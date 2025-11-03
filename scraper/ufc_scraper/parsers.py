"""
HTML parsing functions for UFCStats.com

These functions extract structured data from UFCStats.com HTML pages.
"""

from bs4 import BeautifulSoup, element
from typing import List, Dict, Optional, Any
from datetime import datetime
import re


# ============================================================================
# Helper Functions for Data Cleaning and Parsing
# ============================================================================

def _clean_text(el: Optional[element.Tag]) -> str:
    """Safely extracts and strips text from a BeautifulSoup element."""
    return el.text.strip() if el else ''


def _parse_percentage(value: str) -> Optional[float]:
    """
    Converts a percentage string 'X%' to a float 0.XX.

    Examples:
        >>> _parse_percentage("50%")
        0.5
        >>> _parse_percentage("75%")
        0.75
    """
    if not value or '%' not in value:
        return None
    try:
        return float(value.replace('%', '')) / 100.0
    except (ValueError, AttributeError):
        return None


def _parse_time_to_seconds(value: str) -> Optional[int]:
    """
    Converts a time string 'MM:SS' to total seconds.

    Examples:
        >>> _parse_time_to_seconds("5:00")
        300
        >>> _parse_time_to_seconds("2:30")
        150
    """
    if not value or ':' not in value:
        return None
    try:
        parts = value.split(':')
        if len(parts) == 2:
            minutes, seconds = map(int, parts)
            return (minutes * 60) + seconds
        return None
    except (ValueError, AttributeError):
        return None


def _parse_int(value: str) -> Optional[int]:
    """
    Safely parses a string to an integer.
    Removes non-numeric characters before parsing.

    Examples:
        >>> _parse_int("76\"")
        76
        >>> _parse_int("185 lbs.")
        185
    """
    if not value:
        return None
    try:
        # Remove all non-digit characters except minus sign
        cleaned = re.sub(r'[^\d-]', '', value)
        return int(cleaned) if cleaned else None
    except (ValueError, TypeError):
        return None


def _parse_float(value: str) -> Optional[float]:
    """
    Safely parses a string to a float.

    Examples:
        >>> _parse_float("4.52")
        4.52
        >>> _parse_float("2.1")
        2.1
    """
    if not value:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def parse_event_list(soup: BeautifulSoup) -> List[Dict]:
    """
    Parse the main events list page to extract event URLs and basic info.

    Args:
        soup: BeautifulSoup object of the events list page

    Returns:
        List of dictionaries with event data
    """
    events = []

    # Find the events table
    table = soup.find('table', class_='b-statistics__table-events')
    if not table:
        return events

    # Find all event rows (excluding header and empty rows)
    rows = table.find('tbody').find_all('tr', class_=lambda x: x and 'b-statistics__table-row' in x)

    for row in rows:
        # Skip empty separator rows
        if 'b-statistics__table-col_type_clear' in str(row):
            continue

        # Find the event link
        link = row.find('a', class_=lambda x: x and 'b-link' in x)
        if not link or not link.get('href'):
            continue

        event_url = link.get('href').strip()
        event_name = link.text.strip()

        # Extract date
        date_span = row.find('span', class_='b-statistics__date')
        event_date_str = date_span.text.strip() if date_span else None

        # Extract location (second column)
        cols = row.find_all('td', class_='b-statistics__table-col')
        event_location = None
        if len(cols) >= 2:
            event_location = cols[1].text.strip()

        # Parse date to ISO format
        event_date = None
        if event_date_str:
            try:
                # Parse "November 01, 2025" format
                parsed_date = datetime.strptime(event_date_str, "%B %d, %Y")
                # Add UTC timezone for API validation
                event_date = parsed_date.isoformat() + 'Z'
            except ValueError:
                # If parsing fails, store as-is
                event_date = event_date_str

        # Generate event ID from URL or name
        event_id = extract_id_from_url(event_url)
        if not event_id:
            event_id = normalize_event_name(event_name)

        events.append({
            'id': event_id,
            'name': event_name,
            'date': event_date,
            'location': event_location,
            'sourceUrl': event_url
        })

    return events


