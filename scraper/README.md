# UFC Stats Scraper

Python/Scrapy-based scraper for UFCStats.com that extracts UFC events, fights, and fighters.

## Architecture

This scraper is part of a decoupled architecture:

```
GitHub Actions → Python Scraper → Next.js API → PostgreSQL
```

The scraper's responsibility is to:
1. Fetch HTML from UFCStats.com
2. Parse HTML tables using BeautifulSoup
3. Structure data into JSON format
4. POST JSON to the Ingestion API

## Setup

### Prerequisites

- Python 3.11+
- pip

### Installation

1. **Create virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   pip install -r requirements-dev.txt  # For development
   ```

3. **Set environment variables:**
   ```bash
   export INGEST_API_URL="http://localhost:3000/api/internal/ingest"
   export INGEST_API_SECRET="your-secret-key"
   ```

## Usage

### Run Scraper

```bash
# Scrape all events
scrapy crawl ufcstats

# Limit to N items (for testing)
scrapy crawl ufcstats -s CLOSESPIDER_ITEMCOUNT=5

# Save output to JSON file
scrapy crawl ufcstats -o output.json
```

### Run Tests

```bash
# All tests with coverage
pytest --cov

# Unit tests only
pytest tests/unit/ -v

# Integration tests
pytest tests/integration/ -v

# Specific test file
pytest tests/unit/test_parsers.py -v
```

### Code Quality

```bash
# Format code
black ufc_scraper/ tests/

# Lint
flake8 ufc_scraper/

# Type checking
mypy ufc_scraper/
```

## Project Structure

```
scraper/
├── ufc_scraper/
│   ├── spiders/
│   │   ├── __init__.py
│   │   └── ufcstats.py          # Main spider
│   ├── __init__.py
│   ├── items.py                  # Data models
│   ├── parsers.py                # HTML parsing functions
│   ├── pipelines.py              # API posting logic
│   └── settings.py               # Scrapy settings
├── tests/
│   ├── fixtures/                 # HTML test fixtures
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   └── conftest.py               # Pytest configuration
├── scripts/
│   └── update_fixtures.py        # Update test fixtures
├── requirements.txt              # Production dependencies
├── requirements-dev.txt          # Development dependencies
├── pytest.ini                    # Pytest configuration
└── scrapy.cfg                    # Scrapy project config
```

## Development

### Adding a New Parser

1. Add parsing function to `ufc_scraper/parsers.py`
2. Add tests to `tests/unit/test_parsers.py`
3. Update fixtures if needed
4. Run tests: `pytest tests/unit/test_parsers.py -v`

### Updating Fixtures

```bash
python scripts/update_fixtures.py
```

This will fetch fresh HTML from UFCStats.com and save to `tests/fixtures/`.

## Configuration

### Scrapy Settings

Key settings in `ufc_scraper/settings.py`:

- `DOWNLOAD_DELAY = 3` - Wait 3 seconds between requests
- `CONCURRENT_REQUESTS_PER_DOMAIN = 1` - One request at a time
- `AUTOTHROTTLE_ENABLED = True` - Dynamic throttling based on load
- `ROBOTSTXT_OBEY = True` - Respect robots.txt

### Environment Variables

- `INGEST_API_URL` - URL of the Next.js ingestion endpoint (required)
- `INGEST_API_SECRET` - Bearer token for authentication (required)

## Monitoring

The scraper logs all activity. Check logs for:

- Events found
- Fights extracted
- Fighters processed
- API post results

## Troubleshooting

### No events found

1. Check if UFCStats.com structure changed
2. Update fixtures: `python scripts/update_fixtures.py`
3. Update parser selectors in `parsers.py`
4. Run tests to verify

### API authentication failed

1. Check `INGEST_API_SECRET` is set correctly
2. Verify API is running
3. Check API logs for detailed error

### Rate limiting

If you get blocked:
1. Increase `DOWNLOAD_DELAY` in `settings.py`
2. Check `robots.txt` for restrictions
3. Verify site structure hasn't changed

## References

- [Scrapy Documentation](https://docs.scrapy.org/)
- [BeautifulSoup Documentation](https://www.crummy.com/software/BeautifulSoup/bs4/doc/)
- [Architecture Document](../docs/NEW_SCRAPER_ARCHITECTURE.md)
- [Testing Strategy](../docs/SCRAPER_TESTING_STRATEGY.md)
