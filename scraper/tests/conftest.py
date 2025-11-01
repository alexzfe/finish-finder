"""
Pytest configuration and fixtures

This file contains shared fixtures and configuration for all tests.
"""

import pytest
from pathlib import Path


@pytest.fixture
def fixtures_dir():
    """Return path to fixtures directory"""
    return Path(__file__).parent / 'fixtures'


@pytest.fixture
def event_list_html(fixtures_dir):
    """Load event list page HTML fixture"""
    fixture_path = fixtures_dir / 'event_list_page.html'
    if not fixture_path.exists():
        pytest.skip(f"Fixture not found: {fixture_path}")
    return fixture_path.read_text()


@pytest.fixture
def event_detail_html(fixtures_dir):
    """Load event detail page HTML fixture"""
    fixture_path = fixtures_dir / 'event_detail_page.html'
    if not fixture_path.exists():
        pytest.skip(f"Fixture not found: {fixture_path}")
    return fixture_path.read_text()


@pytest.fixture
def fighter_profile_html(fixtures_dir):
    """Load fighter profile page HTML fixture"""
    fixture_path = fixtures_dir / 'fighter_profile_page.html'
    if not fixture_path.exists():
        pytest.skip(f"Fixture not found: {fixture_path}")
    return fixture_path.read_text()