def parse_event_detail(soup: BeautifulSoup, event_url: str) -> Dict:
    """
    Parse an event detail page to extract complete event and fight data.

    Args:
        soup: BeautifulSoup object of the event detail page
        event_url: Source URL of the event page

    Returns:
        Dictionary with event data including nested fights
    """
    event = {}
    fights = []
    fighters = []
    fighters_seen = set()  # Track unique fighters

    # Extract event name
    title_elem = soup.find('h2', class_='b-content__title')
    if title_elem:
        title_highlight = title_elem.find('span', class_='b-content__title-highlight')
        event_name = title_highlight.text.strip() if title_highlight else title_elem.text.strip()
    else:
        event_name = "Unknown Event"

    # Extract event metadata from info box
    event_date = None
    event_location = None
    event_venue = None

    info_list = soup.find('ul', class_='b-list__box-list')
    if info_list:
        list_items = info_list.find_all('li', class_='b-list__box-list-item')
        for item in list_items:
            text = item.text.strip()
            if 'Date:' in text:
                date_str = text.replace('Date:', '').strip()
                try:
                    # Parse "November 01, 2025" format
                    parsed_date = datetime.strptime(date_str, "%B %d, %Y")
                    # Add UTC timezone for API validation
                    event_date = parsed_date.isoformat() + 'Z'
                except ValueError:
                    event_date = date_str
            elif 'Location:' in text:
                # Format: "Las Vegas, Nevada, USA"
                location_str = text.replace('Location:', '').strip()
                event_location = location_str
                # Try to extract venue (usually city) and location (city, state, country)
                parts = [p.strip() for p in location_str.split(',')]
                if len(parts) >= 1:
                    event_venue = parts[0]  # First part is usually the venue/city

    # Generate event ID
    event_id = extract_id_from_url(event_url)
    if not event_id:
        event_id = normalize_event_name(event_name)

    # Build event dictionary
    event = {
        'id': event_id,
        'name': event_name,
        'date': event_date,
        'venue': event_venue,
        'location': event_location,
        'sourceUrl': event_url
    }

    # Extract fights from the table
    fight_table = soup.find('table', class_='b-fight-details__table')
    if fight_table:
        tbody = fight_table.find('tbody', class_='b-fight-details__table-body')
        if tbody:
            fight_rows = tbody.find_all('tr', class_='b-fight-details__table-row')

            for idx, row in enumerate(fight_rows, start=1):
                # Find all fighter links in this row
                fighter_links = row.find_all('a', href=lambda x: x and 'fighter-details' in x)

                # Should be 2 fighters per fight
                if len(fighter_links) < 2:
                    continue

                fighter1_url = fighter_links[0].get('href').strip()
                fighter1_name = fighter_links[0].text.strip()
                fighter1_id = extract_id_from_url(fighter1_url)

                fighter2_url = fighter_links[1].get('href').strip()
                fighter2_name = fighter_links[1].text.strip()
                fighter2_id = extract_id_from_url(fighter2_url)

                # Extract weight class and title fight status
                weight_class = None
                is_title_fight = False
                # Weight class is in a specific column
                cells = row.find_all('td', class_='b-fight-details__table-col')
                for cell in cells:
                    cell_text = cell.text.strip()
                    # Look for weight class keywords
                    if 'weight' in cell_text.lower() or 'Catch Weight' in cell_text:
                        # Extract just the weight class name (before any newlines or "Bout")
                        weight_class = cell_text.split('\n')[0].strip()

                        # Check for title fight (belt.png image)
                        belt_img = cell.find('img', src=lambda x: x and 'belt.png' in x)
                        if belt_img:
                            is_title_fight = True
                        break

                # Determine card position and main event status based on fight order
                # UFCStats lists fights from most important (main event) to least important
                is_main_event = (idx == 1)  # First fight is main event

                # Infer card position based on index
                if idx == 1:
                    card_position = "Main Event"
                elif idx == 2:
                    card_position = "Co-Main Event"
                elif idx <= 5:
                    card_position = "Main Card"
                elif idx <= 9:
                    card_position = "Prelims"
                else:
                    card_position = "Early Prelims"

                # Generate fight ID
                fight_id = f"{event_id}-{fighter1_id}-{fighter2_id}"

                # Generate unique sourceUrl for this fight by appending fight ID as fragment
                # This ensures each fight has a unique sourceUrl for database constraints
                fight_source_url = f"{event_url}#fight-{fight_id}"

                # Add fight
                fight = {
                    'id': fight_id,
                    'eventId': event_id,
                    'fighter1Id': fighter1_id,
                    'fighter2Id': fighter2_id,
                    'weightClass': weight_class,
                    'titleFight': is_title_fight,
                    'mainEvent': is_main_event,
                    'cardPosition': card_position,
                    'sourceUrl': fight_source_url
                }
                fights.append(fight)

                # Add fighters if not already seen
                if fighter1_id not in fighters_seen:
                    fighters.append({
                        'id': fighter1_id,
                        'name': fighter1_name,
                        'sourceUrl': fighter1_url,
                        # Record will be populated from fighter profile page if needed
                        'record': None,
                        'wins': None,
                        'losses': None,
                        'draws': None
                    })
                    fighters_seen.add(fighter1_id)

                if fighter2_id not in fighters_seen:
                    fighters.append({
                        'id': fighter2_id,
                        'name': fighter2_name,
                        'sourceUrl': fighter2_url,
                        'record': None,
                        'wins': None,
                        'losses': None,
                        'draws': None
                    })
                    fighters_seen.add(fighter2_id)

    return {
        'event': event,
        'fights': fights,
        'fighters': fighters
    }


