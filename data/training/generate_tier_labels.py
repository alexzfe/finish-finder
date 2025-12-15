#!/usr/bin/env python3
"""
Generate Tier Labels

Applies tier labeling functions to the training data based on
the thresholds derived from statistical analysis.

Entertainment Tiers:
- Tier 5 (Elite): FOTN bonus
- Tier 4 (Excellent): POTN bonus OR high-action finish
- Tier 3 (Good): Finish OR high-volume competitive
- Tier 2 (Average): Moderate activity
- Tier 1 (Low): Low activity or one-sided

Output: labeled_training_data.csv with tier assignments
"""

import csv
import json
from collections import defaultdict


# Load thresholds from analysis
def load_thresholds(filepath: str) -> dict:
    """Load tier thresholds from JSON file."""
    with open(filepath, 'r') as f:
        return json.load(f)


def assign_tier(fight: dict, thresholds: dict) -> tuple[int, str, float]:
    """
    Assign entertainment tier to a fight.

    Returns: (tier, reason, confidence)
    """
    t = thresholds['thresholds']

    sig_strikes = fight['total_sig_strikes']
    knockdowns = fight['total_knockdowns']
    is_finish = fight['is_finish']
    fight_bonus = fight['fight_bonus']
    fight_round = fight['round']
    fight_time = fight['total_fight_time_seconds']

    # Calculate strikes per minute
    if fight_time > 0:
        strikes_per_min = sig_strikes / (fight_time / 60)
    else:
        strikes_per_min = 0

    # TIER 5: FOTN bonus
    if fight_bonus == 'FOTN':
        return (5, 'FOTN bonus', 0.95)

    # TIER 4: POTN/KOTN/SOTN bonus OR high-action finish
    if fight_bonus == 'POTN':
        return (4, 'POTN bonus', 0.90)
    if fight_bonus == 'KOTN':
        return (4, 'KOTN bonus (legacy)', 0.90)
    if fight_bonus == 'SOTN':
        return (4, 'SOTN bonus (legacy)', 0.90)

    # High-action finish: Finish + >100 sig strikes OR round 1 finish with good action
    if is_finish:
        if sig_strikes > 100:
            return (4, 'Finish + high strikes (>100)', 0.75)
        if fight_round == 1 and fight_time < 180 and sig_strikes > 30:
            return (4, 'Early round 1 finish with action', 0.70)

    # TIER 3: Finish OR high-volume competitive
    if is_finish:
        if sig_strikes > 60:
            return (3, 'Finish with action', 0.70)
        return (3, 'Finish (any)', 0.60)

    # High volume decision
    if sig_strikes > t['very_high_volume']:  # >153 strikes
        return (3, f'Very high volume (>{t["very_high_volume"]})', 0.65)

    # Multiple knockdowns
    if knockdowns >= 2:
        return (3, 'Multiple knockdowns', 0.70)

    # TIER 2: Moderate activity
    if t['medium_volume'] <= sig_strikes <= t['very_high_volume']:  # 61-153 strikes
        return (2, 'Moderate activity', 0.55)

    # TIER 1: Low activity
    if sig_strikes < t['low_volume']:  # <28 strikes
        return (1, 'Very low activity', 0.70)

    if sig_strikes < t['medium_volume']:  # <61 strikes
        return (1, 'Low activity', 0.60)

    # Default to tier 2 for edge cases
    return (2, 'Default (moderate)', 0.40)


def main():
    """Main labeling function."""
    print("=" * 60)
    print("Generating Tier Labels for Training Data")
    print("=" * 60)

    # Load thresholds
    print("\nLoading thresholds...")
    thresholds = load_thresholds('tier_thresholds.json')
    print(f"  Thresholds: {thresholds['thresholds']}")

    # Load training data
    print("\nLoading training data...")
    fights = []
    with open('training_data.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Convert numeric fields
            row['total_sig_strikes'] = int(row['total_sig_strikes']) if row['total_sig_strikes'] else 0
            row['total_knockdowns'] = int(row['total_knockdowns']) if row['total_knockdowns'] else 0
            row['total_fight_time_seconds'] = int(row['total_fight_time_seconds']) if row['total_fight_time_seconds'] else 0
            row['round'] = int(row['round']) if row['round'] else 0
            row['is_finish'] = row['is_finish'] == 'True'
            fights.append(row)

    print(f"  Loaded {len(fights)} fights")

    # Assign tiers
    print("\nAssigning tiers...")
    tier_counts = defaultdict(int)
    reason_counts = defaultdict(int)
    labeled_fights = []

    for fight in fights:
        tier, reason, confidence = assign_tier(fight, thresholds)
        tier_counts[tier] += 1
        reason_counts[reason] += 1

        # Add tier info to fight
        fight['tier'] = tier
        fight['tier_reason'] = reason
        fight['tier_confidence'] = confidence

        # Convert back to string for CSV
        fight['is_finish'] = str(fight['is_finish'])
        fight['total_sig_strikes'] = str(fight['total_sig_strikes'])
        fight['total_knockdowns'] = str(fight['total_knockdowns'])
        fight['total_fight_time_seconds'] = str(fight['total_fight_time_seconds'])
        fight['round'] = str(fight['round'])

        labeled_fights.append(fight)

    # Print distribution
    print("\nTier Distribution:")
    for tier in sorted(tier_counts.keys()):
        count = tier_counts[tier]
        pct = 100 * count / len(fights)
        tier_names = {1: 'Low', 2: 'Average', 3: 'Good', 4: 'Excellent', 5: 'Elite'}
        print(f"  Tier {tier} ({tier_names[tier]}): {count} ({pct:.1f}%)")

    print("\nTop Labeling Reasons:")
    for reason, count in sorted(reason_counts.items(), key=lambda x: -x[1])[:10]:
        print(f"  {reason}: {count}")

    # Save labeled data
    print("\nSaving labeled training data...")
    output_file = 'labeled_training_data.csv'

    # Get fieldnames from first record
    fieldnames = list(labeled_fights[0].keys())

    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(labeled_fights)

    print(f"  Saved {len(labeled_fights)} records to {output_file}")

    # Validation: Check high-confidence labels
    print("\nValidation:")
    high_conf = [f for f in labeled_fights if float(f['tier_confidence']) >= 0.7]
    print(f"  High confidence labels (>=0.7): {len(high_conf)} ({100*len(high_conf)/len(labeled_fights):.1f}%)")

    # Check tier distribution for bonus vs non-bonus
    bonus_tiers = defaultdict(int)
    non_bonus_tiers = defaultdict(int)
    for f in labeled_fights:
        if f['has_bonus'] == 'True':
            bonus_tiers[int(f['tier'])] += 1
        else:
            non_bonus_tiers[int(f['tier'])] += 1

    print("\nBonus fights tier distribution:")
    for tier in sorted(bonus_tiers.keys()):
        print(f"  Tier {tier}: {bonus_tiers[tier]}")

    print("\nNon-bonus fights tier distribution:")
    for tier in sorted(non_bonus_tiers.keys()):
        pct = 100 * non_bonus_tiers[tier] / sum(non_bonus_tiers.values())
        print(f"  Tier {tier}: {non_bonus_tiers[tier]} ({pct:.1f}%)")

    print("\nDone!")


if __name__ == '__main__':
    main()
