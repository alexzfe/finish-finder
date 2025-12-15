#!/usr/bin/env python3
"""
Snorkel-Style Labeling Functions for Entertainment Tier Classification

Implements 10 labeling functions that vote on entertainment tier (1-5).
Each function returns:
- -1 (ABSTAIN): No signal
- 0-4: Tier 1-5 (0 = Tier 1 Low, 4 = Tier 5 Elite)

Based on the plan's specifications:
1. lf_fotn_bonus → Tier 5 (high confidence)
2. lf_potn_bonus → Tier 4 (high confidence)
3. lf_early_finish (round 1 KO/SUB) → Tier 4-5
4. lf_high_volume_competitive (>150 strikes, <30 diff) → Tier 3-4
5. lf_finish_with_action (finish + >80 strikes) → Tier 3-4
6. lf_any_finish → Tier 3
7. lf_knockdown_present → Tier 3+
8. lf_low_volume (<60 strikes) → Tier 1-2
9. lf_one_sided_grappling (>5min ctrl diff, low strikes) → Tier 1
10. lf_decision_low_action (decision + <100 strikes) → Tier 2
"""

import numpy as np
import pandas as pd
from typing import Callable, List, Dict, Any

# Constants
ABSTAIN = -1
TIER_1_LOW = 0
TIER_2_AVERAGE = 1
TIER_3_GOOD = 2
TIER_4_EXCELLENT = 3
TIER_5_ELITE = 4

# Thresholds from data analysis
THRESHOLDS = {
    'low_volume': 28,           # 25th percentile
    'medium_volume': 61,        # 50th percentile
    'high_volume': 104,         # 75th percentile
    'very_high_volume': 153,    # 90th percentile
    'competitive_diff_max': 30, # Max strike diff for "competitive"
    'one_sided_diff_min': 50,   # Min diff for "one-sided"
    'high_action_finish': 80,   # Strikes for "finish with action"
    'very_high_action_finish': 100,  # Strikes for tier 4 finish
    'grappling_control_min': 300,    # 5 min control time
}


def lf_fotn_bonus(row: Dict[str, Any]) -> int:
    """
    LF1: Fight of the Night bonus → Tier 5 (Elite)

    FOTN is the strongest signal for entertainment - both fighters
    put on a show worthy of bonus recognition.
    """
    fight_bonus = row.get('fight_bonus', '')
    if fight_bonus == 'FOTN':
        return TIER_5_ELITE
    return ABSTAIN


def lf_potn_bonus(row: Dict[str, Any]) -> int:
    """
    LF2: Performance of the Night bonus → Tier 4 (Excellent)

    POTN indicates one fighter had a standout performance.
    Also includes legacy KOTN/SOTN bonuses.
    """
    fight_bonus = row.get('fight_bonus', '')
    fighter1_bonus = row.get('fighter1_bonus', '')
    fighter2_bonus = row.get('fighter2_bonus', '')

    if fight_bonus in ['POTN', 'KOTN', 'SOTN']:
        return TIER_4_EXCELLENT
    if fighter1_bonus in ['POTN', 'KOTN', 'SOTN'] or fighter2_bonus in ['POTN', 'KOTN', 'SOTN']:
        return TIER_4_EXCELLENT
    return ABSTAIN


def lf_implied_bonus(row: Dict[str, Any]) -> int:
    """
    LF2b: Implied bonus for pre-2014 fights → Tier 4 (Excellent)

    Uses the implied_bonus flag from normalization to identify
    exciting fights that didn't receive official bonuses due to
    the bonus system not existing or data gaps.
    """
    # Only fire for fights without official bonus
    fight_bonus = row.get('fight_bonus', '')
    if pd.notna(fight_bonus) and fight_bonus != '':
        return ABSTAIN

    implied = row.get('implied_bonus', False)
    if implied in [True, 'True', 1, '1']:
        return TIER_4_EXCELLENT
    return ABSTAIN


def lf_early_finish(row: Dict[str, Any]) -> int:
    """
    LF3: Early round 1 finish → Tier 4-5

    Round 1 finishes under 3 minutes with action are typically exciting.
    Very early finishes (< 60s) indicate explosive action.
    """
    is_finish = row.get('is_finish')
    if is_finish in [True, 'True', 1, '1']:
        fight_round = int(row.get('round', 0) or 0)
        fight_time = int(row.get('total_fight_time_seconds', 0) or 0)
        sig_strikes = int(row.get('total_sig_strikes', 0) or 0)

        if fight_round == 1:
            # Very early explosive finish
            if fight_time < 60:
                return TIER_5_ELITE if sig_strikes > 10 else TIER_4_EXCELLENT
            # Quick finish with action
            if fight_time < 180 and sig_strikes >= 30:
                return TIER_4_EXCELLENT
    return ABSTAIN


