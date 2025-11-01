# UFC Scraper Operations Guide

## Overview

The UFC scraper is a Python/Scrapy application that scrapes fight data from UFCStats.com and posts it to a Next.js ingestion API. It runs automatically daily via GitHub Actions and can be triggered manually for testing.

## Architecture

```
GitHub Actions (Daily 2AM UTC)
        ↓
Python Scraper (Scrapy)
        ↓ HTTP POST with auth
Next.js API (/api/internal/ingest)
        ↓ Prisma ORM
PostgreSQL Database (Supabase)
```

## Automated Daily Scraping

**Schedule**: Daily at 2:00 AM UTC
**Workflow**: `.github/workflows/scraper.yml`
**Duration**: ~2 minutes for 1 event, scales with event count

The scraper runs automatically every day to capture new UFC events and updates.

## Manual Scraping

### Via GitHub Actions (Recommended)

Trigger the workflow manually from the Actions tab or via CLI:

```bash
# Scrape all events
gh workflow run scraper.yml

# Scrape limited events (for testing)
gh workflow run scraper.yml -f limit=1
gh workflow run scraper.yml -f limit=5
```

### Local Development

```bash
cd scraper

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export INGEST_API_URL="https://finish-finder.vercel.app/api/internal/ingest"
export INGEST_API_SECRET="your-secret-here"

# Run scraper
scrapy crawl ufcstats                    # All events
scrapy crawl ufcstats -a limit=1          # Limit to 1 event
scrapy crawl ufcstats -a limit=5          # Limit to 5 events
scrapy crawl ufcstats -s LOG_LEVEL=DEBUG  # Verbose logging
```

## Monitoring

### Check Scrape Logs

View the most recent scrape status in the database:

```sql
SELECT
  "startTime",
  "endTime",
  "status",
  "eventsFound",
  "fightsAdded",
  "fightsUpdated",
  "fightersAdded",
  "errorMessage"
FROM "ScrapeLog"
ORDER BY "startTime" DESC
LIMIT 10;
```

### GitHub Actions Logs

```bash
# List recent runs
gh run list --workflow=scraper.yml --limit=10

# View specific run
gh run view <run-id> --log

# Watch live run
gh run watch <run-id>
```

### Database Health Checks

```sql
-- Check total records
SELECT
  (SELECT COUNT(*) FROM "Event") as events,
  (SELECT COUNT(*) FROM "Fight") as fights,
  (SELECT COUNT(*) FROM "Fighter") as fighters;

-- Check recent updates
SELECT
  id,
  name,
  "lastScrapedAt"
FROM "Event"
WHERE "lastScrapedAt" > NOW() - INTERVAL '24 hours'
ORDER BY "lastScrapedAt" DESC;

-- Identify stale data (not updated in 7 days)
SELECT
  id,
  name,
  date,
  "lastScrapedAt"
FROM "Event"
WHERE
  "lastScrapedAt" < NOW() - INTERVAL '7 days'
  AND date > NOW()
ORDER BY date ASC;
```

## Troubleshooting

### Common Issues

#### 1. Scraper Returns 0 Events

**Symptom**: `eventsFound: 0` in ScrapeLog

**Causes**:
- UFCStats.com HTML structure changed
- Rate limiting or IP blocking
- Network connectivity issues

**Solution**:
```bash
# 1. Test locally with verbose logging
cd scraper
scrapy crawl ufcstats -a limit=1 -s LOG_LEVEL=DEBUG

# 2. Update HTML fixtures
curl -A "Mozilla/5.0" http://ufcstats.com/statistics/events/completed > tests/fixtures/event_list_new.html

# 3. Compare with existing fixture
diff tests/fixtures/event_list.html tests/fixtures/event_list_new.html

# 4. Update parsers if structure changed
# Edit ufc_scraper/parsers.py with new CSS selectors

# 5. Run tests
pytest tests/test_parsers.py -v
```

#### 2. API Authentication Failure

**Symptom**: `401 Unauthorized` or `403 Forbidden`

**Causes**:
- Missing or incorrect INGEST_API_SECRET
- Secret mismatch between GitHub and Vercel

**Solution**:
```bash
# Check GitHub secrets
gh secret list

# Update secret if needed
gh secret set INGEST_API_SECRET --body "new-secret-here"

# Verify Vercel environment variable matches
# Visit: https://vercel.com/your-project/settings/environment-variables
```

#### 3. Database Connection Errors

**Symptom**: `Can't reach database server`

**Causes**:
- Supabase database paused/unavailable
- Connection string expired
- Network issues

**Solution**:
```bash
# Test database connection
DATABASE_URL="your-connection-string" node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$connect().then(() => console.log('✓ Connected')).catch(console.error);
"

# Update DATABASE_URL secret if needed
gh secret set DATABASE_URL --body "new-database-url"
```

#### 4. High Parsing Errors

**Symptom**: Many fighters or fights missing from scraped events

**Causes**:
- HTML structure changes
- Missing error handling
- Data format changes

**Solution**:
```bash
# Run parser tests with fixtures
pytest tests/test_parsers.py -v --cov=ufc_scraper/parsers

# Test with live data
python test_fight_enrichment.py

# Check specific parser functions
python -c "
from bs4 import BeautifulSoup
from ufc_scraper import parsers

# Test event list parsing
with open('tests/fixtures/event_list.html') as f:
    soup = BeautifulSoup(f.read(), 'html.parser')
    events = parsers.parse_event_list(soup)
    print(f'Parsed {len(events)} events')
"
```

