#!/usr/bin/env python3
"""
Tier Classification Model Training

Trains an XGBoost classifier to predict entertainment tiers (1-5) from pre-fight features.

Pipeline:
1. Temporal train/validation/test splits
2. XGBoost multiclass classification with ordinal-aware loss
3. Platt scaling for probability calibration
4. Comprehensive evaluation on held-out test set
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    accuracy_score, classification_report, confusion_matrix,
    brier_score_loss, log_loss
)
import xgboost as xgb
import joblib
import warnings
warnings.filterwarnings('ignore')


# Feature columns (excluding identifiers and targets)
FEATURE_COLS = [
    # Fighter 1 career features
    'f1_career_fights', 'f1_career_win_rate', 'f1_career_finish_rate',
    'f1_career_ko_rate', 'f1_career_sub_rate', 'f1_career_sig_str_per_round',
    'f1_career_sig_str_accuracy', 'f1_career_td_per_round', 'f1_career_td_accuracy',
    'f1_career_sub_att_per_round', 'f1_career_kd_per_round', 'f1_career_ctrl_per_round',
    'f1_career_avg_rounds', 'f1_recent_win_streak', 'f1_recent_loss_streak',

    # Fighter 2 career features
    'f2_career_fights', 'f2_career_win_rate', 'f2_career_finish_rate',
    'f2_career_ko_rate', 'f2_career_sub_rate', 'f2_career_sig_str_per_round',
    'f2_career_sig_str_accuracy', 'f2_career_td_per_round', 'f2_career_td_accuracy',
    'f2_career_sub_att_per_round', 'f2_career_kd_per_round', 'f2_career_ctrl_per_round',
    'f2_career_avg_rounds', 'f2_recent_win_streak', 'f2_recent_loss_streak',

    # Physical attributes
    'f1_height', 'f1_reach', 'f2_height', 'f2_reach',

    # Matchup features
    'combined_finish_rate', 'combined_ko_rate', 'combined_sig_str_per_round',
    'combined_kd_per_round', 'experience_diff', 'reach_diff', 'height_diff',

    # Context features
    'wc_baseline_finish_rate', 'is_title_fight', 'scheduled_rounds',
]


def load_features() -> pd.DataFrame:
    """Load feature dataset."""
    df = pd.read_csv('fight_features.csv')
    print(f"Loaded {len(df)} fights with features")
    return df


def create_temporal_splits(df: pd.DataFrame) -> tuple:
    """
    Create temporal train/validation/test splits.

    - Train: Fights before 2023
    - Validation: Fights 2023 - mid 2024
    - Test: Fights mid 2024+
    """
    print("\nCreating temporal splits...")

    # Filter to fights with sufficient history
    df = df[df['f1_career_fights'] > 0].copy()
    df = df[df['f2_career_fights'] > 0].copy()
    print(f"  Fights with both fighters having history: {len(df)}")

    train = df[df['year'] < 2023].copy()
    val = df[(df['year'] >= 2023) & (df['year'] < 2024)].copy()
    test = df[df['year'] >= 2024].copy()

    print(f"  Train (before 2023): {len(train)} fights")
    print(f"  Validation (2023): {len(val)} fights")
    print(f"  Test (2024+): {len(test)} fights")

    return train, val, test


def prepare_data(df: pd.DataFrame, feature_cols: list) -> tuple:
    """Prepare X, y, and sample weights from dataframe."""
    X = df[feature_cols].copy()

    # Handle missing values
    X = X.fillna(0)

    # Convert boolean to int
    X['is_title_fight'] = X['is_title_fight'].astype(int)

    # Target: tiers are 1-5, convert to 0-4 for XGBoost
    y = df['snorkel_tier'].values - 1

    # Sample weights from Snorkel confidence
    weights = df['snorkel_confidence'].values if 'snorkel_confidence' in df.columns else None

    return X, y, weights


def calculate_tier_metrics(y_true, y_pred, y_proba=None) -> dict:
    """Calculate tier-specific evaluation metrics."""
    metrics = {}

    # Exact accuracy
    metrics['exact_accuracy'] = accuracy_score(y_true, y_pred)

    # Within ±1 accuracy
    within_one = np.mean(np.abs(y_true - y_pred) <= 1)
    metrics['within_one_accuracy'] = within_one

    # Mean absolute error (in tiers)
    metrics['mae_tiers'] = np.mean(np.abs(y_true - y_pred))

    if y_proba is not None:
        # Log loss (multiclass cross-entropy)
        metrics['log_loss'] = log_loss(y_true, y_proba)

        # Expected Calibration Error (ECE)
        metrics['ece'] = calculate_ece(y_true, y_proba)

    return metrics


def calculate_ece(y_true, y_proba, n_bins=5) -> float:
    """
    Calculate Expected Calibration Error.

    ECE = sum(|accuracy - confidence| * bin_size / total)
    """
    # Get predicted class and confidence
    y_pred = np.argmax(y_proba, axis=1)
    confidences = np.max(y_proba, axis=1)
    accuracies = (y_pred == y_true).astype(float)

    ece = 0.0
    for i in range(n_bins):
        bin_lower = i / n_bins
        bin_upper = (i + 1) / n_bins
        in_bin = (confidences > bin_lower) & (confidences <= bin_upper)

        if np.sum(in_bin) > 0:
            bin_accuracy = np.mean(accuracies[in_bin])
            bin_confidence = np.mean(confidences[in_bin])
            bin_size = np.sum(in_bin) / len(y_true)
            ece += np.abs(bin_accuracy - bin_confidence) * bin_size

    return ece


def train_xgboost(X_train, y_train, X_val, y_val, sample_weights=None) -> xgb.XGBClassifier:
    """Train XGBoost classifier."""
    print("\nTraining XGBoost classifier...")

    # Use sample weights (from Snorkel confidence) if provided
    train_weights = sample_weights

    # XGBoost parameters - regularized to prevent overfitting
    model = xgb.XGBClassifier(
        objective='multi:softprob',
        num_class=5,
        n_estimators=200,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.7,
        min_child_weight=5,
        gamma=0.1,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42,
        eval_metric='mlogloss',
        early_stopping_rounds=20,
        verbosity=1
    )

    model.fit(
        X_train, y_train,
        sample_weight=train_weights,
        eval_set=[(X_val, y_val)],
        verbose=False
    )

    print(f"  Best iteration: {model.best_iteration}")
    return model


def train_lightgbm(X_train, y_train, X_val, y_val, sample_weights=None):
    """Train LightGBM classifier as alternative."""
    try:
        import lightgbm as lgb
    except ImportError:
        print("  LightGBM not installed, skipping")
        return None

    print("\nTraining LightGBM classifier...")

    model = lgb.LGBMClassifier(
        objective='multiclass',
        num_class=5,
        n_estimators=200,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.7,
        min_child_samples=20,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42,
        verbose=-1
    )

    model.fit(
        X_train, y_train,
        sample_weight=sample_weights,
        eval_set=[(X_val, y_val)],
        callbacks=[lgb.early_stopping(20, verbose=False)]
    )

    print(f"  Best iteration: {model.best_iteration_}")
    return model


def calibrate_model(model, X_val, y_val) -> CalibratedClassifierCV:
    """Apply Platt scaling for probability calibration."""
    print("\nCalibrating probabilities with Platt scaling...")

    calibrated = CalibratedClassifierCV(
        model,
        method='sigmoid',  # Platt scaling
        cv='prefit'  # Model already trained
    )

    calibrated.fit(X_val, y_val)
    return calibrated


def evaluate_model(model, X, y, split_name: str, calibrated=None):
    """Evaluate model on a dataset."""
    print(f"\n{'='*60}")
    print(f"Evaluation on {split_name} set")
    print('='*60)

    # Predictions
    y_pred = model.predict(X)
    y_proba = model.predict_proba(X)

    # Metrics
    metrics = calculate_tier_metrics(y, y_pred, y_proba)

    print(f"\nExact Accuracy: {metrics['exact_accuracy']:.1%}")
    print(f"Within ±1 Tier: {metrics['within_one_accuracy']:.1%}")
    print(f"Mean Absolute Error: {metrics['mae_tiers']:.2f} tiers")
    print(f"Log Loss: {metrics['log_loss']:.4f}")
    print(f"ECE (5 bins): {metrics['ece']:.4f}")

    # Classification report
    print(f"\nClassification Report:")
    # Convert back to 1-5 tiers for display
    print(classification_report(y + 1, y_pred + 1, digits=3))

    # Confusion matrix
    print("Confusion Matrix:")
    cm = confusion_matrix(y, y_pred)
    print(cm)

    # If calibrated model provided, compare calibration
    if calibrated is not None:
        print(f"\n--- After Calibration ---")
        y_pred_cal = calibrated.predict(X)
        y_proba_cal = calibrated.predict_proba(X)

        metrics_cal = calculate_tier_metrics(y, y_pred_cal, y_proba_cal)

        print(f"Exact Accuracy: {metrics_cal['exact_accuracy']:.1%}")
        print(f"Log Loss: {metrics_cal['log_loss']:.4f}")
        print(f"ECE (5 bins): {metrics_cal['ece']:.4f}")

        return metrics, metrics_cal

    return metrics, None


def analyze_feature_importance(model, feature_cols: list):
    """Analyze and display feature importance."""
    print("\n" + "="*60)
    print("Feature Importance (Top 20)")
    print("="*60)

    importance = model.feature_importances_
    indices = np.argsort(importance)[::-1]

    for i, idx in enumerate(indices[:20]):
        print(f"  {i+1:2d}. {feature_cols[idx]:35s} {importance[idx]:.4f}")


def validate_against_bonuses(df_test: pd.DataFrame, y_pred, y_proba) -> dict:
    """
    Validate predictions against actual bonus fights.

    High-tier predictions should correlate with bonus fights.
    """
    print("\n" + "="*60)
    print("Bonus Fight Validation")
    print("="*60)

    # Load original labeled data to get bonus info
    labeled = pd.read_csv('snorkel_labeled_data.csv')

    # Match by event and fighters
    test_events = df_test['event_name'].values
    test_f1 = df_test['fighter1'].values
    test_f2 = df_test['fighter2'].values

    bonus_fights = []
    for i, (event, f1, f2) in enumerate(zip(test_events, test_f1, test_f2)):
        match = labeled[
            (labeled['event_name'] == event) &
            (labeled['fighter1'] == f1) &
            (labeled['fighter2'] == f2)
        ]
        if len(match) > 0:
            has_bonus = match.iloc[0]['has_bonus'] if pd.notna(match.iloc[0].get('has_bonus')) else False
        else:
            has_bonus = False
        bonus_fights.append(has_bonus)

    bonus_fights = np.array(bonus_fights)
    predicted_tier = y_pred + 1  # Convert back to 1-5

    # Calculate metrics
    bonus_count = np.sum(bonus_fights)
    if bonus_count > 0:
        # Average predicted tier for bonus vs non-bonus fights
        avg_tier_bonus = np.mean(predicted_tier[bonus_fights])
        avg_tier_non_bonus = np.mean(predicted_tier[~bonus_fights])

        print(f"\nBonus fights in test set: {bonus_count}")
        print(f"Average predicted tier for bonus fights: {avg_tier_bonus:.2f}")
        print(f"Average predicted tier for non-bonus fights: {avg_tier_non_bonus:.2f}")

        # What % of bonus fights predicted as Tier 4+?
        bonus_high_tier = np.mean(predicted_tier[bonus_fights] >= 4)
        print(f"Bonus fights predicted as Tier 4+: {bonus_high_tier:.1%}")

        # Precision: Of fights predicted as Tier 4+, what % were bonus?
        high_tier_mask = predicted_tier >= 4
        if np.sum(high_tier_mask) > 0:
            precision = np.mean(bonus_fights[high_tier_mask])
            print(f"Precision (Tier 4+ → bonus): {precision:.1%}")
    else:
        print("\nNo bonus fights in test set")


def main():
    """Main training pipeline."""
    print("="*70)
    print("Tier Classification Model Training")
    print("="*70)

    # Load data
    df = load_features()

    # Create temporal splits
    train_df, val_df, test_df = create_temporal_splits(df)

    # Prepare data
    X_train, y_train, w_train = prepare_data(train_df, FEATURE_COLS)
    X_val, y_val, _ = prepare_data(val_df, FEATURE_COLS)
    X_test, y_test, _ = prepare_data(test_df, FEATURE_COLS)

    print(f"\nFeature matrix shape: {X_train.shape}")

    # Train XGBoost model
    xgb_model = train_xgboost(X_train, y_train, X_val, y_val, sample_weights=w_train)

    # Train LightGBM model for comparison
    lgb_model = train_lightgbm(X_train, y_train, X_val, y_val, sample_weights=w_train)

    # Compare on validation set
    print("\n" + "="*60)
    print("Model Comparison (Validation Set)")
    print("="*60)

    xgb_val_pred = xgb_model.predict(X_val)
    xgb_val_acc = accuracy_score(y_val, xgb_val_pred)
    print(f"  XGBoost:  {xgb_val_acc:.1%}")

    if lgb_model:
        lgb_val_pred = lgb_model.predict(X_val)
        lgb_val_acc = accuracy_score(y_val, lgb_val_pred)
        print(f"  LightGBM: {lgb_val_acc:.1%}")

        # Use the better model
        model = xgb_model if xgb_val_acc >= lgb_val_acc else lgb_model
        print(f"\n  Selected: {'XGBoost' if xgb_val_acc >= lgb_val_acc else 'LightGBM'}")
    else:
        model = xgb_model

    # Calibrate probabilities
    calibrated_model = calibrate_model(model, X_val, y_val)

    # Evaluate
    print("\n" + "="*70)
    print("MODEL EVALUATION")
    print("="*70)

    train_metrics, _ = evaluate_model(model, X_train, y_train, "Training")
    val_metrics, val_metrics_cal = evaluate_model(model, X_val, y_val, "Validation", calibrated_model)
    test_metrics, test_metrics_cal = evaluate_model(model, X_test, y_test, "Test", calibrated_model)

    # Feature importance
    analyze_feature_importance(model, FEATURE_COLS)

    # Bonus validation
    validate_against_bonuses(test_df, calibrated_model.predict(X_test), calibrated_model.predict_proba(X_test))

    # Summary
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)

    print("\nTarget Metrics vs Achieved (Test Set):")
    print(f"  Tier Accuracy:      Target >50%  | Achieved: {test_metrics['exact_accuracy']:.1%}")
    print(f"  Tier ±1 Accuracy:   Target >85%  | Achieved: {test_metrics['within_one_accuracy']:.1%}")
    print(f"  ECE (5 bins):       Target <0.10 | Achieved: {test_metrics_cal['ece'] if test_metrics_cal else test_metrics['ece']:.4f}")

    # Save models
    print("\nSaving models...")
    joblib.dump(model, 'tier_model_xgboost.joblib')
    joblib.dump(calibrated_model, 'tier_model_calibrated.joblib')
    print("  Saved tier_model_xgboost.joblib")
    print("  Saved tier_model_calibrated.joblib")

    # Save feature list
    with open('model_features.txt', 'w') as f:
        f.write('\n'.join(FEATURE_COLS))
    print("  Saved model_features.txt")

    print("\nDone!")


if __name__ == '__main__':
    main()