def parse_fighter_profile(soup: BeautifulSoup, fighter_url: str) -> Dict[str, Any]:
    """
    Parses a fighter's profile page on UFCStats.com to extract a comprehensive
    set of statistics for AI modeling.

    Args:
        soup: BeautifulSoup object of the fighter profile page
        fighter_url: URL of the fighter profile

    Returns:
        Dictionary with comprehensive fighter data including all statistics
    """
    fighter: Dict[str, Any] = {
        'id': extract_id_from_url(fighter_url),
        'sourceUrl': fighter_url,
    }

    # --- Basic Info ---
    fighter['name'] = _clean_text(soup.find('span', class_='b-content__title-highlight'))

    record_elem = soup.find('span', class_='b-content__title-record')
    if record_elem:
        record_str = _clean_text(record_elem).replace('Record:', '').strip()
        fighter['record'] = record_str
        parsed_record = parse_record(record_str)
        if parsed_record:
            fighter.update(parsed_record)

    # --- Physical Attributes & Career Stats ---
    info_box_elements = soup.find_all('li', class_='b-list__box-list-item')

    # A mapping from the label on the website to our desired schema key and parser function
    stats_map = {
        'Height:': ('height', None),
        'Weight:': ('weightLbs', _parse_int),
        'Reach:': ('reachInches', _parse_int),
        'STANCE:': ('stance', None),
        'DOB:': ('dob', None),
        'SLpM:': ('significantStrikesLandedPerMinute', _parse_float),
        'Str. Acc.:': ('strikingAccuracyPercentage', _parse_percentage),
        'SApM:': ('significantStrikesAbsorbedPerMinute', _parse_float),
        'Str. Def:': ('strikingDefensePercentage', _parse_percentage),  # Note: HTML uses "Str. Def:" not "Sig. Str. Defence:"
        'TD Avg.:': ('takedownAverage', _parse_float),
        'TD Acc.:': ('takedownAccuracyPercentage', _parse_percentage),
        'TD Def.:': ('takedownDefensePercentage', _parse_percentage),
        'Sub. Avg.:': ('submissionAverage', _parse_float),
        # NOTE: UFCStats.com does NOT provide these stats on fighter profile pages!
        # They would need to be calculated from fight history or event results
        # 'Avg. Fight Time:': ('averageFightTimeSeconds', _parse_time_to_seconds),
        # 'Wins by KO/TKO:': ('winsByKO', _parse_int),
        # 'Wins by Submission:': ('winsBySubmission', _parse_int),
        # 'Wins by Decision:': ('winsByDecision', _parse_int),
    }

    # Set defaults for fields not available on profile page
    fighter.setdefault('averageFightTimeSeconds', 0)
    fighter.setdefault('winsByKO', 0)
    fighter.setdefault('winsBySubmission', 0)
    fighter.setdefault('winsByDecision', 0)

    for item in info_box_elements:
        label_element = item.find('i', class_='b-list__box-item-title')
        if not label_element:
            continue

        label = _clean_text(label_element)
        if label in stats_map:
            schema_key, parser_func = stats_map[label]

            # The value is the text of the <li> element minus the label's text
            value_str = _clean_text(item).replace(label, '').strip()

            # Store original height/reach strings for display, but also parse numeric values
            if schema_key == 'height':
                fighter['height'] = value_str  # e.g. "5' 11\""
                fighter['reachInches'] = None  # Will be set separately from 'Reach:' field
            elif schema_key == 'reachInches':
                fighter['reach'] = value_str  # e.g. "76\""
                fighter[schema_key] = parser_func(value_str) if parser_func else value_str
            else:
                fighter[schema_key] = parser_func(value_str) if parser_func else value_str

    # --- Calculated Stats for AI Model ---
    total_wins = fighter.get('wins', 0)
    wins_by_ko = fighter.get('winsByKO', 0)
    wins_by_sub = fighter.get('winsBySubmission', 0)

    if total_wins and total_wins > 0 and wins_by_ko is not None and wins_by_sub is not None:
        finish_rate = (wins_by_ko + wins_by_sub) / total_wins
        fighter['finishRate'] = round(finish_rate, 3)
        fighter['koPercentage'] = round(wins_by_ko / total_wins, 3)
        fighter['submissionPercentage'] = round(wins_by_sub / total_wins, 3)
    else:
        # Set defaults for fighters with no wins or missing data
        fighter['finishRate'] = 0.0
        fighter['koPercentage'] = 0.0
        fighter['submissionPercentage'] = 0.0

    return fighter


