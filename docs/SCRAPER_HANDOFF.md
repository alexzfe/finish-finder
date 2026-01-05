# UFC Scraper Redesign - Engineering Handoff

**Date:** 2025-01-01
**Project:** Finish Finder - UFC Data Scraper Rebuild
**Status:** Planning Complete, Ready for Implementation
**Priority:** High
**Estimated Effort:** 2-3 weeks for full implementation

---

## 🎯 Executive Summary

We're **rebuilding the UFC scraper from scratch** using Python/Scrapy instead of the failed TypeScript implementation. The old multi-source scraper (Wikipedia/Tapology/Sherdog) has been archived after proving unreliable.

**Key Decision:** Single source (UFCStats.com) + battle-tested framework (Scrapy) = reliability.

**What's Done:**
- ✅ Comprehensive architecture planned (with Gemini AI consultation)
- ✅ Complete testing strategy defined
- ✅ Old scraper archived safely
- ✅ Database schema enhancements designed

**What's Next:**
- ⏳ Implement Python scraper (Phase 1-3)
- ⏳ Create Next.js ingestion API
- ⏳ Set up test suites
- ⏳ Deploy to production

**Estimated Cost:** $0/month (runs on free tiers)

---

## 📖 Quick Start Guide

### 1. Read These Documents First (30 min)

**Read in this order:**

1. **This document** (`SCRAPER_HANDOFF.md`) - You are here
2. **`NEW_SCRAPER_ARCHITECTURE.md`** (594 lines) - Complete architectural plan
3. **`SCRAPER_TESTING_STRATEGY.md`** (1,224 lines) - Test specifications
4. **`Building a comprehensive.md`** (reference) - UFCStats.com scraping guide

### 2. Understand the Context (15 min)

**Why are we rebuilding?**

The previous TypeScript implementation failed because:
- ❌ Multi-source complexity (Wikipedia/Tapology/Sherdog)
- ❌ Complex deduplication logic
- ❌ Aggressive anti-bot measures from Tapology/Sherdog
- ❌ Constant maintenance burden (3 scrapers to fix)
- ❌ No comprehensive testing

**What's different this time?**

- ✅ Single reliable source (UFCStats.com)
- ✅ Industry-standard framework (Python/Scrapy)
- ✅ Comprehensive test coverage (90%+ Python, 85%+ TypeScript)
- ✅ Decoupled architecture (scraper → API → database)
- ✅ Clear monitoring and alerts

### 3. Review the Architecture (20 min)

**Data Flow:**
```
┌─────────────────────┐
│ GitHub Actions Cron │  Daily at 8:00 UTC
│  (Orchestrator)     │
└──────────┬──────────┘
           │ triggers
           ▼
┌─────────────────────┐
│ Python Scraper      │  Fetch & parse UFCStats.com
│ (Scrapy framework)  │  Output JSON
└──────────┬──────────┘
           │ POST with secret
           ▼
┌─────────────────────┐
│ Next.js API         │  Authenticate & validate
│ /api/internal/      │  Upsert via Prisma
│      ingest         │  Create ScrapeLog
└──────────┬──────────┘
           │ Prisma queries
           ▼
┌─────────────────────┐
│ PostgreSQL          │  Events, Fights, Fighters
│ (Supabase)          │
└─────────────────────┘
```

**Key Principle:** The scraper is **completely decoupled** from the Next.js app. It just POSTs JSON to an API endpoint.

### 4. Set Up Your Environment (30 min)

```bash
# 1. Clone and navigate
git clone <repo-url>
cd finish-finder

# 2. Check what's been archived
ls -la archive/scrapers-old-2025-01/
ls -la archive/docs-old-2025-01/

# 3. Install Node dependencies (for Next.js API)
npm install

# 4. Set up Python environment (for scraper)
cd scraper  # This directory doesn't exist yet - you'll create it
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install scrapy beautifulsoup4 requests

# 5. Set up environment variables
cp .env.example .env.local
# Edit .env.local and add:
#   DATABASE_URL=<your-postgres-url>
#   INGEST_API_SECRET=<generate-a-secret>
#   OPENAI_API_KEY=<for-predictions>

# 6. Set up database
npx prisma migrate deploy
```

