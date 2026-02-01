# UFC Scraper Testing Strategy

**Created:** 2025-01-01
**Status:** Planning Phase
**Related:** `NEW_SCRAPER_ARCHITECTURE.md`

## Table of Contents
1. [Testing Philosophy](#testing-philosophy)
2. [Test Pyramid](#test-pyramid)
3. [Python Scraper Tests](#python-scraper-tests)
4. [TypeScript API Tests](#typescript-api-tests)
5. [Integration Tests](#integration-tests)
6. [E2E Tests](#e2e-tests)
7. [Test Fixtures & Data](#test-fixtures--data)
8. [CI/CD Integration](#cicd-integration)
9. [Monitoring & Alerts](#monitoring--alerts)

---

## Testing Philosophy

### Goals
- ✅ **Prevent regressions** - Site structure changes don't break silently
- ✅ **Fast feedback** - Developers know immediately when something breaks
- ✅ **Confidence in deploys** - All tests pass = safe to deploy
- ✅ **Living documentation** - Tests show how the system should work

### Principles
1. **Test behavior, not implementation** - Don't test CSS selectors, test extracted data
2. **Use real HTML fixtures** - Capture actual UFCStats.com pages
3. **Fail fast** - Tests should fail loudly when site changes
4. **No flaky tests** - Every test must be deterministic
5. **CI must pass** - Blocked deploys if tests fail

---

## Test Pyramid

```
         ╱╲
        ╱  ╲       E2E (5%)
       ╱────╲      - Full pipeline smoke test
      ╱      ╲     - Live scrape → API → DB
     ╱────────╲
    ╱          ╲   Integration (15%)
   ╱────────────╲  - Scraper → API contract
  ╱              ╲ - API → Database writes
 ╱────────────────╲
╱                  ╲ Unit (80%)
────────────────────  - Parser functions
                      - Data transformation
                      - Validation logic
```

**Target Coverage:**
- Python scraper: **90%+**
- TypeScript API: **85%+**
- Overall: **80%+**

---

## Python Scraper Tests

### Test Structure

```
scraper/
├── tests/
│   ├── fixtures/
│   │   ├── event_list_page.html
│   │   ├── event_detail_page.html
│   │   ├── fighter_profile_page.html
│   │   └── README.md (how fixtures were captured)
│   ├── unit/
│   │   ├── test_parsers.py
│   │   ├── test_items.py
│   │   ├── test_pipelines.py
│   │   └── test_utils.py
│   ├── integration/
│   │   ├── test_spider_flow.py
│   │   └── test_api_posting.py
│   └── conftest.py (pytest fixtures)
├── pytest.ini
└── requirements-dev.txt (test dependencies)
```

### 1. Unit Tests - Parser Functions

**File:** `tests/unit/test_parsers.py`

**What to test:**
- Event list parsing from fixtures
- Event detail page parsing
- Fighter profile parsing
- Edge cases (missing data, malformed HTML)

**Example:**

```python
import pytest
from bs4 import BeautifulSoup
from ufc_scraper.parsers import parse_event_list, parse_event_detail

class TestEventListParser:
    """Test parsing the main events list page"""

    @pytest.fixture
    def event_list_html(self):
        """Load fixture HTML"""
        with open('tests/fixtures/event_list_page.html') as f:
            return f.read()

    def test_parse_upcoming_events(self, event_list_html):
        """Should extract all upcoming events"""
        soup = BeautifulSoup(event_list_html, 'html.parser')
        events = parse_event_list(soup)

        assert len(events) > 0
        assert all('id' in e for e in events)
        assert all('name' in e for e in events)
        assert all('sourceUrl' in e for e in events)

    def test_event_ids_are_url_safe(self, event_list_html):
        """Event IDs should be URL-safe slugs"""
        soup = BeautifulSoup(event_list_html, 'html.parser')
        events = parse_event_list(soup)

        for event in events:
            assert event['id'].replace('-', '').replace('_', '').isalnum()
            assert ' ' not in event['id']

    def test_event_dates_are_valid(self, event_list_html):
        """Event dates should parse to valid datetime"""
        from datetime import datetime
        soup = BeautifulSoup(event_list_html, 'html.parser')
        events = parse_event_list(soup)

        for event in events:
            try:
                datetime.fromisoformat(event['date'])
            except ValueError:
                pytest.fail(f"Invalid date: {event['date']}")

class TestEventDetailParser:
    """Test parsing individual event detail pages"""

    @pytest.fixture
    def event_detail_html(self):
        with open('tests/fixtures/event_detail_page.html') as f:
            return f.read()

    def test_extract_fights(self, event_detail_html):
        """Should extract all fights from event"""
        soup = BeautifulSoup(event_detail_html, 'html.parser')
        fights = parse_event_detail(soup)

        assert len(fights) > 0
        assert all('id' in f for f in fights)
        assert all('fighter1Id' in f for f in fights)
        assert all('fighter2Id' in f for f in fights)

    def test_fight_ids_unique(self, event_detail_html):
        """Fight IDs should be unique within event"""
        soup = BeautifulSoup(event_detail_html, 'html.parser')
        fights = parse_event_detail(soup)

        fight_ids = [f['id'] for f in fights]
        assert len(fight_ids) == len(set(fight_ids))

    def test_handles_cancelled_fights(self):
        """Should handle fights marked as cancelled"""
        html = """
        <tr class="b-fight-details__table-row">
            <td>CANCELLED</td>
            <td><a href="/fighter/123">Fighter One</a></td>
            <td><a href="/fighter/456">Fighter Two</a></td>
        </tr>
        """
        soup = BeautifulSoup(html, 'html.parser')
        fights = parse_event_detail(soup)

        # Should either skip or mark as cancelled
        assert len(fights) == 0 or fights[0].get('cancelled') == True

class TestFighterParser:
    """Test parsing fighter profiles"""

    @pytest.fixture
    def fighter_html(self):
        with open('tests/fixtures/fighter_profile_page.html') as f:
            return f.read()

    def test_extract_fighter_data(self, fighter_html):
        """Should extract fighter name and record"""
        from ufc_scraper.parsers import parse_fighter_profile
        soup = BeautifulSoup(fighter_html, 'html.parser')
        fighter = parse_fighter_profile(soup)

        assert 'name' in fighter
        assert 'record' in fighter
        assert isinstance(fighter.get('wins'), int) or fighter.get('wins') is None

    def test_parse_record_string(self):
        """Should parse W-L-D record string"""
        from ufc_scraper.parsers import parse_record

        assert parse_record("27-1-0") == {'wins': 27, 'losses': 1, 'draws': 0}
        assert parse_record("15-10-2") == {'wins': 15, 'losses': 10, 'draws': 2}
        assert parse_record("5-0-0") == {'wins': 5, 'losses': 0, 'draws': 0}

    def test_parse_malformed_record(self):
        """Should handle malformed record strings gracefully"""
        from ufc_scraper.parsers import parse_record

        # Should return None or zeros, not crash
        result = parse_record("Unknown")
        assert result is None or result == {'wins': 0, 'losses': 0, 'draws': 0}
```

### 2. Unit Tests - Data Items

**File:** `tests/unit/test_items.py`

```python
import pytest
from ufc_scraper.items import EventItem, FightItem, FighterItem

class TestEventItem:
    """Test Event data item validation"""

    def test_valid_event(self):
        """Should accept valid event data"""
        event = EventItem(
            id="UFC-299",
            name="UFC 299: O'Malley vs. Vera 2",
            date="2024-03-09T00:00:00Z",
            sourceUrl="http://ufcstats.com/event-details/abc123"
        )
        assert event.id == "UFC-299"

    def test_rejects_invalid_date(self):
        """Should reject invalid date format"""
        with pytest.raises(ValueError):
            EventItem(
                id="UFC-299",
                name="UFC 299",
                date="not-a-date",
                sourceUrl="http://example.com"
            )

    def test_rejects_missing_required_fields(self):
        """Should reject events missing required fields"""
        with pytest.raises(ValueError):
            EventItem(
                id="UFC-299",
                # Missing name, date, sourceUrl
            )

class TestFightItem:
    """Test Fight data item validation"""

    def test_valid_fight(self):
        """Should accept valid fight data"""
        fight = FightItem(
            id="UFC-299-Fighter1-Fighter2",
            eventId="UFC-299",
            fighter1Id="Fighter1",
            fighter2Id="Fighter2",
            sourceUrl="http://ufcstats.com/fight/xyz"
        )
        assert fight.fighter1Id != fight.fighter2Id

    def test_rejects_same_fighter_twice(self):
        """Should reject fight with same fighter on both sides"""
        with pytest.raises(ValueError):
            FightItem(
                id="UFC-299-Fighter1-Fighter1",
                eventId="UFC-299",
                fighter1Id="Fighter1",
                fighter2Id="Fighter1",  # Same as fighter1Id
                sourceUrl="http://example.com"
            )
```

### 3. Integration Tests - Spider Flow

**File:** `tests/integration/test_spider_flow.py`

```python
import pytest
from scrapy.http import HtmlResponse, Request
from ufc_scraper.spiders.ufcstats import UFCStatsSpider

class TestSpiderFlow:
    """Test the spider's crawling logic"""

    @pytest.fixture
    def spider(self):
        return UFCStatsSpider()

    @pytest.fixture
    def mock_event_list_response(self):
        """Mock response for event list page"""
        with open('tests/fixtures/event_list_page.html') as f:
            html = f.read()

        request = Request(url='http://ufcstats.com/statistics/events/completed')
        return HtmlResponse(
            url='http://ufcstats.com/statistics/events/completed',
            request=request,
            body=html.encode('utf-8')
        )

    def test_spider_generates_event_requests(self, spider, mock_event_list_response):
        """Should generate requests for each event detail page"""
        results = list(spider.parse(mock_event_list_response))

        # Should yield Request objects
        requests = [r for r in results if isinstance(r, Request)]
        assert len(requests) > 0

        # All should point to event detail pages
        for req in requests:
            assert 'event-details' in req.url or 'fight' in req.url

    def test_spider_extracts_items(self, spider):
        """Should extract EventItem, FightItem, FighterItem"""
        with open('tests/fixtures/event_detail_page.html') as f:
            html = f.read()

        request = Request(url='http://ufcstats.com/event-details/test')
        response = HtmlResponse(
            url='http://ufcstats.com/event-details/test',
            request=request,
            body=html.encode('utf-8')
        )

        results = list(spider.parse_event(response))

        # Should extract items
        from ufc_scraper.items import EventItem, FightItem, FighterItem
        events = [r for r in results if isinstance(r, EventItem)]
        fights = [r for r in results if isinstance(r, FightItem)]

        assert len(events) > 0
        assert len(fights) > 0
```

### 4. Integration Tests - API Posting

**File:** `tests/integration/test_api_posting.py`

```python
import pytest
import responses
from ufc_scraper.pipelines import APIIngestionPipeline

class TestAPIPosting:
    """Test posting scraped data to the ingestion API"""

    @pytest.fixture
    def pipeline(self):
        return APIIngestionPipeline(
            api_url='http://localhost:3000/api/internal/ingest',
            api_secret='test-secret-123'
        )

    @responses.activate
    def test_successful_post(self, pipeline):
        """Should successfully post data to API"""
        # Mock the API endpoint
        responses.add(
            responses.POST,
            'http://localhost:3000/api/internal/ingest',
            json={'success': True, 'eventsCreated': 5},
            status=200
        )

        data = {
            'events': [{'id': 'UFC-299', 'name': 'Test Event'}],
            'fights': [],
            'fighters': []
        }

        result = pipeline.post_to_api(data)
        assert result['success'] == True

        # Verify auth header was sent
        assert len(responses.calls) == 1
        assert responses.calls[0].request.headers['Authorization'] == 'Bearer test-secret-123'

    @responses.activate
    def test_handles_api_error(self, pipeline):
        """Should raise exception on API error"""
        responses.add(
            responses.POST,
            'http://localhost:3000/api/internal/ingest',
            json={'error': 'Validation failed'},
            status=400
        )

        data = {'events': [], 'fights': [], 'fighters': []}

        with pytest.raises(Exception):
            pipeline.post_to_api(data)

    @responses.activate
    def test_retries_on_network_error(self, pipeline):
        """Should retry on network errors"""
        # First call fails, second succeeds
        responses.add(
            responses.POST,
            'http://localhost:3000/api/internal/ingest',
            body=Exception('Network error')
        )
        responses.add(
            responses.POST,
            'http://localhost:3000/api/internal/ingest',
            json={'success': True},
            status=200
        )

        data = {'events': [], 'fights': [], 'fighters': []}
        result = pipeline.post_to_api(data)

        assert result['success'] == True
        assert len(responses.calls) == 2  # Retried once
```

### 5. Test Configuration

**File:** `scraper/pytest.ini`

```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*

# Show summary of failures
addopts =
    -v
    --tb=short
    --strict-markers
    --cov=ufc_scraper
    --cov-report=html
    --cov-report=term-missing
    --cov-fail-under=90

markers =
    unit: Unit tests (fast, no network)
    integration: Integration tests (may use network)
    slow: Slow-running tests
    fixture: Tests that generate/update fixtures
```

**File:** `scraper/requirements-dev.txt`

```
# Testing
pytest==7.4.3
pytest-cov==4.1.0
pytest-mock==3.12.0
responses==0.24.1  # HTTP mocking

# Code quality
black==23.12.1
flake8==6.1.0
mypy==1.7.1

# Scrapy
scrapy==2.11.0
beautifulsoup4==4.12.2
```

---

## TypeScript API Tests

### Test Structure

```
src/
├── app/
│   └── api/
│       └── internal/
│           └── ingest/
│               ├── route.ts
│               └── route.test.ts
├── lib/
│   └── scraper/
│       ├── validation.ts
│       └── validation.test.ts
└── __tests__/
    ├── fixtures/
    │   └── scraper-payload.json
    └── integration/
        └── ingest-api.test.ts
```

### 1. Unit Tests - Validation Logic

**File:** `src/lib/scraper/validation.test.ts`

```typescript
import { describe, test, expect } from 'vitest'
import { ScrapedDataSchema, validateScrapedData } from './validation'

describe('ScrapedDataSchema', () => {
  test('accepts valid scraped data', () => {
    const validData = {
      events: [{
        id: 'UFC-299',
        name: 'UFC 299',
        date: '2024-03-09T00:00:00Z',
        sourceUrl: 'http://ufcstats.com/event-details/abc'
      }],
      fights: [{
        id: 'UFC-299-Fighter1-Fighter2',
        eventId: 'UFC-299',
        fighter1Id: 'Fighter1',
        fighter2Id: 'Fighter2',
        sourceUrl: 'http://ufcstats.com/fight/xyz'
      }],
      fighters: [{
        id: 'Fighter1',
        name: 'John Doe',
        sourceUrl: 'http://ufcstats.com/fighter/123'
      }]
    }

    expect(() => ScrapedDataSchema.parse(validData)).not.toThrow()
  })

  test('rejects invalid event date', () => {
    const invalidData = {
      events: [{
        id: 'UFC-299',
        name: 'UFC 299',
        date: 'not-a-date',
        sourceUrl: 'http://example.com'
      }],
      fights: [],
      fighters: []
    }

    expect(() => ScrapedDataSchema.parse(invalidData)).toThrow()
  })

  test('rejects missing required fields', () => {
    const invalidData = {
      events: [{
        id: 'UFC-299',
        // Missing name, date, sourceUrl
      }],
      fights: [],
      fighters: []
    }

    expect(() => ScrapedDataSchema.parse(invalidData)).toThrow()
  })

  test('rejects fight with same fighter twice', () => {
    const invalidData = {
      events: [],
      fights: [{
        id: 'UFC-299-Fighter1-Fighter1',
        eventId: 'UFC-299',
        fighter1Id: 'Fighter1',
        fighter2Id: 'Fighter1',  // Same fighter
        sourceUrl: 'http://example.com'
      }],
      fighters: []
    }

    expect(() => ScrapedDataSchema.parse(invalidData)).toThrow()
  })
})

describe('validateScrapedData', () => {
  test('returns errors for invalid data', () => {
    const invalidData = { events: 'not-an-array' }
    const errors = validateScrapedData(invalidData)

    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('events')
  })

  test('returns empty array for valid data', () => {
    const validData = {
      events: [],
      fights: [],
      fighters: []
    }
    const errors = validateScrapedData(validData)

    expect(errors).toEqual([])
  })
})
```

### 2. Integration Tests - API Route

**File:** `src/app/api/internal/ingest/route.test.ts`

```typescript
import { describe, test, expect, beforeEach, vi } from 'vitest'
import { POST } from './route'
import { prisma } from '@/lib/database/prisma'

// Mock Prisma
vi.mock('@/lib/database/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    event: {
      upsert: vi.fn()
    },
    fighter: {
      upsert: vi.fn()
    },
    fight: {
      upsert: vi.fn()
    },
    scrapeLog: {
      create: vi.fn()
    }
  }
}))

describe('POST /api/internal/ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns 401 without auth header', async () => {
    const request = new Request('http://localhost:3000/api/internal/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [], fights: [], fighters: [] })
    })

    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  test('returns 401 with wrong secret', async () => {
    const request = new Request('http://localhost:3000/api/internal/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong-secret'
      },
      body: JSON.stringify({ events: [], fights: [], fighters: [] })
    })

    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  test('returns 400 for invalid payload', async () => {
    const request = new Request('http://localhost:3000/api/internal/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INGEST_API_SECRET}`
      },
      body: JSON.stringify({ events: 'not-an-array' })
    })

    const response = await POST(request)
    expect(response.status).toBe(400)

    const data = await response.json()
    expect(data.errors).toBeDefined()
  })

  test('successfully ingests valid data', async () => {
    const validPayload = {
      events: [{
        id: 'UFC-299',
        name: 'UFC 299',
        date: '2024-03-09T00:00:00Z',
        sourceUrl: 'http://ufcstats.com/event/123'
      }],
      fights: [],
      fighters: []
    }

    // Mock successful transaction
    vi.mocked(prisma.$transaction).mockResolvedValue({})

    const request = new Request('http://localhost:3000/api/internal/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INGEST_API_SECRET}`
      },
      body: JSON.stringify(validPayload)
    })

    const response = await POST(request)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.success).toBe(true)
    expect(data.eventsCreated).toBe(1)
  })

  test('creates ScrapeLog entry', async () => {
    const payload = {
      events: [],
      fights: [],
      fighters: []
    }

    vi.mocked(prisma.$transaction).mockResolvedValue({})

    const request = new Request('http://localhost:3000/api/internal/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INGEST_API_SECRET}`
      },
      body: JSON.stringify(payload)
    })

    await POST(request)

    expect(prisma.scrapeLog.create).toHaveBeenCalled()
  })
})
```

### 3. Test Configuration

**File:** `vitest.config.ts` (update existing)

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'archive/**',
        '.next/**',
        'out/**',
        '**/*.config.ts',
        '**/*.d.ts'
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
```

