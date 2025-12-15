#!/usr/bin/env python3
"""
Train Snorkel Label Model

Trains a generative label model on the labeling function outputs
to produce probabilistic tier assignments.

The label model learns:
1. The accuracy of each labeling function
2. Correlations between labeling functions
3. Optimal way to aggregate conflicting votes

Output:
- Probabilistic tier labels for all fights
- Model accuracy metrics on known-labeled data (bonus fights)
"""

import numpy as np
import pandas as pd
from typing import Optional, Tuple
from collections import Counter

# Try to import Snorkel, fall back to simple majority vote if unavailable
try:
    from snorkel.labeling.model import LabelModel
    SNORKEL_AVAILABLE = True
except ImportError:
    SNORKEL_AVAILABLE = False
    print("Snorkel not available, using majority vote aggregation")

from labeling_functions import (
    ABSTAIN, TIER_1_LOW, TIER_2_AVERAGE, TIER_3_GOOD, TIER_4_EXCELLENT, TIER_5_ELITE,
    LF_NAMES, apply_labeling_functions
)


def majority_vote_aggregate(L: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """
    Simple majority vote aggregation when Snorkel is unavailable.

    Returns:
        labels: Array of predicted tier labels (0-4)
        probs: Array of confidence scores (based on vote agreement)
    """
    n_samples = L.shape[0]
    labels = np.zeros(n_samples, dtype=int)
    probs = np.zeros((n_samples, 5))  # Probability for each tier

    for i in range(n_samples):
        row_votes = L[i][L[i] != ABSTAIN]

        if len(row_votes) == 0:
            # No votes - assign tier 2 (average) with low confidence
            labels[i] = TIER_2_AVERAGE
            probs[i] = [0.1, 0.6, 0.2, 0.1, 0.0]  # Slight bias toward average
        else:
            # Count votes for each tier
            vote_counts = Counter(row_votes)
            total_votes = len(row_votes)

            # Get most common tier
            labels[i] = vote_counts.most_common(1)[0][0]

            # Calculate probability based on vote distribution
            for tier in range(5):
                probs[i, tier] = vote_counts.get(tier, 0) / total_votes

    return labels, probs


def hierarchical_aggregate(
    L: np.ndarray,
    df: pd.DataFrame
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Hierarchical aggregation that respects high-confidence labels.

    Priority order:
    1. FOTN bonus → Tier 5 (override everything)
    2. POTN/KOTN/SOTN bonus → Tier 4 (override everything else)
    3. Implied bonus (pre-2014 backfill) → Tier 4
    4. Early dramatic finish → Tier 4-5
    5. High volume (absolute or z-score) → Tier 3-4
    6. Finish with action → Tier 3-4
    7. Any finish or knockdowns → Tier 3
    8. Use negative LFs for low entertainment

    Returns:
        labels: Array of predicted tier labels (0-4)
        probs: Array of probability distributions over tiers
    """
    n_samples = L.shape[0]
    labels = np.zeros(n_samples, dtype=int)
    probs = np.zeros((n_samples, 5))

    # LF indices for the updated registry:
    # 0: lf_fotn_bonus
    # 1: lf_potn_bonus
    # 2: lf_implied_bonus
    # 3: lf_early_finish
    # 4: lf_high_volume_competitive
    # 5: lf_high_volume_zscore
    # 6: lf_finish_with_action
    # 7: lf_any_finish
    # 8: lf_knockdown_present
    # 9: lf_low_volume
    # 10: lf_one_sided_grappling
    # 11: lf_decision_low_action

    for i in range(n_samples):
        row = L[i]

        # Priority 1: FOTN bonus (LF0) → Tier 5
        if row[0] != ABSTAIN:
            labels[i] = TIER_5_ELITE
            probs[i] = [0.0, 0.0, 0.0, 0.05, 0.95]
            continue

        # Priority 2: POTN bonus (LF1) → Tier 4
        if row[1] != ABSTAIN:
            labels[i] = TIER_4_EXCELLENT
            probs[i] = [0.0, 0.0, 0.05, 0.90, 0.05]
            continue

        # Priority 3: Implied bonus (LF2) → Tier 4
        if row[2] != ABSTAIN:
            labels[i] = TIER_4_EXCELLENT
            probs[i] = [0.0, 0.0, 0.10, 0.80, 0.10]
            continue

        # Priority 4: Early finish (LF3) → Tier 4 or 5
        if row[3] != ABSTAIN:
            if row[3] == TIER_5_ELITE:
                labels[i] = TIER_5_ELITE
                probs[i] = [0.0, 0.0, 0.05, 0.15, 0.80]
            else:
                labels[i] = TIER_4_EXCELLENT
                probs[i] = [0.0, 0.0, 0.10, 0.75, 0.15]
            continue

        # Priority 5: High volume z-score (LF5) → Tier 3-4
        if row[5] != ABSTAIN:
            if row[5] == TIER_4_EXCELLENT:
                labels[i] = TIER_4_EXCELLENT
                probs[i] = [0.0, 0.05, 0.15, 0.70, 0.10]
            else:
                labels[i] = TIER_3_GOOD
                probs[i] = [0.0, 0.10, 0.65, 0.20, 0.05]
            continue

        # Priority 6: Finish with action (LF6) → Tier 3-4
        if row[6] != ABSTAIN:
            if row[6] == TIER_4_EXCELLENT:
                labels[i] = TIER_4_EXCELLENT
                probs[i] = [0.0, 0.05, 0.15, 0.70, 0.10]
            else:
                labels[i] = TIER_3_GOOD
                probs[i] = [0.0, 0.10, 0.65, 0.20, 0.05]
            continue

        # Priority 7: Any finish (LF7) or knockdowns (LF8) → Tier 3
        if row[7] != ABSTAIN or row[8] != ABSTAIN:
            labels[i] = TIER_3_GOOD
            probs[i] = [0.05, 0.15, 0.60, 0.15, 0.05]
            continue

        # Priority 8: High volume absolute (LF4) → Tier 3
        if row[4] != ABSTAIN:
            labels[i] = TIER_3_GOOD
            probs[i] = [0.0, 0.15, 0.60, 0.20, 0.05]
            continue

        # Non-finish fights: use negative LFs
        # Low volume (LF9) or one-sided grappling (LF10) → Tier 1-2
        # Decision low action (LF11) → Tier 2

        low_volume_vote = row[9]
        one_sided_vote = row[10]
        decision_vote = row[11]

        # Strongest negative signal: very low volume or dominant grappling
        if low_volume_vote == TIER_1_LOW or one_sided_vote == TIER_1_LOW:
            labels[i] = TIER_1_LOW
            probs[i] = [0.70, 0.20, 0.08, 0.02, 0.0]
        elif low_volume_vote == TIER_2_AVERAGE or one_sided_vote == TIER_2_AVERAGE:
            labels[i] = TIER_2_AVERAGE
            probs[i] = [0.25, 0.55, 0.15, 0.05, 0.0]
        elif decision_vote != ABSTAIN:
            labels[i] = TIER_2_AVERAGE
            probs[i] = [0.20, 0.55, 0.20, 0.05, 0.0]
        else:
            # Default: Tier 2 (average)
            labels[i] = TIER_2_AVERAGE
            probs[i] = [0.15, 0.50, 0.25, 0.08, 0.02]

    return labels, probs


def train_snorkel_model(
    L: np.ndarray,
    cardinality: int = 5,
    n_epochs: int = 500,
    seed: int = 42
) -> Tuple[np.ndarray, np.ndarray, Optional[object]]:
    """
    Train Snorkel LabelModel on labeling function outputs.

    Args:
        L: Label matrix of shape (n_samples, n_labeling_functions)
        cardinality: Number of classes (5 tiers)
        n_epochs: Training epochs
        seed: Random seed

    Returns:
        labels: Predicted tier labels (0-4)
        probs: Probability distribution over tiers
        model: Trained LabelModel (or None if using fallback)
    """
    if not SNORKEL_AVAILABLE:
        labels, probs = majority_vote_aggregate(L)
        return labels, probs, None

    # Train Snorkel LabelModel
    label_model = LabelModel(cardinality=cardinality, verbose=True)
    label_model.fit(L, n_epochs=n_epochs, seed=seed, log_freq=100)

    # Get probabilistic predictions
    probs = label_model.predict_proba(L)
    labels = label_model.predict(L)

    return labels, probs, label_model


def evaluate_on_bonus_fights(
    labels: np.ndarray,
    probs: np.ndarray,
    df: pd.DataFrame
) -> dict:
    """
    Evaluate label model on fights with known bonus labels.

    These are our "ground truth" for tiers 4 and 5.
    """
    # Get indices of bonus fights
    fotn_idx = df[df['fight_bonus'] == 'FOTN'].index.tolist()
    potn_idx = df[df['fight_bonus'].isin(['POTN', 'KOTN', 'SOTN'])].index.tolist()

    metrics = {}

    # FOTN should be Tier 5
    if fotn_idx:
        fotn_predictions = labels[fotn_idx]
        fotn_tier5_rate = np.mean(fotn_predictions == TIER_5_ELITE)
        fotn_tier4_plus_rate = np.mean(fotn_predictions >= TIER_4_EXCELLENT)
        fotn_avg_confidence = np.mean(probs[fotn_idx, TIER_5_ELITE])

        metrics['fotn_tier5_accuracy'] = fotn_tier5_rate
        metrics['fotn_tier4_plus_accuracy'] = fotn_tier4_plus_rate
        metrics['fotn_avg_tier5_prob'] = fotn_avg_confidence
        metrics['fotn_count'] = len(fotn_idx)

    # POTN should be Tier 4
    if potn_idx:
        potn_predictions = labels[potn_idx]
        potn_tier4_rate = np.mean(potn_predictions == TIER_4_EXCELLENT)
        potn_tier4_plus_rate = np.mean(potn_predictions >= TIER_4_EXCELLENT)
        potn_avg_confidence = np.mean(probs[potn_idx, TIER_4_EXCELLENT])

        metrics['potn_tier4_accuracy'] = potn_tier4_rate
        metrics['potn_tier4_plus_accuracy'] = potn_tier4_plus_rate
        metrics['potn_avg_tier4_prob'] = potn_avg_confidence
        metrics['potn_count'] = len(potn_idx)

    # Non-bonus fights distribution
    non_bonus_idx = df[df['fight_bonus'].isna() | (df['fight_bonus'] == '')].index.tolist()
    if non_bonus_idx:
        non_bonus_labels = labels[non_bonus_idx]
        metrics['non_bonus_tier_distribution'] = {
            'tier1': np.mean(non_bonus_labels == TIER_1_LOW),
            'tier2': np.mean(non_bonus_labels == TIER_2_AVERAGE),
            'tier3': np.mean(non_bonus_labels == TIER_3_GOOD),
            'tier4': np.mean(non_bonus_labels == TIER_4_EXCELLENT),
            'tier5': np.mean(non_bonus_labels == TIER_5_ELITE),
        }
        metrics['non_bonus_count'] = len(non_bonus_idx)

    return metrics


def analyze_lf_accuracy(L: np.ndarray, labels: np.ndarray, lf_names: list) -> pd.DataFrame:
    """
    Analyze how often each labeling function agrees with the final label.
    """
    n_lfs = L.shape[1]
    results = []

    for j in range(n_lfs):
        lf_votes = L[:, j]
        non_abstain_mask = lf_votes != ABSTAIN

        if non_abstain_mask.sum() == 0:
            accuracy = 0.0
        else:
            # Check agreement with final labels
            agreements = lf_votes[non_abstain_mask] == labels[non_abstain_mask]
            accuracy = np.mean(agreements)

        results.append({
            'lf_name': lf_names[j],
            'coverage': np.mean(non_abstain_mask),
            'agreement_with_model': accuracy,
        })

    return pd.DataFrame(results)


def main():
    """Main training function."""
    print("=" * 60)
    print("Training Label Model (Hierarchical Aggregation)")
    print("=" * 60)

    # Load normalized data (includes implied_bonus and z-scores)
    print("\nLoading normalized training data...")
    try:
        df = pd.read_csv('normalized_training_data.csv')
        print(f"  Loaded {len(df)} fights (normalized)")
    except FileNotFoundError:
        print("  normalized_training_data.csv not found, using training_data.csv")
        df = pd.read_csv('training_data.csv')
        print(f"  Loaded {len(df)} fights (raw)")

    # Apply labeling functions
    print("\nApplying labeling functions...")
    L = apply_labeling_functions(df)
    print(f"  Label matrix shape: {L.shape}")

    # Check coverage
    coverage = np.mean(np.any(L != ABSTAIN, axis=1))
    print(f"  Overall coverage: {coverage:.1%}")

    # Use hierarchical aggregation (respects high-confidence labels)
    print("\nApplying hierarchical label aggregation...")
    labels, probs = hierarchical_aggregate(L, df)
    model = None
    print("  Aggregation complete")

    # Distribution of predicted tiers
    print("\nPredicted Tier Distribution:")
    tier_names = ['Tier 1 (Low)', 'Tier 2 (Average)', 'Tier 3 (Good)',
                  'Tier 4 (Excellent)', 'Tier 5 (Elite)']
    for i, name in enumerate(tier_names):
        count = np.sum(labels == i)
        pct = 100 * count / len(labels)
        print(f"  {name}: {count} ({pct:.1f}%)")

    # Evaluate on bonus fights
    print("\nEvaluating on Known Bonus Fights:")
    metrics = evaluate_on_bonus_fights(labels, probs, df)

    if 'fotn_tier5_accuracy' in metrics:
        print(f"  FOTN → Tier 5 accuracy: {metrics['fotn_tier5_accuracy']:.1%}")
        print(f"  FOTN → Tier 4+ accuracy: {metrics['fotn_tier4_plus_accuracy']:.1%}")
        print(f"  FOTN average Tier 5 prob: {metrics['fotn_avg_tier5_prob']:.3f}")

    if 'potn_tier4_accuracy' in metrics:
        print(f"  POTN → Tier 4 accuracy: {metrics['potn_tier4_accuracy']:.1%}")
        print(f"  POTN → Tier 4+ accuracy: {metrics['potn_tier4_plus_accuracy']:.1%}")
        print(f"  POTN average Tier 4 prob: {metrics['potn_avg_tier4_prob']:.3f}")

    if 'non_bonus_tier_distribution' in metrics:
        print("\n  Non-bonus fight tier distribution:")
        for tier, pct in metrics['non_bonus_tier_distribution'].items():
            print(f"    {tier}: {pct:.1%}")

    # Analyze LF accuracy
    print("\nLabeling Function Analysis:")
    lf_analysis = analyze_lf_accuracy(L, labels, LF_NAMES)
    print(lf_analysis.to_string(index=False))

    # Confidence analysis
    print("\nConfidence Analysis:")
    max_probs = np.max(probs, axis=1)
    high_conf = np.mean(max_probs >= 0.7)
    med_conf = np.mean((max_probs >= 0.5) & (max_probs < 0.7))
    low_conf = np.mean(max_probs < 0.5)
    print(f"  High confidence (>=70%): {high_conf:.1%}")
    print(f"  Medium confidence (50-70%): {med_conf:.1%}")
    print(f"  Low confidence (<50%): {low_conf:.1%}")

    # Save results
    print("\nSaving results...")

    # Add labels to dataframe
    df['snorkel_tier'] = labels + 1  # Convert 0-4 to 1-5
    df['snorkel_confidence'] = np.max(probs, axis=1)
    df['tier_1_prob'] = probs[:, 0]
    df['tier_2_prob'] = probs[:, 1]
    df['tier_3_prob'] = probs[:, 2]
    df['tier_4_prob'] = probs[:, 3]
    df['tier_5_prob'] = probs[:, 4]

    output_file = 'snorkel_labeled_data.csv'
    df.to_csv(output_file, index=False)
    print(f"  Saved to {output_file}")

    # Save model weights if Snorkel model available
    if model is not None:
        weights = model.get_weights()
        np.save('lf_weights.npy', weights)
        print("  Saved LF weights to lf_weights.npy")

    # Save label matrix
    np.save('label_matrix.npy', L)
    print("  Saved label matrix to label_matrix.npy")

    # Save probabilities
    np.save('tier_probabilities.npy', probs)
    print("  Saved tier probabilities to tier_probabilities.npy")

    print("\nDone!")


if __name__ == '__main__':
    main()