---

## 🗺️ Implementation Roadmap

### Phase 1: Foundation & MVP (3-5 days)

**Goal:** Scrape one UFCStats.com event page and successfully ingest it.

#### Tasks:

**1. Set up Python/Scrapy project** (Day 1)
```bash
# Create scraper directory
mkdir scraper
cd scraper

# Initialize Scrapy project
scrapy startproject ufc_scraper .

# Create requirements files
cat > requirements.txt << EOF
scrapy==2.11.0
beautifulsoup4==4.12.2
requests==2.31.0
pydantic==2.5.0
EOF

cat > requirements-dev.txt << EOF
pytest==7.4.3
pytest-cov==4.1.0
pytest-mock==3.12.0
responses==0.24.1
black==23.12.1
flake8==6.1.0
EOF

pip install -r requirements.txt
pip install -r requirements-dev.txt
```

**2. Implement Prisma schema changes** (Day 1)
```bash
# Add to prisma/schema.prisma:
# - ScrapeLog model
# - sourceUrl, contentHash, lastScrapedAt fields to Event/Fighter/Fight
# See NEW_SCRAPER_ARCHITECTURE.md section 4 for full schema

npx prisma migrate dev --name add_scraper_fields
```

**3. Create Next.js Ingestion API** (Day 2)
```bash
# Create file: src/app/api/internal/ingest/route.ts
# Implement:
# - Bearer token authentication
# - Zod schema validation
# - Prisma upsert logic
# - ScrapeLog creation
# See SCRAPER_TESTING_STRATEGY.md for API test examples
```

**4. Write basic Scrapy spider** (Day 3)
```bash
# Create file: scraper/ufc_scraper/spiders/ufcstats.py
# Implement:
# - Start with one hardcoded event URL
# - Parse HTML tables using BeautifulSoup
# - Extract events, fights, fighters
# - Output structured JSON
```

**5. Implement upsert logic in API** (Day 3-4)
```typescript
// In route.ts
// - Compute contentHash for each item
// - Compare with existing hash in DB
// - Skip update if unchanged
// - Wrap all operations in prisma.$transaction()
```

**6. Write unit tests** (Day 4-5)
```bash
# Create test fixtures
curl -A "Mozilla/5.0" http://ufcstats.com/event-details/xyz > tests/fixtures/event_detail_page.html

# Write parser tests
# See SCRAPER_TESTING_STRATEGY.md section "Python Scraper Tests"

pytest tests/unit/test_parsers.py -v
```

**✅ Phase 1 Deliverables:**
- [ ] Scrapy project structure created
- [ ] Prisma schema updated and migrated
- [ ] Ingestion API endpoint working
- [ ] Basic spider scrapes 1 event successfully
- [ ] Data appears in database
- [ ] Unit tests pass (>90% coverage)

---

### Phase 2: Full Scraping & Data Integrity (5-8 days)

**Goal:** Scrape all UFCStats.com events with efficient change detection.

#### Tasks:

**1. Enhance spider to crawl event list** (Day 1-2)
```python
# In ufcstats.py spider
# Start URL: http://ufcstats.com/statistics/events/completed
# Extract all event links
# Follow pagination if needed
# Yield Request for each event detail page
```

**2. Implement content hash change detection** (Day 2-3)
```typescript
// In API route.ts
import crypto from 'crypto'

function calculateContentHash(data: any): string {
  const content = JSON.stringify(data, Object.keys(data).sort())
  return crypto.createHash('sha256').update(content).digest('hex')
}

// Compare with event.contentHash in database
// Skip UPDATE if hashes match
```

**3. Add ScrapeLog creation** (Day 3)
```typescript
// In API route.ts
const scrapeLog = await prisma.scrapeLog.create({
  data: {
    startTime: new Date(),
    endTime: new Date(),
    status: 'SUCCESS',
    eventsFound: events.length,
    fightsAdded: newFights,
    fightsUpdated: updatedFights
  }
})
```

