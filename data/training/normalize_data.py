#!/usr/bin/env python3
"""
Data Normalization Pipeline

Addresses data quality issues identified through analysis:
1. Cleans invalid zero-stat rows (long fights with missing data)
2. Calculates Era-Adjusted Z-Scores to fix temporal bias
3. Generates 'implied_bonus' to fix the 2000-2004 label gap

Based on Gemini analysis recommendations.
"""

import pandas as pd
import numpy as np


def get_era(year: int) -> str:
    """Categorize year into structural era based on UFC history."""
    if year < 2000:
        return '1_Pioneer'      # No unified rules / sparse stats
    if year < 2005:
        return '2_DarkAges'     # The missing bonus era
    if year < 2010:
        return '3_Growth'       # TUF Boom, sport standardization
    if year < 2015:
        return '4_PreUSADA'     # Fox Era, before USADA testing
    if year < 2020:
        return '5_Modern'       # Early ESPN era
    return '6_Current'          # Apex/Current era


def process_fight_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Main normalization pipeline.

    1. Cleans invalid zero-stat rows.
    2. Calculates Era-Adjusted Z-Scores to fix temporal bias.
    3. Generates 'implied_bonus' to fix the 2000-2004 label gap.

    Args:
        df: Raw training DataFrame

    Returns:
        Normalized DataFrame with new columns
    """
    df = df.copy()

    # --- PRE-PROCESSING: Date & Year ---
    print("Parsing dates...")
    df['event_date_parsed'] = pd.to_datetime(
        df['event_date'],
        format='%B %d, %Y',
        errors='coerce'
    )
    df['year'] = df['event_date_parsed'].dt.year

    # ==========================================================================
    # 1. DATA CLEANING: Filter Invalid Zero-Stat Fights
    # ==========================================================================
    print("\n=== Step 1: Data Cleaning ===")
    initial_count = len(df)

    # Condition: Fight lasted > 5 minutes (300s) BUT has 0 significant stats
    # We keep short fights (e.g., 15s KO) with 0 stats as they are valid "flash" finishes
    is_suspicious_zero = (
        (df['total_fight_time_seconds'] > 300) &
        (df['total_sig_strikes'] == 0) &
        (df['total_knockdowns'] == 0) &
        (df['total_sub_attempts'] == 0) &
        (df['total_control_time'] == 0)
    )

    dropped_rows = df[is_suspicious_zero]
    print(f"Flagged {len(dropped_rows)} suspicious rows:")
    if len(dropped_rows) > 0:
        print(dropped_rows[['event_name', 'fighter1', 'fighter2', 'method', 'year']].head(10).to_string())

    df_clean = df[~is_suspicious_zero].copy()
    dropped_count = initial_count - len(df_clean)
    print(f"\nDropped {dropped_count} rows ({100*dropped_count/initial_count:.2f}%) due to missing stats in long fights.")

    # ==========================================================================
    # 2. FEATURE ENGINEERING: Era-Adjusted Z-Scores
    # ==========================================================================
    print("\n=== Step 2: Era-Adjusted Z-Scores ===")

    df_clean['era'] = df_clean['year'].apply(get_era)

    # Show era distribution
    print("\nEra distribution:")
    print(df_clean['era'].value_counts().sort_index())

    # Metrics to normalize
    metrics = ['total_sig_strikes', 'total_knockdowns', 'total_sub_attempts']

    for metric in metrics:
        # Calculate Z-Score: (Value - Era_Mean) / Era_Std
        # This makes a 30-strike fight in 1998 comparable to a 100-strike fight in 2023
        df_clean[f'{metric}_z'] = df_clean.groupby('era')[metric].transform(
            lambda x: (x - x.mean()) / (x.std() + 1e-6)  # Add epsilon to avoid div/0
        )

    print("\nZ-score columns created:")
    for metric in metrics:
        print(f"  {metric}_z: mean={df_clean[f'{metric}_z'].mean():.4f}, std={df_clean[f'{metric}_z'].std():.4f}")

    # ==========================================================================
    # 3. LABEL FIXING: Implied Bonus Generation
    # ==========================================================================
    print("\n=== Step 3: Implied Bonus Generation ===")

    # Initialize with existing official bonuses
    df_clean['has_official_bonus'] = df_clean['fight_bonus'].notna() & (df_clean['fight_bonus'] != '')

    # Create the Implied Bonus column (starts as copy of official)
    df_clean['implied_bonus'] = df_clean['has_official_bonus'].copy()

    # LOGIC: Backfill bonuses for Pre-2014 (Before POTN was standardized)
    # We use the Z-Scores we just calculated to find statistical outliers

    mask_pre_2014 = df_clean['year'] < 2014

    # Criteria A: Exciting Finish (High impact finish)
    # Logic: It ended AND (had a knockdown OR multiple sub attempts)
    criteria_finish = (
        (df_clean['is_finish'] == True) &
        ((df_clean['total_knockdowns'] >= 1) | (df_clean['total_sub_attempts'] >= 2))
    )

    # Criteria B: Exciting Decision (The "War" proxy)
    # Logic: Went to decision BUT had very high strike volume for its era (Top ~10%)
    # Z-Score > 1.28 is roughly top 10% of distribution
    criteria_war = (
        (df_clean['is_finish'] == False) &
        (df_clean['total_sig_strikes_z'] > 1.28)
    )

    # Apply the backfill ONLY to pre-2014 fights without existing bonus
    mask_no_bonus = ~df_clean['has_official_bonus']
    mask_backfill = mask_pre_2014 & mask_no_bonus & (criteria_finish | criteria_war)

    df_clean.loc[mask_backfill, 'implied_bonus'] = True

    # Also mark exciting modern fights without bonuses as implied
    # (some exciting fights don't get bonuses due to budget constraints)
    mask_modern = df_clean['year'] >= 2014
    mask_very_exciting = (
        (df_clean['total_sig_strikes_z'] > 1.5) |  # Top ~7%
        ((df_clean['is_finish'] == True) & (df_clean['total_knockdowns'] >= 2))
    )
    mask_modern_backfill = mask_modern & mask_no_bonus & mask_very_exciting

    df_clean.loc[mask_modern_backfill, 'implied_bonus'] = True

    # Stats
    official_count = df_clean['has_official_bonus'].sum()
    implied_count = df_clean['implied_bonus'].sum()
    added_bonuses = implied_count - official_count

    print(f"\nOfficial bonuses: {official_count}")
    print(f"Implied bonuses (total): {implied_count}")
    print(f"Backfilled: {added_bonuses} additional fights")

    # Show by era
    print("\nImplied bonus rate by era:")
    for era in sorted(df_clean['era'].unique()):
        era_df = df_clean[df_clean['era'] == era]
        official = era_df['has_official_bonus'].mean() * 100
        implied = era_df['implied_bonus'].mean() * 100
        print(f"  {era}: Official {official:.1f}% → Implied {implied:.1f}%")

    return df_clean


def main():
    """Main function."""
    print("=" * 70)
    print("Data Normalization Pipeline")
    print("=" * 70)

    # Load raw training data
    print("\nLoading training data...")
    df = pd.read_csv('training_data.csv')
    print(f"Loaded {len(df)} fights")

    # Process
    df_normalized = process_fight_data(df)

    # Save
    output_file = 'normalized_training_data.csv'
    df_normalized.to_csv(output_file, index=False)
    print(f"\n✓ Saved {len(df_normalized)} normalized records to {output_file}")

    # Verify temporal bias fix
    print("\n" + "=" * 70)
    print("VERIFICATION: Tier Distribution (using implied_bonus)")
    print("=" * 70)

    # Quick tier assignment using implied bonus
    def quick_tier(row):
        if row['fight_bonus'] == 'FOTN':
            return 5
        if row['implied_bonus']:
            return 4  # Implied excellent
        if row['is_finish']:
            return 3
        if row['total_sig_strikes_z'] > 0:
            return 2
        return 1

    df_normalized['quick_tier'] = df_normalized.apply(quick_tier, axis=1)

    print("\nTier distribution by era (with implied bonuses):")
    for era in sorted(df_normalized['era'].unique()):
        era_df = df_normalized[df_normalized['era'] == era]
        tier1_pct = (era_df['quick_tier'] == 1).mean() * 100
        tier4_plus = (era_df['quick_tier'] >= 4).mean() * 100
        print(f"  {era}: Tier1={tier1_pct:.1f}%, Tier4+={tier4_plus:.1f}%")

    print("\nDone!")


if __name__ == '__main__':
    main()