#### 5. Duplicate Fights in Database

**Symptom**: Same fight appears multiple times

**Causes**:
- sourceUrl generation bug
- Fight ID collision
- Transaction failure

**Solution**:
```sql
-- Find duplicates
SELECT
  "fighter1Id",
  "fighter2Id",
  "eventId",
  COUNT(*) as count
FROM "Fight"
GROUP BY "fighter1Id", "fighter2Id", "eventId"
HAVING COUNT(*) > 1;

-- Check sourceUrl uniqueness
SELECT
  "sourceUrl",
  COUNT(*) as count
FROM "Fight"
WHERE "sourceUrl" IS NOT NULL
GROUP BY "sourceUrl"
HAVING COUNT(*) > 1;
```

## Maintenance

### Weekly Tasks

1. **Check Scrape Success Rate**
   ```sql
   SELECT
     status,
     COUNT(*) as count,
     ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
   FROM "ScrapeLog"
   WHERE "startTime" > NOW() - INTERVAL '7 days'
   GROUP BY status;
   ```

2. **Verify Data Freshness**
   ```sql
   SELECT
     COUNT(*) as stale_events
   FROM "Event"
   WHERE
     "lastScrapedAt" < NOW() - INTERVAL '7 days'
     AND date > NOW();
   ```

3. **Review Failed Runs**
   ```bash
   gh run list --workflow=scraper.yml --status=failure --limit=10
   ```

### Monthly Tasks

1. **Update Test Fixtures**
   ```bash
   cd scraper

   # Fetch latest HTML
   curl -A "Mozilla/5.0" http://ufcstats.com/statistics/events/completed?page=all > tests/fixtures/event_list.html
   curl -A "Mozilla/5.0" http://ufcstats.com/event-details/LATEST_EVENT_ID > tests/fixtures/event_detail_upcoming.html

   # Run tests to verify
   pytest tests/ -v
   ```

2. **Review and Rotate Secrets**
   ```bash
   # Generate new API secret
   openssl rand -hex 32

   # Update in GitHub and Vercel
   gh secret set INGEST_API_SECRET --body "new-secret"
   ```

3. **Database Cleanup**
   ```sql
   -- Remove old scrape logs (keep 90 days)
   DELETE FROM "ScrapeLog"
   WHERE "startTime" < NOW() - INTERVAL '90 days';
   ```

## Emergency Procedures

### Disable Automated Scraping

If the scraper is causing issues:

1. **Disable GitHub Actions workflow**:
   ```bash
   # Temporarily disable via GitHub UI
   # Settings → Actions → Workflows → UFC Stats Scraper → Disable
   ```

2. **Or comment out schedule in workflow file**:
   ```yaml
   on:
     # schedule:
     #   - cron: '0 2 * * *'
     workflow_dispatch:
       ...
   ```

### Emergency Data Rollback

If bad data was scraped:

```sql
-- Find the bad scrape
SELECT * FROM "ScrapeLog"
WHERE "startTime" > 'YYYY-MM-DD HH:MM:SS'
ORDER BY "startTime" DESC;

-- Identify affected records
SELECT * FROM "Event"
WHERE "lastScrapedAt" BETWEEN 'START_TIME' AND 'END_TIME';

-- Manual cleanup (use transactions!)
BEGIN;

-- Revert specific event
UPDATE "Event"
SET
  name = 'old_value',
  "lastScrapedAt" = 'previous_timestamp'
WHERE id = 'event_id';

-- Verify changes
SELECT * FROM "Event" WHERE id = 'event_id';

COMMIT; -- or ROLLBACK if wrong
```

## Performance Tuning

### Adjust Scraping Speed

Edit `scraper/ufc_scraper/settings.py`:

```python
# Slower (more respectful, less likely to be blocked)
DOWNLOAD_DELAY = 5
CONCURRENT_REQUESTS = 1

# Faster (use with caution)
DOWNLOAD_DELAY = 2
CONCURRENT_REQUESTS = 2
```

### Limit Event Processing

For testing or faster runs:

```bash
# Only scrape recent events
scrapy crawl ufcstats -a limit=10

# Only scrape specific date range (requires code change)
# Modify parsers.py to filter by date
```

## Contact & Support

- **GitHub Issues**: https://github.com/alexzfe/finish-finder/issues
- **Documentation**: `/scraper/README.md`
- **Architecture**: `/docs/NEW_SCRAPER_ARCHITECTURE.md`
- **Testing**: `/docs/SCRAPER_TESTING_STRATEGY.md`

## Quick Reference

| Task | Command |
|------|---------|
| Trigger manual scrape | `gh workflow run scraper.yml -f limit=1` |
| View recent runs | `gh run list --workflow=scraper.yml` |
| Check logs | `gh run view <run-id> --log` |
| Local test | `scrapy crawl ufcstats -a limit=1` |
| Run tests | `pytest tests/ -v` |
| Check database | See SQL queries in Monitoring section |
| Update fixtures | `curl -A "Mozilla/5.0" <url> > tests/fixtures/<file>` |
