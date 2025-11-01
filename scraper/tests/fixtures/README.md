# Test Fixtures

## Overview

This directory contains HTML fixtures captured from UFCStats.com for testing purposes.

## How to Update Fixtures

When UFCStats.com structure changes and tests start failing:

1. **Capture new HTML:**
   ```bash
   curl -A "Mozilla/5.0" http://ufcstats.com/statistics/events/completed > event_list_page.html
   curl -A "Mozilla/5.0" http://ufcstats.com/event-details/abc123 > event_detail_page.html
   ```

2. **Anonymize data (optional):**
   - Replace real fighter names with generic ones if needed
   - Keep HTML structure intact

3. **Run tests:**
   ```bash
   pytest tests/unit/test_parsers.py -v
   ```

4. **Update parsers if needed:**
   - Fix CSS selectors in `ufc_scraper/parsers.py`
   - Ensure tests pass

## Fixture Files

- `event_list_page.html` - Main events list (to be captured)
- `event_detail_page.html` - Single event details (to be captured)
- `fighter_profile_page.html` - Fighter profile (to be captured)

## Fixture Update Schedule

- **Monthly:** Check if structure has changed
- **On test failures:** Immediate update and investigation

## Capturing Fixtures

Use the provided script:
```bash
python scripts/update_fixtures.py
```

This will automatically fetch and save the latest HTML from UFCStats.com.
