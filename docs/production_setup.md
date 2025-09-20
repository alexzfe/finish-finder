# Production Setup (Vercel + Supabase)

## 1. Provision Infrastructure
- **Frontend**: Create a Vercel project linked to this repo. Plan: Hobby (free).
- **Database**: Create a Supabase project; note the `DATABASE_URL` connection string.
- **Scraper Scheduler**: Options include Vercel Cron Jobs, GitHub Actions scheduled workflow, or Render Cron job hitting `scripts/automated-scraper.js`.

## 2. Configure Environment Variables
Set the following in Vercel → Project → Settings → Environment Variables:
```
DATABASE_URL
SHADOW_DATABASE_URL
OPENAI_API_KEY
SENTRY_DSN
NEXT_PUBLIC_SENTRY_DSN
SENTRY_TRACES_SAMPLE_RATE
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
SCRAPER_CANCEL_THRESHOLD
SCRAPER_FIGHT_CANCEL_THRESHOLD
```
(See `docs/env_vars.md` for details.)

## 3. Run Prisma Migrations
On your workstation (with Supabase credentials):
```bash
DATABASE_URL=... SHADOW_DATABASE_URL=... npx prisma migrate deploy
```
After the first deploy, Vercel will reuse the existing schema.

## 4. Deploy the App
```bash
npm run build
npm run start
```
Vercel will run `npm run build` automatically; ensure the environment variables are set in `Production` and `Preview`.

## 5. Schedule the Scraper
### GitHub Actions (recommended)
Create `.github/workflows/scraper.yml`:
```yaml
name: Scrape UFC Events
on:
  schedule:
    - cron: '0 */4 * * *'
  workflow_dispatch:
jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install
      - run: node scripts/automated-scraper.js check
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          SENTRY_DSN: ${{ secrets.SENTRY_DSN }}
          SCRAPER_CANCEL_THRESHOLD: 3
          SCRAPER_FIGHT_CANCEL_THRESHOLD: 2
```

(Optionally follow with `npm run pages:build` if you still publish GitHub Pages.)

## 6. Smoke Tests
- Visit the deployed Vercel URL, ensure events load.
- Trigger a manual scraper run to confirm data flows end-to-end.
- Verify Sentry receives frontend and backend events.
