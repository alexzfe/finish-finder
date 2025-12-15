#!/usr/bin/env python3
"""
Compute ML Tier Predictions for Fights

This script computes ML tier predictions for fights in the database using
the trained XGBoost model. It can be run as a batch job after scraping
new fights or as a scheduled task to keep predictions up to date.

Usage:
    python scripts/compute-ml-tiers.py [--limit N] [--force]

Arguments:
    --limit N: Only process N fights (for testing)
    --force: Recompute tiers even if already set

Environment:
    DATABASE_URL: PostgreSQL connection string (required)
"""

import os
import sys
import json
import argparse
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import psycopg2
from psycopg2.extras import RealDictCursor

# Add the training directory to path for feature definitions
TRAINING_DIR = Path(__file__).parent.parent / 'data' / 'training'
sys.path.insert(0, str(TRAINING_DIR))

# Feature columns (must match training)
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

# Weight class baseline finish rates (from historical data)
WEIGHT_CLASS_FINISH_RATES = {
    'Heavyweight': 0.70,
    'Light Heavyweight': 0.62,
    'Middleweight': 0.58,
    'Welterweight': 0.52,
    'Lightweight': 0.54,
    'Featherweight': 0.53,
    'Bantamweight': 0.54,
    'Flyweight': 0.52,
    "Women's Bantamweight": 0.56,
    "Women's Flyweight": 0.52,
    "Women's Strawweight": 0.54,
    "Women's Featherweight": 0.60,
    'Catchweight': 0.55,
}


def parse_height_inches(height_str: str) -> float:
    """Convert height string like '5\' 11"' to inches."""
    if not height_str:
        return 0.0
    try:
        # Handle "5' 11\"" format
        parts = height_str.replace('"', '').split("'")
        if len(parts) == 2:
            feet = int(parts[0].strip())
            inches = int(parts[1].strip()) if parts[1].strip() else 0
            return feet * 12 + inches
    except (ValueError, IndexError):
        pass
    return 0.0


def parse_reach_inches(reach_str: str) -> float:
    """Convert reach string like '76"' to inches."""
    if not reach_str:
        return 0.0
    try:
        return float(reach_str.replace('"', '').strip())
    except ValueError:
        return 0.0


def build_fighter_features(fighter: dict, prefix: str) -> dict:
    """Build feature dict for a single fighter."""
    features = {}

    # Career stats
    total_fights = fighter['wins'] + fighter['losses'] + fighter['draws']
    wins = fighter['wins']

    features[f'{prefix}_career_fights'] = total_fights
    features[f'{prefix}_career_win_rate'] = wins / total_fights if total_fights > 0 else 0.0

    # Finish rates
    ko_wins = fighter.get('winsByKO', 0) or 0
    sub_wins = fighter.get('winsBySubmission', 0) or 0
    features[f'{prefix}_career_finish_rate'] = (ko_wins + sub_wins) / wins if wins > 0 else 0.0
    features[f'{prefix}_career_ko_rate'] = ko_wins / wins if wins > 0 else 0.0
    features[f'{prefix}_career_sub_rate'] = sub_wins / wins if wins > 0 else 0.0

    # Striking stats (convert from per-minute to per-round, 5 min rounds)
    slpm = fighter.get('significantStrikesPerMinute', 0) or 0
    features[f'{prefix}_career_sig_str_per_round'] = slpm * 5
    features[f'{prefix}_career_sig_str_accuracy'] = fighter.get('strikingAccuracyPercentage', 0) or 0

    # Takedown stats
    td_avg = fighter.get('takedownAverage', 0) or 0
    features[f'{prefix}_career_td_per_round'] = td_avg / 3  # TD avg is per 15 min
    features[f'{prefix}_career_td_accuracy'] = fighter.get('takedownAccuracyPercentage', 0) or 0

    # Submission attempts (estimate from submission wins)
    features[f'{prefix}_career_sub_att_per_round'] = fighter.get('submissionAverage', 0) or 0

    # Knockdowns (estimate from KO rate and striking)
    # Not directly available, use approximation
    features[f'{prefix}_career_kd_per_round'] = (slpm * 0.01) * features[f'{prefix}_career_ko_rate']

    # Control time (not available in fighter stats, use 0)
    features[f'{prefix}_career_ctrl_per_round'] = 0.0

    # Average rounds (estimate from fight time if available)
    avg_time_sec = fighter.get('averageFightTimeSeconds', 0) or 0
    features[f'{prefix}_career_avg_rounds'] = avg_time_sec / 300 if avg_time_sec > 0 else 2.0

    # Recent streaks (not directly available, approximate from record)
    # Positive record suggests win streak potential
    features[f'{prefix}_recent_win_streak'] = min(3, wins - fighter['losses']) if wins > fighter['losses'] else 0
    features[f'{prefix}_recent_loss_streak'] = min(3, fighter['losses'] - wins) if fighter['losses'] > wins else 0

    # Physical attributes
    features[f'{prefix}_height'] = parse_height_inches(fighter.get('height', ''))
    features[f'{prefix}_reach'] = fighter.get('reachInches', 0) or parse_reach_inches(fighter.get('reach', ''))

    return features