---

## Integration Tests

### Full Pipeline Test

**File:** `tests/integration/full_pipeline.test.ts`

```typescript
import { describe, test, expect } from 'vitest'
import { spawn } from 'child_process'
import { prisma } from '@/lib/database/prisma'

describe('Full Scraper Pipeline', () => {
  test('scraper → API → database flow', async () => {
    // 1. Run scraper (limited to 1 event)
    const scraperProcess = spawn('python', [
      '-m', 'scrapy', 'crawl', 'ufcstats',
      '-s', 'CLOSESPIDER_ITEMCOUNT=1'
    ], {
      cwd: './scraper',
      env: {
        ...process.env,
        INGEST_API_URL: 'http://localhost:3000/api/internal/ingest',
        INGEST_API_SECRET: process.env.INGEST_API_SECRET
      }
    })

    // Wait for scraper to complete
    await new Promise((resolve, reject) => {
      scraperProcess.on('exit', (code) => {
        if (code === 0) resolve(true)
        else reject(new Error(`Scraper failed with code ${code}`))
      })
    })

    // 2. Verify data in database
    const events = await prisma.event.findMany({
      take: 1,
      orderBy: { lastScrapedAt: 'desc' }
    })

    expect(events.length).toBeGreaterThan(0)
    expect(events[0].sourceUrl).toContain('ufcstats.com')

    // 3. Verify ScrapeLog was created
    const latestLog = await prisma.scrapeLog.findFirst({
      orderBy: { startTime: 'desc' }
    })

    expect(latestLog).toBeDefined()
    expect(latestLog?.status).toBe('SUCCESS')
  }, 60000) // 60 second timeout
})
```

