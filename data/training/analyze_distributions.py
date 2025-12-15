#!/usr/bin/env python3
"""
Analyze Statistical Distributions

Analyzes fight statistics to determine optimal tier thresholds for
the entertainment prediction model.

This script:
1. Compares bonus vs non-bonus fights
2. Calculates percentiles for key metrics
3. Recommends tier thresholds based on empirical data
"""

import csv
from collections import defaultdict
import statistics


def load_training_data(filepath: str) -> list[dict]:
    """Load training data from CSV."""
    data = []
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Convert numeric fields
            row['total_sig_strikes'] = int(row['total_sig_strikes']) if row['total_sig_strikes'] else 0
            row['total_knockdowns'] = int(row['total_knockdowns']) if row['total_knockdowns'] else 0
            row['total_takedowns'] = int(row['total_takedowns']) if row['total_takedowns'] else 0
            row['total_sub_attempts'] = int(row['total_sub_attempts']) if row['total_sub_attempts'] else 0
            row['total_control_time'] = int(row['total_control_time']) if row['total_control_time'] else 0
            row['total_fight_time_seconds'] = int(row['total_fight_time_seconds']) if row['total_fight_time_seconds'] else 0
            row['round'] = int(row['round']) if row['round'] else 0
            row['is_finish'] = row['is_finish'] == 'True'
            row['has_bonus'] = row['has_bonus'] == 'True'
            data.append(row)
    return data


def calculate_percentiles(values: list, percentiles: list[int]) -> dict:
    """Calculate multiple percentiles for a list of values."""
    if not values:
        return {p: 0 for p in percentiles}

    sorted_vals = sorted(values)
    n = len(sorted_vals)
    result = {}
    for p in percentiles:
        idx = int(n * p / 100)
        idx = min(idx, n - 1)
        result[p] = sorted_vals[idx]
    return result


def analyze_group(fights: list[dict], group_name: str) -> dict:
    """Analyze statistics for a group of fights."""
    if not fights:
        return {}

    stats = {
        'count': len(fights),
        'sig_strikes': [f['total_sig_strikes'] for f in fights],
        'knockdowns': [f['total_knockdowns'] for f in fights],
        'takedowns': [f['total_takedowns'] for f in fights],
        'control_time': [f['total_control_time'] for f in fights],
        'fight_time': [f['total_fight_time_seconds'] for f in fights],
        'finish_rate': sum(1 for f in fights if f['is_finish']) / len(fights),
    }

    # Calculate strikes per minute
    stats['strikes_per_min'] = [
        f['total_sig_strikes'] / (f['total_fight_time_seconds'] / 60)
        if f['total_fight_time_seconds'] > 0 else 0
        for f in fights
    ]

    return stats


def print_comparison(metric_name: str, bonus_vals: list, non_bonus_vals: list):
    """Print comparison statistics for a metric."""
    percentiles = [10, 25, 50, 75, 90]

    bonus_pct = calculate_percentiles(bonus_vals, percentiles)
    non_bonus_pct = calculate_percentiles(non_bonus_vals, percentiles)

    print(f"\n{metric_name}:")
    print(f"  {'Percentile':<12} {'Bonus':<12} {'Non-Bonus':<12} {'Diff':<12}")
    print(f"  {'-'*48}")
    for p in percentiles:
        diff = bonus_pct[p] - non_bonus_pct[p]
        print(f"  {p}%{'':<10} {bonus_pct[p]:<12.1f} {non_bonus_pct[p]:<12.1f} {diff:+.1f}")

    # Means
    bonus_mean = statistics.mean(bonus_vals) if bonus_vals else 0
    non_bonus_mean = statistics.mean(non_bonus_vals) if non_bonus_vals else 0
    print(f"  {'Mean':<12} {bonus_mean:<12.1f} {non_bonus_mean:<12.1f} {bonus_mean - non_bonus_mean:+.1f}")


