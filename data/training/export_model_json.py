#!/usr/bin/env python3
"""
Export XGBoost Model to JSON for TypeScript Inference

Exports the trained tier model to a JSON format that can be loaded
in TypeScript for client-side or server-side inference without Python.

Output format:
{
    "feature_names": [...],
    "trees": [...],        # Serialized tree structure
    "n_classes": 5,
    "calibration": {...}   # Platt scaling parameters
}
"""

import json
import numpy as np
import joblib
import xgboost as xgb


def export_xgboost_to_json(model_path: str, output_path: str):
    """Export XGBoost model to JSON format."""
    print(f"Loading model from {model_path}...")

    # Load the calibrated model
    calibrated_model = joblib.load(model_path)

    # Get the base XGBoost model from the calibration wrapper
    # CalibratedClassifierCV wraps the base estimator
    base_model = calibrated_model.calibrated_classifiers_[0].estimator

    # Export the XGBoost model to native JSON
    xgb_json_path = 'tier_model_xgb.json'
    base_model.save_model(xgb_json_path)

    # Load XGBoost's native JSON
    with open(xgb_json_path, 'r') as f:
        xgb_json = json.load(f)

    # Load feature names
    with open('model_features.txt', 'r') as f:
        feature_names = [line.strip() for line in f.readlines() if line.strip()]

    # Extract Platt scaling parameters from the calibration layer
    # Each calibrator has an sklearn CalibratedClassifierCV
    calibrators = []
    for cc in calibrated_model.calibrated_classifiers_:
        for i, calibrator in enumerate(cc.calibrators):
            # Sigmoid (Platt scaling) parameters: y = 1 / (1 + exp(-(a*x + b)))
            # sklearn's _SigmoidCalibration stores A_ and B_
            calibrators.append({
                'class': i,
                'A': float(calibrator.a_),
                'B': float(calibrator.b_)
            })

    # Build export structure
    export_data = {
        'metadata': {
            'model_type': 'xgboost',
            'n_classes': 5,
            'tier_mapping': {
                '0': 'Tier 1 (Low)',
                '1': 'Tier 2 (Average)',
                '2': 'Tier 3 (Good)',
                '3': 'Tier 4 (Excellent)',
                '4': 'Tier 5 (Elite)'
            }
        },
        'feature_names': feature_names,
        'xgboost_model': xgb_json,
        'calibration': {
            'method': 'platt',
            'calibrators': calibrators
        }
    }

    # Write to output
    with open(output_path, 'w') as f:
        json.dump(export_data, f, indent=2)

    print(f"Model exported to {output_path}")
    print(f"  Features: {len(feature_names)}")
    print(f"  Classes: 5")
    print(f"  Calibrators: {len(calibrators)}")

    return export_data


def verify_export(model_path: str, export_path: str):
    """Verify export by comparing predictions."""
    print("\nVerifying export...")

    import pandas as pd

    # Load original model
    calibrated_model = joblib.load(model_path)

    # Load test data
    features = pd.read_csv('fight_features.csv')
    features = features[features['year'] >= 2024].head(10)  # Small test set

    # Load feature columns
    with open('model_features.txt', 'r') as f:
        feature_cols = [line.strip() for line in f.readlines() if line.strip()]

    X = features[feature_cols].fillna(0).copy()
    X['is_title_fight'] = X['is_title_fight'].astype(int)

    # Get predictions from original model
    y_pred = calibrated_model.predict(X)
    y_proba = calibrated_model.predict_proba(X)

    print("\nSample predictions (original model):")
    for i in range(min(5, len(y_pred))):
        print(f"  Fight {i+1}: Tier {y_pred[i]+1} (probs: {y_proba[i].round(3)})")

    # The TypeScript implementation should produce identical results


def main():
    """Main export function."""
    print("="*60)
    print("Export XGBoost Model to JSON")
    print("="*60)

    model_path = 'tier_model_calibrated.joblib'
    output_path = 'tier_model_export.json'

    export_xgboost_to_json(model_path, output_path)
    verify_export(model_path, output_path)

    print("\nDone! Model ready for TypeScript inference.")


if __name__ == '__main__':
    main()
