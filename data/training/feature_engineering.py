#!/usr/bin/env python3
"""
Feature Engineering Pipeline for Entertainment Tier Prediction

Generates pre-fight features for the tier classifier:
1. Fighter career statistics (as-of fight date)
2. Matchup features
3. Context features (weight class, card position)

Critical: All features must be calculable BEFORE the fight happens.
"""

import pandas as pd
import numpy as np
from collections import defaultdict
from datetime import datetime
import re
import warnings
warnings.filterwarnings('ignore')


def parse_landed_attempted(value: str) -> tuple:
    """Parse '22 of 68' format to (landed, attempted)."""
    if pd.isna(value) or value == '':
        return 0, 0
    match = re.match(r'(\d+)\s*of\s*(\d+)', str(value))
    if match:
        return int(match.group(1)), int(match.group(2))
    return 0, 0


def parse_control_time(value: str) -> int:
    """Parse '1:33' or '0:00' to total seconds."""
    if pd.isna(value) or value == '' or value == '--':
        return 0
    try:
        if ':' in str(value):
            parts = str(value).split(':')
            return int(parts[0]) * 60 + int(parts[1])
        return int(value)
    except (ValueError, IndexError):
        return 0


def load_fight_stats() -> pd.DataFrame:
    """Load and parse round-by-round fight statistics."""
    print("Loading fight stats...")
    df = pd.read_csv('ufc_fight_stats.csv')

    # Parse landed/attempted columns
    for col in ['SIG.STR.', 'TOTAL STR.', 'TD', 'HEAD', 'BODY', 'LEG', 'DISTANCE', 'CLINCH', 'GROUND']:
        if col in df.columns:
            df[f'{col}_landed'], df[f'{col}_attempted'] = zip(*df[col].apply(parse_landed_attempted))

    # Parse control time
    df['CTRL_seconds'] = df['CTRL'].apply(parse_control_time)

    # Parse knockdowns and sub attempts as integers
    df['KD'] = pd.to_numeric(df['KD'], errors='coerce').fillna(0).astype(int)
    df['SUB.ATT'] = pd.to_numeric(df['SUB.ATT'], errors='coerce').fillna(0).astype(int)
    df['REV.'] = pd.to_numeric(df['REV.'], errors='coerce').fillna(0).astype(int)

    print(f"  Loaded {len(df)} round-level records")
    return df


def load_fight_results() -> pd.DataFrame:
    """Load fight results with outcomes."""
    print("Loading fight results...")
    df = pd.read_csv('ufc_fight_results.csv')
    print(f"  Loaded {len(df)} fight results")
    return df


def load_event_details() -> pd.DataFrame:
    """Load event dates."""
    print("Loading event details...")
    df = pd.read_csv('ufc_event_details.csv')
    df['DATE'] = pd.to_datetime(df['DATE'], format='%B %d, %Y', errors='coerce')
    print(f"  Loaded {len(df)} events")
    return df


def load_fighter_tott() -> pd.DataFrame:
    """Load tale of the tape (physical attributes)."""
    print("Loading fighter TOTT...")
    df = pd.read_csv('ufc_fighter_tott.csv')

    # Parse height (e.g., "5' 11\"" -> inches)
    def parse_height(h):
        if pd.isna(h) or h == '--':
            return np.nan
        match = re.match(r"(\d+)'\s*(\d+)\"?", str(h))
        if match:
            return int(match.group(1)) * 12 + int(match.group(2))
        return np.nan

    # Parse reach (e.g., "74\"" -> 74)
    def parse_reach(r):
        if pd.isna(r) or r == '--':
            return np.nan
        match = re.match(r'(\d+)', str(r))
        if match:
            return int(match.group(1))
        return np.nan

    # Parse weight
    def parse_weight(w):
        if pd.isna(w) or w == '--':
            return np.nan
        match = re.match(r'(\d+)', str(w))
        if match:
            return int(match.group(1))
        return np.nan

    df['height_inches'] = df['HEIGHT'].apply(parse_height)
    df['reach_inches'] = df['REACH'].apply(parse_reach)
    df['weight_lbs'] = df['WEIGHT'].apply(parse_weight)

    print(f"  Loaded {len(df)} fighter profiles")
    return df


def parse_round_number(round_str) -> int:
    """Parse 'Round 1' to 1."""
    if pd.isna(round_str):
        return 1
    match = re.search(r'(\d+)', str(round_str))
    if match:
        return int(match.group(1))
    return 1


