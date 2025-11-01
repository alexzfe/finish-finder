# Engineering Handoff - Finish Finder

**Last Updated:** 2025-11-01
**Session Context:** Connected UI to New Database - COMPLETE! 🎉

---

## Session 8: UI Database Connection (2025-11-01) ✅

**Goal:** Connect the Vercel-hosted UI to the new Supabase database containing scraped UFC data.

**Problem:** The Python/Scrapy scraper had been running and populating the new database since Nov 1st, but the Vercel production deployment was not connected to it. Users visiting the site couldn't see the scraped data.

**What Was Accomplished:**

1. **Environment Variable Configuration:**
   - Installed Vercel CLI (`vercel@48.8.0`)
   - Authenticated and linked to project (`alexzfes-projects/finish-finder`)
   - Identified newline character issue in environment variables (`\n` at end of values)
   - Fixed DATABASE_URL for all environments (production, preview, development):
     ```
     postgresql://postgres.niaiixwcxvkohtsmatvc:how-now-brown-cow@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
     ```
   - Fixed DIRECT_DATABASE_URL for all environments:
     ```
     postgresql://postgres:how-now-brown-cow@db.niaiixwcxvkohtsmatvc.supabase.co:5432/postgres
     ```

2. **Critical Bug Fix:**
   - **Problem**: `prisma.ts` exported as default, but API routes imported as named export
   - **Symptom**: Database client showed as "not initialized" despite env vars being set
   - **Solution**: Added named export to `prisma.ts`: `export { prisma };`
   - **File**: `src/lib/database/prisma.ts:24`
   - **Commit**: `1d38c03` - "fix(database): export prisma as both default and named export"

3. **Updated GitHub Actions:**
   - Updated `DATABASE_URL` secret to point to new database
   - Ensures AI predictions workflow uses correct database

4. **Verification:**
   - Health check endpoint: ✅ Database connected (1 event)
   - Events API: ✅ Returns "UFC Fight Night: Bonfim vs. Brown"
   - Fight data: ✅ 13 fights with complete fighter records
   - Fighter data: ✅ 26 fighters with wins/losses/draws

5. **Documentation Updates:**
   - Updated `DEPLOYMENT.md` with new database details
   - Updated deployment status section
   - Updated `HANDOFF.md` (this file) with session summary

**Production URLs:**
- Main site: https://finish-finder.vercel.app/
- Health check: https://finish-finder.vercel.app/api/health
- Events API: https://finish-finder.vercel.app/api/db-events

**Database Details:**
- **Provider**: Supabase PostgreSQL
- **Project**: `niaiixwcxvkohtsmatvc`
- **Region**: `aws-1-us-east-1`
- **Data**: 1 event (UFC Fight Night: Bonfim vs. Brown), 13 fights, 26 fighters
- **Connection**: Pooler (port 6543) for runtime, Direct (port 5432) for migrations

**Key Learnings:**
1. **Import/Export Mismatch**: Always ensure exports match imports (default vs named)
2. **Environment Variable Format**: Watch for hidden characters like `\n` when piping to env commands
3. **Vercel CLI**: Use `printf` instead of `echo` to avoid newlines in env values
4. **Deployment Timing**: Environment variable changes require redeployment to take effect

**Status:** ✅ COMPLETE - UI successfully connected to new database and displaying scraped UFC data.

**Next Steps:**
- Monitor scraper runs to accumulate more events
- Consider running AI predictions workflow to generate entertainment scores
- Monitor database performance as data grows

---

## UFC Scraper Rebuild - COMPLETE ✅

### Current Status

**Phase 1 Foundation & Infrastructure: COMPLETE ✅**
**Phase 2 Core Parsers & Testing: COMPLETE ✅**
**Phase 2 E2E Integration: COMPLETE ✅**
**Phase 3 Fighter Profile Enhancement: COMPLETE ✅**
**Phase 4 Fight Enrichment (Title Fights, Card Position): COMPLETE ✅**
**Phase 5 Automation & Operations: COMPLETE ✅**

**🎉 THE SCRAPER IS NOW FULLY AUTOMATED AND PRODUCTION-READY! 🎉**

The UFC scraper has been completely rebuilt using Python/Scrapy with a decoupled architecture. All infrastructure components are deployed and the core HTML parsing logic is complete and tested:

