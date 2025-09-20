# Finish Finder Launch Plan

## 1. Infrastructure & Hosting
- Choose production hosting for the Next.js app (e.g., Vercel, Supabase, VPS).
- Provision a managed PostgreSQL database and run Prisma migrations.
- Configure environment secrets (`DATABASE_URL`, `OPENAI_API_KEY`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, etc.).

## 2. Scraper Automation
- Containerize `scripts/automated-scraper.js` so it can be run in CI/scheduler environments.
- Deploy the scraper as a scheduled job (GitHub Actions cron, Render cron job, etc.) to run every 4 hours.
- Set scraper thresholds via env vars (`SCRAPER_CANCEL_THRESHOLD`, `SCRAPER_FIGHT_CANCEL_THRESHOLD`).

## 3. AI Prompt Execution
- Extend the scraper (or a companion job) to call `HybridUFCService.generateEventPredictions` whenever new fights lack AI analysis.
- Track processed fights in Prisma (`predictionUsage` table) to avoid duplicate calls.

## 4. Static Export / CDN
- Decide whether to serve `public/data/events.json` via API or static export.
- If continuing GitHub Pages, run `npm run pages:build` post-scrape to refresh static data.

## 5. Monitoring & Ops
- Confirm Sentry DSNs and alert rules in production.
- Optionally add a health endpoint that checks DB connectivity and last scrape timestamp.

## 6. Documentation & Readiness
- Update README with deployment/scheduler instructions and sample `.env` entries.
- Add an Ops runbook describing manual scraper runs, log locations, and AI backfill triggers.

## 7. Public Launch Steps
- Soft launch on the chosen host and gather tester feedback.
- Monitor Sentry dashboards for early errors; adjust scraper thresholds if needed.
- Public announcement once data flow and UI remain stable.