def aggregate_fighter_stats(fight_stats: pd.DataFrame, events: pd.DataFrame) -> pd.DataFrame:
    """Aggregate round-level stats to fight-level per fighter."""
    print("Aggregating to fight level...")

    # Parse round numbers first
    fight_stats['ROUND_NUM'] = fight_stats['ROUND'].apply(parse_round_number)

    # Group by event, bout, fighter
    agg = fight_stats.groupby(['EVENT', 'BOUT', 'FIGHTER']).agg({
        'KD': 'sum',
        'SIG.STR._landed': 'sum',
        'SIG.STR._attempted': 'sum',
        'TOTAL STR._landed': 'sum',
        'TOTAL STR._attempted': 'sum',
        'TD_landed': 'sum',
        'TD_attempted': 'sum',
        'SUB.ATT': 'sum',
        'REV.': 'sum',
        'CTRL_seconds': 'sum',
        'HEAD_landed': 'sum',
        'BODY_landed': 'sum',
        'LEG_landed': 'sum',
        'DISTANCE_landed': 'sum',
        'CLINCH_landed': 'sum',
        'GROUND_landed': 'sum',
        'ROUND_NUM': 'max'  # Last round
    }).reset_index()

    # Rename for clarity
    agg = agg.rename(columns={'ROUND_NUM': 'ROUND'})

    # Merge with event dates
    events_dates = events[['EVENT', 'DATE']].copy()
    events_dates.columns = ['EVENT', 'event_date']
    agg = agg.merge(events_dates, on='EVENT', how='left')

    print(f"  Created {len(agg)} fighter-fight records")
    return agg


def build_fighter_history(fighter_stats: pd.DataFrame, results: pd.DataFrame) -> dict:
    """
    Build chronological fight history for each fighter.

    Returns dict: fighter_name -> list of fight dicts sorted by date
    """
    print("Building fighter histories...")

    # Get outcome info from results
    results_lookup = {}
    for _, row in results.iterrows():
        bout = row['BOUT'].strip()
        results_lookup[bout] = {
            'method': row['METHOD'],
            'round': row['ROUND'],
            'time': row['TIME'],
            'outcome': row['OUTCOME']
        }

    # Build history per fighter
    fighter_history = defaultdict(list)

    for _, row in fighter_stats.iterrows():
        fighter = row['FIGHTER'].strip()
        bout = row['BOUT'].strip()
        event_date = row['event_date']

        if pd.isna(event_date):
            continue

        # Get result info
        result_info = results_lookup.get(bout, {})

        # Determine if this fighter won
        outcome = result_info.get('outcome', '')
        method = result_info.get('method', '')

        # Parse bout to get opponent and determine win/loss
        fighters_in_bout = bout.split(' vs. ')
        if len(fighters_in_bout) == 2:
            f1, f2 = [f.strip() for f in fighters_in_bout]
            opponent = f2 if fighter == f1 else f1

            # Determine if won
            is_winner = outcome.startswith(fighter.split()[0]) if outcome else None
        else:
            opponent = ''
            is_winner = None

        # Determine finish type
        is_ko = 'KO' in method or 'TKO' in method
        is_sub = 'SUB' in method or 'Submission' in method
        is_decision = 'DEC' in method or 'Decision' in method
        is_finish = is_ko or is_sub

        fight_record = {
            'event': row['EVENT'],
            'date': event_date,
            'opponent': opponent,
            'is_winner': is_winner,
            'method': method,
            'is_ko': is_ko,
            'is_sub': is_sub,
            'is_decision': is_decision,
            'is_finish': is_finish,
            'rounds_fought': int(row['ROUND']) if pd.notna(row['ROUND']) else 1,
            'kd': int(row['KD']) if pd.notna(row['KD']) else 0,
            'sig_str_landed': int(row['SIG.STR._landed']) if pd.notna(row['SIG.STR._landed']) else 0,
            'sig_str_attempted': int(row['SIG.STR._attempted']) if pd.notna(row['SIG.STR._attempted']) else 0,
            'total_str_landed': int(row['TOTAL STR._landed']) if pd.notna(row['TOTAL STR._landed']) else 0,
            'td_landed': int(row['TD_landed']) if pd.notna(row['TD_landed']) else 0,
            'td_attempted': int(row['TD_attempted']) if pd.notna(row['TD_attempted']) else 0,
            'sub_att': int(row['SUB.ATT']) if pd.notna(row['SUB.ATT']) else 0,
            'ctrl_seconds': int(row['CTRL_seconds']) if pd.notna(row['CTRL_seconds']) else 0,
            'head_landed': int(row['HEAD_landed']) if pd.notna(row['HEAD_landed']) else 0,
            'body_landed': int(row['BODY_landed']) if pd.notna(row['BODY_landed']) else 0,
            'leg_landed': int(row['LEG_landed']) if pd.notna(row['LEG_landed']) else 0,
        }

        fighter_history[fighter].append(fight_record)

    # Sort each fighter's history by date
    for fighter in fighter_history:
        fighter_history[fighter].sort(key=lambda x: x['date'])

    print(f"  Built history for {len(fighter_history)} fighters")
    return dict(fighter_history)