- ✅ Python/Scrapy project structure created in `/scraper/`
- ✅ Prisma schema updated with scraper fields (sourceUrl, contentHash, lastScrapedAt)
- ✅ New ScrapeLog model for audit trail
- ✅ Next.js ingestion API endpoint with authentication (`/api/internal/ingest`)
- ✅ Zod validation schemas for data contract
- ✅ Database connection configured (Supabase, new project)
- ✅ Foundational documentation updated (project-structure.md, docs-overview.md, README.md)

**Architecture:** Python Scrapy Spider → Next.js Ingestion API → PostgreSQL Database

### What Was Accomplished

**Session 1 (Previous): Infrastructure Setup**
1. Created complete Python/Scrapy project structure:
   - `/scraper/ufc_scraper/spiders/ufcstats.py` - Main spider (skeleton)
   - `/scraper/ufc_scraper/items.py` - Data models (EventItem, FightItem, FighterItem)
   - `/scraper/ufc_scraper/parsers.py` - HTML parsing utilities (TODO: implement)
   - `/scraper/ufc_scraper/pipelines.py` - API ingestion pipeline
   - `/scraper/ufc_scraper/settings.py` - Scrapy configuration
   - `/scraper/requirements.txt` - Production dependencies
   - `/scraper/requirements-dev.txt` - Development & test dependencies
   - `/scraper/pytest.ini` - Test configuration

2. Updated Prisma schema (`/prisma/schema.prisma`):
   - Added `sourceUrl`, `lastScrapedAt`, `contentHash` to Fighter, Event, Fight models
   - Added `cancelled` boolean to Event model
   - Created new `ScrapeLog` model for monitoring
   - Configured `directUrl` for migrations (Supabase requirement)
   - Migrations: `20251101125236_add_scraper_fields` and `20251101125238_add_scraper_fields`

3. Built Next.js ingestion API (`/src/app/api/internal/ingest/route.ts`):
   - POST endpoint with Bearer token authentication
   - Zod schema validation
   - Transaction-safe upserts with content hash change detection (SHA256)
   - Creates ScrapeLog entries for audit trail
   - 252 lines of production-ready code

4. Created validation schemas (`/src/lib/scraper/validation.ts`):
   - `ScrapedFighterSchema`, `ScrapedFightSchema`, `ScrapedEventSchema`
   - `ScrapedDataSchema` for complete payload
   - TypeScript types exported for API integration

5. Configured new Supabase database:
   - Database URL: `postgresql://postgres.niaiixwcxvkohtsmatvc:how-now-brown-cow@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true`
   - Direct URL: `postgresql://postgres:how-now-brown-cow@db.niaiixwcxvkohtsmatvc.supabase.co:5432/postgres`
   - Ran `COMPLETE_SCHEMA.sql` manually in Supabase SQL Editor (IPv6 limitation on free tier)
   - Verified database connection working

6. Archived old TypeScript scrapers:
   - Moved `src/lib/scrapers/wikipediaService.ts` → `archive/scrapers-old-2025-01/`
   - Moved `src/lib/scrapers/tapologyService.ts` → `archive/scrapers-old-2025-01/`
   - Moved `src/lib/scrapers/requestPolicy.ts` → `archive/scrapers-old-2025-01/`
   - Created `/archive/README.md` explaining archive rationale

**Session 2: Documentation Update**
1. Launched 3 parallel sub-agents to analyze changes:
   - Scraper architecture changes (new Python project, API endpoint, archived files)
   - Database schema changes (ScrapeLog, new fields, indexes)
   - Project structure updates (file tree, technology stack additions)

2. Updated `/docs/ai-context/project-structure.md`:
   - Added `/scraper/` directory with complete Python/Scrapy structure
   - Added `/archive/` directory documentation
   - Updated `/src/lib/` to show new validation schemas
   - Added new `/api/internal/ingest/` route
   - Updated Prisma schema description (8 models, new migrations)
   - Added Python 3.11+, Scrapy 2.11.0, BeautifulSoup 4.12.2 to tech stack
   - Created new section explaining scraper architecture and features

3. Updated `/docs/ai-context/docs-overview.md`:
   - Reorganized Tier 2 documentation (removed old scrapers section)
   - Added Tier 3 scraper architecture documentation references
   - Marked old Tapology plan and Wikipedia enrichment docs as superseded
   - Added references to `/docs/NEW_SCRAPER_ARCHITECTURE.md` and `/docs/SCRAPER_TESTING_STRATEGY.md`

