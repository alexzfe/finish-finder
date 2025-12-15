#!/usr/bin/env python3
"""
Merge Training Data Script

Merges the Greco1899 UFC fight data with Wikipedia bonus data to create
a labeled training dataset for the entertainment prediction model.

Input files:
- ufc_event_details.csv: Event information
- ufc_fight_results.csv: Fight outcomes
- ufc_fight_stats.csv: Round-by-round statistics
- ufc_fighter_details.csv: Fighter information
- ufc_bonuses.csv: FOTN/POTN bonus data from Wikipedia

Output:
- training_data.csv: Merged dataset with bonus labels
"""

import csv
import re
from collections import defaultdict
from datetime import datetime
from typing import Optional


def normalize_name(name: str) -> str:
    """Normalize a fighter name for matching."""
    if not name:
        return ""
    # Lowercase, remove extra whitespace
    name = name.lower().strip()
    name = re.sub(r'\s+', ' ', name)
    # Remove common suffixes like "Jr.", "Sr.", "III"
    name = re.sub(r'\s+(jr\.?|sr\.?|iii|ii|iv)$', '', name)
    # Remove accents (basic)
    replacements = {
        'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a', 'ä': 'a',
        'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
        'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
        'ó': 'o', 'ò': 'o', 'õ': 'o', 'ô': 'o', 'ö': 'o',
        'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
        'ñ': 'n', 'ç': 'c', 'ž': 'z', 'š': 's',
    }
    for old, new in replacements.items():
        name = name.replace(old, new)
    return name


def normalize_event_name(name: str) -> str:
    """Normalize an event name for matching."""
    if not name:
        return ""
    name = name.lower().strip()
    name = re.sub(r'\s+', ' ', name)
    # Remove colons and extra punctuation
    name = re.sub(r'[:\-]', ' ', name)
    name = re.sub(r'\s+', ' ', name)
    return name


def parse_time_to_seconds(time_str: str, round_num: int, scheduled_rounds: int = 3) -> int:
    """Convert fight time to total seconds."""
    if not time_str or not round_num:
        return scheduled_rounds * 5 * 60  # Default full fight

    try:
        # Parse MM:SS format
        parts = time_str.split(':')
        minutes = int(parts[0]) if len(parts) > 0 else 0
        seconds = int(parts[1]) if len(parts) > 1 else 0
        round_time = minutes * 60 + seconds

        # Previous rounds + current round time
        return (round_num - 1) * 5 * 60 + round_time
    except (ValueError, IndexError):
        return scheduled_rounds * 5 * 60


def aggregate_fight_stats(stats_rows: list[dict]) -> dict:
    """Aggregate round-by-round stats into fight totals."""
    totals = {
        'total_sig_strikes': 0,
        'total_knockdowns': 0,
        'total_takedowns': 0,
        'total_sub_attempts': 0,
        'total_control_time': 0,
        'fighter1_sig_strikes': 0,
        'fighter2_sig_strikes': 0,
    }

    fighters = set()
    for row in stats_rows:
        fighter = row.get('FIGHTER', '')
        fighters.add(fighter)

        # Parse significant strikes (format: "X of Y")
        sig_str = row.get('SIG.STR.', '0 of 0')
        try:
            landed = int(sig_str.split(' of ')[0])
            totals['total_sig_strikes'] += landed
        except (ValueError, IndexError):
            pass

        # Parse knockdowns (stored as float strings like '0.0' in CSV)
        try:
            kd = int(float(row.get('KD', 0)))
            totals['total_knockdowns'] += kd
        except (ValueError, TypeError):
            pass

        # Parse takedowns (format: "X of Y")
        td_str = row.get('TD', '0 of 0')
        try:
            landed = int(td_str.split(' of ')[0])
            totals['total_takedowns'] += landed
        except (ValueError, IndexError):
            pass

        # Parse submission attempts (stored as float strings in CSV)
        try:
            sub_att = int(float(row.get('SUB.ATT', 0)))
            totals['total_sub_attempts'] += sub_att
        except (ValueError, TypeError):
            pass

        # Parse control time (format: "M:SS" or seconds)
        ctrl = row.get('CTRL', '0:00')
        try:
            if ':' in str(ctrl):
                parts = ctrl.split(':')
                ctrl_seconds = int(parts[0]) * 60 + int(parts[1])
            else:
                ctrl_seconds = int(ctrl)
            totals['total_control_time'] += ctrl_seconds
        except (ValueError, IndexError):
            pass

    return totals


def load_bonuses(filepath: str) -> dict:
    """Load bonus data into a lookup structure.

    Returns dict: {normalized_event_name: {normalized_fighter_name: bonus_type}}
    """
    bonuses = defaultdict(dict)

    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            event = normalize_event_name(row.get('event_name', ''))
            fighter = normalize_name(row.get('fighter_name', ''))
            bonus_type = row.get('bonus_type', '')

            if event and fighter and bonus_type:
                # Store the bonus type for this fighter in this event
                bonuses[event][fighter] = bonus_type

    return bonuses


def load_events(filepath: str) -> dict:
    """Load event details."""
    events = {}

    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            event_name = row.get('EVENT', '')
            if event_name:
                events[event_name] = {
                    'date': row.get('DATE', ''),
                    'location': row.get('LOCATION', ''),
                    'url': row.get('URL', ''),
                }

    return events


