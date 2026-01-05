# New UFC Scraper Architecture - From Scratch Design

**Created:** 2025-01-01
**Status:** Planning Phase
**Gemini Session:** 5a94cd87-a9d4-447d-837e-e7f65a56c4ac

## Executive Summary

Complete redesign of the UFC scraper based on lessons learned from the failed TypeScript multi-source implementation. This architecture prioritizes **reliability**, **simplicity**, and **maintainability** over language consistency.

**Key Decisions:**
- ✅ **Single Data Source:** UFCStats.com exclusively
- ✅ **Technology:** Python with Scrapy framework
- ✅ **Architecture:** Decoupled scraper → API ingestion → database
- ✅ **Cost:** $0/month (runs on free tiers)

---

## 1. Data Source Selection

### Decision: UFCStats.com Exclusively

**Why This Source:**
- **Official statistics partner of UFC** - authoritative data
- **Simple HTML table structures** - reliable parsing
- **Minimal anti-bot protection** - no proxies needed
- **Comprehensive data** - all UFC events since 1993
- **Proven community success** - multiple GitHub implementations

**Why Not Multi-Source:**
The previous implementation failed because:
1. **Complexity:** Managing 3 different data formats/schemas
2. **Deduplication Hell:** Event name variations across sources
3. **Maintenance Burden:** Site changes = 3 scrapers to fix
4. **Rate Limiting Conflicts:** Tapology/Sherdog aggressive blocking

**Single Source Benefits:**
- ✅ Data consistency guaranteed (same schema)
- ✅ No deduplication logic needed
- ✅ One scraper to maintain
- ✅ Clear failure modes

---

## 2. Technology Stack Decision

### Decision: Python with Scrapy + BeautifulSoup

#### Comparison Matrix

| Feature | **Python (Scrapy)** | TypeScript (Cheerio) |
|---------|-------------------|---------------------|
| **Ecosystem** | ✅ Industry standard, Scrapy is a *framework* | ❌ Must build framework yourself |
| **Robustness** | ✅ Built-in retries, auto-throttling, middlewares | ❌ Previous implementation failed |
| **Maintainability** | ✅ Enforced separation of concerns (Spiders/Pipelines) | ❌ Custom solution becomes monolithic |
| **Project Consistency** | ❌ New language/tooling | ✅ Single language |
| **Learning Curve** | 🟡 Team needs Python knowledge | ✅ Already know TypeScript |

**Verdict:** The operational benefits of Scrapy's reliability far outweigh TypeScript consistency. **Choose the right tool for the job.**

#### Why Scrapy Specifically

Scrapy is not a library—it's a complete scraping framework that provides:
- **Automatic request throttling** (DOWNLOAD_DELAY, AUTOTHROTTLE)
- **Built-in retry logic** with exponential backoff
- **Middleware system** for headers, proxies, caching
- **Data pipelines** for validation and transformation
- **Session management** and cookie handling
- **Pause/resume** for long-running jobs

**We don't have to build any of this.** The previous TypeScript implementation had to recreate all these features manually.

---

## 3. Architecture Design

### Decoupled Data Pipeline

```
┌──────────────────────────┐
│  GitHub Actions Cron     │  Orchestrator
│  (Daily at 8:00 UTC)     │
└────────────┬─────────────┘
             │ triggers
             ▼
┌──────────────────────────┐
│  Python Scrapy Scraper   │  Data Producer
│  (/scraper directory)    │
│                          │
│  1. Fetch HTML           │
│  2. Parse tables         │
│  3. Structure JSON       │
│  4. POST to API          │
└────────────┬─────────────┘
             │ HTTP POST with secret
             ▼
┌──────────────────────────┐
│  Next.js Ingestion API   │  Data Consumer
│  /api/internal/ingest    │
│                          │
│  1. Authenticate         │
│  2. Validate (Zod)       │
│  3. Upsert via Prisma    │
│  4. Log ScrapeLog        │
└────────────┬─────────────┘
             │ Prisma queries
             ▼
┌──────────────────────────┐
│  PostgreSQL (Supabase)   │  Data Store
└──────────────────────────┘
```

### Component Responsibilities

#### 1. Orchestrator (GitHub Actions)
**File:** `.github/workflows/scrape.yml`

**Responsibilities:**
- Schedule scraper runs (daily cron)
- Manage secrets (`INGEST_API_SECRET`)
- Provide logs and failure alerts
- No business logic

#### 2. Scraper (Python/Scrapy)
**Location:** `/scraper` directory

