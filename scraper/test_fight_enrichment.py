#!/usr/bin/env python3
"""Test fight enrichment data extraction"""

import sys
from pathlib import Path
from bs4 import BeautifulSoup

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from ufc_scraper import parsers

# Load the fixture
fixture_path = Path(__file__).parent / "tests" / "fixtures" / "event_detail_completed.html"
with open(fixture_path, 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')
data = parsers.parse_event_detail(soup, "http://ufcstats.com/event-details/9c4e4ddb19e4c56c")

print(f"\nEvent: {data['event']['name']}")
print(f"Total fights: {len(data['fights'])}\n")

# Display enriched fight data
for i, fight in enumerate(data['fights'][:10], 1):  # Show first 10 fights
    title_flag = "[TITLE]" if fight.get('titleFight') else ""
    main_flag = "[MAIN]" if fight.get('mainEvent') else ""
    pos = fight.get('cardPosition', 'N/A')
    weight = fight.get('weightClass', 'Unknown')

    print(f"{i:2}. {pos:16} {title_flag:8} {main_flag:7} | {weight:20}")

print(f"\nTitle fights: {sum(1 for f in data['fights'] if f.get('titleFight'))}")
print(f"Main events: {sum(1 for f in data['fights'] if f.get('mainEvent'))}")