**4. Handle edge cases** (Day 4-5)
```python
# In parser functions
# - Cancelled fights (skip or mark as cancelled)
# - Draw/No Contest outcomes
# - Missing fighter data (graceful degradation)
# - Multiple weight classes
# - Title fight detection
```

**5. Integration testing** (Day 6-7)
```bash
# Full end-to-end test
# 1. Run scraper against staging
# 2. Verify data in staging database
# 3. Check ScrapeLog entries
# 4. Validate data quality

pytest tests/integration/ -v
npm run test:integration
```

**6. Data validation scripts** (Day 7-8)
```sql
-- Check for orphaned fights (eventId doesn't exist)
SELECT * FROM "Fight" f
WHERE NOT EXISTS (SELECT 1 FROM "Event" e WHERE e.id = f."eventId");

-- Check for duplicate events
SELECT "sourceUrl", COUNT(*)
FROM "Event"
GROUP BY "sourceUrl"
HAVING COUNT(*) > 1;

-- Check for null required fields
SELECT * FROM "Fighter" WHERE name IS NULL OR "sourceUrl" IS NULL;
```

**✅ Phase 2 Deliverables:**
- [ ] Spider crawls entire event list
- [ ] Content hash change detection working
- [ ] ScrapeLog populated correctly
- [ ] All edge cases handled gracefully
- [ ] Staging database fully populated
- [ ] Data validation passes
- [ ] Integration tests pass

---

### Phase 3: Productionization & Automation (2-3 days)

**Goal:** Automated, reliable scraper running in production.

#### Tasks:

**1. Create GitHub Actions workflow** (Day 1)

**File:** `.github/workflows/scrape.yml`
```yaml
name: Daily UFC Scraper

on:
  schedule:
    - cron: '0 8 * * *'  # Daily at 8:00 UTC
  workflow_dispatch:      # Allow manual trigger

jobs:
  scrape:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        working-directory: ./scraper
        run: |
          pip install -r requirements.txt

      - name: Run scraper
        working-directory: ./scraper
        env:
          INGEST_API_URL: ${{ secrets.INGEST_API_URL }}
          INGEST_API_SECRET: ${{ secrets.INGEST_API_SECRET }}
        run: |
          scrapy crawl ufcstats

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
          payload: |
            {
              "text": "🚨 UFC Scraper failed - check logs"
            }
```

**2. Configure secrets** (Day 1)
```bash
# In GitHub repo settings → Secrets
gh secret set INGEST_API_URL --body "https://your-app.vercel.app/api/internal/ingest"
gh secret set INGEST_API_SECRET --body "<generate-strong-secret>"
gh secret set SLACK_WEBHOOK_URL --body "https://hooks.slack.com/..."
```

**3. Write operational documentation** (Day 2)
```markdown
# Create docs/SCRAPER_OPERATIONS.md
- How to run scraper manually
- How to read logs
- How to debug failures
- How to update fixtures
- Emergency procedures
```

**4. Rollout plan** (Day 2-3)

**Staging Deploy:**
```bash
# 1. Deploy schema changes
npx prisma migrate deploy

# 2. Deploy API changes (Vercel preview)
git checkout -b scraper-v2
git push origin scraper-v2
# Vercel automatically creates preview deployment

# 3. Run scraper manually against staging
cd scraper
INGEST_API_URL=https://preview-xyz.vercel.app/api/internal/ingest \
INGEST_API_SECRET=<staging-secret> \
scrapy crawl ufcstats

# 4. Verify data in staging database
psql $STAGING_DATABASE_URL -c "SELECT COUNT(*) FROM \"Event\";"
psql $STAGING_DATABASE_URL -c "SELECT * FROM \"ScrapeLog\" ORDER BY \"startTime\" DESC LIMIT 5;"
```

**Production Deploy:**
```bash
# 1. Merge to main
git checkout main
git merge scraper-v2
git push origin main

# 2. Vercel deploys automatically

# 3. Run ONE manual scrape to production
cd scraper
INGEST_API_URL=https://finish-finder.vercel.app/api/internal/ingest \
INGEST_API_SECRET=<prod-secret> \
scrapy crawl ufcstats

# 4. Verify in production database
# 5. Check UI shows data correctly

# 6. Enable cron job
# Uncomment schedule in .github/workflows/scrape.yml
git commit -m "Enable automated scraper"
git push

# 7. Monitor first 3 cron runs
gh run list --workflow=scrape.yml --limit=5
gh run watch <run-id>
```

