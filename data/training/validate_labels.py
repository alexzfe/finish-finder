#!/usr/bin/env python3
"""
Validate Label Quality

Performs comprehensive validation of the tier labels:
1. Validates against known bonus fights (ground truth)
2. Checks tier distribution across different fight characteristics
3. Spot-checks high-confidence and low-confidence predictions
4. Compares against original deterministic labels
"""

import pandas as pd
import numpy as np
from collections import defaultdict


def load_data():
    """Load all labeled datasets."""
    snorkel = pd.read_csv('snorkel_labeled_data.csv')
    try:
        original = pd.read_csv('labeled_training_data.csv')
    except FileNotFoundError:
        original = snorkel.copy()  # Fallback if original doesn't exist
    return snorkel, original


def validate_bonus_fights(df: pd.DataFrame) -> dict:
    """
    Validate tier assignments for bonus fights.

    Expected:
    - FOTN → Tier 5 (Elite)
    - POTN → Tier 4 (Excellent)
    - KOTN/SOTN → Tier 4 (Excellent, legacy)
    """
    results = {}

    # FOTN fights
    fotn = df[df['fight_bonus'] == 'FOTN']
    if len(fotn) > 0:
        results['fotn'] = {
            'count': len(fotn),
            'tier_5': (fotn['snorkel_tier'] == 5).sum(),
            'tier_4_plus': (fotn['snorkel_tier'] >= 4).sum(),
            'accuracy': (fotn['snorkel_tier'] == 5).mean(),
        }
        print("\nFOTN Fights (expected Tier 5):")
        print(f"  Total: {results['fotn']['count']}")
        print(f"  Tier 5: {results['fotn']['tier_5']} ({results['fotn']['accuracy']:.1%})")
        print(f"  Tier 4+: {results['fotn']['tier_4_plus']}")

        # Show any FOTN fights not in tier 5
        wrong = fotn[fotn['snorkel_tier'] != 5]
        if len(wrong) > 0:
            print(f"\n  FOTN fights NOT in Tier 5:")
            for _, row in wrong.head(5).iterrows():
                print(f"    {row['fighter1']} vs {row['fighter2']}: Tier {row['snorkel_tier']}")

    # POTN fights
    potn = df[df['fight_bonus'].isin(['POTN', 'KOTN', 'SOTN'])]
    if len(potn) > 0:
        results['potn'] = {
            'count': len(potn),
            'tier_4': (potn['snorkel_tier'] == 4).sum(),
            'tier_4_plus': (potn['snorkel_tier'] >= 4).sum(),
            'accuracy': (potn['snorkel_tier'] == 4).mean(),
        }
        print("\nPOTN/KOTN/SOTN Fights (expected Tier 4):")
        print(f"  Total: {results['potn']['count']}")
        print(f"  Tier 4: {results['potn']['tier_4']} ({results['potn']['accuracy']:.1%})")
        print(f"  Tier 4+: {results['potn']['tier_4_plus']}")

    return results


def analyze_tier_by_method(df: pd.DataFrame):
    """Analyze tier distribution by fight method."""
    print("\n\nTier Distribution by Fight Method:")
    print("-" * 60)

    # Group by method
    methods = df['method'].str.extract(r'^([A-Z/]+)')[0].fillna('Unknown')
    df['method_category'] = methods

    for method in ['KO/TKO', 'Submission', 'Decision']:
        if method == 'Decision':
            subset = df[df['method'].str.contains('Decision', na=False)]
        else:
            subset = df[df['method_category'] == method]

        if len(subset) == 0:
            continue

        print(f"\n{method} ({len(subset)} fights):")
        tier_dist = subset['snorkel_tier'].value_counts().sort_index()
        for tier in range(1, 6):
            count = tier_dist.get(tier, 0)
            pct = count / len(subset) * 100
            print(f"  Tier {tier}: {count:4d} ({pct:5.1f}%)")

        avg_tier = subset['snorkel_tier'].mean()
        print(f"  Average tier: {avg_tier:.2f}")


def analyze_confidence_distribution(df: pd.DataFrame):
    """Analyze confidence distribution across tiers."""
    print("\n\nConfidence Analysis:")
    print("-" * 60)

    # Overall confidence
    print("\nOverall Confidence Distribution:")
    print(f"  High (>=70%): {(df['snorkel_confidence'] >= 0.7).mean():.1%}")
    print(f"  Medium (50-70%): {((df['snorkel_confidence'] >= 0.5) & (df['snorkel_confidence'] < 0.7)).mean():.1%}")
    print(f"  Low (<50%): {(df['snorkel_confidence'] < 0.5).mean():.1%}")

    # Confidence by tier
    print("\nAverage Confidence by Tier:")
    for tier in range(1, 6):
        tier_conf = df[df['snorkel_tier'] == tier]['snorkel_confidence'].mean()
        tier_count = len(df[df['snorkel_tier'] == tier])
        print(f"  Tier {tier}: {tier_conf:.3f} ({tier_count} fights)")


