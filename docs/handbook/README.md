# Finish Finder – Developer Handbook

This handbook consolidates the key reference material for working on Finish Finder. It replaces the older individual docs (`NEW_DEVELOPER_OVERVIEW`, `env_vars`, `prisma_supabase`, and `production_setup`).

---

## 1. Architecture Overview

| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend | **Next.js 15 (App Router)**, TypeScript, Tailwind-style utility classes | Main screen lives in `src/app/page.tsx`. Uses `/api/db-events` with fallback to `public/data/events.json` for GitHub Pages. Wrapped in `Sentry.ErrorBoundary`. |
| API Routes | `/api/db-events`, `/api/fighter-image` | Prisma-backed events endpoint plus fighter image AP that falls back Tapology → UFC.com → Sherdog. |
| Data Layer | Prisma ORM (`prisma/schema.prisma`) | SQLite in repo for dev; production plan is Supabase Postgres. |
| Scraper | `scripts/automated-scraper.js`, `src/lib/ai/hybridUFCService.ts` | Scrapes Sherdog, reconciles events/fights, tracks missing counts, and triggers OpenAI predictions for new/changed fights. |
| Monitoring | Sentry (`sentry.*.config.ts`, ErrorBoundary, API hooks) + structured logs | Strike ledgers stored in `logs/missing-events.json` / `logs/missing-fights.json`; Sentry captures client/server/scraper issues. |

### Data Flow
1. **Scraper run** (`node scripts/automated-scraper.js check`): fetches upcoming events, updates Prisma, increments strike counters, and regenerates predictions when required.
2. **Prediction backfill** happens automatically within the scraper (or via `scripts/generate-event-predictions.js` for manual runs) when fights lack AI data.
3. **Frontend** consumes `/api/db-events` (Prisma) or falls back to static JSON for GitHub Pages.
4. **Fighter imagery** retrieved lazily by `/api/fighter-image` with Tapology → UFC → Sherdog fallback plus client caching.

---

## 2. Environment & Secrets

| Variable | Scope | Description |
| --- | --- | --- |
| `DATABASE_URL` | Server | Prisma connection string (Supabase recommended in production). |
| `SHADOW_DATABASE_URL` | Server | Optional shadow DB used by Prisma migrate in hosted CI. |
| `OPENAI_API_KEY` | Server | Required for scraper and prediction scripts. |
| `SENTRY_DSN` | Server | Backend Sentry DSN (`finish-finder_backend`). |
| `NEXT_PUBLIC_SENTRY_DSN` | Client | Frontend Sentry DSN (`finish-finder_frontend`). |
| `SENTRY_TRACES_SAMPLE_RATE` | Server | Backend tracing sample rate (default 0.2). |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Client | Frontend tracing sample rate (default 0.1). |
| `SCRAPER_CANCEL_THRESHOLD` | Server | Misses before an event is auto-cancelled (default 3). |
| `SCRAPER_FIGHT_CANCEL_THRESHOLD` | Server | Misses before a fight is removed (default 2). |
| `NEXT_PUBLIC_BASE_PATH` | Client | Base path when exporting to GitHub Pages. |
| `SENTRY_TOKEN` | Ops | Personal/org token for Sentry CLI/API automation. |

See `.env.example` for a ready-made template. Local developers typically copy it to `.env.local` and fill in secrets.

---

## 3. Database & Migrations

1. **Switch Prisma to Postgres** when moving off SQLite:
   ```diff
   datasource db {
-    provider = "sqlite"
-    url      = "file:./dev.db"
+    provider = "postgresql"
+    url      = env("DATABASE_URL")
   }
   ```
2. **Create Supabase shadow DB** (needed for Prisma migrate deploy):
   ```sql
   create database postgres_shadow;
   ```
3. **Run migrations**:
   ```bash
   npx prisma migrate dev              # optional, generates new migration
   DATABASE_URL=... SHADOW_DATABASE_URL=... npx prisma migrate deploy
   ```
4. **Verify schema** with `npx prisma db pull`.
5. Update `DATABASE_URL` everywhere (Vercel, scraper cron jobs, local `.env.local`).

You can keep SQLite for development if you prefer; just ensure production builds point to Supabase.

---

## 4. Deployment Workflow (Vercel + Supabase)

1. **Provision**: Vercel project (Next.js app) + Supabase Postgres (DB + `postgres_shadow`).
2. **Configure env vars** in Vercel (Production & Preview): `DATABASE_URL`, `OPENAI_API_KEY`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, etc.
3. **Build**: `npm run build` (Vercel runs this automatically). Local `npm run dev` still works with SQLite fallback.
4. **Schedule scraper**: recommended via GitHub Actions (every 4 hours) passing the same secrets; optionally run `npm run pages:build` to refresh GitHub Pages static export.
5. **Smoke tests**: visit Vercel deployment, run scraper once, confirm Sentry captures events, and ensure strike ledgers behave as expected.

Detailed step-by-step instructions live in `launch_plan.md` if you need a project plan.

---

## 5. Automation & Monitoring

- **Scraper** (Sherdog + OpenAI): resilience logic ensures cards aren’t cancelled after a single miss; all actions logged to `logs/scraper.log`.
- **Prediction backfill**: runs automatically when fights lack descriptions/scores or when cards change.
- **Sentry**: instrumentation covers client (`NEXT_PUBLIC_SENTRY_DSN`), server (`SENTRY_DSN`), edge, and scraper warnings (via `SENTRY_TOKEN`).
- **Static export**: `npm run pages:build` writes to `/docs` for GitHub Pages hosting; optional once Vercel is live.

### Automated Scraper Scheduler
- **Container image**: build with `docker build -t finish-finder-scraper .` (uses the root `Dockerfile`, installs Prisma + ts-node, and runs the scraper in `check` mode by default).
- **Runner env vars**: provide `OPENAI_API_KEY`, `DATABASE_URL`, `SCRAPER_CANCEL_THRESHOLD`, `SCRAPER_FIGHT_CANCEL_THRESHOLD`, and optional Sentry DSNs when starting the container.
- **GitHub Actions cron**: `.github/workflows/scraper.yml` triggers the container every 4 hours (plus manual `workflow_dispatch`). Secrets/variables are pulled from repository settings so the job stays zero-cost.
- **Local dry run**: run `docker run --rm --env-file .env.local finish-finder-scraper` to verify behavior exactly as Actions will execute it.

---

## 6. Current Limitations & Backlog

- **Database**: migrations to Supabase/Postgres not committed yet.
- **Hosting**: production deployment not set up—still local/static.
- **Network**: sandboxed environments here cannot reach Sherdog/Tapology/OpenAI; real host must allow outbound HTTPS.
- **Advanced analytics**: future plans include pace/stylistic metrics and user rating feedback loops.
- **User features**: no auth, rating UI, or alerts yet.
- **Tests**: no automated test suite; rely on manual runs.

See `launch_plan.md` for staged tasks and future work items.

---

## 7. First Steps for New Developers

1. `npm install`
2. Copy `.env.example` → `.env.local`; fill in secrets (OpenAI, Sentry, DB if needed).
3. `npm run dev` – preview the UI, verify fallback data loads.
4. Provide credentials & network, then run `node scripts/automated-scraper.js check` to scrape/prune/generate predictions.
5. Review Sentry dashboards and strike ledgers to ensure monitoring is active.
6. Follow `launch_plan.md` to progress towards production hosting.
