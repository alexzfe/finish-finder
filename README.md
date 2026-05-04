# Finish Finder

AI-assisted UFC fight discovery built with Next.js 15, Prisma, and an automated scraping + prediction pipeline. Finish Finder ranks upcoming bouts by entertainment value using live data from a multi-source scraper and OpenAI-generated analysis, then serves the experience via a themed UFC UI.

## Table of Contents
1. [Overview](#overview)
2. [Architecture Snapshot](#architecture-snapshot)
3. [Quickstart](#quickstart)
   - [Prerequisites](#prerequisites)
   - [Setup](#setup)
   - [Run Locally](#run-locally)
   - [Database Tasks](#database-tasks)
   - [Automation Commands](#automation-commands)
4. [Deployment](#deployment)
5. [Documentation](#documentation)
6. [Project Status](#project-status)

## Overview
Finish Finder helps UFC fans pick the most electric fights. The system:
- Scrapes upcoming UFC cards and fighter data from **UFCStats.com** using a Python/Scrapy scraper.
- Persists the data in PostgreSQL (SQLite for local play).
- Calls OpenAI to score finish probability, fun factor, and risk.
- Delivers a mobile-first, responsive UFC-styled interface with optimized touch targets and sticky fight insights.
- Serves a dynamic API on Vercel/Supabase.

> ✅ **Automated Scraping Status**: **Phase 1 Complete**. Python/Scrapy scraper infrastructure deployed with content hash change detection, database schema updated, and ingestion API operational. Scraper implementation (parsers, tests) in progress.

Core repo pillars:
- **Frontend** – Next.js App Router with client components in `src/app` and modular UI widgets under `src/components`.
- **APIs** – Prisma-backed routes in `src/app/api`, including `/api/db-events` (event feed), `/api/internal/ingest` (scraper ingestion), `/api/health` (system health checks), and `/api/performance` (database performance metrics).
- **Scraper** – Python/Scrapy scraper in `/scraper` directory that crawls UFCStats.com and POSTs to the ingestion API with content hash change detection.
- **Data & AI** – `src/lib/ai/hybridUFCService.ts` orchestrates prediction requests. Supporting utilities and validation schemas live in `src/lib`.
- **Automation** – Node scripts in `scripts/` schedule scrapes and regenerate predictions.

## Architecture Snapshot
| Slice | Entrypoints | Notes |
| --- | --- | --- |
| UI | `src/app/page.tsx`, `src/components/**` | Mobile-first responsive design. Fetches `/api/db-events`. Adaptive sidebar: prominent on mobile, sticky on desktop. |
| API | `src/app/api/db-events/route.ts`, `src/app/api/fighter-image/route.ts`, `src/app/api/health/route.ts`, `src/app/api/performance/route.ts` | Prisma event feed with JSON safety guards; fighter-image route currently disabled to reduce third-party scraping noise. Health and performance monitoring endpoints for observability. |
| Data Layer | `prisma/schema.prisma`, `prisma/migrations/**` | Runs on SQLite locally and Supabase/Postgres remotely. Includes ScrapeLog audit table and scraper fields (sourceUrl, contentHash, lastScrapedAt). |
| Scraper | `scraper/ufc_scraper/`, `src/app/api/internal/ingest/route.ts`, `src/lib/scraper/validation.ts` | Python/Scrapy spider extracts data from UFCStats.com → POSTs JSON to Next.js API → Transaction-safe upserts with SHA256 change detection. Creates ScrapeLog entries for monitoring. |
| AI | `src/lib/ai/hybridUFCService.ts`, `scripts/generate-*.js` | Generates fight predictions using OpenAI GPT-4o based on scraped data. |
| Monitoring | `src/lib/monitoring/logger.ts` | Structured loggers (`apiLogger`, `scraperLogger`, etc.) for console output. |

## Quickstart

### Prerequisites
- Node.js 20.x (or newer 18+ release that supports `fetch`).
- npm 9+
- **Python 3.11+** (for web scraper)
- PostgreSQL database for persistent runs (SQLite is bundled for local exploration).
- OpenAI API key with access to `gpt-4o` (used by prediction helpers).

### Setup
```bash
npm install
cp .env.example .env.local
# populate .env.local with private keys (OpenAI, DATABASE_URL, etc.)
```

### Run Locally
```bash
npm run dev               # Start Next.js with Turbopack on http://localhost:3000
```
The app fetches `/api/db-events`; you'll need a populated `DATABASE_URL` for it to render anything.

### Database Tasks
```bash
npm run db:push           # Push Prisma schema to the configured database
npm run db:migrate        # Create + apply a local development migration
npm run db:reset          # Reset schema and reseed (destructive)
```
SQLite lives at `prisma/dev.db`. For Postgres deployments, set `DATABASE_URL` in `.env.local` or the host environment before running these commands.

### Scraper E2E (Dev) – Wikipedia/Tapology → DB
```bash
# 1) Start Postgres (or point DATABASE_URL to an existing DB)
docker compose -f docker-compose.dev.yml up -d postgres

# 2) Apply schema
npm run db:push

# 3) Run scraper (idempotent; validates data before writes)
npm run scraper:check

# 4) Optional: generate AI predictions for upcoming events
OPENAI_API_KEY=... node scripts/ai-predictions-runner.js

# 5) Verify API contract remains stable
curl -s http://localhost:3000/api/db-events | jq '.data.events[0]'
```

Troubleshooting:
- If fights are not created, ensure the DB is reachable and migrations are applied. The scraper validates fights with `eventId` injected prior to persistence.
- If you see duplicate fight ID conflicts from Wikipedia-only sources, update to latest code: Wikipedia fight IDs are event‑scoped to avoid collisions across events.

### Duplicate Event Management
The system includes enhanced deduplication to handle multi-source data conflicts:
```bash
node check-database-duplicates.js    # Analyze database for duplicates
node test-deduplication.js           # Test deduplication algorithm
node fresh-duplicate-check.js        # Quick duplicate analysis
```
For cleanup operations, see `OPERATIONS.md` for detailed instructions.

### Python Scraper Setup

```bash
# Install Python dependencies
cd scraper
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Configure environment variables
export INGEST_API_URL="http://localhost:3000/api/internal/ingest"
export INGEST_API_SECRET="your-secret-token"

# Run the scraper
scrapy crawl ufcstats
```

For detailed scraper documentation, see [`scraper/README.md`](scraper/README.md) and [`docs/NEW_SCRAPER_ARCHITECTURE.md`](docs/NEW_SCRAPER_ARCHITECTURE.md).

### Automation Commands

```bash
npm run predict:event     # Generate AI predictions for the newest event(s)
npm run predict:all       # Regenerate predictions for every tracked fight
```

Prediction commands require `DATABASE_URL` and `OPENAI_API_KEY`.

## Scraper Architecture

### Current Implementation (2025-11-01)

The scraper has been completely rebuilt using Python/Scrapy with a decoupled architecture:

**Architecture:** Python Scrapy Spider → Next.js Ingestion API → PostgreSQL Database

**Key Features:**
- **Single Data Source**: UFCStats.com exclusively (official UFC stats partner)
- **Content Hash Change Detection**: SHA256-based change detection skips unnecessary database writes
- **Transaction Safety**: All upserts wrapped in Prisma transactions for atomicity
- **Audit Trail**: ScrapeLog table tracks every scraper execution with metrics
- **Authentication**: Bearer token authentication for API security

**Implementation Status:**
- ✅ **Phase 1 Complete**: Database schema, ingestion API, and scraper infrastructure deployed
- 🔨 **In Progress**: Python spider implementation (parsers, HTML extraction, tests)
- 📋 **Planned**: GitHub Actions automation workflow

For complete architecture details, see [`docs/NEW_SCRAPER_ARCHITECTURE.md`](docs/NEW_SCRAPER_ARCHITECTURE.md).

**Archived:** Previous TypeScript multi-source scraper (Wikipedia/Tapology) moved to `/archive/scrapers-old-2025-01/` due to reliability issues and complex deduplication requirements.

## Deployment
Recommended production topology:
1. **Vercel + Supabase** – Deploy the Next.js app to Vercel (`npm run build`) and point Prisma at Supabase Postgres.
2. **Secrets** – Configure `DATABASE_URL`, `DIRECT_DATABASE_URL`, `INGEST_API_SECRET`, and `OPENAI_API_KEY` in Vercel env settings and GitHub Actions secrets.
3. **Automated Scraper** – Python/Scrapy scraper runs in GitHub Actions, POSTs to `/api/internal/ingest` endpoint.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`OPERATIONS.md`](OPERATIONS.md) for deeper diagrams, runbooks, and deployment checklists.

## Documentation

### Core Guides
- [`ARCHITECTURE.md`](ARCHITECTURE.md) – System architecture, data flows, and component overview.
- [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md) – Complete setup, development workflow, and troubleshooting.
- [`OPERATIONS.md`](OPERATIONS.md) – Runbooks for daily operations, incident response, and maintenance.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) – Deployment procedures for Vercel, database setup, and monitoring.

### Standards & Practices
- [`CONTRIBUTING.md`](CONTRIBUTING.md) – Branch strategy, code review expectations, and required checks.
- [`TESTING.md`](TESTING.md) – Testing philosophy, coverage targets, and how to add new suites.
- [`STYLEGUIDE.md`](STYLEGUIDE.md) – UI, TypeScript, and logging conventions.
- [`SECURITY.md`](SECURITY.md) – Threat model, secrets policy, and dependency hygiene.
- [`ROADMAP.md`](ROADMAP.md) – Project roadmap and planned features.

### Specialized Documentation
- [`docs/scraper/ARCHITECTURE.md`](docs/scraper/ARCHITECTURE.md) – Complete scraper guide (Python/Scrapy).
- [`docs/ai/RESEARCH.md`](docs/ai/RESEARCH.md) – AI prediction research findings and best practices.
- [`docs/AI_DOCUMENTATION_INDEX.md`](docs/AI_DOCUMENTATION_INDEX.md) – AI system documentation hub.

### Historical Archives
- Completed migrations, old handoffs, and superseded research in [`archive/docs-historical/`](archive/docs-historical/)

## Project Status
- Active prototype with production aspirations; database migrations for Supabase live under `prisma/migrations/`.
- ✅ **TypeScript + ESLint in CI** – Use `npx tsc --noEmit` and `npm run lint` in CI for quality gates.
- ⚠️ **Production build on Vercel ignores lint/type errors** – To ensure deployment continuity, `next.config.ts` opts out of blocking on lint/type errors. CI should enforce quality before deploys.
- Automated testing is not yet implemented—quality assured through TypeScript compilation and linting. ROADMAP highlights next steps for test coverage.
- `docs/_next/` and `out/` store large static exports checked into git; consider pruning or generating on-demand for lighter clones.
- Secrets must never be committed. Regenerate any keys that were previously stored in version control and rely on `.env.local` going forward.

## Code Quality
```bash
npm run lint          # ESLint checks - must pass for builds
npx tsc --noEmit      # TypeScript compilation - must pass for builds
npm run build         # Full build with quality gates enabled
```
- **TypeScript**: Strict mode; treat CI as the source of truth for blocking
- **ESLint**: Comprehensive rules; CI should block on violations
- **Build Gates**: Vercel deploys do not block on lint/type errors; use CI to enforce

Planned: Lint/Type Cleanup
- Remove remaining `any`/`require()` usage in scrapers and migrate to idiomatic ESM imports.
- Address ESLint violations to re‑enable blocking builds on Vercel (flip `ignoreBuildErrors` and `ignoreDuringBuilds` back to false).

---
Licensed under the MIT License.