def parse_record(record_str: str) -> Optional[Dict[str, int]]:
    """
    Parse a W-L-D record string into wins, losses, draws.

    Args:
        record_str: Record string like "27-1-0"

    Returns:
        Dictionary with wins, losses, draws or None if invalid

    Examples:
        >>> parse_record("27-1-0")
        {'wins': 27, 'losses': 1, 'draws': 0}
    """
    if not record_str or not isinstance(record_str, str):
        return None

    # Match W-L-D pattern
    match = re.match(r'(\d+)-(\d+)-(\d+)', record_str.strip())
    if not match:
        return None

    return {
        'wins': int(match.group(1)),
        'losses': int(match.group(2)),
        'draws': int(match.group(3))
    }


def extract_id_from_url(url: str) -> str:
    """
    Extract a unique ID from a UFCStats.com URL.

    Args:
        url: UFCStats.com URL

    Returns:
        URL-safe ID string

    Examples:
        >>> extract_id_from_url("http://ufcstats.com/event-details/abc123")
        "abc123"
        >>> extract_id_from_url("http://ufcstats.com/fighter-details/Jon-Jones")
        "Jon-Jones"
    """
    # Remove trailing slash and extract last segment
    url = url.rstrip('/')
    return url.split('/')[-1]


def normalize_event_name(name: str) -> str:
    """
    Normalize event name for ID generation.

    Args:
        name: Raw event name

    Returns:
        Normalized, URL-safe event name

    Examples:
        >>> normalize_event_name("UFC 299: O'Malley vs. Vera 2")
        "UFC-299"
    """
    # Extract UFC number or Fight Night identifier
    match = re.search(r'UFC\s+(\d+)', name, re.IGNORECASE)
    if match:
        return f"UFC-{match.group(1)}"

    # Handle Fight Night events
    match = re.search(r'UFC\s+Fight\s+Night\s*:?\s*(.+)', name, re.IGNORECASE)
    if match:
        # Use first fighter names or location
        subtitle = match.group(1).strip()
        # Clean and truncate
        subtitle = re.sub(r'[^\w\s-]', '', subtitle)
        subtitle = '-'.join(subtitle.split()[:3])  # First 3 words
        return f"UFC-Fight-Night-{subtitle}"

    # Fallback: clean the full name
    clean_name = re.sub(r'[^\w\s-]', '', name)
    return '-'.join(clean_name.split()[:5])
