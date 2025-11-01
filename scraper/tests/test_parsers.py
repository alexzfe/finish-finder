"""
Tests for UFC scraper parser functions
"""

import pytest
from bs4 import BeautifulSoup
from pathlib import Path
from ufc_scraper import parsers


@pytest.fixture
def fixtures_dir():
    """Return path to fixtures directory"""
    return Path(__file__).parent / 'fixtures'


@pytest.fixture
def event_list_html(fixtures_dir):
    """Load event list HTML fixture"""
    fixture_path = fixtures_dir / 'event_list.html'
    with open(fixture_path, 'r', encoding='utf-8') as f:
        return f.read()


@pytest.fixture
def event_detail_upcoming_html(fixtures_dir):
    """Load upcoming event detail HTML fixture"""
    fixture_path = fixtures_dir / 'event_detail_upcoming.html'
    with open(fixture_path, 'r', encoding='utf-8') as f:
        return f.read()


@pytest.fixture
def event_detail_completed_html(fixtures_dir):
    """Load completed event detail HTML fixture"""
    fixture_path = fixtures_dir / 'event_detail_completed.html'
    with open(fixture_path, 'r', encoding='utf-8') as f:
        return f.read()


class TestParseEventList:
    """Tests for parse_event_list()"""

    def test_parse_event_list_returns_events(self, event_list_html):
        """Should parse events from list page"""
        soup = BeautifulSoup(event_list_html, 'html.parser')
        events = parsers.parse_event_list(soup)

        assert len(events) > 0, "Should find at least one event"
        assert isinstance(events, list), "Should return a list"

    def test_event_structure(self, event_list_html):
        """Each event should have required fields"""
        soup = BeautifulSoup(event_list_html, 'html.parser')
        events = parsers.parse_event_list(soup)

        first_event = events[0]
        assert 'id' in first_event
        assert 'name' in first_event
        assert 'date' in first_event
        assert 'location' in first_event
        assert 'sourceUrl' in first_event

        # Verify types
        assert isinstance(first_event['id'], str)
        assert isinstance(first_event['name'], str)
        assert isinstance(first_event['sourceUrl'], str)

        # Name should not be empty
        assert len(first_event['name']) > 0

        # URL should contain event-details
        assert 'event-details' in first_event['sourceUrl']

    def test_date_parsing(self, event_list_html):
        """Dates should be parsed to ISO format"""
        soup = BeautifulSoup(event_list_html, 'html.parser')
        events = parsers.parse_event_list(soup)

        # Find an event with a date
        events_with_dates = [e for e in events if e['date']]
        assert len(events_with_dates) > 0, "Should have events with dates"

        # Check ISO format (YYYY-MM-DD...)
        event_with_date = events_with_dates[0]
        assert 'T' in event_with_date['date'] or '-' in event_with_date['date']

    def test_empty_table(self):
        """Should handle empty table gracefully"""
        html = "<html><body><table class='b-statistics__table-events'><tbody></tbody></table></body></html>"
        soup = BeautifulSoup(html, 'html.parser')
        events = parsers.parse_event_list(soup)

        assert events == []

    def test_no_table(self):
        """Should handle missing table gracefully"""
        html = "<html><body></body></html>"
        soup = BeautifulSoup(html, 'html.parser')
        events = parsers.parse_event_list(soup)

        assert events == []