---

## E2E Tests

### Smoke Test

**File:** `tests/e2e/smoke.test.ts`

```typescript
import { describe, test, expect } from 'vitest'
import axios from 'axios'

describe('E2E Smoke Tests', () => {
  const API_URL = process.env.API_URL || 'http://localhost:3000'

  test('scraper can reach UFCStats.com', async () => {
    const response = await axios.get('http://ufcstats.com/statistics/events/completed')
    expect(response.status).toBe(200)
    expect(response.data).toContain('Event Name')
  })

  test('API is reachable', async () => {
    const response = await axios.get(`${API_URL}/api/health`)
    expect(response.status).toBe(200)
  })

  test('database is connected', async () => {
    const response = await axios.get(`${API_URL}/api/health`)
    const data = response.data
    expect(data.database).toBe('connected')
  })
})
```

---

## Test Fixtures & Data

### Creating Fixtures

**File:** `scraper/tests/fixtures/README.md`

```markdown
# Test Fixtures

## How to Update Fixtures

When UFCStats.com structure changes and tests start failing:

1. **Capture new HTML:**
   ```bash
   curl -A "Mozilla/5.0" http://ufcstats.com/statistics/events/completed > event_list_page.html
   curl -A "Mozilla/5.0" http://ufcstats.com/event-details/abc123 > event_detail_page.html
   ```

2. **Anonymize data (optional):**
   - Replace real fighter names with generic ones
   - Keep HTML structure intact

3. **Run tests:**
   ```bash
   pytest tests/unit/test_parsers.py
   ```

4. **Update parsers if needed:**
   - Fix CSS selectors in `ufc_scraper/parsers.py`
   - Ensure tests pass

## Fixture Files

- `event_list_page.html` - Main events list (captured 2025-01-01)
- `event_detail_page.html` - Single event details (captured 2025-01-01)
- `fighter_profile_page.html` - Fighter profile (captured 2025-01-01)

## Fixture Update Schedule

- **Monthly:** Check if structure has changed
- **On test failures:** Immediate update and investigation
```

