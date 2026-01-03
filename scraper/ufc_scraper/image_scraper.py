"""
Fighter Image Scraper

Multi-source image collection for UFC fighters.

Sources (in priority order):
1. ESPN API - Most reliable with predictable URLs once athlete ID is found
2. Wikipedia - Legally safe CC-licensed images

Usage:
    from ufc_scraper.image_scraper import get_fighter_image

    image_url = get_fighter_image("Conor McGregor")
"""

import requests
import unicodedata
import time
import logging
from typing import Optional, Dict, Any
from functools import lru_cache

logger = logging.getLogger(__name__)

# Rate limiting: minimum seconds between requests per source
RATE_LIMIT_SECONDS = 2.0
_last_request_time: Dict[str, float] = {}

# Request headers
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; FinishFinderBot/1.0; +https://finish-finder.com)'
}

# ESPN API endpoints
ESPN_SEARCH_URL = "https://site.web.api.espn.com/apis/common/v3/search"
ESPN_IMAGE_URL_TEMPLATE = "https://a.espncdn.com/i/headshots/mma/players/full/{athlete_id}.png"

# Cache for ESPN athlete ID mappings
_espn_athlete_cache: Dict[str, Optional[str]] = {}


def _rate_limit(source: str) -> None:
    """Apply rate limiting between requests to a source."""
    global _last_request_time
    now = time.time()
    last = _last_request_time.get(source, 0)
    wait = RATE_LIMIT_SECONDS - (now - last)
    if wait > 0:
        time.sleep(wait)
    _last_request_time[source] = time.time()


def _normalize_name(name: str) -> str:
    """Normalize fighter name for matching."""
    # Remove accents
    name = unicodedata.normalize('NFD', name)
    name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
    # Lowercase and clean whitespace
    return ' '.join(name.lower().split())


def _names_match(name1: str, name2: str, threshold: float = 0.85) -> bool:
    """Check if two names match using token-based comparison."""
    n1 = set(_normalize_name(name1).split())
    n2 = set(_normalize_name(name2).split())

    if not n1 or not n2:
        return False

    # Calculate Jaccard similarity
    intersection = len(n1 & n2)
    union = len(n1 | n2)
    similarity = intersection / union if union > 0 else 0

    return similarity >= threshold


def _get_espn_athlete_id(fighter_name: str) -> Optional[str]:
    """
    Find ESPN athlete ID by searching their API.

    Uses ESPN's search endpoint which returns athlete IDs and headshot URLs.
    We cache results to avoid repeated lookups.
    """
    normalized = _normalize_name(fighter_name)

    # Check cache first
    if normalized in _espn_athlete_cache:
        return _espn_athlete_cache[normalized]

    try:
        _rate_limit('espn')

        params = {
            'query': fighter_name,
            'limit': 5,
            'type': 'player'
        }

        response = requests.get(
            ESPN_SEARCH_URL,
            params=params,
            headers=HEADERS,
            timeout=10
        )
        response.raise_for_status()
        data = response.json()

        # Search through results for MMA fighters
        items = data.get('items', [])
        for item in items:
            # Only consider MMA fighters
            if item.get('sport') != 'mma':
                continue

            athlete_name = item.get('displayName', '')
            athlete_id = item.get('id')

            if athlete_id and _names_match(fighter_name, athlete_name):
                _espn_athlete_cache[normalized] = athlete_id
                logger.info(f"Found ESPN athlete ID for {fighter_name}: {athlete_id}")
                return athlete_id

        # Cache negative result
        _espn_athlete_cache[normalized] = None
        return None

    except Exception as e:
        logger.warning(f"ESPN athlete lookup failed for {fighter_name}: {e}")
        return None


def get_espn_image(fighter_name: str) -> Optional[str]:
    """
    Get fighter image URL from ESPN.

    Returns the direct CDN URL if athlete ID is found.
    """
    athlete_id = _get_espn_athlete_id(fighter_name)

    if athlete_id:
        image_url = ESPN_IMAGE_URL_TEMPLATE.format(athlete_id=athlete_id)

        # Verify the image exists
        try:
            _rate_limit('espn_verify')
            response = requests.head(image_url, headers=HEADERS, timeout=5)
            if response.status_code == 200:
                return image_url
        except Exception:
            pass

    return None


def get_wikipedia_image(fighter_name: str) -> Optional[str]:
    """
    Get fighter image from Wikipedia using their API.

    Wikipedia images are CC-licensed, making them legally safe to use.
    """
    try:
        _rate_limit('wikipedia')

        # Wikipedia API for page images
        api_url = "https://en.wikipedia.org/w/api.php"
        params = {
            'action': 'query',
            'titles': fighter_name.replace(' ', '_'),
            'prop': 'pageimages',
            'format': 'json',
            'piprop': 'original',
            'redirects': 1  # Follow redirects
        }

        response = requests.get(api_url, params=params, headers=HEADERS, timeout=10)
        response.raise_for_status()
        data = response.json()

        pages = data.get('query', {}).get('pages', {})
        for page_id, page_data in pages.items():
            if page_id == '-1':
                continue  # Page not found

            original = page_data.get('original', {})
            source = original.get('source')

            if source:
                logger.info(f"Found Wikipedia image for {fighter_name}")
                return source

        return None

    except Exception as e:
        logger.warning(f"Wikipedia image lookup failed for {fighter_name}: {e}")
        return None


def get_fighter_image(fighter_name: str) -> Optional[str]:
    """
    Get fighter image URL from multiple sources.

    Tries sources in order of reliability:
    1. ESPN (most reliable for active UFC fighters)
    2. Wikipedia (legally safe fallback)

    Args:
        fighter_name: Full fighter name (e.g., "Conor McGregor")

    Returns:
        Image URL string or None if no image found
    """
    if not fighter_name or not fighter_name.strip():
        return None

    logger.debug(f"Looking up image for: {fighter_name}")

    # Try ESPN first (best quality, most reliable for UFC fighters)
    image_url = get_espn_image(fighter_name)
    if image_url:
        logger.info(f"[ESPN] Found image for {fighter_name}: {image_url}")
        return image_url

    # Fall back to Wikipedia
    image_url = get_wikipedia_image(fighter_name)
    if image_url:
        logger.info(f"[Wikipedia] Found image for {fighter_name}: {image_url}")
        return image_url

    logger.debug(f"No image found for {fighter_name}")
    return None


def batch_get_fighter_images(fighter_names: list[str]) -> Dict[str, Optional[str]]:
    """
    Get images for multiple fighters efficiently.

    Args:
        fighter_names: List of fighter names

    Returns:
        Dict mapping fighter names to image URLs (or None)
    """
    results = {}

    for name in fighter_names:
        results[name] = get_fighter_image(name)

    return results


# ESPN cache is populated on-demand via search API (no pre-warming needed)
