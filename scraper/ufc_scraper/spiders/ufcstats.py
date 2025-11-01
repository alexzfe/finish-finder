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

    Start URL: http://ufcstats.com/statistics/events/completed

    Spider arguments:
        limit (int): Limit number of events to scrape (default: all)
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

        self.logger.info(f"Found {len(events)} events")

        if self.limit:
            self.logger.info(f"Limiting to first {self.limit} events")
            events = events[:self.limit]

        for event in events:
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
            FighterItem: Fighter data
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

        # Yield fighters
        for fighter in data.get('fighters', []):
            fighter_item = FighterItem(fighter)
            yield fighter_item

        # Yield fights
        for fight in data.get('fights', []):
            fight_item = FightItem(fight)
            yield fight_item

        self.logger.info(
            f"Extracted {len(data.get('fights', []))} fights "
            f"and {len(data.get('fighters', []))} fighters from {event_name}"
        )