### Sample Fixture Generator

**File:** `scraper/scripts/update_fixtures.py`

```python
#!/usr/bin/env python3
"""
Update test fixtures from live UFCStats.com pages.

Usage:
    python scripts/update_fixtures.py
"""

import requests
from pathlib import Path

FIXTURES_DIR = Path(__file__).parent.parent / 'tests' / 'fixtures'
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

def fetch_page(url, filename):
    """Fetch page and save to fixtures"""
    print(f"Fetching {url}...")
    response = requests.get(url, headers={'User-Agent': USER_AGENT})
    response.raise_for_status()

    output_path = FIXTURES_DIR / filename
    output_path.write_text(response.text)
    print(f"Saved to {output_path}")

def main():
    # Event list page
    fetch_page(
        'http://ufcstats.com/statistics/events/completed',
        'event_list_page.html'
    )

    # Event detail page (use a stable historical event)
    fetch_page(
        'http://ufcstats.com/event-details/some-stable-event',
        'event_detail_page.html'
    )

    # Fighter profile (use a retired fighter for stability)
    fetch_page(
        'http://ufcstats.com/fighter-details/some-retired-fighter',
        'fighter_profile_page.html'
    )

    print("\nFixtures updated! Run tests to verify:")
    print("  pytest tests/unit/test_parsers.py")

if __name__ == '__main__':
    main()
```

