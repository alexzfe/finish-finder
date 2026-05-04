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

```
Users → Next.js App (Vercel)
            ↓ fetches
        API Routes (db-events, fighter-image, health)
            ↓ Prisma ORM
      PostgreSQL (Supabase)
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
| **UI** | Renders events, fight cards, and sticky analysis. Handles optimistic selection state. | `src/app/page.tsx`, `src/components/**/*`
| **API** | Serves structured fight data from the database, resolves fighter imagery, and exposes a health check. The ingestion API receives scraper submissions, validated by Zod schemas. | `src/app/api/db-events/route.ts`, `src/app/api/internal/ingest/route.ts`, `src/app/api/fighter-image/route.ts`, `src/app/api/health/route.ts`
| **Data & Domain** | Defines TypeScript and Prisma models (Event, Fight, Fighter, Prediction, PredictionVersion, ScrapeLog), conversion helpers, JSON parsing utilities, weight-class validation, and scraper data validation schemas. | `prisma/schema.prisma`, `src/types/**/*`, `src/lib/utils/json.ts`, `src/lib/utils/weight-class.ts`, `src/lib/database/validation.ts`, `src/lib/scraper/validation.ts`, `src/lib/scraper/fightReconciler.ts`
| **Scraper** | Python/Scrapy spider scrapes UFCStats.com for events, fights, and fighter profiles. Includes HTML parsers, content hash change detection, and API ingestion pipeline. Runs daily via GitHub Actions. | `scraper/ufc_scraper/spiders/ufcstats.py`, `scraper/ufc_scraper/parsers.py`, `scraper/ufc_scraper/pipelines.py`, `scraper/ufc_scraper/items.py`, `.github/workflows/scraper.yml`
| **AI Predictions** | Per fight, a `Predictor` builds a `FightSnapshot`, calls one `LLMAdapter` (OpenAI/Anthropic), reads back qualitative attributes + AI-judged `funScore` + `confidence`, and computes `finishProbability` deterministically from those attributes. Persists through `PredictionStore` against an active `PredictionVersion`. **The system predicts entertainment value — never winners or methods.** | `src/lib/ai/predictor.ts`, `src/lib/ai/adapters/`, `src/lib/ai/snapshot.ts`, `src/lib/ai/persistence/predictionStore.ts`, `scripts/generate-hybrid-predictions-all.ts`, `.github/workflows/ai-predictions.yml`
| **Monitoring** | Structured loggers for console output. ScrapeLog table provides audit trail of scraper executions. | `src/lib/monitoring/logger.ts`, `prisma/schema.prisma` (ScrapeLog model)

## Data & Control Flow
1. **Scrape** – Python/Scrapy spider runs daily at 2:00 AM UTC via GitHub Actions (`.github/workflows/scraper.yml`). It crawls UFCStats.com event listings, extracts fight details and fighter profiles, then POSTs JSON payloads to `/api/internal/ingest` with Bearer token authentication. The ingestion API validates data with Zod schemas, performs SHA256 content hash comparison to detect changes, and executes transaction-safe upserts to Postgres. Creates `ScrapeLog` audit entries for monitoring. Spider can be triggered manually with optional event limit.
2. **Predict** – `.github/workflows/ai-predictions.yml` runs `scripts/generate-hybrid-predictions-all.ts` daily after the scraper. The runner asks `PredictionStore` for fights missing predictions for the current `PREDICTION_VERSION`, then per fight: a `Predictor` builds a `FightSnapshot`, makes one LLM call (via an injected adapter) for qualitative attributes + `funScore` (1-10 integer) + `confidence`, computes `finishProbability` deterministically from the attributes, and saves through `PredictionStore`. `PREDICTION_VERSION` is **bumped manually** whenever the prompt, deterministic math, or output contract changes — an earlier file-hashing approach produced too much version churn on cosmetic edits and was dropped.
3. **Serve** – The UI requests `/api/db-events`, which returns Prisma-backed events with fight enrichment data (title fights, card position, main event flags).
4. **Monitoring** – Failure paths log via the structured logger (`src/lib/monitoring/logger.ts`). Scraper executions tracked in `ScrapeLog` table with status, event counts, and error messages. `/api/health` exposes a basic readiness probe.

## External Integrations
- **UFCStats.com** – Single authoritative data source for all UFC events, fights, and fighter profiles. Official UFC stats partner with consistent HTML structure. Python/Scrapy spider respects robots.txt and implements 3-second request delays.
- **Next.js Ingestion API** – Internal API endpoint (`/api/internal/ingest`) receives scraped data from Python spider. Secured with Bearer token authentication (`INGEST_API_SECRET`). Validates incoming data with Zod schemas before database writes.
- **Fighter imagery** – Implemented in `fighter-image` route but currently disabled (returns placeholder) to avoid aggressive scraping until rate-limiting is solved.
- **OpenAI (gpt-4o)** – Generates fight entertainment analysis; chunk size configurable via `OPENAI_PREDICTION_CHUNK_SIZE`.
- **GitHub Actions** – Schedules daily scraper runs (2:00 AM UTC) and AI predictions (1:30 AM UTC).
- **Supabase PostgreSQL** – Managed database with connection pooling. Uses `DATABASE_URL` for runtime, `DIRECT_DATABASE_URL` for migrations.

## Configuration & Environments
- **Environment Variables** – See `.env.example` and [`OPERATIONS.md`](OPERATIONS.md) for full list. Critical variables include `DATABASE_URL`, `DIRECT_DATABASE_URL`, `INGEST_API_URL`, `INGEST_API_SECRET`, `OPENAI_API_KEY`, and `NEXT_PUBLIC_BASE_PATH`.
- **Profiles** –
  - *Local* – SQLite at `prisma/dev.db`; optional `.env.local` overrides; static data fallback works without external services. Python scraper requires `INGEST_API_URL` and `INGEST_API_SECRET` for local testing.
  - *Sandbox / CI* – GitHub Actions runs Python scraper with secrets injected (`INGEST_API_URL`, `INGEST_API_SECRET`). Separate AI predictions workflow uses `DATABASE_URL` and `OPENAI_API_KEY`.
  - *Production* – Vercel hosting with Supabase PostgreSQL; Python scraper runs in GitHub Actions.
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
- **Secret hygiene** - Leaked tokens in history need rotation (OpenAI/Google). See ROADMAP for remediation plan.

## Database Patterns
- Performance indexes on event queries and fight joins.
- Singleton `PrismaClient` (`src/lib/database/prisma.ts`) shared across API routes and scripts.
- Pagination on the events query path to bound result sets.
- Scraper writes wrapped in Prisma transactions (see `src/app/api/internal/ingest/route.ts`); fight matching/cancellation handled by `planFightReconciliation` in `src/lib/scraper/fightReconciler.ts`.
- JSON columns parsed via `src/lib/utils/json.ts` (`parseJsonArray`, etc.) with safe fallbacks.

## Enhanced Fighter Statistics

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

**Prediction tracking models** — `PredictionVersion` (one row per active prompt/math/contract revision; manually bumped via `PREDICTION_VERSION` in the runner) and `Prediction` (one row per fight per version, with `funScore` 1-10 integer, `finishProbability` 0-1, `confidence` 0-1, `actualFinish` for post-hoc evaluation). See `prisma/schema.prisma` for the canonical shape; `PredictionStore` (`src/lib/ai/persistence/predictionStore.ts`) is the only writer.

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

### Scraper Architecture
- **Event List Parsing**: `scraper/ufc_scraper/parsers.py:parse_event_list` — extracts events from UFCStats.com
- **Event Detail Parsing**: `scraper/ufc_scraper/parsers.py:parse_event_detail` — extracts fights, fighters, metadata
- **Fighter Profile Parsing**: `scraper/ufc_scraper/parsers.py:parse_fighter_profile` — extracts complete fighter records, computes UFC-only finish/loss-finish rates
- **Fight Enrichment**: `scraper/ufc_scraper/parsers.py:enrich_fight_data` — adds title-fight, card-position, main-event flags
- **API Ingestion**: `src/app/api/internal/ingest/route.ts` — validates with Zod, applies the plan from `planFightReconciliation`
- **Test Suite**: `scraper/tests/test_parsers.py` — pytest with HTML fixtures for offline testing