4. Updated `/README.md`:
   - Changed scraping status: "⚠️ Under Investigation" → "✅ Phase 1 Complete"
   - Updated overview to mention UFCStats.com single source
   - Updated core repo pillars to include Python/Scrapy scraper
   - Updated architecture snapshot table with new scraper row
   - Added Python 3.11+ to prerequisites
   - Added "Python Scraper Setup" section with installation instructions
   - Replaced "Scraper Issues" section with "Scraper Architecture" section

**Session 3: Core Parsers & Python 3.13 Compatibility**
1. Implemented complete HTML parsers (`/scraper/ufc_scraper/parsers.py`):
   - `parse_event_list()` - Extracts 752 events from UFCStats.com event list
   - `parse_event_detail()` - Extracts event metadata, fights (13 per event), fighters (26 per event)
   - `parse_fighter_profile()` - Parses fighter records (wins-losses-draws)
   - Helper functions: `extract_id_from_url()`, `normalize_event_name()`, `parse_record()`
   - Date parsing with ISO 8601 format + UTC timezone

2. Created comprehensive test suite (`/scraper/tests/test_parsers.py`):
   - 14 unit tests covering all parser functions
   - 90% code coverage achieved
   - 100% test pass rate
   - Captured 680KB of HTML fixtures from UFCStats.com for offline testing

3. Fixed Python 3.13 compatibility:
   - Updated `pydantic==2.5.0` → `pydantic>=2.9.0` in requirements.txt
   - Resolved pydantic-core build errors on Python 3.13.9
   - Successfully installed Scrapy 2.13.3 + all dependencies

4. Updated spider with limit parameter:
   - Added `-a limit=N` parameter for controlled testing
   - Enables testing with 1 event instead of all 752

**Session 4: E2E Testing & Deployment ✅**

**Major Achievement: Complete E2E scraper flow is now operational and tested!**

1. **Resolved Prisma Client Issues**:
   - Fixed prisma.ts initialization pattern (removed conditional logic that caused null client)
   - Used standard Prisma pattern: `global.prisma || new PrismaClient()`
   - Fixed import/export (changed to default export)
   - Added diagnostic logging to API route

2. **Fixed Vercel Deployment Issues**:
   - Root cause: `prisma/schema.prisma` had uncommitted changes
   - Vercel was building with old schema missing `ScrapeLog` model and `sourceUrl` fields
   - Committed schema changes and pushed to GitHub
   - Resolved Prisma client cache issues

3. **Database Configuration**:
   - Pushed schema to new Supabase database (Session Mode, port 5432)
   - Fixed DATABASE_URL to use Session Mode pooler instead of Transaction Mode
   - Verified all tables created: events, fighters, fights, scrape_logs

4. **Successful E2E Test**:
   - Scraped 1 event from UFCStats.com (13 fights, 26 fighters)
   - Data validated with Zod schemas
   - API authenticated successfully
   - Data saved to Supabase with content hash change detection
   - ScrapeLog audit entry created (ID: cmhgpydt3000tl204zneqjwsv)
   - **Result**: `{'success': True, 'eventsCreated': 1, 'fightsCreated': 13, 'fightersCreated': 26}`

5. **Implemented Fighter Profile Parser**:
   - Added `parse_fighter_profile()` function to extract fighter records
   - Parses wins, losses, draws from fighter profile pages
   - Ready to integrate into spider (not yet connected)

**Session 5: Fighter Profile Enhancement ✅**

**Major Achievement: Fighters now have complete records with wins/losses/draws!**

1. **Integrated Fighter Profile Scraping**:
   - Updated spider `parse_event()` to yield scrapy.Request objects for fighter profiles
   - Added new callback `parse_fighter_profile_page()` to process fighter pages
   - Used existing `parsers.parse_fighter_profile()` function for data extraction
   - Merges base fighter data from event page with profile data from fighter page

2. **Spider Enhancement** (`/scraper/ufc_scraper/spiders/ufcstats.py`):
   - Modified to visit each fighter's profile URL after parsing event
   - Added `dont_filter=True` to allow same fighter across multiple events
   - Logs fighter records during parsing: "Fighter {name} - Record: {record}"
   - Complete data flow: event list → event detail → fighter profiles → API

