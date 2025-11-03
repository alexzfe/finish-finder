# Architecture

## Table of Contents
1. [System Context](#system-context)
2. [Runtime Components](#runtime-components)
3. [Data & Control Flow](#data--control-flow)
4. [External Integrations](#external-integrations)
5. [Configuration & Environments](#configuration--environments)
6. [Known Gaps & Future Work](#known-gaps--future-work)

## System Context
Finish Finder sits between public fight data sources and UFC fans:
- **Users** interact with the Next.js frontend to browse upcoming events and dig into fight analytics.
- **Python/Scrapy scraper** extracts UFC event data from UFCStats.com (official UFC stats partner).
- **Next.js ingestion API** receives scraped data and performs transaction-safe database upserts.
- **OpenAI** generates entertainment scores, finish probabilities, and narrative summaries.
- **Supabase/Postgres** (or SQLite locally) persists events, fights, fighter profiles, and scrape audit logs.
- **Sentry** captures client, server, and API exceptions.

```
Users → Next.js App (Vercel/GitHub Pages)
            ↓ fetches
        API Routes (db-events, fighter-image, health, performance)
            ↓ Prisma ORM
      PostgreSQL / SQLite (Supabase)
            ↑ Transaction-safe upserts
        Ingestion API (/api/internal/ingest)
            ↑ HTTP POST with Bearer auth
     Python/Scrapy Spider (GitHub Actions)
            ↑ HTML parsing
        UFCStats.com (single source)

     AI Predictions (separate workflow)
            ↑
        OpenAI APIs
```

## Runtime Components
| Layer | Responsibilities | Key Files |
| --- | --- | --- |
| **UI** | Renders events, fight cards, and sticky analysis. Handles optimistic selection state and base-path aware static fetch. | `src/app/page.tsx`, `src/components/**/*`
| **API** | Serves structured fight data from the database and (optionally) resolves fighter imagery. Includes ingestion API for scraper data submission, JSON safety nets, performance monitoring, and health check endpoints. | `src/app/api/db-events/route.ts`, `src/app/api/internal/ingest/route.ts`, `src/app/api/fighter-image/route.ts`, `src/app/api/performance/route.ts`, `src/app/api/health/route.ts`
| **Data & Domain** | Defines TypeScript and Prisma models (Event, Fight, Fighter, ScrapeLog), conversion helpers, logging utilities, JSON parsing utilities, weight-class validation, scraper data validation schemas, and database performance monitoring. | `prisma/schema.prisma`, `src/types/**/*`, `src/lib/**/*`, `src/lib/utils/json.ts`, `src/lib/utils/weight-class.ts`, `src/lib/database/validation.ts`, `src/lib/database/monitoring.ts`, `src/lib/scraper/validation.ts`
| **Scraper** | Python/Scrapy spider scrapes UFCStats.com for events, fights, and fighter profiles. Includes HTML parsers, content hash change detection, and API ingestion pipeline. Runs daily via GitHub Actions. | `scraper/ufc_scraper/spiders/ufcstats.py`, `scraper/ufc_scraper/parsers.py`, `scraper/ufc_scraper/pipelines.py`, `scraper/ufc_scraper/items.py`, `.github/workflows/scraper.yml`
| **AI Predictions** | Generates fight predictions using OpenAI GPT-4o. Runs as separate daily workflow, exports static bundles, and prepares GitHub Pages artifacts. | `scripts/ai-predictions-runner.js`, `scripts/generate-*.js`, `scripts/export-static-data.js`, `scripts/prepare-github-pages.js`, `.github/workflows/ai-predictions.yml`
| **Monitoring** | Wires Sentry for client/server/edge and exposes loggers with structured output. ScrapeLog table provides audit trail of scraper executions. Provides database performance monitoring, health checks, and admin dashboard. | `sentry.*.config.ts`, `src/lib/monitoring/logger.ts`, `src/app/admin/`, `src/components/admin/`, `prisma/schema.prisma` (ScrapeLog model)

## Data & Control Flow
1. **Scrape** – Python/Scrapy spider runs daily at 2:00 AM UTC via GitHub Actions (`.github/workflows/scraper.yml`). It crawls UFCStats.com event listings, extracts fight details and fighter profiles, then POSTs JSON payloads to `/api/internal/ingest` with Bearer token authentication. The ingestion API validates data with Zod schemas, performs SHA256 content hash comparison to detect changes, and executes transaction-safe upserts to Postgres. Creates `ScrapeLog` audit entries for monitoring. Spider can be triggered manually with optional event limit.
2. **Predict** – Separate AI predictions workflow (`.github/workflows/ai-predictions.yml`) runs daily at 1:30 AM UTC. Script `scripts/ai-predictions-runner.js` identifies fights lacking AI predictions and batches them through OpenAI using `buildPredictionPrompt`. Results update `fights` table with entertainment scores and finish probabilities, plus `predictionUsage` metrics.
3. **Serve** – The UI requests `/api/db-events`. When Postgres is reachable it returns Prisma-backed events with fight enrichment data (title fights, card position, main event flags); otherwise the frontend falls back to `public/data/events.json` (exported via `scripts/export-static-data.js`).
4. **Static Mirror** – `scripts/prepare-github-pages.js` copies the production `out/` bundle into `docs/` so GitHub Pages can host a static mirror with client-side data fetching disabled.
5. **Monitoring** – Each failure path logs to Sentry (client/server) or to the structured logger. Scraper executions tracked in `ScrapeLog` table with status, event counts, and error messages. Database operations are automatically tracked via Prisma middleware for performance analysis.
6. **Performance Tracking** – All database queries are monitored in real-time, with slow/critical query detection and health scoring. Admins can access performance data via `/api/health`, `/api/performance`, or the dashboard at `/admin`.

## External Integrations
- **UFCStats.com** – Single authoritative data source for all UFC events, fights, and fighter profiles. Official UFC stats partner with consistent HTML structure. Python/Scrapy spider respects robots.txt and implements 3-second request delays.
- **Next.js Ingestion API** – Internal API endpoint (`/api/internal/ingest`) receives scraped data from Python spider. Secured with Bearer token authentication (`INGEST_API_SECRET`). Validates incoming data with Zod schemas before database writes.
- **Fighter imagery** – Implemented in `fighter-image` route but currently disabled (returns placeholder) to avoid aggressive scraping until rate-limiting is solved.
- **OpenAI (gpt-4o)** – Generates fight entertainment analysis; chunk size configurable via `OPENAI_PREDICTION_CHUNK_SIZE`.
- **Sentry** – Error and performance monitoring for UI, API, and edge functions.
- **GitHub Actions** – Schedules daily scraper runs (2:00 AM UTC) and AI predictions (1:30 AM UTC). Publishes static exports to GitHub Pages.
- **Supabase PostgreSQL** – Managed database with connection pooling. Uses `DATABASE_URL` for runtime, `DIRECT_DATABASE_URL` for migrations.

## Configuration & Environments
- **Environment Variables** – See `.env.example` and [`OPERATIONS.md`](OPERATIONS.md) for full list. Critical variables include `DATABASE_URL`, `DIRECT_DATABASE_URL`, `INGEST_API_URL`, `INGEST_API_SECRET`, `OPENAI_API_KEY`, `SENTRY_*`, and `NEXT_PUBLIC_BASE_PATH`.
- **Profiles** –
  - *Local* – SQLite at `prisma/dev.db`; optional `.env.local` overrides; static data fallback works without external services. Python scraper requires `INGEST_API_URL` and `INGEST_API_SECRET` for local testing.
  - *Sandbox / CI* – GitHub Actions runs Python scraper with secrets injected (`INGEST_API_URL`, `INGEST_API_SECRET`). Separate AI predictions workflow uses `DATABASE_URL` and `OPENAI_API_KEY`.
  - *Production* – Vercel hosting with Supabase PostgreSQL; Python scraper runs in GitHub Actions; static mirror optionally lives on GitHub Pages from `docs/`.
- **Feature Flags** – None presently. Image lookup effectively toggled off via early return in `fighter-image` route.

## Known Gaps & Future Work
- ✅ **Python/Scrapy scraper complete** - Production-ready scraper with UFCStats.com as single authoritative source, complete fighter profiles, fight enrichment, and automated daily runs
- ✅ **TypeScript safety improved** - Replaced `any` types with `unknown`, added type guards for safer runtime handling
- ✅ **Repository size optimized** - Build artifacts removed from git tracking, reducing clone size by ~2.4MB
- ✅ **Local development setup** - Docker Compose and environment documentation for easy onboarding
- ✅ **TypeScript strict mode** - Full compilation enforcement enabled in production; builds fail on type errors (`ignoreBuildErrors: false`)
- ✅ **ESLint enforcement** - Quality standards enforced at build time; strategic `any` types documented with disable comments (`ignoreDuringBuilds: false`)
- ✅ **Scraper audit trail** - ScrapeLog table tracks all scraper executions with metrics and error logging
- No automated tests in CI; builds now enforce TypeScript/ESLint quality gates. See [`ROADMAP.md`](ROADMAP.md) for test suite implementation.
- Fighter imagery fallback logic exists but is disabled; needs rate-limit friendly implementation before re-enabling.
- **Secret hygiene** - Leaked tokens in history need rotation (Sentry/OpenAI/Google). See ROADMAP for remediation plan.

## Recent Database Improvements (2025-09-20 & 2025-09-21)
- ✅ **Performance indexes added** for event queries and fight joins
- ✅ **Connection pooling optimized** with singleton PrismaClient pattern
- ✅ **Query pagination implemented** to prevent unbounded results
- ✅ **Transaction safety added** to scraper operations for atomicity
- ✅ **Bulk operations optimized** for fighter/fight creation
- ✅ **JSON field validation** implemented to prevent runtime errors
- ✅ **Query performance monitoring** with real-time dashboard and health checks
- ✅ **Admin interface** for database performance visualization and management
- ✅ **Comprehensive observability** with metrics collection and alerting

See [`DATABASE_PRODUCTION_STATUS.md`](DATABASE_PRODUCTION_STATUS.md) for complete implementation details.

## Enhanced Fighter Statistics & AI Prediction System (2025-11-02)

### Database Schema Enhancements
Added comprehensive fighter statistics from UFCStats.com to support advanced AI predictions:

**New Fighter Fields (26 statistics total):**
- **Physical Attributes**: `weightLbs`, `reachInches`, `stance`, `dob`
- **Striking Stats**: `significantStrikesLandedPerMinute`, `strikingAccuracyPercentage`, `significantStrikesAbsorbedPerMinute`, `strikingDefensePercentage`
- **Grappling Stats**: `takedownAverage`, `takedownAccuracyPercentage`, `takedownDefensePercentage`, `submissionAverage`
- **Win Methods**: `winsByKO`, `winsBySubmission`, `winsByDecision`
- **Loss Methods**: `lossesByKO`, `lossesBySubmission`, `lossesByDecision` (for defensive analysis)
- **Fight Averages**: `averageFightTimeSeconds`
- **Calculated Win Stats**: `finishRate`, `koPercentage`, `submissionPercentage` (derived from win methods)
- **Calculated Loss Stats**: `lossFinishRate`, `koLossPercentage`, `submissionLossPercentage` (defensive metrics)

**New AI Prediction Tracking Models:**
```prisma
model PredictionVersion {
  // Tracks different prompt iterations with accuracy metrics
  version             String   @unique
  finishPromptHash    String   // SHA256 of finish probability prompt
  funScorePromptHash  String   // SHA256 of fun score prompt
  finishAccuracy      Float?   // % of correct predictions
  brierScore          Float?   // Calibration score for probabilities
  funScoreCorrelation Float?   // Correlation with FOTN awards
}

model Prediction {
  // Individual fight predictions with full reasoning
  fightId             String
  versionId           String
  finishProbability   Float    // 0-1 (0-100%)
  finishConfidence    Float    // 0-1
  finishReasoning     Json     // Chain-of-thought steps
  funScore            Float    // 0-100
  funBreakdown        Json     // Score breakdown by factor
  actualFinish        Boolean? // Actual outcome for evaluation
}
```

### Enhanced Scraper (Python/Scrapy)
Updated `parse_fighter_profile()` function to extract all 17 statistics from UFCStats.com:

**Helper Functions Added:**
- `_parse_percentage()` - Converts "50%" → 0.5
- `_parse_time_to_seconds()` - Converts "5:00" → 300 seconds
- `_parse_int()` / `_parse_float()` - Safe numeric parsing with error handling
- `_parse_fight_history()` - Extracts win AND loss methods from fight history table for comprehensive offensive/defensive metrics

**Data Flow:**
1. Scraper visits fighter profile page on UFCStats.com
2. Extracts all available stats using CSS selectors and labels
3. Calculates derived stats (finish rate, KO%, sub%)
4. Computes content hash of fighter data
5. API checks if fighter exists and if stats changed
6. Only updates database if content hash differs (avoids unnecessary writes)

**Files Modified:**
- `scraper/ufc_scraper/parsers.py` - Enhanced parser with 17 stat fields
- `scraper/ufc_scraper/items.py` - Updated FighterItem schema
- `src/lib/scraper/validation.ts` - Extended Zod validation schemas
- `src/app/api/internal/ingest/route.ts` - Saves all new fighter fields

**Database Optimization:**
- Fighters stored separately with `sourceUrl` as unique key
- Content hashing prevents redundant updates (only write if stats changed)
- `lastScrapedAt` timestamp tracks freshness
- Foreign keys maintain referential integrity between fights and fighters

### AI Prediction Implementation Plan
Complete implementation plan stored in `/docs/AI_PREDICTION_IMPLEMENTATION_PLAN.md`:

**Architecture**: Two-prompt approach
- **Prompt A**: Finish Probability (0-100%) with 4-step chain-of-thought reasoning
- **Prompt B**: Fun Score (0-100) with weighted factor analysis

**Phase 1 Complete** (Database & Scraper):
- ✅ Database schema with 17 new fighter stats
- ✅ PredictionVersion and Prediction tracking models
- ✅ Enhanced scraper extracting full statistics
- ✅ Validation schemas and API ingestion updated
- ✅ Tested with real UFCStats.com data (26 fighters scraped successfully)

**Phase 2 Complete** (AI Prompt Templates):
- ✅ Weight class base rates lookup (`src/lib/ai/prompts/weightClassRates.ts`)
- ✅ Finish probability prompt with 4-step chain-of-thought reasoning
- ✅ Fun score prompt with weighted factor analysis (40% pace, 30% secondary, 20% style, 10% context)
- ✅ Fighter style classification helper (`striker`, `wrestler`, `grappler`, `balanced`)
- ✅ Complete TypeScript interfaces with full type safety
- ✅ Example usage and database mapper functions

**Phase 3 Complete** (Prediction Service & Runner):
- ✅ NewPredictionService class with Anthropic Claude and OpenAI support (`src/lib/ai/newPredictionService.ts`)
- ✅ 1-fight-per-call architecture for maximum quality (can batch later if needed)
- ✅ Retry logic with exponential backoff (3 attempts, 1s → 2s → 4s delays)
- ✅ JSON parsing with markdown code block handling and comprehensive validation
- ✅ Token and cost tracking ($0.02-0.04 per fight, ~$2/month for 4 events)
- ✅ Prediction runner script with version management (`scripts/new-ai-predictions-runner.ts`)
- ✅ SHA256 hash-based prompt versioning for A/B testing
- ✅ Command line interface: `--dry-run`, `--force`, `--event-id=<id>`
- ✅ **Risk Level Calculation** - Automatically derives Fight.riskLevel from AI confidence scores:
  - `calculateRiskLevel()` function averages finish + fun confidence scores
  - Maps confidence to risk: High confidence (≥0.7) → "low" risk, Medium (0.4-0.7) → "balanced", Low (<0.4) → "high"
  - Populated automatically when predictions are generated
  - Displayed in UI "Risk Profile" section (`src/components/fight/FightDetailsModal.tsx:97-100`)
- ✅ Progress tracking and error handling with detailed metrics logging
- ✅ Tested with dry-run: 51 fights found across 4 upcoming events

**Next Phases**:
- Phase 4: Implement evaluation system with accuracy tracking (Brier score, finish accuracy, fun score correlation)
- Phase 5: Deploy to production and establish continuous improvement loop with monthly prompt optimization

See [`/docs/AI_PREDICTION_IMPLEMENTATION_PLAN.md`](docs/AI_PREDICTION_IMPLEMENTATION_PLAN.md) for complete technical specification.

## TypeScript Strict Mode Migration (2025-09-21)
- ✅ **Build quality gates enabled** - TypeScript and ESLint errors now block builds in production
- ✅ **Strategic any types documented** - All framework integration `any` usage justified with ESLint disable comments
- ✅ **Vercel deployment validated** - Production builds successfully pass strict type checking
- ✅ **ESLint configuration optimized** - Build artifacts and legacy code excluded from quality checks

See [`TYPESCRIPT_MIGRATION_PLAN.md`](TYPESCRIPT_MIGRATION_PLAN.md) for complete migration details.

## JSON Parsing & Error Handling Infrastructure (2025-09-21)
- ✅ **Vitest test suite implemented** - 60 comprehensive tests covering JSON utilities, weight-class validation, and database validation
- ✅ **JSON utilities with error handling** - parseJsonArray, parseJsonSafe, stringifyJsonSafe with graceful fallbacks and console warning logging
- ✅ **Weight class validation & normalization** - Handles common scraping variations (LHW → light_heavyweight, case normalization, women's divisions)
- ✅ **Database input validation** - Type checking and error accumulation for fight/fighter data with realistic test scenarios
- ✅ **99.06% test coverage achieved** - Far exceeding the 60% target on tested src/lib modules
- ✅ **API route refactoring** - db-events route now uses centralized JSON parsing utilities

### Key Utility Functions
- **JSON Parsing**: `src/lib/utils/json.ts:parseJsonArray` - Safely parses database JSON with fallback to empty arrays
- **Weight Class Validation**: `src/lib/utils/weight-class.ts:toWeightClass` - Normalizes weight class variations from scraped data
- **Database Validation**: `src/lib/database/validation.ts:validateFightData` - Validates fight objects with comprehensive error reporting

## Python/Scrapy UFC Scraper (2025-11-01)
- ✅ **Production-ready scraper** - Complete Python/Scrapy implementation with UFCStats.com as single authoritative source
- ✅ **Complete fighter profiles** - Extracts wins, losses, draws from fighter profile pages (100% coverage)
- ✅ **Fight enrichment data** - Title fights detection, card position assignment, main event identification
- ✅ **Content hash change detection** - SHA256-based comparison prevents unnecessary database writes
- ✅ **Transaction-safe upserts** - All database operations wrapped in Prisma transactions for atomicity
- ✅ **Comprehensive audit trail** - ScrapeLog table tracks every execution with metrics and error logging
- ✅ **Automated daily runs** - GitHub Actions workflow at 2:00 AM UTC with manual trigger support
- ✅ **90% test coverage** - Comprehensive unit tests with HTML fixtures for offline testing

### Scraper Architecture
- **Event List Parsing**: `scraper/ufc_scraper/parsers.py:parse_event_list` - Extracts 750+ events from UFCStats.com
- **Event Detail Parsing**: `scraper/ufc_scraper/parsers.py:parse_event_detail` - Extracts fights, fighters, and metadata
- **Fighter Profile Parsing**: `scraper/ufc_scraper/parsers.py:parse_fighter_profile` - Extracts complete fighter records
- **Fight Enrichment**: `scraper/ufc_scraper/parsers.py:enrich_fight_data` - Adds title fight, card position, main event flags
- **API Ingestion**: `src/app/api/internal/ingest/route.ts` - Validates and persists scraped data
- **Data Validation**: `src/lib/scraper/validation.ts` - Zod schemas for type-safe data contracts
- **Test Suite**: `scraper/tests/test_parsers.py` - 14 tests with 90% coverage
- **Operations Guide**: `/scraper/OPERATIONS.md` - Comprehensive troubleshooting and monitoring runbook