---

## CI/CD Integration

### GitHub Actions Workflow

**File:** `.github/workflows/test.yml`

```yaml
name: Tests

on:
  pull_request:
  push:
    branches: [main, develop]

jobs:
  python-tests:
    name: Python Scraper Tests
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Install dependencies
        working-directory: ./scraper
        run: |
          pip install -r requirements.txt
          pip install -r requirements-dev.txt

      - name: Run pytest
        working-directory: ./scraper
        run: |
          pytest --cov --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./scraper/coverage.xml
          flags: python

  typescript-tests:
    name: TypeScript API Tests
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run Vitest
        run: npm run test:coverage
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
          INGEST_API_SECRET: test-secret-for-ci

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
          flags: typescript

  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          npm ci
          cd scraper && pip install -r requirements.txt

      - name: Setup database
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db

      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
          INGEST_API_SECRET: test-secret-for-ci
```

### Pre-commit Hook

**File:** `.github/hooks/pre-commit`

```bash
#!/bin/bash
# Run tests before commit

echo "Running Python tests..."
cd scraper && pytest tests/unit/ -q || exit 1

echo "Running TypeScript tests..."
cd .. && npm run test:unit || exit 1

echo "All tests passed!"
```

---

## Monitoring & Alerts

### Test Failure Notifications