3. **E2E Test Results**:
   - Scraped 1 event: "UFC Fight Night: Bonfim vs. Brown"
   - Visited 26 fighter profiles (29 total pages: 1 events list + 1 event + 26 fighters + 1 robots.txt)
   - Execution time: ~105 seconds (3-4 seconds per fighter profile with rate limiting)
   - All fighters have complete records: 26/26 (100%)
   - API response: `{'success': True, 'eventsCreated': 1, 'fightsCreated': 13, 'fightersCreated': 26}`

4. **Database Verification**:
   - All 26 fighters saved with complete record data
   - `record` field: "17-6-0", "17-1-0 (1 NC)", etc.
   - `wins` field: parsed integer values (17, 16, 12, etc.)
   - `losses` field: parsed integer values (6, 2, 5, etc.)
   - `draws` field: null (none in this event)
   - Examples:
     - Adrian Yanez: Record: 17-6-0, W: 17, L: 6
     - Gabriel Bonfim: Record: 18-1-0, W: 18, L: 1
     - Daniel Marcos: Record: 17-1-0 (1 NC), W: 17, L: 1

**Session 6: Fight Enrichment - Title Fights, Card Position, Main Event (THIS SESSION) ✅**

**Major Achievement: Fights now have complete enrichment data!**

1. **Implemented Fight Enrichment Parser** (`/scraper/ufc_scraper/parsers.py:174-226`):
   - Detects title fights by checking for `belt.png` image in weight class cell
   - Identifies main event (first fight, index 1)
   - Assigns card positions based on fight order:
     - Fight 1: "Main Event" (+ mainEvent flag)
     - Fight 2: "Co-Main Event"
     - Fights 3-5: "Main Card"
     - Fights 6-9: "Prelims"
     - Fights 10+: "Early Prelims"

2. **Updated Data Models**:
   - FightItem (`items.py`): Added `titleFight`, `mainEvent` boolean fields
   - Validation schema (`validation.ts`): Added titleFight/mainEvent with defaults
   - API route (`route.ts`): Saves enrichment fields to database

3. **Fixed Critical Bug**:
   - **Problem**: All fights shared same `sourceUrl` (event URL), violating unique constraint
   - **Symptom**: Only 1 of 13 fights saved to database (others overwritten)
   - **Solution**: Generate unique `sourceUrl` per fight: `{event_url}#fight-{fight_id}`
   - **Result**: All 13 fights now save correctly

4. **Test Results** (UFC Fight Night: Bonfim vs. Brown):
   ```
   1. Main Event       [MAIN]  | Welterweight         | Gabriel Bonfim vs Randy Brown
   2. Co-Main Event            | Flyweight            | Matt Schnell vs Joseph Morales
   3-5. Main Card (3 fights)
   6-9. Prelims (4 fights)
   10-13. Early Prelims (4 fights)

   13/13 fights saved (100% success)
   Title fights: 0 (correct - Fight Night has no title bouts)
   Main events: 1 (correct)
   ```

5. **Verified with Fixture** (UFC 320):
   ```
   1. Main Event       [TITLE] [MAIN]  | Light Heavyweight
   2. Co-Main Event    [TITLE]          | Bantamweight
   ...
   Total: 14 fights, 2 title fights, 1 main event
   ```

**Session 7: Automation & Operations (THIS SESSION) ✅**

**Major Achievement: Automated daily scraping is now live in production!**

1. **Created GitHub Actions Workflow** (`.github/workflows/scraper.yml`):
   - Runs daily at 2:00 AM UTC (after UFC events conclude)
   - Uses Python 3.11 with pip caching for speed
   - Installs dependencies from `scraper/requirements.txt`
   - Executes `scrapy crawl ufcstats` command
   - Posts data to production Next.js API
   - Uploads logs as artifacts (7-day retention)
   - Supports manual triggering with optional event limit

2. **Configured GitHub Secrets**:
   - `INGEST_API_URL`: https://finish-finder.vercel.app/api/internal/ingest
   - `INGEST_API_SECRET`: Bearer token for authentication
   - Secrets verified and accessible to workflow

3. **Tested Automation**:
   - Manual workflow trigger: ✅ SUCCESS (2m4s)
   - Scraped 1 event with limit=1
   - Data posted to API successfully
   - ScrapeLog created with status: SUCCESS
   - Content hash change detection working (0 fights added/updated = no changes)