def load_fight_stats(filepath: str) -> dict:
    """Load fight statistics grouped by event+bout."""
    fight_stats = defaultdict(list)

    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Strip whitespace from event and bout names to match results file
            event = row.get('EVENT', '').strip()
            bout = row.get('BOUT', '').strip()
            key = (event, bout)
            fight_stats[key].append(row)

    return fight_stats


def main():
    """Main merging function."""
    print("=== Merge Training Data ===\n")

    # Load data files
    print("Step 1: Loading data files...")

    try:
        bonuses = load_bonuses('ufc_bonuses.csv')
        print(f"  Loaded bonuses for {len(bonuses)} events")
    except FileNotFoundError:
        print("  Error: ufc_bonuses.csv not found. Run scrape_wikipedia_bonuses.py first.")
        return

    events = load_events('ufc_event_details.csv')
    print(f"  Loaded {len(events)} events")

    fight_stats = load_fight_stats('ufc_fight_stats.csv')
    print(f"  Loaded stats for {len(fight_stats)} fight-round combinations")

    # Process fight results
    print("\nStep 2: Processing fight results...")

    training_data = []
    matched_bonuses = 0
    total_fights = 0

    with open('ufc_fight_results.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            event_name = row.get('EVENT', '').strip()
            bout = row.get('BOUT', '')

            if not event_name or not bout:
                continue

            total_fights += 1

            # Parse fighters from bout string
            fighters = bout.split(' vs. ')
            if len(fighters) != 2:
                fighters = bout.split(' vs ')
            if len(fighters) != 2:
                continue

            fighter1 = fighters[0].strip()
            fighter2 = fighters[1].strip()

            # Get event info
            event_info = events.get(event_name, {})

            # Parse method
            method = row.get('METHOD', '')
            is_finish = 'KO' in method or 'TKO' in method or 'SUB' in method

            # Parse round and time
            try:
                fight_round = int(row.get('ROUND', 0))
            except ValueError:
                fight_round = 0

            time_str = row.get('TIME', '')

            # Determine scheduled rounds from TIME FORMAT
            time_format = row.get('TIME FORMAT', '')
            scheduled_rounds = 3
            if '5-5-5-5-5' in time_format:
                scheduled_rounds = 5

            # Calculate total fight time
            total_time = parse_time_to_seconds(time_str, fight_round, scheduled_rounds)

            # Get fight stats (strip whitespace from keys to match)
            stats_key = (event_name.strip(), bout.strip())
            stats = fight_stats.get(stats_key, [])
            aggregated_stats = aggregate_fight_stats(stats)

            # Check for bonuses
            norm_event = normalize_event_name(event_name)
            norm_f1 = normalize_name(fighter1)
            norm_f2 = normalize_name(fighter2)

            event_bonuses = bonuses.get(norm_event, {})

            f1_bonus = event_bonuses.get(norm_f1, '')
            f2_bonus = event_bonuses.get(norm_f2, '')

            # Determine fight-level bonus
            fight_bonus = ''
            if f1_bonus == 'FOTN' or f2_bonus == 'FOTN':
                fight_bonus = 'FOTN'
                matched_bonuses += 1
            elif f1_bonus or f2_bonus:
                fight_bonus = f1_bonus or f2_bonus
                matched_bonuses += 1

            # Create training record
            record = {
                'event_name': event_name,
                'event_date': event_info.get('date', ''),
                'fighter1': fighter1,
                'fighter2': fighter2,
                'weight_class': row.get('WEIGHTCLASS', ''),
                'method': method,
                'round': fight_round,
                'time': time_str,
                'scheduled_rounds': scheduled_rounds,
                'total_fight_time_seconds': total_time,
                'is_finish': is_finish,
                'outcome': row.get('OUTCOME', ''),
                'referee': row.get('REFEREE', ''),
                # Statistics
                'total_sig_strikes': aggregated_stats['total_sig_strikes'],
                'total_knockdowns': aggregated_stats['total_knockdowns'],
                'total_takedowns': aggregated_stats['total_takedowns'],
                'total_sub_attempts': aggregated_stats['total_sub_attempts'],
                'total_control_time': aggregated_stats['total_control_time'],
                # Bonus labels
                'fighter1_bonus': f1_bonus,
                'fighter2_bonus': f2_bonus,
                'fight_bonus': fight_bonus,
                'has_bonus': bool(fight_bonus),
            }

            training_data.append(record)

    print(f"  Processed {total_fights} fights")
    print(f"  Matched {matched_bonuses} fights with bonuses")

    # Save training data
    print("\nStep 3: Saving training data...")

    output_file = 'training_data.csv'
    if training_data:
        fieldnames = list(training_data[0].keys())
        with open(output_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(training_data)

        print(f"  Saved {len(training_data)} records to {output_file}")

    # Summary statistics
    print("\n=== Summary ===")
    print(f"  Total fights: {len(training_data)}")

    # Count by bonus type
    bonus_counts = defaultdict(int)
    for record in training_data:
        if record['fight_bonus']:
            bonus_counts[record['fight_bonus']] += 1

    print(f"  Fights with FOTN: {bonus_counts['FOTN']}")
    print(f"  Fights with POTN: {bonus_counts['POTN']}")
    print(f"  Fights with KOTN: {bonus_counts['KOTN']}")
    print(f"  Fights with SOTN: {bonus_counts['SOTN']}")

    # Count finishes
    finishes = sum(1 for r in training_data if r['is_finish'])
    print(f"  Total finishes: {finishes} ({100*finishes/len(training_data):.1f}%)")


if __name__ == '__main__':
    main()
