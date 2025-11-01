"""
Item pipelines for UFC Scraper

See documentation in:
https://docs.scrapy.org/en/latest/topics/item-pipeline.html
"""

import os
import requests
import logging
from typing import Dict, Any
from scrapy import Spider
from scrapy.exceptions import DropItem


logger = logging.getLogger(__name__)


class APIIngestionPipeline:
    """
    Pipeline to send scraped data to the Next.js Ingestion API.

    This pipeline collects all scraped items and posts them in a batch
    to the API endpoint when the spider closes.
    """

    def __init__(self):
        self.api_url = os.getenv('INGEST_API_URL', 'http://localhost:3000/api/internal/ingest')
        self.api_secret = os.getenv('INGEST_API_SECRET')

        if not self.api_secret:
            raise ValueError("INGEST_API_SECRET environment variable must be set")

        self.events = []
        self.fights = []
        self.fighters = []

    def open_spider(self, spider: Spider):
        """Called when spider opens"""
        logger.info(f"Opening spider {spider.name}")
        logger.info(f"Will post data to: {self.api_url}")

    def process_item(self, item: Dict[str, Any], spider: Spider):
        """
        Process each scraped item.

        Items are collected in memory and will be sent to API when spider closes.
        """
        item_type = type(item).__name__

        if item_type == 'EventItem':
            self.events.append(dict(item))
        elif item_type == 'FightItem':
            self.fights.append(dict(item))
        elif item_type == 'FighterItem':
            self.fighters.append(dict(item))
        else:
            logger.warning(f"Unknown item type: {item_type}")

        return item

    def close_spider(self, spider: Spider):
        """
        Called when spider closes.

        Posts all collected data to the Ingestion API.
        """
        logger.info(f"Closing spider {spider.name}")
        logger.info(f"Collected {len(self.events)} events, {len(self.fights)} fights, {len(self.fighters)} fighters")

        if not self.events and not self.fights and not self.fighters:
            logger.warning("No data to send to API")
            return

        try:
            self.post_to_api()
        except Exception as e:
            logger.error(f"Failed to post data to API: {e}")
            raise

    def post_to_api(self):
        """
        Send collected data to the Ingestion API.

        Raises:
            Exception: If API request fails
        """
        payload = {
            'events': self.events,
            'fights': self.fights,
            'fighters': self.fighters
        }

        headers = {
            'Authorization': f'Bearer {self.api_secret}',
            'Content-Type': 'application/json'
        }

        logger.info(f"Posting to API: {len(self.events)} events")

        try:
            response = requests.post(
                self.api_url,
                json=payload,
                headers=headers,
                timeout=30
            )

            response.raise_for_status()

            result = response.json()
            logger.info(f"API response: {result}")

        except requests.exceptions.RequestException as e:
            logger.error(f"API request failed: {e}")
            if hasattr(e.response, 'text'):
                logger.error(f"Response body: {e.response.text}")
            raise