def spot_check_predictions(df: pd.DataFrame, n: int = 5):
    """Spot-check predictions across tiers."""
    print("\n\nSpot-Check Predictions:")
    print("-" * 60)

    tier_names = {1: 'Low', 2: 'Average', 3: 'Good', 4: 'Excellent', 5: 'Elite'}

    for tier in range(1, 6):
        tier_df = df[df['snorkel_tier'] == tier].sample(min(n, len(df[df['snorkel_tier'] == tier])))

        print(f"\n=== Tier {tier} ({tier_names[tier]}) Samples ===")
        for _, row in tier_df.iterrows():
            print(f"\n  {row['fighter1']} vs {row['fighter2']}")
            print(f"    Event: {row['event_name'][:50]}")
            print(f"    Method: {row['method']}, Round {row['round']}")
            print(f"    Sig Strikes: {row['total_sig_strikes']}, Knockdowns: {row['total_knockdowns']}")
            print(f"    Confidence: {row['snorkel_confidence']:.2f}")
            if row['fight_bonus']:
                print(f"    Bonus: {row['fight_bonus']}")


def compare_with_original(snorkel_df: pd.DataFrame, original_df: pd.DataFrame):
    """Compare Snorkel labels with original deterministic labels."""
    print("\n\nComparison with Original Deterministic Labels:")
    print("-" * 60)

    # Merge on index (same order)
    comparison = pd.DataFrame({
        'snorkel_tier': snorkel_df['snorkel_tier'],
        'original_tier': original_df['tier'].astype(int),
    })

    # Agreement
    exact_match = (comparison['snorkel_tier'] == comparison['original_tier']).mean()
    within_one = (abs(comparison['snorkel_tier'] - comparison['original_tier']) <= 1).mean()

    print(f"\n  Exact match: {exact_match:.1%}")
    print(f"  Within ±1 tier: {within_one:.1%}")

    # Confusion matrix
    print("\n  Confusion Matrix (rows=Snorkel, cols=Original):")
    confusion = pd.crosstab(
        comparison['snorkel_tier'],
        comparison['original_tier'],
        margins=True
    )
    print(confusion)

    # Direction of disagreements
    snorkel_higher = (comparison['snorkel_tier'] > comparison['original_tier']).mean()
    original_higher = (comparison['snorkel_tier'] < comparison['original_tier']).mean()
    print(f"\n  Snorkel rates higher: {snorkel_higher:.1%}")
    print(f"  Original rates higher: {original_higher:.1%}")


def validate_temporal_consistency(df: pd.DataFrame):
    """Check if tier distribution is consistent across time periods."""
    print("\n\nTemporal Consistency:")
    print("-" * 60)

    # Parse dates
    df['year'] = pd.to_datetime(df['event_date'], format='%B %d, %Y', errors='coerce').dt.year

    # Group by year ranges
    periods = [
        ('Pre-2015', df['year'] < 2015),
        ('2015-2019', (df['year'] >= 2015) & (df['year'] < 2020)),
        ('2020-2023', (df['year'] >= 2020) & (df['year'] < 2024)),
        ('2024+', df['year'] >= 2024),
    ]

    for period_name, mask in periods:
        period_df = df[mask]
        if len(period_df) == 0:
            continue

        print(f"\n{period_name} ({len(period_df)} fights):")
        for tier in range(1, 6):
            count = (period_df['snorkel_tier'] == tier).sum()
            pct = count / len(period_df) * 100
            print(f"  Tier {tier}: {pct:5.1f}%")


def main():
    """Main validation function."""
    print("=" * 60)
    print("Label Quality Validation")
    print("=" * 60)

    # Load data
    print("\nLoading data...")
    snorkel_df, original_df = load_data()
    print(f"  Loaded {len(snorkel_df)} fights with Snorkel labels")
    print(f"  Loaded {len(original_df)} fights with original labels")

    # Validation tests
    validate_bonus_fights(snorkel_df)
    analyze_tier_by_method(snorkel_df)
    analyze_confidence_distribution(snorkel_df)
    spot_check_predictions(snorkel_df, n=3)
    compare_with_original(snorkel_df, original_df)
    validate_temporal_consistency(snorkel_df)

    # Summary
    print("\n" + "=" * 60)
    print("Validation Summary")
    print("=" * 60)

    bonus_fights = snorkel_df[snorkel_df['fight_bonus'].notna() & (snorkel_df['fight_bonus'] != '')]
    non_bonus = snorkel_df[snorkel_df['fight_bonus'].isna() | (snorkel_df['fight_bonus'] == '')]

    print(f"\nBonus fights in Tier 4+: {(bonus_fights['snorkel_tier'] >= 4).mean():.1%}")
    print(f"Non-bonus fights in Tier 1-3: {(non_bonus['snorkel_tier'] <= 3).mean():.1%}")

    # High-confidence analysis
    high_conf = snorkel_df[snorkel_df['snorkel_confidence'] >= 0.7]
    print(f"\nHigh-confidence labels (>=70%): {len(high_conf)} ({len(high_conf)/len(snorkel_df):.1%})")

    print("\n✓ Validation complete!")


if __name__ == '__main__':
    main()
