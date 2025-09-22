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
- Scrapes upcoming UFC cards and fighter data from Sherdog via **Mullvad VPN integration**.
- Persists the data in PostgreSQL (SQLite for local play).
- Calls OpenAI to score finish probability, fun factor, and risk.
- Delivers a responsive, UFC-styled interface with sticky fight insights.
- Exports static JSON bundles for GitHub Pages while supporting a dynamic API on Vercel/Supabase.

> ✅ **Automated Scraping Status**: **Re-enabled with VPN support!** Scraper now uses Mullvad VPN to bypass IP blocking. Configure `MULLVAD_ACCOUNT_TOKEN` in GitHub secrets to activate.

Core repo pillars:
- **Frontend** – Next.js App Router with client components in `src/app` and modular UI widgets under `src/components`.
- **APIs** – Prisma-backed routes in `src/app/api`, including `/api/db-events` (event feed), `/api/fighter-image` (scraped imagery, currently placeholder-only), `/api/health` (system health checks), and `/api/performance` (database performance metrics).
- **Data & AI** – `src/lib/ai/hybridUFCService.ts` orchestrates scraping and prediction requests. Supporting utilities live in `src/lib`.
- **Automation** – Node scripts in `scripts/` schedule scrapes, regenerate predictions, export static JSON, and prep GitHub Pages artifacts.

## Architecture Snapshot
| Slice | Entrypoints | Notes |
| --- | --- | --- |
| UI | `src/app/page.tsx`, `src/components/**` | Fetches `/api/db-events` first, falls back to `public/data/events.json`. Sticky sidebar highlights selected fight. |
| API | `src/app/api/db-events/route.ts`, `src/app/api/fighter-image/route.ts`, `src/app/api/health/route.ts`, `src/app/api/performance/route.ts` | Prisma event feed with JSON safety guards; fighter-image route currently disabled to reduce third-party scraping noise. Health and performance monitoring endpoints for observability. |
| Data Layer | `prisma/schema.prisma`, `prisma/migrations/**` | Runs on SQLite locally and Supabase/Postgres remotely. Includes prediction usage telemetry tables. |
| Scraper & AI | `scripts/automated-scraper.js`, `src/lib/ai/hybridUFCService.ts`, `scripts/generate-*.js` | Handles scrape → diff → persist → prediction replays. Writes audit logs under `logs/`. |
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

### Automation Commands
**✅ Automated scraping is now enabled with VPN support!**

```bash
npm run scraper:check     # Run scraper locally (uses VPN if configured)
npm run scraper:status    # Summarise strike counters and pending predictions
npm run scraper:schedule  # Prepare scheduled execution metadata
npm run predict:event     # Generate AI predictions for the newest event(s)
npm run predict:all       # Regenerate predictions for every tracked fight
npm run pages:build       # Refresh GitHub Pages bundle under docs/
```

#### VPN Configuration
To enable VPN scraping, set these environment variables:
```bash
export MULLVAD_ACCOUNT_TOKEN="your_token_here"     # Required for VPN
export MULLVAD_RELAY_LOCATION="us-nyc-wg-301"      # Optional, defaults to NYC
export MULLVAD_VPN_ENABLED="true"                  # Optional, defaults to true
export MULLVAD_FALLBACK_NO_VPN="true"              # Optional, continue without VPN if setup fails
```

Scraper and prediction commands require `DATABASE_URL` and `OPENAI_API_KEY`. They also honour `SCRAPER_CANCEL_THRESHOLD` and `SCRAPER_FIGHT_CANCEL_THRESHOLD` for strike-ledger logic. Logs are written to `logs/scraper.log`, `logs/missing-events.json`, and `logs/missing-fights.json`.

For VPN setup details, see [docker/mullvad/README.md](docker/mullvad/README.md).

## Deployment
Recommended production topology:
1. **Vercel + Supabase** – Deploy the Next.js app to Vercel (`npm run build`) and point Prisma at Supabase Postgres.
2. **Secrets** – Configure `DATABASE_URL`, `OPENAI_API_KEY`, `SENTRY_*`, `NEXT_PUBLIC_SENTRY_*`, and scraper thresholds in Vercel env settings and GitHub Actions secrets.
3. **VPN-Enabled Scraper** – ✅ **Now active!** Set `MULLVAD_ACCOUNT_TOKEN` in GitHub secrets to enable automated scraping with VPN support.
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
- ✅ **TypeScript strict mode enabled** - Full type safety enforcement at build time prevents runtime errors.
- ✅ **ESLint quality gates active** - Code quality standards enforced; builds fail on violations.
- Automated testing is not yet implemented—quality assured through TypeScript compilation and linting. ROADMAP highlights next steps for test coverage.
- `docs/_next/` and `out/` store large static exports checked into git; consider pruning or generating on-demand for lighter clones.
- Secrets must never be committed. Regenerate any keys that were previously stored in version control and rely on `.env.local` going forward.

## Code Quality
```bash
npm run lint          # ESLint checks - must pass for builds
npx tsc --noEmit      # TypeScript compilation - must pass for builds
npm run build         # Full build with quality gates enabled
```
- **TypeScript**: Strict mode enabled with zero `any` types in production code
- **ESLint**: Comprehensive rules enforced at build time with strategic exceptions documented
- **Build Gates**: Both TypeScript and ESLint violations block builds (`ignoreBuildErrors: false`)

---
Licensed under the MIT License.