**✅ Phase 3 Deliverables:**
- [ ] GitHub Actions workflow created
- [ ] Secrets configured
- [ ] Documentation complete
- [ ] Staging deploy successful
- [ ] Production deploy successful
- [ ] Cron job enabled and running
- [ ] Monitoring dashboard set up

---

## 🧪 Testing Requirements

### Before Each PR

**Run these commands:**
```bash
# Python tests
cd scraper
pytest --cov --cov-report=term-missing
black ufc_scraper/ tests/
flake8 ufc_scraper/

# TypeScript tests
cd ..
npm run test:coverage
npm run lint
npx tsc --noEmit
```

**Coverage Thresholds:**
- Python: **90%+** (CI blocks merge below this)
- TypeScript: **85%+** (CI blocks merge below this)

### Test Checklist

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Coverage meets thresholds
- [ ] No linter errors
- [ ] Manual smoke test completed

---

## 📊 Monitoring & Debugging

### Check Scraper Health

**1. View ScrapeLog table:**
```sql
SELECT
  "startTime",
  "endTime",
  "status",
  "eventsFound",
  "fightsAdded",
  "errorMessage"
FROM "ScrapeLog"
ORDER BY "startTime" DESC
LIMIT 10;
```

**2. Check GitHub Actions:**
```bash
gh run list --workflow=scrape.yml
gh run view <run-id> --log
```

**3. Check API health:**
```bash
curl https://finish-finder.vercel.app/api/health
```

### Common Issues & Solutions

**Issue: "eventsFound = 0"**
```
Problem: Site structure changed
Solution:
  1. Update fixtures: python scripts/update_fixtures.py
  2. Run tests: pytest tests/unit/test_parsers.py
  3. Fix CSS selectors in ufc_scraper/parsers.py
  4. Re-deploy
```

**Issue: "API returns 401 Unauthorized"**
```
Problem: INGEST_API_SECRET mismatch
Solution:
  1. Check GitHub secrets: gh secret list
  2. Verify .env.local has correct secret
  3. Rotate secret if compromised
```

**Issue: "High parsing errors"**
```
Problem: HTML structure changed
Solution:
  1. Check latest fixture vs live site
  2. Update parsers
  3. Add regression tests
```

**Issue: "Duplicate events in database"**
```
Problem: ID generation logic changed
Solution:
  1. Review event ID generation in spider
  2. Check for sourceUrl uniqueness
  3. Run deduplication script
```

---

## 🔑 Critical Files Reference

### Documentation (Read First)
```
docs/
├── SCRAPER_HANDOFF.md           ⭐ This document
├── NEW_SCRAPER_ARCHITECTURE.md  ⭐ Complete architecture (594 lines)
├── SCRAPER_TESTING_STRATEGY.md  ⭐ Test specifications (1,224 lines)
└── Building a comprehensive.md   📚 Research guide (reference)
```

### Code to Write
```
scraper/                          🆕 Create this directory
├── ufc_scraper/
│   ├── spiders/
│   │   └── ufcstats.py          ⭐ Main spider
│   ├── items.py                  Data models
│   ├── pipelines.py              API posting logic
│   ├── parsers.py                HTML parsing functions
│   └── settings.py               Rate limits, headers
├── tests/
│   ├── fixtures/                 Real HTML from UFCStats
│   ├── unit/
│   │   └── test_parsers.py      ⭐ Parser tests
│   └── integration/
│       └── test_api_posting.py   API tests
├── scripts/
│   └── update_fixtures.py        Update test fixtures
├── requirements.txt
└── pytest.ini

src/app/api/internal/ingest/
├── route.ts                      ⭐ Ingestion API endpoint
└── route.test.ts                 ⭐ API tests

.github/workflows/
├── scrape.yml                    ⭐ Scraper automation
└── test.yml                      ⭐ CI test pipeline
```

