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
- **Multi-source scraping system** with intelligent fallback (Sherdog → Wikipedia → Tapology) supplies event and fighter metadata.
- **OpenAI** generates entertainment scores, finish probabilities, and narrative summaries.
- **Supabase/Postgres** (or SQLite locally) persists events, fights, and prediction telemetry.
- **Sentry** captures client, server, and scraper exceptions.

```
Users → Next.js App (Vercel/GitHub Pages)
            ↓ fetches
        API Routes (db-events, fighter-image)
            ↓ Prisma ORM
      PostgreSQL / SQLite
            ↑
   Automated Scraper + AI predictions
            ↑
   Multi-source: Sherdog → Wikipedia → Tapology
            ↑
        OpenAI APIs
```

## Runtime Components
| Layer | Responsibilities | Key Files |
| --- | --- | --- |
| **UI** | Renders events, fight cards, and sticky analysis. Handles optimistic selection state and base-path aware static fetch. | `src/app/page.tsx`, `src/components/**/*`
| **API** | Serves structured fight data from the database and (optionally) resolves fighter imagery. Includes JSON safety nets to avoid poisoning the feed. Provides performance monitoring and health check endpoints. | `src/app/api/db-events/route.ts`, `src/app/api/fighter-image/route.ts`, `src/app/api/performance/route.ts`, `src/app/api/health/route.ts`
| **Data & Domain** | Defines TypeScript and Prisma models, conversion helpers, logging utilities, JSON parsing utilities, weight-class validation, and database performance monitoring that keep scraper output consistent. | `prisma/schema.prisma`, `src/types/**/*`, `src/lib/**/*`, `src/lib/utils/json.ts`, `src/lib/utils/weight-class.ts`, `src/lib/database/validation.ts`, `src/lib/database/monitoring.ts`
| **Automation** | Scrapes Sherdog, reconciles DB state, replays predictions, exports static bundles, and prepares GitHub Pages artifacts. Writes strike-ledger JSON for resilience. | `scripts/automated-scraper.js`, `scripts/generate-*.js`, `scripts/export-static-data.js`, `scripts/prepare-github-pages.js`
| **Monitoring** | Wires Sentry for client/server/edge and exposes loggers with structured output for scraper ops. Provides database performance monitoring, health checks, and admin dashboard. | `sentry.*.config.ts`, `src/lib/monitoring/logger.ts`, `src/app/admin/`, `src/components/admin/`

## Data & Control Flow
1. **Scrape** – `scripts/automated-scraper.js` runs (GitHub Action, cron, or manual). It calls `HybridUFCService` to fetch events/fights using multi-source fallback (Sherdog → Wikipedia → Tapology) and stores results in the database, keeping strike counts in `logs/missing-*.json` to delay cancellations.
2. **Predict** – The scraper (or `scripts/generate-*.js`) identifies fights lacking AI fields and batches them through OpenAI using `buildPredictionPrompt`. Results update `fights` plus `predictionUsage` metrics.
3. **Serve** – The UI requests `/api/db-events`. When Postgres is reachable it returns Prisma-backed events; otherwise the frontend falls back to `public/data/events.json` (exported via `scripts/export-static-data.js`).
4. **Static Mirror** – `scripts/prepare-github-pages.js` copies the production `out/` bundle into `docs/` so GitHub Pages can host a static mirror with client-side data fetching disabled.
5. **Monitoring** – Each failure path logs to Sentry (client/server) or to the structured logger. Scraper warnings update strike ledgers but defer destructive actions until thresholds (default 3 events / 2 fights) are hit. Database operations are automatically tracked via Prisma middleware for performance analysis.
6. **Performance Tracking** – All database queries are monitored in real-time, with slow/critical query detection and health scoring. Admins can access performance data via `/api/health`, `/api/performance`, or the dashboard at `/admin`.

## External Integrations
- **Multi-source scraping** – Primary: Sherdog for event schedules and fight cards. Fallback: Wikipedia for comprehensive event and fighter data extraction. Tertiary: Tapology for basic event information.
- **VPN capability** – Mullvad VPN integration available via Docker for bypassing IP blocks (currently disabled, relying on fallback sources).
- **Fighter imagery** – Implemented in `fighter-image` route but currently disabled (returns placeholder) to avoid aggressive scraping until rate-limiting is solved.
- **OpenAI (gpt-4o)** – Generates fight entertainment analysis; chunk size configurable via `OPENAI_PREDICTION_CHUNK_SIZE`.
- **Sentry** – Error and performance monitoring for UI, API, edge functions, and scraper tasks.
- **GitHub Actions** – Schedules scraper runs with Docker and publishes static exports to Pages.

## Configuration & Environments
- **Environment Variables** – See `.env.example` and [`OPERATIONS.md`](OPERATIONS.md) for full list. Critical variables include `DATABASE_URL`, `OPENAI_API_KEY`, `SENTRY_*`, `NEXT_PUBLIC_BASE_PATH`, and scraper thresholds.
- **Profiles** –
  - *Local* – SQLite at `prisma/dev.db`; optional `.env.local` overrides; static data fallback works without external services.
  - *Sandbox / CI* – GitHub Actions builds Docker image and runs scraper with secrets injected. Prisma migrations rely on Postgres when available.
  - *Production* – Vercel hosting with Supabase; static mirror optionally lives on GitHub Pages from `docs/`.
- **Feature Flags** – None presently. Image lookup effectively toggled off via early return in `fighter-image` route.

## Known Gaps & Future Work
- ✅ **TypeScript safety improved** - Replaced `any` types with `unknown`, added type guards for safer runtime handling
- ✅ **Repository size optimized** - Build artifacts removed from git tracking, reducing clone size by ~2.4MB
- ✅ **Local development setup** - Docker Compose and environment documentation for easy onboarding
- ✅ **TypeScript strict mode** - Full compilation enforcement enabled in production; builds fail on type errors (`ignoreBuildErrors: false`)
- ✅ **ESLint enforcement** - Quality standards enforced at build time; strategic `any` types documented with disable comments (`ignoreDuringBuilds: false`)
- No automated tests in CI; builds now enforce TypeScript/ESLint quality gates. See [`ROADMAP.md`](ROADMAP.md) for test suite implementation.
- Scraper lacks proxy rotation and will still fail if Sherdog blocks repeated requests.
- Fighter imagery fallback logic exists but is disabled; needs rate-limit friendly implementation before re-enabling.
- Observability for scraper jobs is console/log-file based; database performance monitoring now available via admin dashboard.

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