def calculate_career_stats(fights: list, as_of_date: pd.Timestamp) -> dict:
    """
    Calculate career statistics for a fighter using only fights BEFORE as_of_date.

    Returns dict of career features.
    """
    # Filter to fights before the target date
    prior_fights = [f for f in fights if f['date'] < as_of_date]

    if len(prior_fights) == 0:
        return {
            'career_fights': 0,
            'career_wins': 0,
            'career_losses': 0,
            'career_win_rate': 0.5,  # Default for unknown
            'career_finish_rate': 0.0,
            'career_ko_rate': 0.0,
            'career_sub_rate': 0.0,
            'career_sig_str_per_round': 0.0,
            'career_sig_str_accuracy': 0.0,
            'career_td_per_round': 0.0,
            'career_td_accuracy': 0.0,
            'career_sub_att_per_round': 0.0,
            'career_kd_per_round': 0.0,
            'career_ctrl_per_round': 0.0,
            'career_avg_rounds': 0.0,
            'career_bonus_count': 0,  # TODO: Add from bonus data
            'recent_win_streak': 0,
            'recent_loss_streak': 0,
        }

    # Basic record
    wins = sum(1 for f in prior_fights if f['is_winner'] == True)
    losses = sum(1 for f in prior_fights if f['is_winner'] == False)
    total = len(prior_fights)

    # Finish rates (among wins)
    ko_wins = sum(1 for f in prior_fights if f['is_winner'] and f['is_ko'])
    sub_wins = sum(1 for f in prior_fights if f['is_winner'] and f['is_sub'])
    finish_wins = ko_wins + sub_wins

    # Per-round stats
    total_rounds = sum(f['rounds_fought'] for f in prior_fights)
    total_sig_str = sum(f['sig_str_landed'] for f in prior_fights)
    total_sig_str_att = sum(f['sig_str_attempted'] for f in prior_fights)
    total_td = sum(f['td_landed'] for f in prior_fights)
    total_td_att = sum(f['td_attempted'] for f in prior_fights)
    total_sub_att = sum(f['sub_att'] for f in prior_fights)
    total_kd = sum(f['kd'] for f in prior_fights)
    total_ctrl = sum(f['ctrl_seconds'] for f in prior_fights)

    # Recent form (last 3 fights)
    recent = prior_fights[-3:] if len(prior_fights) >= 3 else prior_fights
    win_streak = 0
    loss_streak = 0
    for f in reversed(prior_fights):
        if f['is_winner'] == True:
            if loss_streak == 0:
                win_streak += 1
            else:
                break
        elif f['is_winner'] == False:
            if win_streak == 0:
                loss_streak += 1
            else:
                break

    return {
        'career_fights': total,
        'career_wins': wins,
        'career_losses': losses,
        'career_win_rate': wins / total if total > 0 else 0.5,
        'career_finish_rate': finish_wins / wins if wins > 0 else 0.0,
        'career_ko_rate': ko_wins / wins if wins > 0 else 0.0,
        'career_sub_rate': sub_wins / wins if wins > 0 else 0.0,
        'career_sig_str_per_round': total_sig_str / total_rounds if total_rounds > 0 else 0.0,
        'career_sig_str_accuracy': total_sig_str / total_sig_str_att if total_sig_str_att > 0 else 0.0,
        'career_td_per_round': total_td / total_rounds if total_rounds > 0 else 0.0,
        'career_td_accuracy': total_td / total_td_att if total_td_att > 0 else 0.0,
        'career_sub_att_per_round': total_sub_att / total_rounds if total_rounds > 0 else 0.0,
        'career_kd_per_round': total_kd / total_rounds if total_rounds > 0 else 0.0,
        'career_ctrl_per_round': total_ctrl / total_rounds if total_rounds > 0 else 0.0,
        'career_avg_rounds': total_rounds / total if total > 0 else 0.0,
        'career_bonus_count': 0,  # TODO: Add from bonus data
        'recent_win_streak': win_streak,
        'recent_loss_streak': loss_streak,
    }


def normalize_fighter_name(name: str) -> str:
    """Normalize fighter name for matching."""
    if pd.isna(name):
        return ''
    # Remove extra whitespace, lowercase
    name = ' '.join(str(name).lower().split())
    return name


