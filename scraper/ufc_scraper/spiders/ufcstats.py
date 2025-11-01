"""
UFCStats.com Spider

This spider crawls UFCStats.com to extract upcoming UFC events, fights, and fighters.
"""

import scrapy
from bs4 import BeautifulSoup
from typing import Generator
from datetime import datetime, timezone
from ufc_scraper.items import EventItem, FightItem, FighterItem
from ufc_scraper import parsers


class UFCStatsSpider(scrapy.Spider):
    """
    Spider for crawling UFCStats.com

    Start URL: http://ufcstats.com/statistics/events/completed

    Automatically filters for upcoming events only (date >= today).

    Spider arguments:
        limit (int): Limit number of upcoming events to scrape (default: 3)
                     Usage: scrapy crawl ufcstats -a limit=5
    """

    name = "ufcstats"
    allowed_domains = ["ufcstats.com"]
    start_urls = ["http://ufcstats.com/statistics/events/completed"]

    def __init__(self, limit=None, *args, **kwargs):
        super(UFCStatsSpider, self).__init__(*args, **kwargs)
        self.limit = int(limit) if limit else None
        self.events_scraped = 0

    def parse(self, response):
        """
        Parse the main events list page.

        Yields:
            scrapy.Request: Requests to event detail pages
        """
        self.logger.info(f"Parsing events list from {response.url}")

        soup = BeautifulSoup(response.text, 'html.parser')
        events = parsers.parse_event_list(soup)

        self.logger.info(f"Found {len(events)} total events")

        # Filter for upcoming events only (date >= today)
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        upcoming_events = []

        for event in events:
            if event.get('date'):
                try:
                    # Parse the ISO date string
                    event_date = datetime.fromisoformat(event['date'].replace('Z', '+00:00'))
                    # Only include events that are today or in the future
                    if event_date >= today:
                        upcoming_events.append(event)
                except (ValueError, AttributeError) as e:
                    self.logger.warning(f"Could not parse date for event {event.get('name')}: {e}")
                    continue

        self.logger.info(f"Found {len(upcoming_events)} upcoming events")

        # Sort by date ascending (nearest events first)
        upcoming_events.sort(key=lambda x: x['date'])

        # Limit to specified number or default to 3
        limit = self.limit if self.limit else 3
        self.logger.info(f"Limiting to nearest {limit} upcoming events")
        upcoming_events = upcoming_events[:limit]

        for event in upcoming_events:
            self.logger.info(f"Will scrape: {event['name']} ({event['date']})")
            # Follow each event detail page
            yield scrapy.Request(
                url=event['sourceUrl'],
                callback=self.parse_event,
                meta={'event_id': event['id'], 'event_name': event['name']}
            )

    def parse_event(self, response):
        """
        Parse an individual event detail page.

        Yields:
            EventItem: Event data
            FightItem: Fight data
            scrapy.Request: Requests to fighter profile pages
        """
        event_id = response.meta.get('event_id')
        event_name = response.meta.get('event_name')

        self.events_scraped += 1
        self.logger.info(f"Parsing event {self.events_scraped}: {event_name}")

        soup = BeautifulSoup(response.text, 'html.parser')
        data = parsers.parse_event_detail(soup, response.url)

        # Yield event
        if data.get('event'):
            event_item = EventItem(data['event'])
            yield event_item

        # Yield fights
        for fight in data.get('fights', []):
            fight_item = FightItem(fight)
            yield fight_item

        # Visit each fighter's profile page to get complete record data
        for fighter in data.get('fighters', []):
            yield scrapy.Request(
                url=fighter['sourceUrl'],
                callback=self.parse_fighter_profile_page,
                meta={'fighter_base_data': fighter},
                dont_filter=True  # Allow visiting same fighter multiple times across events
            )

        self.logger.info(
            f"Extracted {len(data.get('fights', []))} fights "
            f"and requesting {len(data.get('fighters', []))} fighter profiles from {event_name}"
        )

    def parse_fighter_profile_page(self, response):
        """
        Parse a fighter profile page to extract complete fighter data.

        Yields:
            FighterItem: Fighter data with complete record
        """
        base_data = response.meta.get('fighter_base_data', {})

        self.logger.info(f"Parsing fighter profile: {base_data.get('name', 'Unknown')}")

        soup = BeautifulSoup(response.text, 'html.parser')
        profile_data = parsers.parse_fighter_profile(soup, response.url)

        # Merge base data with profile data (profile data takes precedence)
        fighter_data = {**base_data, **profile_data}

        # Yield complete fighter item
        fighter_item = FighterItem(fighter_data)
        yield fighter_item

        self.logger.info(
            f"Fighter {fighter_data.get('name')} - Record: {fighter_data.get('record', 'Unknown')}"
        )
