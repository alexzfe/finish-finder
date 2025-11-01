"""
Scrapy items for UFC Stats data

Define here the models for your scraped items

See documentation in:
https://docs.scrapy.org/en/latest/topics/items.html
"""

import scrapy
from typing import Optional


class EventItem(scrapy.Item):
    """UFC Event"""
    id = scrapy.Field()  # URL slug: "UFC-299"
    name = scrapy.Field()
    date = scrapy.Field()  # ISO 8601 datetime string
    venue = scrapy.Field()
    location = scrapy.Field()
    sourceUrl = scrapy.Field()  # UFCStats.com URL
    fights = scrapy.Field()  # List of FightItem


class FightItem(scrapy.Item):
    """UFC Fight"""
    id = scrapy.Field()  # "{eventId}-{fighter1Id}-{fighter2Id}"
    eventId = scrapy.Field()
    fighter1Id = scrapy.Field()
    fighter2Id = scrapy.Field()
    weightClass = scrapy.Field()
    titleFight = scrapy.Field()  # Boolean: True if championship bout
    mainEvent = scrapy.Field()  # Boolean: True if main event
    cardPosition = scrapy.Field()  # "Main Event", "Co-Main Event", "Main Card", "Prelims", "Early Prelims"
    sourceUrl = scrapy.Field()


class FighterItem(scrapy.Item):
    """UFC Fighter"""
    id = scrapy.Field()  # URL slug: "Jon-Jones"
    name = scrapy.Field()
    record = scrapy.Field()  # "W-L-D" format
    wins = scrapy.Field()
    losses = scrapy.Field()
    draws = scrapy.Field()
    sourceUrl = scrapy.Field()