4. **Created Operational Documentation** (`/scraper/OPERATIONS.md`):
   - **Manual Scraping**: GitHub Actions and local development commands
   - **Monitoring**: ScrapeLog queries, GitHub Actions logs, database health checks
   - **Troubleshooting**: 5 common issues with step-by-step solutions
   - **Maintenance**: Weekly and monthly tasks
   - **Emergency Procedures**: Disable scraping, rollback bad data
   - **Performance Tuning**: Rate limiting, concurrent requests
   - **Quick Reference Table**: Common commands

5. **Production Status**:
   - ✅ Automated daily scraping enabled
   - ✅ Manual trigger available for testing
   - ✅ Monitoring and alerting configured
   - ✅ Comprehensive operations runbook
   - ✅ Production secrets secured
   - ✅ End-to-end tested and verified

**Session 3 (Previous): Phase 2 - Core Parser and Spider Implementation**

**Part 1: HTML Parsers**
1. **Created HTML fixtures** for offline testing (`/scraper/tests/fixtures/`):
   - `event_list.html` - 752 UFC events (586KB, all completed events)
   - `event_detail_upcoming.html` - Sample upcoming event (34KB)
   - `event_detail_completed.html` - Sample completed event (49KB)
   - Total: 680KB of test data for reproducible parsing tests

2. **Implemented parse_event_list()** (`/scraper/ufc_scraper/parsers.py:13-80`):
   - Parses `.b-statistics__table-events` table from events listing page
   - Extracts event URLs, names, dates (ISO 8601), locations
   - Handles pagination (page=all parameter)
   - Date parsing: "November 01, 2025" → "2025-11-01T00:00:00"
   - Event ID generation from URL or normalized name
   - Successfully parsed 752 events from fixtures

3. **Implemented parse_event_detail()** (`/scraper/ufc_scraper/parsers.py:83-229`):
   - Extracts event metadata (name, date, venue, location)
   - Parses `.b-fight-details__table` to extract all fights
   - Identifies 2 fighters per fight via `fighter-details` links
   - Extracts weight classes from table cells
   - Generates fight IDs: `{eventId}-{fighter1Id}-{fighter2Id}`
   - Deduplicates fighters across fights (using set)
   - Handles both upcoming (no results) and completed events
   - Successfully parsed 13 fights + 26 fighters from upcoming event
   - Successfully parsed 14 fights + 28 fighters from completed event

4. **Created comprehensive test suite** (`/scraper/tests/test_parsers.py`):
   - 14 unit tests covering all parsing functions
   - 100% test pass rate (14/14 passed)
   - 90% code coverage on `parsers.py` module (128 statements, 13 missed)
   - Tests cover:
     - `parse_event_list()`: returns events, structure validation, date parsing, empty/missing tables
     - `parse_event_detail()`: structure validation, metadata extraction, fights/fighters, upcoming vs completed
     - Helper functions: `parse_record()`, `extract_id_from_url()`, `normalize_event_name()`
   - Uses pytest fixtures to load HTML files
   - Test execution: `pytest tests/test_parsers.py -v` (1.89s)

5. **Created smoke test script** (`/scraper/test_scraper.py`):
   - End-to-end validation using fixtures
   - Verifies parsing logic without hitting UFCStats.com
   - Displays parsed data for manual inspection
   - Confirms: 752 events, 13 fights, 26 fighters successfully extracted

**Part 2: Spider Integration**
6. **Added limit parameter to spider** (`/scraper/ufc_scraper/spiders/ufcstats.py:29-32`):
   - Accepts `-a limit=N` argument for controlled testing
   - Tracks `events_scraped` count for progress logging
   - Usage: `scrapy crawl ufcstats -a limit=5`
   - Limits event list before yielding requests

7. **Created integration test** (`/scraper/test_spider_integration.py`):
   - Simulates full spider crawl without Scrapy runtime
   - Tests: event list parsing → event detail parsing → item yielding
   - Validated with fixtures: 83 items extracted (2 events, 27 fights, 54 fighters)
   - Demonstrates complete spider workflow and pipeline integration points
   - Run: `python test_spider_integration.py`

**Blocker Encountered (RESOLVED):**
- ~~Python 3.13 compatibility issue with pydantic-core dependency~~
- ~~`pip install -r requirements.txt` fails on Python 3.13~~
- **FIXED**: Updated requirements.txt to use pydantic>=2.9.0 (Python 3.13 compatible)
- **RESULT**: Successfully installed Scrapy 2.13.3 on Python 3.13.9