def build_fight_features(fight: dict, fighter1: dict, fighter2: dict) -> dict:
    """Build complete feature vector for a fight."""
    features = {}

    # Fighter 1 features
    f1_features = build_fighter_features(fighter1, 'f1')
    features.update(f1_features)

    # Fighter 2 features
    f2_features = build_fighter_features(fighter2, 'f2')
    features.update(f2_features)

    # Matchup features
    features['combined_finish_rate'] = (f1_features['f1_career_finish_rate'] + f2_features['f2_career_finish_rate']) / 2
    features['combined_ko_rate'] = (f1_features['f1_career_ko_rate'] + f2_features['f2_career_ko_rate']) / 2
    features['combined_sig_str_per_round'] = (f1_features['f1_career_sig_str_per_round'] + f2_features['f2_career_sig_str_per_round']) / 2
    features['combined_kd_per_round'] = (f1_features['f1_career_kd_per_round'] + f2_features['f2_career_kd_per_round']) / 2

    features['experience_diff'] = f1_features['f1_career_fights'] - f2_features['f2_career_fights']
    features['reach_diff'] = f1_features['f1_reach'] - f2_features['f2_reach']
    features['height_diff'] = f1_features['f1_height'] - f2_features['f2_height']

    # Context features
    wc = fight.get('weightClass', 'Lightweight')
    features['wc_baseline_finish_rate'] = WEIGHT_CLASS_FINISH_RATES.get(wc, 0.55)
    features['is_title_fight'] = 1 if fight.get('titleFight') else 0
    features['scheduled_rounds'] = fight.get('scheduledRounds', 3) or 3

    return features


def load_model():
    """Load the trained calibrated model."""
    model_path = TRAINING_DIR / 'tier_model_calibrated.joblib'
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found at {model_path}")
    return joblib.load(model_path)


def connect_db():
    """Connect to the database."""
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        raise ValueError("DATABASE_URL environment variable not set")
    return psycopg2.connect(db_url)


