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
    completed = scrapy.Field()  # Boolean: True if event has concluded
    cancelled = scrapy.Field()  # Boolean: True if event was cancelled
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
    scheduledRounds = scrapy.Field()  # 3 or 5 rounds
    sourceUrl = scrapy.Field()

    # Fight outcome fields (populated for completed events)
    completed = scrapy.Field()  # Boolean: True if fight has concluded
    winnerId = scrapy.Field()  # String: ID of winning fighter (None for NC/Draw)
    method = scrapy.Field()  # String: KO/TKO, SUB, DEC, DQ, NC
    round = scrapy.Field()  # Int: Round in which fight ended (1-5)
    time = scrapy.Field()  # String: Time in format "M:SS"


class FighterItem(scrapy.Item):
    """UFC Fighter with comprehensive statistics"""
    id = scrapy.Field()  # URL slug: "Jon-Jones"
    name = scrapy.Field()
    sourceUrl = scrapy.Field()

    # Basic record
    record = scrapy.Field()  # "W-L-D" format
    wins = scrapy.Field()
    losses = scrapy.Field()
    draws = scrapy.Field()

    # Physical attributes (from UFCStats.com)
    height = scrapy.Field()  # e.g. "5' 11\""
    weightLbs = scrapy.Field()
    reach = scrapy.Field()  # e.g. "76\""
    reachInches = scrapy.Field()
    stance = scrapy.Field()  # Orthodox, Southpaw, Switch
    dob = scrapy.Field()

    # Striking statistics (from UFCStats.com)
    significantStrikesLandedPerMinute = scrapy.Field()
    strikingAccuracyPercentage = scrapy.Field()
    significantStrikesAbsorbedPerMinute = scrapy.Field()
    strikingDefensePercentage = scrapy.Field()

    # Grappling statistics (from UFCStats.com)
    takedownAverage = scrapy.Field()
    takedownAccuracyPercentage = scrapy.Field()
    takedownDefensePercentage = scrapy.Field()
    submissionAverage = scrapy.Field()

    # Win methods & fight averages (from UFCStats.com)
    averageFightTimeSeconds = scrapy.Field()
    winsByKO = scrapy.Field()
    winsBySubmission = scrapy.Field()
    winsByDecision = scrapy.Field()

    # Loss methods (computed from fight history)
    lossesByKO = scrapy.Field()
    lossesBySubmission = scrapy.Field()
    lossesByDecision = scrapy.Field()

    # Calculated statistics (computed by parser)
    finishRate = scrapy.Field()
    koPercentage = scrapy.Field()
    submissionPercentage = scrapy.Field()