8. **Resolved Python 3.13 compatibility** (`/scraper/requirements.txt`):
   - Updated pydantic from ==2.5.0 to >=2.9.0
   - Changed all version specifiers to >= for flexibility
   - Successfully installed: Scrapy 2.13.3, Pydantic 2.11.9, BeautifulSoup4 4.14.2

9. **E2E Test with Live UFCStats.com** (dry run, no API):
   - Ran scraper against live UFCStats.com: `scrapy crawl ufcstats -a limit=1`
   - Successfully scraped 40 items (1 event + 26 fighters + 13 fights)
   - Execution time: 8.87 seconds
   - Output saved to JSON and validated
   - All data structures correct and complete

### Current Issue

**None - All blockers resolved! ✅**

The scraper is fully functional with:
- ✅ Complete event, fight, and fighter data extraction
- ✅ Fighter profile scraping for complete records (wins/losses/draws)
- ✅ E2E integration with Next.js API and database
- ✅ Content hash change detection
- ✅ ScrapeLog audit trail
- ✅ Production-ready and tested with live data

### Next Steps to Complete Scraper Implementation

**Phase 2: Core Spider Implementation (3-5 days) - 60% Complete**

1. ✅ **COMPLETE: Implement HTML parsers** (`/scraper/ufc_scraper/parsers.py`):
   - ✅ `parse_event_list()` - Extracts 750+ events from UFCStats.com
   - ✅ `parse_event_detail()` - Extracts event metadata, fights, fighters
   - ⏳ `parse_fighter_profile()` - Extract fighter records (optional, can defer)
   - ✅ BeautifulSoup parsing of HTML tables
   - ✅ Edge case handling (empty tables, missing data, upcoming vs completed)

2. ✅ **COMPLETE: Capture HTML fixtures** for testing:
   - ✅ Event list page HTML (752 events, 586KB)
   - ✅ Event detail - upcoming event (34KB)
   - ✅ Event detail - completed event (49KB)
   - Total: 680KB of fixtures in `/scraper/tests/fixtures/`

3. ✅ **COMPLETE: Implement unit tests** (`/scraper/tests/`):
   - ✅ `test_parsers.py` - 14 tests, 100% pass rate, 90% coverage
   - ⏳ `test_items.py` - Test data model validation (optional)
   - ⏳ `test_pipelines.py` - Test API posting logic (integration test)
   - ✅ 90% coverage achieved on parsers.py
   - ✅ Smoke test script: `python scraper/test_scraper.py`

4. ✅ **COMPLETE: Spider integration** (`/scraper/ufc_scraper/spiders/ufcstats.py`):
   - ✅ Spider accepts `-a limit=N` parameter for controlled testing
   - ✅ Parsers integrated with spider workflow
   - ✅ Integration test validates complete flow (83 items from 2 events)
   - ⏳ Live Scrapy testing blocked by Python 3.13 compatibility
   - ✅ Spider logic validated and production-ready

5. ✅ **COMPLETE: End-to-end testing**:
   - ✅ Set environment variables: `INGEST_API_URL`, `INGEST_API_SECRET`
   - ✅ Run spider locally: `cd scraper && scrapy crawl ufcstats -a limit=1`
   - ✅ Verified JSON POST to Next.js ingestion API (Vercel production)
   - ✅ Database records created in Supabase (1 event, 13 fights, 26 fighters)
   - ✅ ScrapeLog audit entries created
   - ✅ Content hash change detection working (12 fights updated, 1 added)
   - ✅ Tested with limit flag successfully

**Phase 3: Fighter Profile Enhancement (COMPLETE ✅)**

1. ✅ **COMPLETE: Integrate fighter profile scraping** (`/scraper/ufc_scraper/spiders/ufcstats.py`):
   - ✅ Parser implemented: `parse_fighter_profile()` function exists
   - ✅ Updated spider to visit fighter profile URLs
   - ✅ Extract wins, losses, draws from fighter pages
   - ✅ Update fighters with complete record data
   - ✅ Tested with `-a limit=1` and verified 26/26 fighters have complete records
   - ✅ Data verified in database: all fighters have wins/losses/record fields populated

**Phase 4: Automation & Operations (1-2 hours)**

1. **Create GitHub Actions workflow** (`.github/workflows/scraper.yml`):
   - Scheduled run (2:00 AM UTC daily)
   - Manual trigger option
   - Python 3.11+ environment setup
   - Install dependencies from requirements.txt
   - Set environment variables from secrets
   - Run spider: `scrapy crawl ufcstats`
   - Upload logs as artifacts on failure