**Responsibilities:**
- Fetch HTML from UFCStats.com
- Parse HTML tables using BeautifulSoup
- Structure data into predefined JSON format
- POST JSON to Ingestion API
- **NOT responsible for:** Database logic, Prisma schemas, business rules

**Key Files:**
```
/scraper/
├── scrapy.cfg           # Scrapy project config
├── requirements.txt     # Python dependencies
├── ufc_scraper/
│   ├── spiders/
│   │   └── ufcstats.py  # Main spider
│   ├── items.py         # Data models
│   ├── pipelines.py     # Data transformation
│   └── settings.py      # Rate limits, headers
└── tests/               # Unit tests with fixtures
```

#### 3. Ingestion API (Next.js)
**File:** `src/app/api/internal/ingest/route.ts`

**Responsibilities:**
- Authenticate requests (bearer token)
- Validate JSON payload (Zod schema)
- Upsert data to database (Prisma)
- Content hash change detection
- Create ScrapeLog entry
- All wrapped in transaction

**Security:**
```typescript
// Example authentication
const authHeader = req.headers.get('authorization')
const token = authHeader?.replace('Bearer ', '')

if (token !== process.env.INGEST_API_SECRET) {
  return new Response('Unauthorized', { status: 401 })
}
```

### Data Contract (JSON Payload)

```typescript
// Zod schema enforced by API
const ScrapedDataSchema = z.object({
  events: z.array(z.object({
    id: z.string(),           // URL slug: "UFC-299"
    name: z.string(),
    date: z.string().datetime(),
    venue: z.string().optional(),
    location: z.string().optional(),
    sourceUrl: z.string().url(),
    fights: z.array(z.object({
      id: z.string(),         // "{eventId}-{fighter1Id}-{fighter2Id}"
      fighter1Id: z.string(),
      fighter2Id: z.string(),
      weightClass: z.string().optional(),
      cardPosition: z.string().optional(),
      sourceUrl: z.string().url(),
    }))
  })),
  fighters: z.array(z.object({
    id: z.string(),           // URL slug: "Khabib-Nurmagomedov"
    name: z.string(),
    record: z.string().optional(),
    wins: z.number().int().optional(),
    losses: z.number().int().optional(),
    draws: z.number().int().optional(),
    sourceUrl: z.string().url(),
  }))
})
```

### Error Handling

**Network Errors:** Scrapy auto-retries (configurable)
- `RETRY_TIMES = 3`
- `RETRY_HTTP_CODES = [500, 502, 503, 504, 408, 429]`

**Parsing Errors:** Log and continue
- High error count → GitHub Actions failure alert

**Ingestion Failure:** HTTP 500 from API
- Entire GitHub Action fails
- Team gets immediate notification

**Validation Failure:** HTTP 400 with Zod errors
- Action fails with detailed error message
- Indicates scraper/API schema mismatch

---

## 4. Database Schema Enhancements

### New Tables

```prisma
// Monitoring table for each scrape run
model ScrapeLog {
  id            Int      @id @default(autoincrement())
  startTime     DateTime
  endTime       DateTime
  status        String   // "SUCCESS" | "FAILURE"
  eventsFound   Int
  fightsAdded   Int
  fightsUpdated Int
  errorMessage  String?  @db.Text
}
```

### Enhanced Existing Tables

```prisma
model Event {
  id            String   @id  // Natural key: "UFC-299"
  name          String
  date          DateTime
  venue         String?
  location      String?
  completed     Boolean  @default(false)
  cancelled     Boolean  @default(false)

  // NEW FIELDS
  sourceUrl     String   @unique  // https://ufcstats.com/event-details/...
  lastScrapedAt DateTime @updatedAt
  contentHash   String?           // SHA256 of scraped data

  fights        Fight[]
}

model Fighter {
  id            String   @id  // Natural key: "Khabib-Nurmagomedov"
  name          String   @unique
  record        String?
  wins          Int?
  losses        Int?
  draws         Int?

  // NEW FIELDS
  sourceUrl     String   @unique
  lastScrapedAt DateTime @updatedAt
  contentHash   String?

  fights1       Fight[]  @relation("Fighter1")
  fights2       Fight[]  @relation("Fighter2")
}

model Fight {
  id                   String   @id  // "{eventId}-{fighter1Id}-{fighter2Id}"
  eventId              String
  fighter1Id           String
  fighter2Id           String
  weightClass          String?
  cardPosition         String?

  // AI-generated fields (unchanged)
  funFactor            Int?
  finishProbability    Int?
  entertainmentReason  String?

  // NEW FIELDS
  sourceUrl            String   @unique
  lastScrapedAt        DateTime @updatedAt
  contentHash          String?

  event                Event    @relation(fields: [eventId], references: [id])
  fighter1             Fighter  @relation("Fighter1", fields: [fighter1Id], references: [id])
  fighter2             Fighter  @relation("Fighter2", fields: [fighter2Id], references: [id])
}
```

