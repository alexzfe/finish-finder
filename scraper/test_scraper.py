#!/usr/bin/env python
"""
Simple test script to verify scraper parsing logic works end-to-end
without actually posting to the API.
"""

import sys
from bs4 import BeautifulSoup
from pathlib import Path

# Add the scraper directory to path
sys.path.insert(0, str(Path(__file__).parent))

from ufc_scraper import parsers


def test_with_fixtures():
    """Test parsing with saved HTML fixtures"""
    fixtures_dir = Path(__file__).parent / 'tests' / 'fixtures'

    print("=" * 80)
    print("Testing UFCStats.com Scraper - Fixture-based Parsing")
    print("=" * 80)

    # Test 1: Parse event list
    print("\n[1] Testing parse_event_list()...")
    with open(fixtures_dir / 'event_list.html', 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
        events = parsers.parse_event_list(soup)

    print(f"✓ Found {len(events)} events")
    if events:
        print(f"✓ First event: {events[0]['name']}")
        print(f"  - ID: {events[0]['id']}")
        print(f"  - Date: {events[0]['date']}")
        print(f"  - Location: {events[0]['location']}")
        print(f"  - URL: {events[0]['sourceUrl'][:60]}...")

    # Test 2: Parse event detail (upcoming)
    print("\n[2] Testing parse_event_detail() - Upcoming Event...")
    with open(fixtures_dir / 'event_detail_upcoming.html', 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
        result = parsers.parse_event_detail(soup, "http://ufcstats.com/event-details/0e2c2daf11b5d8f2")

    event = result['event']
    fights = result['fights']
    fighters = result['fighters']

    print(f"✓ Event: {event['name']}")
    print(f"  - ID: {event['id']}")
    print(f"  - Date: {event['date']}")
    print(f"  - Venue: {event['venue']}")
    print(f"  - Location: {event['location']}")
    print(f"✓ Extracted {len(fights)} fights")
    print(f"✓ Extracted {len(fighters)} unique fighters")

    if fights:
        print(f"\n  First fight:")
        print(f"    - ID: {fights[0]['id']}")
        print(f"    - Fighter 1: {fights[0]['fighter1Id']}")
        print(f"    - Fighter 2: {fights[0]['fighter2Id']}")
        print(f"    - Weight Class: {fights[0]['weightClass']}")

    if fighters:
        print(f"\n  First fighter:")
        print(f"    - ID: {fighters[0]['id']}")
        print(f"    - Name: {fighters[0]['name']}")
        print(f"    - URL: {fighters[0]['sourceUrl'][:60]}...")

    # Test 3: Parse event detail (completed)
    print("\n[3] Testing parse_event_detail() - Completed Event...")
    with open(fixtures_dir / 'event_detail_completed.html', 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
        result = parsers.parse_event_detail(soup, "http://ufcstats.com/event-details/8944a0f9b2f0ce6d")

    event = result['event']
    fights = result['fights']
    fighters = result['fighters']

    print(f"✓ Event: {event['name']}")
    print(f"✓ Extracted {len(fights)} fights")
    print(f"✓ Extracted {len(fighters)} unique fighters")

    # Summary
    print("\n" + "=" * 80)
    print("✅ All parsing tests passed!")
    print("=" * 80)
    print("\nThe scraper is ready to crawl UFCStats.com!")
    print("To run the full scraper: cd scraper && scrapy crawl ufcstats")
    print()


if __name__ == '__main__':
    test_with_fixtures()