2. **Configure GitHub secrets**:
   - `INGEST_API_URL` - Production Next.js API endpoint
   - `INGEST_API_SECRET` - Bearer token for authentication
   - `DATABASE_URL` - Supabase connection string (for verification scripts)

3. **Write operational documentation**:
   - Update `/docs/OPERATIONS.md` with scraper runbook
   - Document ScrapeLog monitoring queries
   - Add troubleshooting guide for common scraper failures
   - Document manual scraper execution steps

### Key Files to Review

**Python Scraper:**
- `/scraper/ufc_scraper/spiders/ufcstats.py` - Main spider (✅ COMPLETE - limit parameter, integration tested)
- `/scraper/ufc_scraper/parsers.py` - HTML parsing functions (✅ COMPLETE - 90% coverage)
- `/scraper/ufc_scraper/items.py` - Data models (complete)
- `/scraper/ufc_scraper/pipelines.py` - API posting pipeline (complete, needs E2E test)
- `/scraper/ufc_scraper/settings.py` - Scrapy configuration (complete)
- `/scraper/requirements.txt` - Production dependencies (⚠️ requires Python 3.11)
- `/scraper/tests/test_parsers.py` - Parser unit tests (✅ COMPLETE - 14 tests)
- `/scraper/tests/fixtures/` - HTML test fixtures (✅ COMPLETE - 680KB)
- `/scraper/test_spider_integration.py` - Integration test (✅ COMPLETE - 83 items validated)

**Next.js API:**
- `/src/app/api/internal/ingest/route.ts` - Ingestion API endpoint (complete, 252 lines)
- `/src/lib/scraper/validation.ts` - Zod schemas (complete)

**Database:**
- `/prisma/schema.prisma` - Updated schema (complete)
- `/.env.local` - Database connection strings (configured)

**Documentation:**
- `/docs/NEW_SCRAPER_ARCHITECTURE.md` - Architecture design document
- `/docs/SCRAPER_TESTING_STRATEGY.md` - Testing strategy
- `/docs/ai-context/project-structure.md` - Updated file tree (complete)
- `/README.md` - Updated quickstart (complete)

**Archived (Reference Only):**
- `/archive/scrapers-old-2025-01/wikipediaService.ts` - Old Wikipedia scraper
- `/archive/scrapers-old-2025-01/tapologyService.ts` - Old Tapology enrichment
- `/archive/docs-old-2025-01/scrapers-CONTEXT.md` - Old scraper documentation

### Context for Next Session

**Design Decisions Made:**

1. **UFCStats.com Exclusive**: Chose UFCStats.com as single data source because:
   - Official UFC stats partner (reliable, consistent structure)
   - Simple HTML tables (easy parsing)
   - No aggressive anti-scraping (robots.txt friendly)
   - Eliminates need for complex multi-source deduplication

2. **Decoupled Architecture**: Python scraper POSTs to Next.js API because:
   - Clear separation of concerns (scraping vs persistence)
   - Easier testing (mock API in scraper tests, mock scraper in API tests)
   - Language-specific strengths (Python for scraping, TypeScript for transactions)
   - Independent deployment and scaling

3. **Content Hash Change Detection**: SHA256 hash comparison instead of field-by-field comparison:
   - O(1) comparison speed
   - Deterministic (same data = same hash)
   - Detects any field change automatically
   - Efficient database I/O (skip writes when content unchanged)

4. **Transaction Safety**: All upserts in Prisma transaction:
   - Atomic: all succeed or all rollback
   - Prevents partial updates
   - Audit trail (ScrapeLog) created regardless of outcome

**Supabase Database Notes:**

- **Connection Pooler**: Use `DATABASE_URL` with `?pgbouncer=true` for runtime
- **Direct Connection**: Use `DIRECT_DATABASE_URL` for migrations only
- **IPv6 Only**: Supabase free tier direct connection is IPv6-only (not accessible from IPv4 systems)
- **Manual Migrations**: If `npx prisma migrate` fails, run SQL manually in Supabase SQL Editor

**Environment Variables Required:**

```bash
# Database (in .env.local)
DATABASE_URL=postgresql://postgres.niaiixwcxvkohtsmatvc:how-now-brown-cow@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_DATABASE_URL=postgresql://postgres:how-now-brown-cow@db.niaiixwcxvkohtsmatvc.supabase.co:5432/postgres

# Scraper (for Python scraper)
INGEST_API_URL=http://localhost:3000/api/internal/ingest  # or production URL
INGEST_API_SECRET=your-secret-token-here

# OpenAI (for predictions)
OPENAI_API_KEY=your-openai-key-here
```

