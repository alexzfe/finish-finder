#!/usr/bin/env python3
"""
Quick test script to validate outcome parsing from completed event fixture.
"""

from bs4 import BeautifulSoup
from ufc_scraper import parsers

def test_completed_event_parsing():
    """Test parsing completed event with fight outcomes."""

    # Load completed event fixture
    with open('tests/fixtures/event_detail_completed.html', 'r') as f:
        html = f.read()

    soup = BeautifulSoup(html, 'html.parser')

    # Parse event detail
    data = parsers.parse_event_detail(soup, 'http://ufcstats.com/event-details/test123')

    print("=" * 60)
    print("EVENT PARSING TEST")
    print("=" * 60)

    # Check event
    event = data['event']
    print(f"\nEvent: {event['name']}")
    print(f"Date: {event['date']}")
    print(f"Completed: {event.get('completed', False)}")
    print(f"Cancelled: {event.get('cancelled', False)}")

    # Check fights
    fights = data['fights']
    print(f"\n{len(fights)} fights found:")

    for i, fight in enumerate(fights[:3], 1):  # Show first 3 fights
        print(f"\n--- Fight {i} ---")
        print(f"Weight Class: {fight.get('weightClass', 'N/A')}")
        print(f"Card Position: {fight.get('cardPosition', 'N/A')}")
        print(f"Completed: {fight.get('completed', False)}")

        if fight.get('completed'):
            print(f"Winner ID: {fight.get('winnerId', 'N/A')}")
            print(f"Method: {fight.get('method', 'N/A')}")
            print(f"Round: {fight.get('round', 'N/A')}")
            print(f"Time: {fight.get('time', 'N/A')}")

    # Validate outcome parsing
    print("\n" + "=" * 60)
    print("VALIDATION")
    print("=" * 60)

    completed_fights = [f for f in fights if f.get('completed')]
    print(f"✓ {len(completed_fights)}/{len(fights)} fights marked as completed")

    fights_with_winner = [f for f in completed_fights if f.get('winnerId')]
    print(f"✓ {len(fights_with_winner)}/{len(completed_fights)} completed fights have a winner")

    fights_with_method = [f for f in completed_fights if f.get('method')]
    print(f"✓ {len(fights_with_method)}/{len(completed_fights)} completed fights have a method")

    # Test normalize_method function
    print("\n" + "=" * 60)
    print("METHOD NORMALIZATION TESTS")
    print("=" * 60)

    test_methods = [
        ("U-DEC", "DEC"),
        ("S-DEC", "DEC"),
        ("M-DEC", "DEC"),
        ("KO/TKO", "KO/TKO"),
        ("KO", "KO/TKO"),
        ("SUB", "SUB"),
        ("Submission", "SUB"),
        ("DQ", "DQ"),
        ("NC", "NC"),
        ("No Contest", "NC"),
    ]

    all_pass = True
    for input_method, expected in test_methods:
        result = parsers.normalize_method(input_method)
        status = "✓" if result == expected else "✗"
        if result != expected:
            all_pass = False
        print(f"{status} {input_method:20} → {result:10} (expected: {expected})")

    print("\n" + "=" * 60)
    if all_pass:
        print("✓ ALL TESTS PASSED!")
    else:
        print("✗ SOME TESTS FAILED!")
    print("=" * 60)

if __name__ == '__main__':
    test_completed_event_parsing()
