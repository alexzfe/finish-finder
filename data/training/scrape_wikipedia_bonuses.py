#!/usr/bin/env python3
"""
Wikipedia UFC Bonus Scraper

Scrapes Fight of the Night (FOTN) and Performance of the Night (POTN) bonus data
from Wikipedia UFC event pages.

Output: ufc_bonuses.csv with columns:
- event_name: Name of the UFC event
- fighter_name: Fighter who received the bonus
- bonus_type: FOTN, POTN, KOTN, or SOTN
- opponent_name: Opponent (for FOTN bonuses)
"""

import csv
import re
import time
import requests
from bs4 import BeautifulSoup
from typing import Optional

# User agent to avoid 403 errors
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
}

# Rate limiting
REQUEST_DELAY = 0.8  # seconds between requests


def get_wikipedia_page(title: str) -> Optional[str]:
    """Fetch a Wikipedia page by title using the API."""
    url = "https://en.wikipedia.org/w/api.php"
    params = {
        'action': 'parse',
        'page': title,
        'format': 'json',
        'prop': 'text',
        'redirects': 1
    }

    try:
        response = requests.get(url, params=params, headers=HEADERS, timeout=30)
        response.raise_for_status()
        data = response.json()

        if 'parse' in data and 'text' in data['parse']:
            return data['parse']['text']['*']
        return None
    except Exception as e:
        return None


def clean_fighter_name(name: str) -> str:
    """Clean up a fighter name by removing extra characters."""
    # Remove reference markers like [1], [a], etc.
    name = re.sub(r'\[\d+\]', '', name)
    name = re.sub(r'\[[a-z]+\]', '', name)
    name = re.sub(r'\[i+\]', '', name)
    # Remove extra whitespace
    name = re.sub(r'\s+', ' ', name)
    # Remove common prefixes/suffixes
    name = name.strip(' ,:;.')
    return name


def is_valid_fighter_name(name: str) -> bool:
    """Check if a string looks like a valid fighter name."""
    if not name or len(name) < 5:
        return False
    # Must start with uppercase letter
    if not name[0].isupper():
        return False
    # Should not contain these patterns
    bad_patterns = [
        r'\bbonus\b', r'\baward', r'\bvs\.?\b', r'^no\s', r'^a\s[A-Z]',
        r'\bnight\b', r'\bperformance\b', r'\bfight\b', r'\bknockout\b',
        r'\bsubmission\b', r'\bof\s+the\b'
    ]
    name_lower = name.lower()
    for pattern in bad_patterns:
        if re.search(pattern, name_lower):
            return False
    # Should have at least two parts (first and last name) in most cases
    # But allow single names like "Rampage"
    return True


def extract_bonuses_from_event_page(html: str, event_name: str) -> list[dict]:
    """Extract bonus information from a UFC event Wikipedia page."""
    bonuses = []
    soup = BeautifulSoup(html, 'html.parser')

    # Get all text elements
    all_elements = soup.find_all(['p', 'li', 'td', 'dd'])

    for elem in all_elements:
        text = elem.get_text(strip=True)

        # Skip if text is too short or doesn't mention bonuses
        if len(text) < 20:
            continue

        # Fight of the Night pattern - capture full names carefully
        # Pattern: "Fight of the Night: FirstName LastName vs. FirstName LastName"
        fotn_match = re.search(
            r'Fight\s+of\s+the\s+Night:\s*([A-Z][a-zA-ZÀ-ÿ\'\-\.\s]+?)\s+vs\.?\s+([A-Z][a-zA-ZÀ-ÿ\'\-\.\s]+?)(?:\[|\s*$|\.(?:\s|$))',
            text
        )
        if fotn_match:
            f1 = clean_fighter_name(fotn_match.group(1))
            f2 = clean_fighter_name(fotn_match.group(2))
            if is_valid_fighter_name(f1) and is_valid_fighter_name(f2):
                bonuses.append({
                    'event_name': event_name,
                    'fighter_name': f1,
                    'bonus_type': 'FOTN',
                    'opponent_name': f2
                })
                bonuses.append({
                    'event_name': event_name,
                    'fighter_name': f2,
                    'bonus_type': 'FOTN',
                    'opponent_name': f1
                })

        # Performance of the Night pattern
        # Match the whole list after "Performance of the Night:"
        potn_match = re.search(
            r'Performance\s+of\s+the\s+Night:\s*(.+?)(?:\[(?:\d|[a-z])\]|\s*$|(?:Fight|Knockout|Submission)\s+of)',
            text,
            re.IGNORECASE
        )
        if potn_match:
            fighters_text = potn_match.group(1)
            # Split by ", and ", " and ", ", " but be careful with names containing "and"
            # First replace " and " with a delimiter, but not if it's part of a name
            # Split on 'and' (with or without spaces) when followed by uppercase
            fighters_text = re.sub(r',?\s*and\s*(?=[A-Z])', '|||', fighters_text)
            fighters_text = re.sub(r',\s*', '|||', fighters_text)

            fighters = fighters_text.split('|||')
            for fighter in fighters:
                fighter = clean_fighter_name(fighter)
                if is_valid_fighter_name(fighter):
                    bonuses.append({
                        'event_name': event_name,
                        'fighter_name': fighter,
                        'bonus_type': 'POTN',
                        'opponent_name': ''
                    })

        # Knockout of the Night pattern (legacy, pre-2014)
        kotn_match = re.search(
            r'Knockout\s+of\s+the\s+Night:\s*([A-Z][a-zA-ZÀ-ÿ\'\-\.\s]+?)(?:\[|\s*$|\.(?:\s|$))',
            text
        )
        if kotn_match:
            fighter = clean_fighter_name(kotn_match.group(1))
            if is_valid_fighter_name(fighter):
                bonuses.append({
                    'event_name': event_name,
                    'fighter_name': fighter,
                    'bonus_type': 'KOTN',
                    'opponent_name': ''
                })

        # Submission of the Night pattern (legacy, pre-2014)
        sotn_match = re.search(
            r'Submission\s+of\s+the\s+Night:\s*([A-Z][a-zA-ZÀ-ÿ\'\-\.\s]+?)(?:\[|\s*$|\.(?:\s|$))',
            text
        )
        if sotn_match:
            fighter = clean_fighter_name(sotn_match.group(1))
            if is_valid_fighter_name(fighter):
                bonuses.append({
                    'event_name': event_name,
                    'fighter_name': fighter,
                    'bonus_type': 'SOTN',
                    'opponent_name': ''
                })

    return bonuses