def lf_high_volume_competitive(row: Dict[str, Any]) -> int:
    """
    LF4: High volume + competitive → Tier 3-4

    Fights with >150 strikes and close strike differential
    indicate back-and-forth action.
    """
    sig_strikes = int(row.get('total_sig_strikes', 0) or 0)

    if sig_strikes > THRESHOLDS['very_high_volume']:
        # For competitive assessment, we don't have strike differential
        # in the current data, so use knockdowns as proxy
        knockdowns = int(row.get('total_knockdowns', 0) or 0)

        # Very high volume with knockdowns = likely exciting
        if knockdowns >= 2:
            return TIER_4_EXCELLENT
        # Very high volume fight
        return TIER_3_GOOD
    return ABSTAIN


def lf_high_volume_zscore(row: Dict[str, Any]) -> int:
    """
    LF4b: Era-adjusted high volume → Tier 3-4

    Uses Z-score normalized strikes to identify fights that were
    high-volume relative to their era (fixes temporal bias).
    """
    strikes_z = row.get('total_sig_strikes_z')
    if strikes_z is None or pd.isna(strikes_z):
        return ABSTAIN

    # Top 10% for era = Z > 1.28
    if strikes_z > 1.5:  # Top ~7%
        return TIER_4_EXCELLENT
    if strikes_z > 1.28:  # Top ~10%
        return TIER_3_GOOD
    return ABSTAIN


def lf_finish_with_action(row: Dict[str, Any]) -> int:
    """
    LF5: Finish with significant action → Tier 3-4

    Finishes with >80 strikes indicate a fight with action before the stoppage.
    >100 strikes bumps to Tier 4.
    """
    is_finish = row.get('is_finish')
    if is_finish not in [True, 'True', 1, '1']:
        return ABSTAIN

    sig_strikes = int(row.get('total_sig_strikes', 0) or 0)

    if sig_strikes > THRESHOLDS['very_high_action_finish']:
        return TIER_4_EXCELLENT
    if sig_strikes > THRESHOLDS['high_action_finish']:
        return TIER_3_GOOD
    return ABSTAIN


def lf_any_finish(row: Dict[str, Any]) -> int:
    """
    LF6: Any finish (no bonus) → Tier 3 (Good)

    Finishes are generally more entertaining than decisions.
    Weak signal - only applies if no other finish LF fired.
    """
    is_finish = row.get('is_finish')
    fight_bonus = row.get('fight_bonus', '')

    # Handle NaN values
    if pd.isna(fight_bonus):
        fight_bonus = ''

    if is_finish in [True, 'True', 1, '1'] and not fight_bonus:
        return TIER_3_GOOD
    return ABSTAIN


def lf_knockdown_present(row: Dict[str, Any]) -> int:
    """
    LF7: Multiple knockdowns → Tier 3+

    Knockdowns indicate exciting striking exchanges.
    Multiple knockdowns are definite excitement markers.
    """
    knockdowns = int(row.get('total_knockdowns', 0) or 0)

    if knockdowns >= 3:
        return TIER_4_EXCELLENT
    if knockdowns >= 2:
        return TIER_3_GOOD
    return ABSTAIN


def lf_low_volume(row: Dict[str, Any]) -> int:
    """
    LF8: Low volume fight → Tier 1-2

    Fights with very few strikes tend to be less entertaining.
    Very low (<28 strikes) is likely boring.
    """
    sig_strikes = int(row.get('total_sig_strikes', 0) or 0)
    is_finish = row.get('is_finish')

    # Don't penalize quick finishes
    if is_finish in [True, 'True', 1, '1']:
        fight_time = int(row.get('total_fight_time_seconds', 0) or 0)
        if fight_time < 180:  # < 3 minutes
            return ABSTAIN

    if sig_strikes < THRESHOLDS['low_volume']:
        return TIER_1_LOW
    if sig_strikes < THRESHOLDS['medium_volume']:
        return TIER_2_AVERAGE
    return ABSTAIN


def lf_one_sided_grappling(row: Dict[str, Any]) -> int:
    """
    LF9: One-sided grappling → Tier 1

    High control time with low strikes indicates a grinding style.
    These fights are often viewed as less exciting.
    """
    control_time = int(row.get('total_control_time', 0) or 0)
    sig_strikes = int(row.get('total_sig_strikes', 0) or 0)
    fight_time = int(row.get('total_fight_time_seconds', 0) or 0)

    if fight_time == 0:
        return ABSTAIN

    # Control dominance (> 60% of fight time)
    control_pct = control_time / fight_time

    if control_pct > 0.6 and sig_strikes < THRESHOLDS['medium_volume']:
        return TIER_1_LOW

    # Very high control with below average strikes
    if control_time > THRESHOLDS['grappling_control_min'] and sig_strikes < THRESHOLDS['high_volume']:
        return TIER_2_AVERAGE

    return ABSTAIN