**File:** `.github/workflows/notify-on-failure.yml`

```yaml
name: Notify on Test Failure

on:
  workflow_run:
    workflows: ["Tests"]
    types: [completed]

jobs:
  notify:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'failure' }}

    steps:
      - name: Send Slack notification
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "🚨 Tests failed on ${{ github.repository }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Tests Failed*\n\nBranch: `${{ github.ref }}`\nCommit: `${{ github.sha }}`\n\n<${{ github.event.workflow_run.html_url }}|View Workflow>"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### Coverage Tracking

**CodeCov Configuration:**

**File:** `codecov.yml`

```yaml
coverage:
  status:
    project:
      default:
        target: 85%
        threshold: 2%
    patch:
      default:
        target: 90%

comment:
  require_changes: true
  layout: "diff, files"
  behavior: default

ignore:
  - "archive/**"
  - "**/*.test.ts"
  - "**/*.config.ts"
```

---

## Testing Checklist

### Before Every PR
- [ ] All unit tests pass
- [ ] Coverage meets thresholds (Python 90%, TypeScript 85%)
- [ ] Integration tests pass
- [ ] No linter errors

### Before Production Deploy
- [ ] All CI tests pass
- [ ] Manual smoke test completed
- [ ] Fixtures are up-to-date
- [ ] ScrapeLog monitoring dashboard checked

### Monthly Maintenance
- [ ] Update test fixtures
- [ ] Review and update test coverage
- [ ] Check for deprecated dependencies
- [ ] Review failed test trends

---

## Next Steps

1. **Set up Python testing environment**
   ```bash
   cd scraper
   pip install -r requirements-dev.txt
   ```

2. **Create initial test fixtures**
   ```bash
   python scripts/update_fixtures.py
   ```

3. **Write first parser test**
   ```bash
   pytest tests/unit/test_parsers.py -v
   ```

4. **Set up CI workflow**
   - Add `.github/workflows/test.yml`
   - Configure secrets

5. **Enforce coverage thresholds**
   - Python: 90%+
   - TypeScript: 85%+

Would you like me to start implementing any of these test suites?
