# Finish Finder – Developer Overview

## Architecture at a Glance

| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind-style utility classes | Single page at `src/app/page.tsx` with server API fallback + static JSON fallback. Sentry error boundary wraps `RootLayout`. |
| API Routes | `/api/db-events` (Prisma → DB), `/api/fighter-image` (Axios + Cheerio) | Serve upcoming events, and aggregate fighter images from Tapology → UFC.com → Sherdog. |
| Data Layer | Prisma ORM (`prisma/schema.prisma`) | Currently configured for SQLite in repo; production plan migrates to Supabase Postgres. |
| Scraper | `scripts/automated-scraper.js`, `src/lib/ai/hybridUFCService.ts` | Scrapes Sherdog, reconciles events/fights, tracks missing counts, calls OpenAI predictions. |
| Monitoring | Sentry (`sentry.*.config.ts`, ErrorBoundary, API hooks) + structured logs | Events/fights missing counters recorded in `logs/missing-events.json` / `logs/missing-fights.json`. |

## Data Pipeline

1. `scripts/automated-scraper.js` fetches events from Sherdog every run (intended schedule: every 4 hours).  
   - Maintains strike counts for events and fights. Only cancels after N consecutive misses (`SCRAPER_CANCEL_THRESHOLD`, `SCRAPER_FIGHT_CANCEL_THRESHOLD`).  
   - Automatically re-generates OpenAI predictions for any new/changed fight or incomplete event analytics.
2. New data is written to Prisma tables; API route `/api/db-events` serves the structured card and sidebar content.  
3. Frontend uses `/api/db-events` in dev/production, falling back to `public/data/events.json` for GitHub Pages static deployments.
4. Fighter avatars use `/api/fighter-image` → Tapology → UFC → Sherdog fallback chain, cached client-side.

## Automation & Scripts

- `scripts/automated-scraper.js check` – main job; requires network access to `www.sherdog.com`, `tapology.com`, and `OPENAI_API_KEY`.
- `scripts/generate-event-predictions.js` / `scripts/generate-predictions-only.js` – manual prediction rebuilds for an event or across events.
- `scripts/prepare-github-pages.js` – builds static assets for GitHub Pages (`docs/` output).

## Monitoring & Logging

- Sentry DSNs must be set (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`).  
- Scraper logs warnings to `logs/scraper.log` and persists missing strike ledgers to JSON files.  
- Optional Sentry token (`SENTRY_TOKEN`) enables CLI/API access for ops automation.

## Current Limitations / To-Do

- **Database**: repo defaults to SQLite; migration to Supabase/Postgres still pending. See `docs/prisma_supabase.md`.
- **Hosting**: Next.js app currently run locally / GitHub Pages static export. Production deployment via Vercel not yet wired. See `docs/production_setup.md`.
- **Scraper Connectivity**: Sandbox lacks outbound internet; scraping and OpenAI calls require a networked host.
- **Advanced Analytics**: Only baseline AI predictions implemented. Roadmap includes pace/stylistic metrics and user feedback loop.
- **User Features**: No auth, ratings, or notification system yet.
- **Testing**: No automated tests; manual verification recommended after scraping/prediction runs.

## Helpful References

- `launch_plan.md` – staged checklist to launch the hosted version.  
- `docs/env_vars.md` – production/local environment variables.  
- `docs/production_setup.md` – recommended stack (Vercel + Supabase) and migration steps.
- `scripts/` – automation entry points.

## First Steps for a New Developer

1. Clone repo, install deps (`npm install`).  
2. Copy `.env.local` and supply `OPENAI_API_KEY`, Sentry DSNs, and (if scraping) Supabase `DATABASE_URL`.  
3. Run `npm run dev` to preview the UI.  
4. (Optional) Run the scraper with real credentials:  
   ```bash
   OPENAI_API_KEY=... DATABASE_URL=... node scripts/automated-scraper.js check
   ```
5. Review Sentry dashboard for errors; inspect `logs/missing-*.json` for strike counts.  
6. Follow `launch_plan.md` to progress toward production hosting.