def lf_decision_low_action(row: Dict[str, Any]) -> int:
    """
    LF10: Decision with low action → Tier 2

    Decisions that go the distance with moderate-low action
    are typically average entertainment.
    """
    is_finish = row.get('is_finish')
    if is_finish in [True, 'True', 1, '1']:
        return ABSTAIN

    sig_strikes = int(row.get('total_sig_strikes', 0) or 0)

    # Decision with below-average action
    if sig_strikes < THRESHOLDS['high_volume']:
        return TIER_2_AVERAGE
    return ABSTAIN


# Registry of all labeling functions
LABELING_FUNCTIONS: List[Callable[[Dict[str, Any]], int]] = [
    lf_fotn_bonus,              # LF1: FOTN bonus
    lf_potn_bonus,              # LF2: POTN/KOTN/SOTN bonus
    lf_implied_bonus,           # LF3: Implied bonus (pre-2014)
    lf_early_finish,            # LF4: Early dramatic finish
    lf_high_volume_competitive, # LF5: High volume (absolute)
    lf_high_volume_zscore,      # LF6: High volume (era-adjusted)
    lf_finish_with_action,      # LF7: Finish with action
    lf_any_finish,              # LF8: Any finish
    lf_knockdown_present,       # LF9: Knockdowns present
    lf_low_volume,              # LF10: Low volume
    lf_one_sided_grappling,     # LF11: One-sided grappling
    lf_decision_low_action,     # LF12: Decision with low action
]

LF_NAMES = [
    'lf_fotn_bonus',
    'lf_potn_bonus',
    'lf_implied_bonus',
    'lf_early_finish',
    'lf_high_volume_competitive',
    'lf_high_volume_zscore',
    'lf_finish_with_action',
    'lf_any_finish',
    'lf_knockdown_present',
    'lf_low_volume',
    'lf_one_sided_grappling',
    'lf_decision_low_action',
]


def apply_labeling_functions(df: pd.DataFrame) -> np.ndarray:
    """
    Apply all labeling functions to a dataframe.

    Returns:
        L: numpy array of shape (n_samples, n_labeling_functions)
           Values are -1 (abstain) or 0-4 (tiers 1-5)
    """
    n_samples = len(df)
    n_lfs = len(LABELING_FUNCTIONS)
    L = np.full((n_samples, n_lfs), ABSTAIN, dtype=int)

    for i, row in df.iterrows():
        row_dict = row.to_dict()
        for j, lf in enumerate(LABELING_FUNCTIONS):
            try:
                L[i, j] = lf(row_dict)
            except Exception as e:
                # On error, abstain
                L[i, j] = ABSTAIN

    return L


def get_lf_summary(L: np.ndarray, lf_names: List[str] = None) -> pd.DataFrame:
    """
    Generate summary statistics for labeling function outputs.
    """
    if lf_names is None:
        lf_names = LF_NAMES

    n_samples, n_lfs = L.shape

    summary = []
    for j in range(n_lfs):
        col = L[:, j]
        non_abstain = col[col != ABSTAIN]

        summary.append({
            'lf_name': lf_names[j],
            'coverage': len(non_abstain) / n_samples,
            'n_labels': len(non_abstain),
            'n_tier1': np.sum(col == TIER_1_LOW),
            'n_tier2': np.sum(col == TIER_2_AVERAGE),
            'n_tier3': np.sum(col == TIER_3_GOOD),
            'n_tier4': np.sum(col == TIER_4_EXCELLENT),
            'n_tier5': np.sum(col == TIER_5_ELITE),
        })

    return pd.DataFrame(summary)


def main():
    """Test labeling functions on training data."""
    print("=" * 60)
    print("Labeling Functions Test")
    print("=" * 60)

    # Load normalized training data (includes implied_bonus and z-scores)
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

    # Summary statistics
    print("\nLabeling Function Summary:")
    summary = get_lf_summary(L)
    print(summary.to_string(index=False))

    # Coverage analysis
    print("\n\nCoverage Analysis:")
    total_coverage = np.mean(np.any(L != ABSTAIN, axis=1))
    print(f"  Overall coverage (at least one LF fires): {total_coverage:.1%}")

    # Label agreement
    print("\nLabel Agreement:")
    for i in range(5):
        tier_votes = np.sum(L == i, axis=1)
        unanimous = np.sum(tier_votes == np.sum(L != ABSTAIN, axis=1))
        print(f"  Tier {i+1}: {np.sum(tier_votes > 0)} fights have at least one vote")

    # Conflict analysis
    conflicts = 0
    for i in range(len(df)):
        row_labels = L[i][L[i] != ABSTAIN]
        if len(row_labels) > 1 and len(set(row_labels)) > 1:
            conflicts += 1
    print(f"\n  Conflicts (LFs disagree): {conflicts} ({100*conflicts/len(df):.1f}%)")

    # Save label matrix
    np.save('label_matrix.npy', L)
    print("\nSaved label matrix to label_matrix.npy")


if __name__ == '__main__':
    main()