### Key Changes Rationale

**Natural Keys for IDs:**
- Instead of auto-increment integers, use URL slugs from UFCStats
- Example: `event.id = "UFC-299"`, `fighter.id = "Jon-Jones"`
- Makes upsert logic simpler and more reliable
- No need for complex matching algorithms

**`sourceUrl` Field:**
- Unbreakable link between our data and its source
- Invaluable for debugging and verification
- Marked as `@unique` to prevent duplicates

**`contentHash` Field:**
- SHA256 hash of the scraped data
- Compare incoming hash with stored hash
- Skip database writes if unchanged
- Provides clear audit trail of what changed when

**`ScrapeLog` Table:**
- Essential for production monitoring
- Track trends: `eventsFound` dropping = potential issue
- `errorMessage` helps diagnose failures quickly

---

## 5. Implementation Roadmap

### Phase 1: Foundation & MVP (3-5 days)

**Goal:** Scrape one event page and successfully ingest its data

**Tasks:**
1. Set up Python/Scrapy environment in `/scraper`
   - Create `requirements.txt` with Scrapy, BeautifulSoup, requests
   - Create basic Scrapy project structure
   - Configure `settings.py` with rate limiting

2. Implement Prisma schema changes
   - Add `ScrapeLog` model
   - Add new fields to Event/Fighter/Fight
   - Run migration

3. Create Next.js Ingestion API
   - `src/app/api/internal/ingest/route.ts`
   - Zod validation schemas
   - Authentication with bearer token

4. Write basic Scrapy spider
   - Parse one hardcoded UFCStats event URL
   - Extract events, fights, fighters
   - Output to JSON

5. Implement upsert logic in API
   - Event upserts with conflict resolution
   - Fighter upserts
   - Fight upserts
   - Wrapped in `prisma.$transaction`

**Deliverables:**
- [ ] Working scraper for 1 event
- [ ] API accepts and persists data
- [ ] Manual test: scrape → API → database

**Testing:**
- Unit tests for spider parsing (use saved HTML fixtures)
- API tests with Postman/curl
- Database verification queries

---

### Phase 2: Full Scrape & Data Integrity (5-8 days)

**Goal:** Scrape all events with efficient change detection

**Tasks:**
1. Enhance spider to crawl event list
   - Start from `http://ufcstats.com/statistics/events/completed`
   - Follow links to all event detail pages
   - Handle pagination

2. Implement content hash change detection
   - In API: compute SHA256 of incoming data
   - Compare with `contentHash` in database
   - Skip UPDATE if unchanged

3. Add ScrapeLog creation
   - API creates log entry at start of ingestion
   - Updates with final counts and status
   - Captures any errors

4. Handle edge cases
   - Cancelled fights
   - Draw/No Contest outcomes
   - Missing fighter data
   - Multiple weight classes

**Deliverables:**
- [ ] Full event list scraping
- [ ] Change detection working
- [ ] ScrapeLog populated correctly
- [ ] Staging database fully populated

**Testing:**
- End-to-end manual runs
- Data validation scripts (check for orphaned records, null values)
- Verify change detection (run twice, 2nd run = no updates)

---

### Phase 3: Productionization & Automation (2-3 days)

**Goal:** Automated, reliable scraper running in production

**Tasks:**
1. Create GitHub Actions workflow
   - `.github/workflows/scrape.yml`
   - Daily cron schedule (8:00 UTC)
   - Install Python, deps, run scraper
   - POST to production API

2. Configure secrets
   - `INGEST_API_SECRET` in GitHub secrets
   - `INGEST_API_URL` as variable

3. Add alerting
   - Email on workflow failure
   - Slack webhook (optional)

4. Write documentation
   - How to run scraper manually
   - How to read logs
   - How to debug failures

**Rollout Plan:**
1. Deploy schema changes to staging database
2. Deploy API changes to staging (Vercel preview)
3. Run scraper manually against staging
4. Verify data in staging database
5. Deploy to production
6. Run scraper manually against production (dry run)
7. Enable cron job
8. Monitor first 3 automated runs

