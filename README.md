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
- Scrapes upcoming UFC cards and fighter data from a **multi-source system** (Wikipedia primary → Tapology enrichment → Sherdog optional).
- Persists the data in PostgreSQL (SQLite for local play).
- Calls OpenAI to score finish probability, fun factor, and risk.
- Delivers a mobile-first, responsive UFC-styled interface with optimized touch targets and sticky fight insights.
- Exports static JSON bundles for GitHub Pages while supporting a dynamic API on Vercel/Supabase.

> ✅ **Automated Scraping Status**: **Operational (Wikipedia-first + Tapology records)**. Scraper extracts complete fight cards from upcoming UFC events via Wikipedia and enriches fighter win/loss records via Tapology. Sherdog is currently disabled in CI due to IP blocking.

Core repo pillars:
- **Frontend** – Next.js App Router with client components in `src/app` and modular UI widgets under `src/components`.
- **APIs** – Prisma-backed routes in `src/app/api`, including `/api/db-events` (event feed), `/api/fighter-image` (scraped imagery, currently placeholder-only), `/api/health` (system health checks), and `/api/performance` (database performance metrics).
- **Data & AI** – `src/lib/ai/hybridUFCService.ts` orchestrates scraping and prediction requests. Supporting utilities live in `src/lib`.
- **Automation** – Node scripts in `scripts/` schedule scrapes, regenerate predictions, export static JSON, and prep GitHub Pages artifacts.

## Architecture Snapshot
| Slice | Entrypoints | Notes |
| --- | --- | --- |
| UI | `src/app/page.tsx`, `src/components/**` | Mobile-first responsive design. Fetches `/api/db-events` first, falls back to `public/data/events.json`. Adaptive sidebar: prominent on mobile, sticky on desktop. |
| API | `src/app/api/db-events/route.ts`, `src/app/api/fighter-image/route.ts`, `src/app/api/health/route.ts`, `src/app/api/performance/route.ts` | Prisma event feed with JSON safety guards; fighter-image route currently disabled to reduce third-party scraping noise. Health and performance monitoring endpoints for observability. |
| Data Layer | `prisma/schema.prisma`, `prisma/migrations/**` | Runs on SQLite locally and Supabase/Postgres remotely. Includes prediction usage telemetry tables. |
| Scraper & AI | `scripts/automated-scraper.js`, `src/lib/ai/hybridUFCService.ts`, `src/lib/scrapers/*`, `scripts/generate-*.js` | Handles scrape → diff → persist → prediction replays. Wikipedia supplies fight cards; Tapology enriches fighter records (W-L-D). Writes audit logs under `logs/`. |
| Static Export | `scripts/export-static-data.js`, `scripts/prepare-github-pages.js`, `docs/` | Produces GitHub Pages snapshot with `_next` assets and pre-rendered data. |
| Monitoring | `sentry.*.config.ts`, `src/lib/monitoring/logger.ts`, `src/app/admin/`, `src/lib/database/monitoring.ts` | Sentry is wired for client, server, and edge; logger utilities keep console output structured. Database performance monitoring with admin dashboard at `/admin`. |

## Quickstart

### Prerequisites
- Node.js 20.x (or newer 18+ release that supports `fetch`).
- npm 9+
- PostgreSQL database for persistent runs (SQLite is bundled for local exploration).
- OpenAI API key with access to `gpt-4o` (used by prediction helpers).

### Setup
```bash
npm install
cp .env.example .env.local
# populate .env.local with private keys (OpenAI, Sentry, DATABASE_URL, etc.)
```

### Run Locally
```bash
npm run dev               # Start Next.js with Turbopack on http://localhost:3000
```
The app attempts `/api/db-events` first. Without a database it will read from `public/data/events.json`.

**Admin Dashboard**: Access database performance monitoring at `http://localhost:3000/admin` (password: "admin123" in development mode).

To view the static export:
```bash
npm run pages:build       # Regenerates docs/ and public/data snapshots
```