def get_weight_class_stats() -> dict:
    """Get baseline finish rates by weight class."""
    # Pre-computed from historical data
    return {
        "Women's Strawweight": 0.28,
        "Women's Flyweight": 0.30,
        "Women's Bantamweight": 0.32,
        "Women's Featherweight": 0.35,
        "Flyweight": 0.32,
        "Bantamweight": 0.35,
        "Featherweight": 0.38,
        "Lightweight": 0.40,
        "Welterweight": 0.42,
        "Middleweight": 0.45,
        "Light Heavyweight": 0.52,
        "Heavyweight": 0.65,
        "Catch Weight": 0.40,
        "Open Weight": 0.50,
    }


def build_features(labeled_data: pd.DataFrame, fighter_history: dict,
                   fighter_tott: pd.DataFrame, events: pd.DataFrame) -> pd.DataFrame:
    """
    Build pre-fight features for each fight in labeled_data.

    Features are calculated using only data available BEFORE each fight.
    """
    print("Building features...")

    # Create TOTT lookup by normalized name
    tott_lookup = {}
    for _, row in fighter_tott.iterrows():
        name = normalize_fighter_name(row['FIGHTER'])
        tott_lookup[name] = {
            'height': row['height_inches'],
            'reach': row['reach_inches'],
            'weight': row['weight_lbs'],
            'stance': row['STANCE'],
        }

    # Weight class baseline stats
    wc_stats = get_weight_class_stats()

    # Parse event dates in labeled data
    labeled_data['fight_date'] = pd.to_datetime(
        labeled_data['event_date'],
        format='%B %d, %Y',
        errors='coerce'
    )

    features_list = []

    for idx, row in labeled_data.iterrows():
        if idx % 500 == 0:
            print(f"  Processing fight {idx}/{len(labeled_data)}...")

        fight_date = row['fight_date']
        if pd.isna(fight_date):
            continue

        # Get fighter names (fighter1 and fighter2 from labeled data)
        f1_name = row['fighter1'].strip() if pd.notna(row['fighter1']) else ''
        f2_name = row['fighter2'].strip() if pd.notna(row['fighter2']) else ''

        # Get career stats for both fighters
        f1_history = fighter_history.get(f1_name, [])
        f2_history = fighter_history.get(f2_name, [])

        f1_stats = calculate_career_stats(f1_history, fight_date)
        f2_stats = calculate_career_stats(f2_history, fight_date)

        # Get physical attributes
        f1_tott = tott_lookup.get(normalize_fighter_name(f1_name), {})
        f2_tott = tott_lookup.get(normalize_fighter_name(f2_name), {})

        # Weight class baseline
        wc = row.get('weight_class', '')
        wc_finish_rate = wc_stats.get(wc, 0.40)

        # Build feature dict
        features = {
            # Identifiers (not features)
            'event_name': row['event_name'],
            'fight_date': fight_date,
            'fighter1': f1_name,
            'fighter2': f2_name,

            # Target
            'snorkel_tier': row['snorkel_tier'],
            'snorkel_confidence': row['snorkel_confidence'],

            # Fighter 1 career features
            'f1_career_fights': f1_stats['career_fights'],
            'f1_career_win_rate': f1_stats['career_win_rate'],
            'f1_career_finish_rate': f1_stats['career_finish_rate'],
            'f1_career_ko_rate': f1_stats['career_ko_rate'],
            'f1_career_sub_rate': f1_stats['career_sub_rate'],
            'f1_career_sig_str_per_round': f1_stats['career_sig_str_per_round'],
            'f1_career_sig_str_accuracy': f1_stats['career_sig_str_accuracy'],
            'f1_career_td_per_round': f1_stats['career_td_per_round'],
            'f1_career_td_accuracy': f1_stats['career_td_accuracy'],
            'f1_career_sub_att_per_round': f1_stats['career_sub_att_per_round'],
            'f1_career_kd_per_round': f1_stats['career_kd_per_round'],
            'f1_career_ctrl_per_round': f1_stats['career_ctrl_per_round'],
            'f1_career_avg_rounds': f1_stats['career_avg_rounds'],
            'f1_recent_win_streak': f1_stats['recent_win_streak'],
            'f1_recent_loss_streak': f1_stats['recent_loss_streak'],

            # Fighter 2 career features
            'f2_career_fights': f2_stats['career_fights'],
            'f2_career_win_rate': f2_stats['career_win_rate'],
            'f2_career_finish_rate': f2_stats['career_finish_rate'],
            'f2_career_ko_rate': f2_stats['career_ko_rate'],
            'f2_career_sub_rate': f2_stats['career_sub_rate'],
            'f2_career_sig_str_per_round': f2_stats['career_sig_str_per_round'],
            'f2_career_sig_str_accuracy': f2_stats['career_sig_str_accuracy'],
            'f2_career_td_per_round': f2_stats['career_td_per_round'],
            'f2_career_td_accuracy': f2_stats['career_td_accuracy'],
            'f2_career_sub_att_per_round': f2_stats['career_sub_att_per_round'],
            'f2_career_kd_per_round': f2_stats['career_kd_per_round'],
            'f2_career_ctrl_per_round': f2_stats['career_ctrl_per_round'],
            'f2_career_avg_rounds': f2_stats['career_avg_rounds'],
            'f2_recent_win_streak': f2_stats['recent_win_streak'],
            'f2_recent_loss_streak': f2_stats['recent_loss_streak'],

            # Physical attributes
            'f1_height': f1_tott.get('height', np.nan),
            'f1_reach': f1_tott.get('reach', np.nan),
            'f2_height': f2_tott.get('height', np.nan),
            'f2_reach': f2_tott.get('reach', np.nan),

            # Matchup features (combined/differential)
            'combined_finish_rate': (f1_stats['career_finish_rate'] + f2_stats['career_finish_rate']) / 2,
            'combined_ko_rate': (f1_stats['career_ko_rate'] + f2_stats['career_ko_rate']) / 2,
            'combined_sig_str_per_round': f1_stats['career_sig_str_per_round'] + f2_stats['career_sig_str_per_round'],
            'combined_kd_per_round': f1_stats['career_kd_per_round'] + f2_stats['career_kd_per_round'],
            'experience_diff': abs(f1_stats['career_fights'] - f2_stats['career_fights']),
            'reach_diff': (f1_tott.get('reach', 70) or 70) - (f2_tott.get('reach', 70) or 70),
            'height_diff': (f1_tott.get('height', 70) or 70) - (f2_tott.get('height', 70) or 70),

            # Context features
            'weight_class': wc,
            'wc_baseline_finish_rate': wc_finish_rate,
            'is_title_fight': 'title' in str(row.get('weight_class', '')).lower(),
            'scheduled_rounds': row.get('scheduled_rounds', 3),

            # Year for temporal split
            'year': fight_date.year,
        }

        features_list.append(features)

    df = pd.DataFrame(features_list)
    print(f"  Built {len(df)} feature vectors")
    return df