### Archived (Don't Modify)
```
archive/
├── scrapers-old-2025-01/         Old TypeScript scrapers
│   ├── wikipediaService.ts
│   ├── tapologyService.ts
│   └── requestPolicy.ts
└── docs-old-2025-01/             Old documentation
    ├── scrapers-CONTEXT.md
    └── TAPOLOGY_SCRAPER_PLAN.md
```

---

## 💡 Key Decisions & Rationale

### Why Python instead of TypeScript?

**TL;DR:** We chose the right tool for the job.

The previous TypeScript implementation failed because scraping requires a **framework**, not just libraries. Scrapy provides:
- Built-in retry logic with exponential backoff
- Automatic request throttling (AUTOTHROTTLE)
- Middleware system for headers and proxies
- Data pipelines for validation
- Session management
- Pause/resume for long jobs

Building all of this in TypeScript would take weeks and likely introduce bugs. **Scrapy gives us this for free.**

### Why single source instead of multi-source?

**TL;DR:** Complexity killed the old implementation.

Multi-source scraping requires:
1. Different parsers for each site
2. Complex deduplication logic (event name variations)
3. Handling different update schedules
4. 3x the maintenance burden

**UFCStats.com alone provides everything we need:**
- Official UFC statistics partner
- Comprehensive data back to UFC 1
- Simple HTML structure
- Minimal anti-bot measures
- Proven community success

### Why decoupled architecture?

**TL;DR:** Separation of concerns.

The scraper and Next.js app have **completely different lifecycles**:
- Scraper: Runs once daily, can be slow, needs retries
- API: Must respond in <500ms, handles concurrent requests

**Decoupling via API allows:**
- Independent deployments
- Different error handling strategies
- Easy scraper swaps (could switch to API source later)
- Clear data contracts (Zod validation)
- Transaction safety in one place (API)

### Why content hash change detection?

**TL;DR:** Save database writes and track changes.

Without hashing:
- Every scrape → UPDATE all records (even unchanged)
- No audit trail of what changed
- Wasted database resources

With hashing:
- Compare hash → skip UPDATE if unchanged
- Clear history of modifications
- Reduced database load
- Know exactly when data changed

---

## 🚨 Important Notes

### Security

1. **Never commit secrets:**
   ```bash
   # ❌ DON'T
   const secret = 'my-secret-key'

   # ✅ DO
   const secret = process.env.INGEST_API_SECRET
   ```

2. **Rotate secrets quarterly:**
   ```bash
   # Generate new secret
   openssl rand -hex 32

   # Update in GitHub secrets and Vercel
   gh secret set INGEST_API_SECRET --body "<new-secret>"
   ```

3. **API endpoint is internal only:**
   - Never expose `/api/internal/ingest` publicly
   - Always require bearer token auth
   - Rate limit if needed

### Rate Limiting

UFCStats.com is **not aggressively protected**, but be respectful:

```python
# In settings.py
DOWNLOAD_DELAY = 3  # Wait 3 seconds between requests
CONCURRENT_REQUESTS_PER_DOMAIN = 1  # One at a time
ROBOTSTXT_OBEY = True  # Respect robots.txt
```

**If you get blocked:**
1. Increase DOWNLOAD_DELAY to 5-7 seconds
2. Check robots.txt hasn't changed
3. Verify site structure is same

### Data Quality

**Always validate:**
- Event IDs are unique
- Fighter IDs match between fights and fighters
- Dates are in future (for upcoming events)
- No orphaned records
- sourceUrl is always populated

**Run these checks weekly:**
```sql
-- Orphaned fights
SELECT COUNT(*) FROM "Fight" f
WHERE NOT EXISTS (SELECT 1 FROM "Event" e WHERE e.id = f."eventId");

-- Should be 0

-- Events missing fights
SELECT e.id, e.name
FROM "Event" e
LEFT JOIN "Fight" f ON f."eventId" = e.id
WHERE f.id IS NULL AND e.completed = false;

-- Should be empty for completed events
```

---

## 📞 Support & Questions

### Get Help

**Documentation:**
1. Read `NEW_SCRAPER_ARCHITECTURE.md` (594 lines of detailed architecture)
2. Read `SCRAPER_TESTING_STRATEGY.md` (1,224 lines of test specs)
3. Read `Building a comprehensive.md` (UFCStats.com patterns)