### Database Tasks
```bash
npm run db:push           # Push Prisma schema to the configured database
npm run db:migrate        # Create + apply a local development migration
npm run db:reset          # Reset schema and reseed (destructive)
```
SQLite lives at `prisma/dev.db`. For Postgres deployments, set `DATABASE_URL` in `.env.local` or the host environment before running these commands.

### Duplicate Event Management
The system includes enhanced deduplication to handle multi-source data conflicts:
```bash
node check-database-duplicates.js    # Analyze database for duplicates
node test-deduplication.js           # Test deduplication algorithm
node fresh-duplicate-check.js        # Quick duplicate analysis
```
For cleanup operations, see `OPERATIONS.md` for detailed instructions.

### Automation Commands
**✅ Automated scraping runs daily (Wikipedia-first).**

```bash
npm run scraper:check     # Run scraper locally
npm run scraper:status    # Summarise strike counters and pending predictions
npm run scraper:schedule  # Prepare scheduled execution metadata
npm run predict:event     # Generate AI predictions for the newest event(s)
npm run predict:all       # Regenerate predictions for every tracked fight
npm run pages:build       # Refresh GitHub Pages bundle under docs/
```

Scraper and prediction commands require `DATABASE_URL` and `OPENAI_API_KEY`. They also honour `SCRAPER_CANCEL_THRESHOLD` and `SCRAPER_FIGHT_CANCEL_THRESHOLD` for strike-ledger logic. Logs are written to `logs/scraper.log`, `logs/missing-events.json`, and `logs/missing-fights.json`.

#### Scraper flags
- `SHERDOG_ENABLED`: `true|false` (default `true` locally; CI sets `false`).
- `TAPOLOGY_ENRICH_RECORDS`: `true|false` (default `true` locally and CI; set to `false` to disable).
- `SHERDOG_MAX_RPS`: optional throttle for Sherdog when enabled.

Helper scripts:
- `npm run sherdog:test:local` – probe Sherdog org+event pages with rotated headers.
- `node scripts/test-enrich-records.js 1` – run 1 event with Tapology record enrichment.
- `node scripts/test-tapology-fighter-record.js "Fighter Name"` – fetch a single fighter record from Tapology.

For VPN setup details, see [docker/mullvad/README.md](docker/mullvad/README.md).

## Deployment
Recommended production topology:
1. **Vercel + Supabase** – Deploy the Next.js app to Vercel (`npm run build`) and point Prisma at Supabase Postgres.
2. **Secrets** – Configure `DATABASE_URL`, `OPENAI_API_KEY`, `SENTRY_*`, `NEXT_PUBLIC_SENTRY_*`, and scraper thresholds in Vercel env settings and GitHub Actions secrets.
3. **Automated Scraper** – Runs in GitHub Actions. CI disables Sherdog (`SHERDOG_ENABLED=false`) and enables Tapology record enrichment (`TAPOLOGY_ENRICH_RECORDS=true`).
4. **Static Mirror (Optional)** – After successful scrapes, run `npm run pages:build` and publish `docs/` to GitHub Pages for a static fallback.

### GitHub Actions VPN Setup
```bash
# Configure Mullvad VPN for automated scraping
gh secret set MULLVAD_ACCOUNT_TOKEN --body "your_account_token"

# Optional: customize VPN relay location
gh variable set MULLVAD_RELAY_LOCATION --body "us-nyc-wg-301"
```

See [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`OPERATIONS.md`](OPERATIONS.md) for deeper diagrams, runbooks, and deployment checklists.

## Documentation
- [`ARCHITECTURE.md`](ARCHITECTURE.md) – Context, containers, components, and key data flows.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) – Branch strategy, code review expectations, and required checks.
- [`OPERATIONS.md`](OPERATIONS.md) – Runbooks for scrapes, predictions, migrations, and incident response.
- [`TESTING.md`](TESTING.md) – Testing philosophy, coverage targets, and how to add new suites.
- [`STYLEGUIDE.md`](STYLEGUIDE.md) – UI, TypeScript, and logging conventions.
- [`SECURITY.md`](SECURITY.md) – Threat model, secrets policy, and dependency hygiene.
- [`docs/handbook/README.md`](docs/handbook/README.md) – Legacy handbook retained for reference; superseded by the documents above.

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