**Deliverables:**
- [ ] GitHub Actions workflow complete
- [ ] Automated scraper running successfully
- [ ] Documentation complete
- [ ] Monitoring in place

**Testing:**
- Manual production run before enabling cron
- Monitor logs for first 3 cron runs
- Verify data freshness in UI

---

## 6. Anti-Blocking Strategy

UFCStats.com does not have aggressive anti-bot measures. Simple "polite" scraping is sufficient.

### Scrapy Configuration

**File:** `scraper/ufc_scraper/settings.py`

```python
# Rate Limiting (Most Important)
DOWNLOAD_DELAY = 3  # Wait 3 seconds between requests
AUTOTHROTTLE_ENABLED = True  # Dynamic adjustment based on response times
AUTOTHROTTLE_START_DELAY = 3
AUTOTHROTTLE_MAX_DELAY = 10
AUTOTHROTTLE_TARGET_CONCURRENCY = 1.0

# Concurrency
CONCURRENT_REQUESTS_PER_DOMAIN = 1  # Process one request at a time

# Retries
RETRY_ENABLED = True
RETRY_TIMES = 3
RETRY_HTTP_CODES = [500, 502, 503, 504, 408, 429]

# Headers
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

# Respect robots.txt
ROBOTSTXT_OBEY = True
```

### Monitoring for Blocks

**Indicators of being blocked:**
1. `ScrapeLog.eventsFound` suddenly drops to 0
2. High number of parsing errors
3. HTTP 429 responses in Scrapy logs

**Response:**
1. Increase `DOWNLOAD_DELAY` to 5-7 seconds
2. Check robots.txt for changes
3. Verify site structure hasn't changed

---

## 7. Cost Estimates

### Infrastructure Costs (< 1000 pages/day)

| Service | Usage | Tier | Monthly Cost |
|---------|-------|------|--------------|
| **GitHub Actions** | Daily 10-min runs = 5 hours/month | Free (2000 min/month) | **$0** |
| **Vercel** | Ingestion API (serverless) | Hobby (free) | **$0** |
| **Supabase** | PostgreSQL database | Free (500MB) | **$0** |

**Total: $0/month**

### Scaling Considerations

If we exceed free tiers:
- **GitHub Actions Pro:** $0.008/minute (~$2.40/month for daily runs)
- **Vercel Pro:** $20/month (rarely needed for this use case)
- **Supabase Pro:** $25/month (if we exceed 500MB storage)

**Maximum anticipated cost: $50/month**

---

## 8. Success Metrics

### Technical Metrics
- ✅ **Scraper success rate:** > 95% (from ScrapeLog)
- ✅ **Data freshness:** < 24 hours old
- ✅ **Zero duplicate events/fighters**
- ✅ **API response time:** < 500ms for ingestion

### Business Metrics
- ✅ **Event coverage:** All upcoming UFC events present
- ✅ **Fight completeness:** > 95% of fights have fighters populated
- ✅ **Uptime:** 99%+ for automated scraper

---

## 9. Migration from Old Scraper

### Transition Plan

**Week 1: Development**
- Build new scraper (Phase 1)
- Test against staging database
- Keep old scraper running in production

**Week 2: Integration**
- Complete Phase 2 (full scraping)
- Run both scrapers in parallel
- Compare data quality

**Week 3: Cutover**
- Deploy new scraper to production
- Disable old scraper GitHub Actions
- Monitor closely for 1 week

**Week 4: Cleanup**
- Archive old scraper code (done)
- Update documentation
- Remove old dependencies

---

## 10. Risk Assessment & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| UFCStats.com changes structure | Medium | High | Fixture tests, alert on parsing errors, fast iteration |
| Rate limiting/blocking | Low | Medium | Conservative delays, respect robots.txt, monitor logs |
| Scraper bugs | Medium | Low | Extensive testing, transaction safety, ScrapeLog monitoring |
| API authentication bypass | Low | High | Rotate secrets quarterly, audit logs |
| Database corruption | Very Low | High | All writes in transactions, daily backups |

---

## Next Steps

1. **Review this plan** with the team
2. **Set up Python environment** locally
3. **Create Prisma migration** for schema changes
4. **Start Phase 1 implementation**
5. **Create tracking issue** in GitHub with checklist

---

## References

- **Research Guide:** `archive/docs-old-2025-01/ScraperResearch.md`
- **Gemini Consultation:** Session ID `5a94cd87-a9d4-447d-837e-e7f65a56c4ac`
- **Current Architecture:** `ARCHITECTURE.md`
- **Archived Old Scraper:** `archive/scrapers-old-2025-01/`