**Code Examples:**
- See `SCRAPER_TESTING_STRATEGY.md` for complete code examples
- Reference Gemini consultation (Session ID: `5a94cd87-a9d4-447d-837e-e7f65a56c4ac`)

**Debugging:**
- Check ScrapeLog table for error messages
- Review GitHub Actions logs
- Compare fixtures with live site

### Common Questions

**Q: Can I use TypeScript instead of Python?**
A: No. The decision to use Python/Scrapy was made after the TypeScript implementation failed. Don't repeat past mistakes.

**Q: Can I add Tapology as a secondary source?**
A: No. Single source = reliability. Multi-source = complexity. UFCStats.com has everything we need.

**Q: Should I scrape historical events or just upcoming?**
A: Start with upcoming only (completed=false). Historical data can be added later if needed.

**Q: What if UFCStats.com goes down?**
A: The UI falls back to `public/data/events.json` (static export). The scraper will retry automatically.

**Q: How do I test without hitting the live site?**
A: Use test fixtures (`tests/fixtures/*.html`). Update monthly with `scripts/update_fixtures.py`.

---

## ✅ Pre-Implementation Checklist

Before you start coding, make sure you have:

### Understanding
- [ ] Read this handoff document completely
- [ ] Read `NEW_SCRAPER_ARCHITECTURE.md`
- [ ] Skimmed `SCRAPER_TESTING_STRATEGY.md`
- [ ] Understand why we're using Python/Scrapy
- [ ] Understand the decoupled architecture

### Environment
- [ ] Python 3.11+ installed
- [ ] Node.js 20+ installed
- [ ] PostgreSQL client installed
- [ ] Access to Supabase database
- [ ] `.env.local` configured
- [ ] Database migrated with `npx prisma migrate deploy`

### Tools
- [ ] GitHub CLI installed (`gh`)
- [ ] Can run `npx prisma studio` to view database
- [ ] Can run `pytest` in scraper directory
- [ ] Can run `npm run test` in root

### Access
- [ ] GitHub repository access
- [ ] Vercel project access
- [ ] Supabase project access
- [ ] Can create GitHub secrets
- [ ] Can trigger GitHub Actions manually

---

## 🎯 Success Criteria

**You'll know you're done when:**

1. ✅ Scraper runs daily via GitHub Actions
2. ✅ Database updates with new UFC events within 24 hours
3. ✅ UI displays upcoming fights correctly
4. ✅ ScrapeLog shows consistent SUCCESS entries
5. ✅ Test coverage > 90% Python, > 85% TypeScript
6. ✅ No manual intervention needed for 2 weeks
7. ✅ Monitoring dashboard shows healthy metrics

**Timeline:**
- Week 1: Phase 1 complete (MVP working)
- Week 2: Phase 2 complete (full scraping)
- Week 3: Phase 3 complete (production automation)

---

## 📝 Final Notes

### What Makes This Different

The old scraper failed because it was:
- Too complex (3 sources)
- Wrong tool (TypeScript for scraping)
- No tests
- No monitoring

The new scraper will succeed because:
- ✅ Simple (1 source)
- ✅ Right tool (Python/Scrapy)
- ✅ Comprehensive tests
- ✅ Built-in monitoring
- ✅ Clear documentation

### Remember

> "Make it work, make it right, make it fast" - Kent Beck

We're starting from scratch to do this **right**. Take time to:
- Write tests first (TDD where possible)
- Follow the architecture exactly
- Don't skip phases
- Ask questions early

### Good Luck! 🚀

You have everything you need:
- 📚 1,800+ lines of documentation
- 🏗️ Complete architecture
- 🧪 Detailed test specifications
- 🤖 AI consultation session for questions
- 📦 Clean slate (old code archived)

**Next step:** Read `NEW_SCRAPER_ARCHITECTURE.md` and start Phase 1.

---

**Questions? Review the Gemini consultation:**
Session ID: `5a94cd87-a9d4-447d-857e-e7f65a56c4ac`

**Happy scraping!** 🥊
