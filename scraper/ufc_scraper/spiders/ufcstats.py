"""
UFCStats.com Spider

This spider crawls UFCStats.com to extract upcoming UFC events, fights, and fighters.
"""

import scrapy
from bs4 import BeautifulSoup
from typing import Generator
from ufc_scraper.items import EventItem, FightItem, FighterItem
from ufc_scraper import parsers


class UFCStatsSpider(scrapy.Spider):
    """
    Spider for crawling UFCStats.com

    Start URLs:
        - http://ufcstats.com/statistics/events/upcoming (always scraped)
        - http://ufcstats.com/statistics/events/completed (enabled by default, limited to 2 most recent)

    Scrapes UFC events from UFCStats.com with full fight outcome data.

    Spider arguments:
        limit (int): Limit number of UPCOMING events to scrape (optional, defaults to all upcoming)
                     Usage: scrapy crawl ufcstats -a limit=5
        include_completed (str): Also scrape 2 most recent completed events with outcomes
                                 Values: 'true', '1', 'yes'
                                 Usage: scrapy crawl ufcstats -a include_completed=true

    Note:
        Completed events are ALWAYS limited to 2 most recent to avoid excessive scraping.
        The 'limit' parameter only applies to upcoming events.
    """

    name = "ufcstats"
    allowed_domains = ["ufcstats.com"]

    def __init__(self, limit=None, include_completed=None, *args, **kwargs):
        super(UFCStatsSpider, self).__init__(*args, **kwargs)
        self.limit = int(limit) if limit else None
        # Parse include_completed as boolean
        self.include_completed = include_completed in ['true', '1', 'yes', 'True', 'Yes']
        self.events_scraped = 0

    def start_requests(self):
        """
        Generate initial requests for event list pages.

        Yields:
            scrapy.Request: Requests to event list pages
        """
        # Always scrape upcoming events
        self.logger.info("Scraping upcoming events")
        yield scrapy.Request(
            url="http://ufcstats.com/statistics/events/upcoming",
            callback=self.parse,
            meta={'event_type': 'upcoming'}
        )

        # Optionally scrape completed events
        if self.include_completed:
            self.logger.info("Also scraping completed events (outcomes enabled)")
            yield scrapy.Request(
                url="http://ufcstats.com/statistics/events/completed",
                callback=self.parse,
                meta={'event_type': 'completed'}
            )

    def parse(self, response):
        """
        Parse the main events list page.

        Yields:
            scrapy.Request: Requests to event detail pages
        """
        event_type = response.meta.get('event_type', 'unknown')
        self.logger.info(f"Parsing {event_type} events list from {response.url}")

        soup = BeautifulSoup(response.text, 'html.parser')
        events = parsers.parse_event_list(soup)

        self.logger.info(f"Found {len(events)} total {event_type} events")

        # Sort by date
        if event_type == 'completed':
            # For completed events: sort descending (most recent first)
            events.sort(key=lambda x: x['date'], reverse=True)
        else:
            # For upcoming events: sort ascending (nearest first)
            events.sort(key=lambda x: x['date'])

        # Apply limits
        if event_type == 'completed':
            # Always limit completed events to 2 most recent
            events = events[:2]
            self.logger.info(f"Limiting completed events to 2 most recent")
        elif self.limit:
            # Apply user-specified limit to upcoming events
            self.logger.info(f"Limiting upcoming events to {self.limit}")
            events = events[:self.limit]
        else:
            self.logger.info(f"No limit specified, scraping all {len(events)} {event_type} events")

        for event in events:
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