def main():
    """Main analysis function."""
    print("=" * 60)
    print("UFC Fight Entertainment Analysis")
    print("=" * 60)

    # Load data
    print("\nLoading training data...")
    fights = load_training_data('training_data.csv')
    print(f"Loaded {len(fights)} fights")

    # Split by bonus status
    bonus_fights = [f for f in fights if f['has_bonus']]
    non_bonus_fights = [f for f in fights if not f['has_bonus']]

    print(f"\nBonus fights: {len(bonus_fights)} ({100*len(bonus_fights)/len(fights):.1f}%)")
    print(f"Non-bonus fights: {len(non_bonus_fights)} ({100*len(non_bonus_fights)/len(fights):.1f}%)")

    # Further split by bonus type
    fotn_fights = [f for f in fights if f['fight_bonus'] == 'FOTN']
    potn_fights = [f for f in fights if f['fight_bonus'] == 'POTN']

    print(f"\nFOTN fights: {len(fotn_fights)}")
    print(f"POTN fights: {len(potn_fights)}")

    # Analyze each group
    bonus_stats = analyze_group(bonus_fights, "Bonus")
    non_bonus_stats = analyze_group(non_bonus_fights, "Non-Bonus")
    fotn_stats = analyze_group(fotn_fights, "FOTN")
    potn_stats = analyze_group(potn_fights, "POTN")

    # Compare metrics
    print("\n" + "=" * 60)
    print("METRIC COMPARISONS: Bonus vs Non-Bonus Fights")
    print("=" * 60)

    print_comparison(
        "Total Significant Strikes",
        bonus_stats['sig_strikes'],
        non_bonus_stats['sig_strikes']
    )

    print_comparison(
        "Strikes per Minute",
        bonus_stats['strikes_per_min'],
        non_bonus_stats['strikes_per_min']
    )

    print_comparison(
        "Knockdowns",
        bonus_stats['knockdowns'],
        non_bonus_stats['knockdowns']
    )

    print_comparison(
        "Fight Duration (seconds)",
        bonus_stats['fight_time'],
        non_bonus_stats['fight_time']
    )

    # Finish rates
    print("\n" + "=" * 60)
    print("FINISH RATES BY GROUP")
    print("=" * 60)

    print(f"\nOverall finish rate: {100*sum(1 for f in fights if f['is_finish'])/len(fights):.1f}%")
    print(f"Bonus fights finish rate: {100*bonus_stats['finish_rate']:.1f}%")
    print(f"Non-bonus fights finish rate: {100*non_bonus_stats['finish_rate']:.1f}%")
    if fotn_stats:
        print(f"FOTN fights finish rate: {100*fotn_stats['finish_rate']:.1f}%")
    if potn_stats:
        print(f"POTN fights finish rate: {100*potn_stats['finish_rate']:.1f}%")

    # Recommended tier thresholds
    print("\n" + "=" * 60)
    print("RECOMMENDED TIER THRESHOLDS")
    print("=" * 60)

    # Calculate percentiles for all fights
    all_strikes = [f['total_sig_strikes'] for f in fights]
    all_strikes_per_min = [
        f['total_sig_strikes'] / (f['total_fight_time_seconds'] / 60)
        if f['total_fight_time_seconds'] > 0 else 0
        for f in fights
    ]
    all_knockdowns = [f['total_knockdowns'] for f in fights]

    strikes_pct = calculate_percentiles(all_strikes, [10, 25, 50, 75, 90])
    spm_pct = calculate_percentiles(all_strikes_per_min, [10, 25, 50, 75, 90])
    kd_pct = calculate_percentiles(all_knockdowns, [10, 25, 50, 75, 90])

    print("\nOverall Strike Distribution:")
    for p, v in strikes_pct.items():
        print(f"  {p}th percentile: {v:.0f} strikes")

    print("\nStrikes per Minute Distribution:")
    for p, v in spm_pct.items():
        print(f"  {p}th percentile: {v:.1f} str/min")

    # Recommended thresholds based on data
    print("\n" + "-" * 60)
    print("TIER THRESHOLD RECOMMENDATIONS")
    print("-" * 60)

    print("""
Based on the analysis, here are the recommended tier thresholds:

TIER 5 (Elite) - FOTN bonus
  - Primary: FOTN bonus awarded
  - Characteristics: High action, often finish, always exciting

TIER 4 (Excellent) - POTN bonus OR High-action finish
  - Primary: POTN bonus awarded
  - Secondary: Finish + >100 sig strikes total
  - Alternative: Early finish (Rd 1) with high action

TIER 3 (Good) - Finish OR High-volume competitive
  - Primary: Any finish (KO/TKO/SUB) without bonus
  - Secondary: >150 sig strikes + competitive (diff <30)
  - Also: Multiple knockdowns (2+)

TIER 2 (Average) - Moderate activity
  - Sig strikes between 80-150
  - No standout features (no finish, no bonuses)
  - Decision with some action

TIER 1 (Low) - Low activity or one-sided
  - Primary: <80 sig strikes total
  - Secondary: Very one-sided (diff >50) with low strikes
  - Also: High control time + low strikes (grinding)
""")

    # Specific threshold values from data
    print("\nSPECIFIC THRESHOLD VALUES (from data):")
    print(f"  - Low volume threshold: ~{strikes_pct[25]:.0f} strikes (25th percentile)")
    print(f"  - High volume threshold: ~{strikes_pct[75]:.0f} strikes (75th percentile)")
    print(f"  - Very high volume: ~{strikes_pct[90]:.0f} strikes (90th percentile)")
    print(f"  - Median strikes: {strikes_pct[50]:.0f}")

    # Calculate bonus fight thresholds
    bonus_strikes_median = statistics.median(bonus_stats['sig_strikes'])
    non_bonus_strikes_median = statistics.median(non_bonus_stats['sig_strikes'])

    print(f"\n  - Bonus fights median: {bonus_strikes_median:.0f} strikes")
    print(f"  - Non-bonus fights median: {non_bonus_strikes_median:.0f} strikes")

    # Save analysis results
    print("\n" + "=" * 60)
    print("Saving analysis results...")

    with open('tier_thresholds.json', 'w') as f:
        import json
        thresholds = {
            "tier_5_criteria": {
                "name": "Elite",
                "primary": "FOTN bonus awarded",
            },
            "tier_4_criteria": {
                "name": "Excellent",
                "primary": "POTN bonus awarded",
                "secondary": "Finish + sig_strikes > 100",
            },
            "tier_3_criteria": {
                "name": "Good",
                "primary": "Any finish (no bonus)",
                "secondary": "sig_strikes > 150 AND strike_diff < 30",
            },
            "tier_2_criteria": {
                "name": "Average",
                "sig_strikes_range": [80, 150],
            },
            "tier_1_criteria": {
                "name": "Low",
                "primary": "sig_strikes < 80",
                "secondary": "High control + low strikes",
            },
            "thresholds": {
                "low_volume": int(strikes_pct[25]),
                "medium_volume": int(strikes_pct[50]),
                "high_volume": int(strikes_pct[75]),
                "very_high_volume": int(strikes_pct[90]),
                "competitive_diff_max": 30,
                "one_sided_diff_min": 50,
            },
            "statistics": {
                "total_fights": len(fights),
                "bonus_fights": len(bonus_fights),
                "fotn_fights": len(fotn_fights),
                "potn_fights": len(potn_fights),
                "overall_finish_rate": sum(1 for f in fights if f['is_finish']) / len(fights),
                "bonus_finish_rate": bonus_stats['finish_rate'],
            }
        }
        json.dump(thresholds, f, indent=2)

    print("Saved tier_thresholds.json")
    print("\nDone!")


if __name__ == '__main__':
    main()