def get_fights_to_process(conn, limit: int = None, force: bool = False) -> list:
    """Get fights that need ML tier computation."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        # Get fights with their fighters
        sql = """
            SELECT
                f.id,
                f."weightClass",
                f."titleFight",
                f."scheduledRounds",
                f."mlTier",
                f1.id as f1_id, f1.name as f1_name, f1.wins as f1_wins, f1.losses as f1_losses, f1.draws as f1_draws,
                f1.height as f1_height, f1.reach as f1_reach, f1."reachInches" as f1_reach_inches,
                f1."winsByKO" as f1_ko_wins, f1."winsBySubmission" as f1_sub_wins, f1."winsByDecision" as f1_dec_wins,
                f1."significantStrikesLandedPerMinute" as f1_slpm, f1."strikingAccuracyPercentage" as f1_str_acc,
                f1."takedownAverage" as f1_td_avg, f1."takedownAccuracyPercentage" as f1_td_acc,
                f1."submissionAverage" as f1_sub_avg, f1."averageFightTimeSeconds" as f1_avg_time,
                f2.id as f2_id, f2.name as f2_name, f2.wins as f2_wins, f2.losses as f2_losses, f2.draws as f2_draws,
                f2.height as f2_height, f2.reach as f2_reach, f2."reachInches" as f2_reach_inches,
                f2."winsByKO" as f2_ko_wins, f2."winsBySubmission" as f2_sub_wins, f2."winsByDecision" as f2_dec_wins,
                f2."significantStrikesLandedPerMinute" as f2_slpm, f2."strikingAccuracyPercentage" as f2_str_acc,
                f2."takedownAverage" as f2_td_avg, f2."takedownAccuracyPercentage" as f2_td_acc,
                f2."submissionAverage" as f2_sub_avg, f2."averageFightTimeSeconds" as f2_avg_time
            FROM fights f
            JOIN fighters f1 ON f."fighter1Id" = f1.id
            JOIN fighters f2 ON f."fighter2Id" = f2.id
            WHERE f.completed = false
              AND f."isCancelled" = false
        """
        if not force:
            sql += ' AND f."mlTier" IS NULL'
        if limit:
            sql += f' LIMIT {limit}'

        cur.execute(sql)
        return cur.fetchall()


def update_fight_ml_tier(conn, fight_id: str, tier: int, confidence: float, probabilities: list):
    """Update a fight's ML tier prediction."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE fights
            SET "mlTier" = %s,
                "mlTierConfidence" = %s,
                "mlTierProbabilities" = %s,
                "mlTierComputedAt" = %s
            WHERE id = %s
        """, (tier, confidence, json.dumps(probabilities), datetime.now(timezone.utc), fight_id))


def main():
    parser = argparse.ArgumentParser(description='Compute ML tier predictions')
    parser.add_argument('--limit', type=int, help='Max fights to process')
    parser.add_argument('--force', action='store_true', help='Recompute existing tiers')
    args = parser.parse_args()

    print("="*60)
    print("ML Tier Prediction Computation")
    print("="*60)

    # Load model
    print("\nLoading trained model...")
    model = load_model()
    print("  Model loaded successfully")

    # Connect to database
    print("\nConnecting to database...")
    conn = connect_db()
    print("  Connected")

    # Get fights to process
    print("\nFetching fights to process...")
    fights = get_fights_to_process(conn, limit=args.limit, force=args.force)
    print(f"  Found {len(fights)} fights to process")

    if len(fights) == 0:
        print("\nNo fights to process. Done!")
        return

    # Process each fight
    print("\nComputing predictions...")
    processed = 0
    errors = 0

    for fight in fights:
        try:
            # Build fighter dicts
            fighter1 = {
                'wins': fight['f1_wins'],
                'losses': fight['f1_losses'],
                'draws': fight['f1_draws'],
                'height': fight['f1_height'],
                'reach': fight['f1_reach'],
                'reachInches': fight['f1_reach_inches'],
                'winsByKO': fight['f1_ko_wins'],
                'winsBySubmission': fight['f1_sub_wins'],
                'winsByDecision': fight['f1_dec_wins'],
                'significantStrikesPerMinute': fight['f1_slpm'],
                'strikingAccuracyPercentage': fight['f1_str_acc'],
                'takedownAverage': fight['f1_td_avg'],
                'takedownAccuracyPercentage': fight['f1_td_acc'],
                'submissionAverage': fight['f1_sub_avg'],
                'averageFightTimeSeconds': fight['f1_avg_time'],
            }
            fighter2 = {
                'wins': fight['f2_wins'],
                'losses': fight['f2_losses'],
                'draws': fight['f2_draws'],
                'height': fight['f2_height'],
                'reach': fight['f2_reach'],
                'reachInches': fight['f2_reach_inches'],
                'winsByKO': fight['f2_ko_wins'],
                'winsBySubmission': fight['f2_sub_wins'],
                'winsByDecision': fight['f2_dec_wins'],
                'significantStrikesPerMinute': fight['f2_slpm'],
                'strikingAccuracyPercentage': fight['f2_str_acc'],
                'takedownAverage': fight['f2_td_avg'],
                'takedownAccuracyPercentage': fight['f2_td_acc'],
                'submissionAverage': fight['f2_sub_avg'],
                'averageFightTimeSeconds': fight['f2_avg_time'],
            }

            # Build features
            features = build_fight_features(fight, fighter1, fighter2)

            # Create feature vector in correct order
            X = np.array([[features.get(col, 0.0) for col in FEATURE_COLS]])

            # Predict
            tier = int(model.predict(X)[0]) + 1  # Convert 0-4 back to 1-5
            probabilities = model.predict_proba(X)[0].tolist()
            confidence = max(probabilities)

            # Tier 5 threshold adjustment: FOTN is rare (1.3%), so model is conservative.
            # Promote to Tier 5 if T5 probability >= 4% (captures top action fights)
            T5_PROMOTION_THRESHOLD = 0.04
            if probabilities[4] >= T5_PROMOTION_THRESHOLD:
                tier = 5
                confidence = probabilities[4]

            # Update database
            update_fight_ml_tier(conn, fight['id'], tier, confidence, probabilities)
            processed += 1

            if processed % 10 == 0:
                conn.commit()
                print(f"  Processed {processed}/{len(fights)} fights...")

        except Exception as e:
            errors += 1
            print(f"  Error processing fight {fight['id']}: {e}")

    # Final commit
    conn.commit()
    conn.close()

    print(f"\nDone!")
    print(f"  Processed: {processed}")
    print(f"  Errors: {errors}")


if __name__ == '__main__':
    main()