def load_events_from_csv(filepath: str) -> list[str]:
    """Load event names from the Greco1899 CSV."""
    events = []
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            event_name = row.get('EVENT', '')
            if event_name and event_name not in events:
                events.append(event_name)
    return events


def main():
    """Main scraping function."""
    all_bonuses = []

    print("=== UFC Bonus Scraper ===\n")

    # Load events from our CSV
    print("Step 1: Loading events from CSV...")
    events_csv = 'ufc_event_details.csv'
    try:
        events = load_events_from_csv(events_csv)
        print(f"  Loaded {len(events)} events from CSV")
    except FileNotFoundError:
        print(f"  Error: CSV not found at {events_csv}")
        return

    # Scrape ALL event pages for bonus info
    print("\nStep 2: Scraping ALL event pages...")
    scraped_count = 0
    error_count = 0
    events_with_bonuses = 0

    for i, event_name in enumerate(events):
        # Progress indicator
        if (i + 1) % 50 == 0 or i == 0:
            print(f"  Processing event {i+1}/{len(events)}...")

        html = get_wikipedia_page(event_name.strip())
        if html:
            event_bonuses = extract_bonuses_from_event_page(html, event_name)
            if event_bonuses:
                events_with_bonuses += 1
                all_bonuses.extend(event_bonuses)
            scraped_count += 1
        else:
            error_count += 1

        time.sleep(REQUEST_DELAY)

    print(f"\n  Scraped: {scraped_count}, Errors: {error_count}, Events with bonuses: {events_with_bonuses}")

    # Deduplicate and save
    print("\nStep 3: Deduplicating and saving...")

    # Deduplicate based on event + fighter + bonus_type
    seen = set()
    unique_bonuses = []
    for bonus in all_bonuses:
        key = (bonus['event_name'], bonus['fighter_name'], bonus['bonus_type'])
        if key not in seen:
            seen.add(key)
            unique_bonuses.append(bonus)

    print(f"  {len(unique_bonuses)} unique bonus records")

    # Save to CSV
    output_file = 'ufc_bonuses.csv'
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        fieldnames = ['event_name', 'fighter_name', 'bonus_type', 'opponent_name']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for bonus in sorted(unique_bonuses, key=lambda x: x['event_name']):
            writer.writerow(bonus)

    print(f"\nSaved to {output_file}")

    # Summary statistics
    print("\n=== Summary ===")
    by_type = {}
    for b in unique_bonuses:
        by_type[b['bonus_type']] = by_type.get(b['bonus_type'], 0) + 1
    for bonus_type, count in sorted(by_type.items()):
        print(f"  {bonus_type}: {count}")

    print(f"\n  Total bonuses: {len(unique_bonuses)}")
    print(f"  Events with bonuses: {events_with_bonuses}/{scraped_count}")


if __name__ == '__main__':
    main()