def main():
    """Main feature engineering pipeline."""
    print("=" * 70)
    print("Feature Engineering Pipeline")
    print("=" * 70)

    # Load data
    fight_stats = load_fight_stats()
    results = load_fight_results()
    events = load_event_details()
    fighter_tott = load_fighter_tott()
    labeled_data = pd.read_csv('snorkel_labeled_data.csv')
    print(f"Loaded {len(labeled_data)} labeled fights")

    # Aggregate fight stats to fight level
    fighter_fight_stats = aggregate_fighter_stats(fight_stats, events)

    # Build fighter history
    fighter_history = build_fighter_history(fighter_fight_stats, results)

    # Build features
    features_df = build_features(labeled_data, fighter_history, fighter_tott, events)

    # Save
    output_file = 'fight_features.csv'
    features_df.to_csv(output_file, index=False)
    print(f"\n✓ Saved {len(features_df)} feature vectors to {output_file}")

    # Summary statistics
    print("\n" + "=" * 70)
    print("Feature Summary")
    print("=" * 70)

    # Check coverage
    feature_cols = [c for c in features_df.columns if c.startswith('f1_') or c.startswith('f2_') or c.startswith('combined_')]
    print(f"\nTotal features: {len(feature_cols)}")

    # Check for fighters with history
    has_f1_history = (features_df['f1_career_fights'] > 0).sum()
    has_f2_history = (features_df['f2_career_fights'] > 0).sum()
    both_history = ((features_df['f1_career_fights'] > 0) & (features_df['f2_career_fights'] > 0)).sum()

    print(f"\nFights with fighter1 history: {has_f1_history} ({100*has_f1_history/len(features_df):.1f}%)")
    print(f"Fights with fighter2 history: {has_f2_history} ({100*has_f2_history/len(features_df):.1f}%)")
    print(f"Fights with both fighters having history: {both_history} ({100*both_history/len(features_df):.1f}%)")

    # Year distribution
    print("\nYear distribution:")
    print(features_df['year'].value_counts().sort_index().tail(10))

    print("\nDone!")


if __name__ == '__main__':
    main()