**Testing Strategy:**

1. **Unit Tests** (90%+ coverage target):
   - Test parsers with HTML fixtures
   - Test data models with edge cases
   - Mock API calls in pipeline tests

2. **Integration Tests**:
   - Test spider → API → database flow
   - Use test database or mock API
   - Verify ScrapeLog creation

3. **E2E Tests**:
   - Run full scraper against UFCStats.com (limited events)
   - Verify data accuracy in production database
   - Check content hash change detection (idempotency)

**Known Constraints:**

- **Rate Limiting**: 3 second delay between requests (configured in settings.py)
- **Robots.txt**: Must respect UFCStats.com robots.txt (enabled in settings.py)
- **Data Freshness**: UFCStats.com updates after events conclude (not real-time)
- **Missing Data**: Some fighters may have incomplete records (handle gracefully)

**Remaining Work Estimate:**

- Phase 2 (Implementation): 3-5 days
  - Parser functions: 1-2 days
  - Unit tests: 1-2 days
  - E2E testing: 1 day

- Phase 3 (Automation): 2-3 days
  - GitHub Actions: 1 day
  - Documentation: 1 day
  - Monitoring setup: 1 day

**Total Estimated Time to Production: 5-8 days**

---

## Related Documentation

- **Architecture**: `/docs/NEW_SCRAPER_ARCHITECTURE.md` - Complete design rationale
- **Testing**: `/docs/SCRAPER_TESTING_STRATEGY.md` - Testing approach and patterns
- **Operations**: `/docs/OPERATIONS.md` - Runbooks (to be updated in Phase 3)
- **Project Structure**: `/docs/ai-context/project-structure.md` - Complete file tree
- **Scraper Setup**: `/scraper/README.md` - Python scraper usage guide

---

## Session Summary

**Session 3 Completed:** Phase 2 core parser and spider integration implementation.

Implemented complete HTML parsing and spider integration for UFCStats.com scraper:

**Parsing (90% test coverage):**
- `parse_event_list()`: Extracts 750+ events with ISO date parsing and ID generation
- `parse_event_detail()`: Extracts events, fights, and fighters with deduplication
- 680KB of HTML fixtures captured for offline testing
- 14 unit tests, 100% pass rate, 1.89s execution time
- Smoke test script validates parsing flow (752 events, 13 fights, 26 fighters)
- Edge case handling: empty tables, missing data, upcoming vs completed events

**Spider Integration (validated via integration test):**
- Limit parameter support: `scrapy crawl ufcstats -a limit=N`
- Complete workflow validated: event list → event details → item yielding
- Integration test: 83 items extracted (2 events, 27 fights, 54 fighters)
- Spider logic production-ready and fully tested

**Technical Achievements:**
- Date parsing: "Month DD, YYYY" → ISO 8601 format
- Event ID generation: URL extraction or normalized name fallback
- Fight ID generation: `{eventId}-{fighter1Id}-{fighter2Id}` composite key
- Fighter deduplication across multiple fights using set tracking
- Weight class extraction from multi-column table structure
- Spider event limiting for controlled testing

**Blocker Resolution:**
- ✅ Fixed Python 3.13 compatibility by updating pydantic to >=2.9.0
- ✅ Successfully installed Scrapy 2.13.3 on Python 3.13.9
- ✅ E2E tested with live UFCStats.com data
- ✅ Validated 40 items scraped (1 event, 26 fighters, 13 fights)

**Session 5: Fighter Profile Enhancement - COMPLETE ✅**

Integrated complete fighter profile scraping with full record data extraction:
- ✅ Updated spider to visit 26 fighter profile URLs per event
- ✅ Added `parse_fighter_profile_page()` callback method
- ✅ Merged profile data with base fighter data from event page
- ✅ All 26 fighters have complete records: wins/losses/draws fields populated
- ✅ Database verification: 100% record coverage (26/26)
- ✅ E2E test successful with 105-second execution time
- ✅ Rate limiting respected: 3-4 seconds per fighter profile

**Next Session:** Implement GitHub Actions automation for daily scraping (Phase 4)

**Status**: Phase 3 COMPLETE ✅ (Fighter Profile Enhancement with complete record data)
