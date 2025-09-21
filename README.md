# Finish Finder

AI-assisted UFC fight discovery built with Next.js 15, Prisma, and an automated scraping + prediction pipeline. Finish Finder ranks upcoming bouts by entertainment value using live data from Sherdog and OpenAI-generated analysis, then serves the experience via a themed UFC UI.

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
- Scrapes upcoming UFC cards and fighter data from Sherdog.
- Persists the data in PostgreSQL (SQLite for local play).
- Calls OpenAI to score finish probability, fun factor, and risk.
- Delivers a responsive, UFC-styled interface with sticky fight insights.
- Exports static JSON bundles for GitHub Pages while supporting a dynamic API on Vercel/Supabase.

Core repo pillars:
- **Frontend** – Next.js App Router with client components in `src/app` and modular UI widgets under `src/components`.
- **APIs** – Prisma-backed routes in `src/app/api`, including `/api/db-events` (event feed) and `/api/fighter-image` (scraped imagery, currently placeholder-only).
- **Data & AI** – `src/lib/ai/hybridUFCService.ts` orchestrates scraping and prediction requests. Supporting utilities live in `src/lib`.
- **Automation** – Node scripts in `scripts/` schedule scrapes, regenerate predictions, export static JSON, and prep GitHub Pages artifacts.

## Architecture Snapshot
| Slice | Entrypoints | Notes |
| --- | --- | --- |
| UI | `src/app/page.tsx`, `src/components/**` | Fetches `/api/db-events` first, falls back to `public/data/events.json`. Sticky sidebar highlights selected fight. |
| API | `src/app/api/db-events/route.ts`, `src/app/api/fighter-image/route.ts` | Prisma event feed with JSON safety guards; fighter-image route currently disabled to reduce third-party scraping noise. |
| Data Layer | `prisma/schema.prisma`, `prisma/migrations/**` | Runs on SQLite locally and Supabase/Postgres remotely. Includes prediction usage telemetry tables. |
| Scraper & AI | `scripts/automated-scraper.js`, `src/lib/ai/hybridUFCService.ts`, `scripts/generate-*.js` | Handles scrape → diff → persist → prediction replays. Writes audit logs under `logs/`. |
| Static Export | `scripts/export-static-data.js`, `scripts/prepare-github-pages.js`, `docs/` | Produces GitHub Pages snapshot with `_next` assets and pre-rendered data. |
| Monitoring | `sentry.*.config.ts`, `src/lib/monitoring/logger.ts` | Sentry is wired for client, server, and edge; logger utilities keep console output structured. |

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

### Automation Commands
```bash
npm run scraper:check     # Scrape Sherdog, diff against DB, queue predictions
npm run scraper:status    # Summarise strike counters and pending predictions
npm run scraper:schedule  # Prepare scheduled execution metadata
npm run predict:event     # Generate AI predictions for the newest event(s)
npm run predict:all       # Regenerate predictions for every tracked fight
npm run pages:build       # Refresh GitHub Pages bundle under docs/
```
Scraper and prediction commands require `DATABASE_URL` and `OPENAI_API_KEY`. They also honour `SCRAPER_CANCEL_THRESHOLD` and `SCRAPER_FIGHT_CANCEL_THRESHOLD` for strike-ledger logic. Logs are written to `logs/scraper.log`, `logs/missing-events.json`, and `logs/missing-fights.json`.

## Deployment
Recommended production topology:
1. **Vercel + Supabase** – Deploy the Next.js app to Vercel (`npm run build`) and point Prisma at Supabase Postgres.
2. **Secrets** – Configure `DATABASE_URL`, `OPENAI_API_KEY`, `SENTRY_*`, `NEXT_PUBLIC_SENTRY_*`, and scraper thresholds in Vercel env settings and GitHub Actions secrets.
3. **Automated Scraper** – Use `.github/workflows/scraper.yml` or your scheduler of choice to build the Dockerfile and run `scripts/automated-scraper.js check` every 4 hours.
4. **Static Mirror (Optional)** – After successful scrapes, run `npm run pages:build` and publish `docs/` to GitHub Pages for a static fallback.

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
- Automated testing is not yet implemented—`npm run lint` is the only guard. ROADMAP highlights next steps for coverage.
- `docs/_next/` and `out/` store large static exports checked into git; consider pruning or generating on-demand for lighter clones.
- Secrets must never be committed. Regenerate any keys that were previously stored in version control and rely on `.env.local` going forward.

---
Licensed under the MIT License.
