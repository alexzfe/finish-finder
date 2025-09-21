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
- **Sherdog** supplies official event and fighter metadata scraped by the automation layer.
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
     Sherdog + OpenAI APIs
```

## Runtime Components
| Layer | Responsibilities | Key Files |
| --- | --- | --- |
| **UI** | Renders events, fight cards, and sticky analysis. Handles optimistic selection state and base-path aware static fetch. | `src/app/page.tsx`, `src/components/**/*`
| **API** | Serves structured fight data from the database and (optionally) resolves fighter imagery. Includes JSON safety nets to avoid poisoning the feed. | `src/app/api/db-events/route.ts`, `src/app/api/fighter-image/route.ts`
| **Data & Domain** | Defines TypeScript and Prisma models, conversion helpers, and logging utilities that keep scraper output consistent. | `prisma/schema.prisma`, `src/types/**/*`, `src/lib/**/*`
| **Automation** | Scrapes Sherdog, reconciles DB state, replays predictions, exports static bundles, and prepares GitHub Pages artifacts. Writes strike-ledger JSON for resilience. | `scripts/automated-scraper.js`, `scripts/generate-*.js`, `scripts/export-static-data.js`, `scripts/prepare-github-pages.js`
| **Monitoring** | Wires Sentry for client/server/edge and exposes loggers with structured output for scraper ops. | `sentry.*.config.ts`, `src/lib/monitoring/logger.ts`

## Data & Control Flow
1. **Scrape** – `scripts/automated-scraper.js` runs (GitHub Action, cron, or manual). It calls `HybridUFCService` to fetch events/fights from Sherdog and stores results in the database, keeping strike counts in `logs/missing-*.json` to delay cancellations.
2. **Predict** – The scraper (or `scripts/generate-*.js`) identifies fights lacking AI fields and batches them through OpenAI using `buildPredictionPrompt`. Results update `fights` plus `predictionUsage` metrics.
3. **Serve** – The UI requests `/api/db-events`. When Postgres is reachable it returns Prisma-backed events; otherwise the frontend falls back to `public/data/events.json` (exported via `scripts/export-static-data.js`).
4. **Static Mirror** – `scripts/prepare-github-pages.js` copies the production `out/` bundle into `docs/` so GitHub Pages can host a static mirror with client-side data fetching disabled.
5. **Monitoring** – Each failure path logs to Sentry (client/server) or to the structured logger. Scraper warnings update strike ledgers but defer destructive actions until thresholds (default 3 events / 2 fights) are hit.

## External Integrations
- **Sherdog** – Primary scrape target for event schedules, fight cards, and fighter identifiers.
- **Tapology / UFC.com / Sherdog imagery** – Implemented in `fighter-image` route but currently disabled (returns placeholder) to avoid aggressive scraping until rate-limiting is solved.
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
- No automated tests or type/lint enforcement in CI; builds ignore TypeScript/ESLint errors via `next.config.ts` toggle. See [`ROADMAP.md`](ROADMAP.md) for remediation steps.
- Scraper lacks proxy rotation and will still fail if Sherdog blocks repeated requests.
- `docs/_next` and `out/` directories keep the repo large; evaluate generating on demand.
- Fighter imagery fallback logic exists but is disabled; needs rate-limit friendly implementation before re-enabling.
- Observability for scraper jobs is console/log-file only—consider centralising logs and exposing health endpoints.

## Recent Database Improvements (2025-09-20)
- ✅ **Performance indexes added** for event queries and fight joins
- ✅ **Connection pooling optimized** with singleton PrismaClient pattern
- ✅ **Query pagination implemented** to prevent unbounded results
- ✅ **Transaction safety added** to scraper operations for atomicity
- ✅ **Bulk operations optimized** for fighter/fight creation
- ✅ **JSON field validation** implemented to prevent runtime errors

See [`DATABASE_PRODUCTION_STATUS.md`](DATABASE_PRODUCTION_STATUS.md) for complete implementation details.
