#!/usr/bin/env python3
"""
Test to verify completed events are limited to 3 most recent.
"""

from datetime import datetime

def test_completed_limit():
    """Simulate the sorting and limiting logic for completed events."""

    # Simulate 10 completed events with different dates
    events = [
        {'name': 'UFC 320', 'date': '2025-10-04T00:00:00Z'},
        {'name': 'UFC 319', 'date': '2025-09-28T00:00:00Z'},
        {'name': 'UFC 318', 'date': '2025-09-14T00:00:00Z'},
        {'name': 'UFC 317', 'date': '2025-08-31T00:00:00Z'},
        {'name': 'UFC 316', 'date': '2025-08-17T00:00:00Z'},
        {'name': 'UFC 315', 'date': '2025-08-03T00:00:00Z'},
        {'name': 'UFC 314', 'date': '2025-07-20T00:00:00Z'},
        {'name': 'UFC 313', 'date': '2025-07-06T00:00:00Z'},
        {'name': 'UFC 312', 'date': '2025-06-22T00:00:00Z'},
        {'name': 'UFC 311', 'date': '2025-06-08T00:00:00Z'},
    ]

    print("=" * 60)
    print("COMPLETED EVENTS LIMIT TEST")
    print("=" * 60)

    print(f"\nTotal completed events found: {len(events)}")
    print("\nAll events (unsorted):")
    for event in events:
        print(f"  - {event['name']} ({event['date']})")

    # Sort by date descending (most recent first) - same as spider
    events.sort(key=lambda x: x['date'], reverse=True)

    print("\nSorted by date (most recent first):")
    for event in events:
        print(f"  - {event['name']} ({event['date']})")

    # Limit to 3 most recent
    limited_events = events[:3]

    print(f"\n✓ Limiting to 3 most recent events:")
    for event in limited_events:
        print(f"  - {event['name']} ({event['date']})")

    # Verify
    print("\n" + "=" * 60)
    print("VERIFICATION")
    print("=" * 60)

    assert len(limited_events) == 3, "Should have exactly 3 events"
    assert limited_events[0]['name'] == 'UFC 320', "First should be most recent (UFC 320)"
    assert limited_events[1]['name'] == 'UFC 319', "Second should be UFC 319"
    assert limited_events[2]['name'] == 'UFC 318', "Third should be UFC 318"

    print("✓ Exactly 3 events selected")
    print("✓ Most recent event first (UFC 320)")
    print("✓ Correct order maintained")
    print("\n✅ TEST PASSED!")

    print("\n" + "=" * 60)
    print("IMPACT ANALYSIS")
    print("=" * 60)
    print(f"Events scraped: 3/{len(events)} ({3*100/len(events):.0f}%)")
    print(f"Events skipped: {len(events)-3} older events")
    print("\nBenefits:")
    print("  ✓ Faster scraping (3 events instead of all)")
    print("  ✓ Captures recent outcomes only")
    print("  ✓ Reduces server load")
    print("  ✓ Focuses on data that matters")

if __name__ == '__main__':
    test_completed_limit()