class TestParseEventDetail:
    """Tests for parse_event_detail()"""

    def test_parse_event_detail_returns_structure(self, event_detail_upcoming_html):
        """Should return dict with event, fights, fighters"""
        soup = BeautifulSoup(event_detail_upcoming_html, 'html.parser')
        result = parsers.parse_event_detail(soup, "http://ufcstats.com/event-details/test")

        assert 'event' in result
        assert 'fights' in result
        assert 'fighters' in result

        assert isinstance(result['event'], dict)
        assert isinstance(result['fights'], list)
        assert isinstance(result['fighters'], list)

    def test_event_metadata(self, event_detail_upcoming_html):
        """Event should have correct metadata"""
        soup = BeautifulSoup(event_detail_upcoming_html, 'html.parser')
        result = parsers.parse_event_detail(soup, "http://ufcstats.com/event-details/0e2c2daf11b5d8f2")

        event = result['event']
        assert event['id'] == '0e2c2daf11b5d8f2'
        assert 'Garcia vs. Onama' in event['name']
        assert event['date'] is not None
        assert event['location'] is not None
        assert event['sourceUrl'] == "http://ufcstats.com/event-details/0e2c2daf11b5d8f2"

    def test_fights_extraction(self, event_detail_upcoming_html):
        """Should extract fights from event page"""
        soup = BeautifulSoup(event_detail_upcoming_html, 'html.parser')
        result = parsers.parse_event_detail(soup, "http://ufcstats.com/event-details/test")

        fights = result['fights']
        assert len(fights) > 0, "Should find at least one fight"

        first_fight = fights[0]
        assert 'id' in first_fight
        assert 'eventId' in first_fight
        assert 'fighter1Id' in first_fight
        assert 'fighter2Id' in first_fight
        assert 'weightClass' in first_fight
        assert 'sourceUrl' in first_fight

    def test_fighters_extraction(self, event_detail_upcoming_html):
        """Should extract unique fighters from event page"""
        soup = BeautifulSoup(event_detail_upcoming_html, 'html.parser')
        result = parsers.parse_event_detail(soup, "http://ufcstats.com/event-details/test")

        fighters = result['fighters']
        assert len(fighters) > 0, "Should find at least one fighter"

        # Check for duplicates
        fighter_ids = [f['id'] for f in fighters]
        assert len(fighter_ids) == len(set(fighter_ids)), "Fighter IDs should be unique"

        first_fighter = fighters[0]
        assert 'id' in first_fighter
        assert 'name' in first_fighter
        assert 'sourceUrl' in first_fighter
        assert len(first_fighter['name']) > 0, "Fighter name should not be empty"

    def test_completed_event(self, event_detail_completed_html):
        """Should parse completed events (with results)"""
        soup = BeautifulSoup(event_detail_completed_html, 'html.parser')
        result = parsers.parse_event_detail(soup, "http://ufcstats.com/event-details/8944a0f9b2f0ce6d")

        # Should still extract event, fights, and fighters
        assert result['event']['id'] == '8944a0f9b2f0ce6d'
        assert len(result['fights']) > 0
        assert len(result['fighters']) > 0


class TestHelperFunctions:
    """Tests for helper utility functions"""

    def test_parse_record_valid(self):
        """Should parse valid W-L-D records"""
        result = parsers.parse_record("27-1-0")
        assert result == {'wins': 27, 'losses': 1, 'draws': 0}

        result = parsers.parse_record("10-5-2")
        assert result == {'wins': 10, 'losses': 5, 'draws': 2}

    def test_parse_record_invalid(self):
        """Should handle invalid records gracefully"""
        assert parsers.parse_record("") is None
        assert parsers.parse_record(None) is None
        assert parsers.parse_record("invalid") is None
        assert parsers.parse_record("27-1") is None

    def test_extract_id_from_url(self):
        """Should extract ID from UFCStats URLs"""
        assert parsers.extract_id_from_url("http://ufcstats.com/event-details/abc123") == "abc123"
        assert parsers.extract_id_from_url("http://ufcstats.com/fighter-details/Jon-Jones") == "Jon-Jones"
        assert parsers.extract_id_from_url("http://ufcstats.com/event-details/abc123/") == "abc123"

    def test_normalize_event_name(self):
        """Should normalize event names to IDs"""
        assert parsers.normalize_event_name("UFC 299: O'Malley vs. Vera 2") == "UFC-299"
        assert parsers.normalize_event_name("UFC 300: Pereira vs. Hill") == "UFC-300"
        assert parsers.normalize_event_name("UFC Fight Night: Garcia vs. Onama") == "UFC-Fight-Night-Garcia-vs-Onama"
        assert parsers.normalize_event_name("ufc 299") == "UFC-299"  # Case insensitive
