# Production Infrastructure Setup

## 1. Pick Hosting Providers
- **Frontend / API**: Vercel (native Next.js support, automatic builds, cron Jobs beta) or Render (service with cron jobs) are recommended.
- **Database**: Supabase or Neon for serverless PostgreSQL with generous free tiers.
- **Scraper Scheduler**: Either Vercel Cron Jobs, GitHub Actions scheduled workflow, or Render Cron Job hitting the same repo.

_Recommendation_: Vercel for the Next.js app + Supabase for PostgreSQL. GitHub Actions can run the scraper every 4 hours and trigger a deploy hook once the static export is rebuilt.

## 2. Provision PostgreSQL
1. Create a Supabase project (https://app.supabase.com/). Choose region close to your user base.
2. In Supabase → `Project Settings` → `Database`, copy the `Connection string` in `URI` format.
3. Update your `.env` / deployment secrets with:
   ```bash
   DATABASE_URL=postgresql://USER:PASSWORD@DB_HOST:5432/postgres?schema=public
   SHADOW_DATABASE_URL=postgresql://USER:PASSWORD@DB_HOST:5432/postgres_shadow?schema=public
   ```
4. Adjust `prisma/schema.prisma` provider to `provider = "postgresql"` if not already.

## 3. Run Prisma Migrations
_On your local machine with access to Supabase:_
```bash
# Generate migration files if there are outstanding schema changes
npx prisma migrate dev

# Apply existing migrations to Supabase
DATABASE_URL=... npx prisma migrate deploy

# Optional: seed or verify
DATABASE_URL=... npx prisma db pull
```
Ensure migrations run cleanly—this will be the same command the scraper host executes.

## 4. Configure Deployment Secrets
Create environment variables in Vercel/Supabase (or your chosen host):
```
DATABASE_URL
SHADOW_DATABASE_URL (only if you intend to run Prisma migrate from the host)
OPENAI_API_KEY
NEXT_PUBLIC_SENTRY_DSN
SENTRY_DSN
SCRAPER_CANCEL_THRESHOLD (optional override)
SCRAPER_FIGHT_CANCEL_THRESHOLD
```
Vercel UI: Project → Settings → Environment Variables → add per environment (Development, Preview, Production).

## 5. Build & Deploy
1. Connect GitHub repo to Vercel.
2. Set the build command to `npm run build` (handles Next.js export automatically).
3. Test a production build locally with the new `DATABASE_URL` set to ensure Prisma can reach Supabase.
4. Deploy via Vercel/GitHub integration.

## 6. Schedule the Scraper
- **GitHub Actions**: Create `.github/workflows/scrape.yml` running `node scripts/automated-scraper.js check` every 4 hours (pass DB, OpenAI, Sentry secrets).
- **Optional**: After scraping, run `node scripts/generate-event-predictions.js` or call `HybridUFCService.generateEventPredictions` to fill AI gaps.
- Trigger `npm run pages:build` and deploy hook if you continue publishing static JSON to GitHub Pages.

## 7. Smoke Test Production
- Visit production URL, ensure events load from Supabase.
- Trigger manual scraper run to verify Supabase updates and Sentry logs.
- Confirm Sentry receives events for both frontend and backend projects.

With these steps completed, the infrastructure is ready for the next tasks in the launch plan (AI backfill automation, CDN/static export strategy, etc.).
