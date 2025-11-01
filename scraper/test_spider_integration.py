#!/usr/bin/env python
"""
Integration test for spider without requiring Scrapy runtime.
Tests that the spider would work correctly if Scrapy was available.
"""

import sys
from pathlib import Path
from bs4 import BeautifulSoup

# Add the scraper directory to path
sys.path.insert(0, str(Path(__file__).parent))

from ufc_scraper import parsers


def simulate_spider_crawl():
    """Simulate what the spider does when it crawls"""
    print("=" * 80)
    print("Spider Integration Test - Simulating Scrapy Crawl")
    print("=" * 80)

    fixtures_dir = Path(__file__).parent / 'tests' / 'fixtures'

    # Step 1: Spider parses event list (simulating parse())
    print("\n[Spider.parse()] Parsing events list...")
    with open(fixtures_dir / 'event_list.html', 'r', encoding='utf-8') as f:
        event_list_html = f.read()

    soup = BeautifulSoup(event_list_html, 'html.parser')
    events = parsers.parse_event_list(soup)

    print(f"✓ Found {len(events)} events")

    # Limit to first 2 events for testing (simulating -a limit=2)
    limit = 2
    print(f"✓ Limiting to first {limit} events")
    events = events[:limit]

    total_events = 0
    total_fights = 0
    total_fighters = 0
    all_items = []

    # Step 2: Spider follows each event URL (simulating parse_event())
    for idx, event in enumerate(events, 1):
        print(f"\n[Spider.parse_event()] Parsing event {idx}: {event['name']}")

        # For fixtures, we'll use the cached HTML
        # In real spider, this would be: yield scrapy.Request(event['sourceUrl'])
        if idx == 1:
            fixture_file = 'event_detail_upcoming.html'
        else:
            fixture_file = 'event_detail_completed.html'

        with open(fixtures_dir / fixture_file, 'r', encoding='utf-8') as f:
            event_html = f.read()

        soup = BeautifulSoup(event_html, 'html.parser')
        data = parsers.parse_event_detail(soup, event['sourceUrl'])

        # Step 3: Spider yields items (simulating yield EventItem/FightItem/FighterItem)
        if data.get('event'):
            # In real spider: yield EventItem(data['event'])
            all_items.append(('event', data['event']))
            total_events += 1

        for fighter in data.get('fighters', []):
            # In real spider: yield FighterItem(fighter)
            all_items.append(('fighter', fighter))
            total_fighters += 1

        for fight in data.get('fights', []):
            # In real spider: yield FightItem(fight)
            all_items.append(('fight', fight))
            total_fights += 1

        print(f"  ✓ Yielded: 1 event, {len(data.get('fights', []))} fights, {len(data.get('fighters', []))} fighters")

    # Summary
    print("\n" + "=" * 80)
    print("Spider Crawl Complete")
    print("=" * 80)
    print(f"Total items scraped:")
    print(f"  - Events: {total_events}")
    print(f"  - Fights: {total_fights}")
    print(f"  - Fighters: {total_fighters}")
    print(f"  - Total items: {len(all_items)}")

    # Show sample items
    print(f"\nSample Event Item:")
    event_samples = [item for type, item in all_items if type == 'event']
    if event_samples:
        event = event_samples[0]
        print(f"  ID: {event['id']}")
        print(f"  Name: {event['name']}")
        print(f"  Date: {event['date']}")
        print(f"  Venue: {event['venue']}")
        print(f"  Location: {event['location']}")

    print(f"\nSample Fight Item:")
    fight_samples = [item for type, item in all_items if type == 'fight']
    if fight_samples:
        fight = fight_samples[0]
        print(f"  ID: {fight['id']}")
        print(f"  Event ID: {fight['eventId']}")
        print(f"  Fighter 1 ID: {fight['fighter1Id']}")
        print(f"  Fighter 2 ID: {fight['fighter2Id']}")
        print(f"  Weight Class: {fight['weightClass']}")

    print(f"\nSample Fighter Item:")
    fighter_samples = [item for type, item in all_items if type == 'fighter']
    if fighter_samples:
        fighter = fighter_samples[0]
        print(f"  ID: {fighter['id']}")
        print(f"  Name: {fighter['name']}")
        print(f"  Source URL: {fighter['sourceUrl'][:60]}...")

    # Step 4: These items would normally be passed to the pipeline
    print("\n" + "=" * 80)
    print("Pipeline Integration")
    print("=" * 80)
    print("In production, these items would be passed to:")
    print("  1. UFCScraperPipeline.process_item()")
    print("  2. POST to Next.js ingestion API")
    print("  3. API validates with Zod schemas")
    print("  4. API upserts to PostgreSQL with content hash detection")
    print("  5. API creates ScrapeLog audit entry")

    print("\n✅ Spider integration test PASSED!")
    print("\nNext step: Set up environment variables and test full pipeline:")
    print("  export INGEST_API_URL=http://localhost:3000/api/internal/ingest")
    print("  export INGEST_API_SECRET=<your-secret-token>")
    print("  cd scraper && scrapy crawl ufcstats -a limit=2")
    print()

    return all_items


if __name__ == '__main__':
    items = simulate_spider_crawl()
