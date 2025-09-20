# Deployment Guide

## Branch Strategy

- **`main`**: Production deployment on Vercel with PostgreSQL database
- **`github-pages-static`**: Static export for GitHub Pages hosting

## Production Deployment (Vercel + Supabase)

### 1. Database Setup
1. Create a Supabase project at https://supabase.com
2. Note your PostgreSQL connection string
3. Create a shadow database for migrations:
   ```sql
   CREATE DATABASE postgres_shadow;
   ```

### 2. Vercel Deployment
1. Connect your GitHub repository to Vercel
2. Set the following environment variables in Vercel:
   - `DATABASE_URL`: Your Supabase PostgreSQL connection string
   - `SHADOW_DATABASE_URL`: Shadow database connection string
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `SENTRY_DSN`: Backend Sentry DSN
   - `NEXT_PUBLIC_SENTRY_DSN`: Frontend Sentry DSN
   - `SCRAPER_CANCEL_THRESHOLD`: (optional) Default: 3
   - `SCRAPER_FIGHT_CANCEL_THRESHOLD`: (optional) Default: 2

### 3. Database Migration
After deployment, run migrations:
```bash
npx prisma migrate deploy
```

### 4. Data Population

#### Initial Data Scraping
After deployment, populate the database with UFC events and fighters:
```bash
# Scrape UFC data (works without OpenAI key)
DATABASE_URL="your_production_db_url" node scripts/test-scraper-data-only.js
```

#### AI Predictions Generation
Generate entertainment predictions for all fights:
```bash
# Generate AI predictions (requires OpenAI key)
DATABASE_URL="your_production_db_url" OPENAI_API_KEY="your_openai_key" node scripts/generate-ai-predictions.js
```

#### Automated Updates
Set up GitHub Actions or another cron service to run the scraper every 4 hours:
```bash
node scripts/automated-scraper.js check
```

## ✅ Deployment Status

**Production deployment successfully completed!**

- **Live Site**: https://finish-finder.vercel.app/
- **API Endpoint**: https://finish-finder.vercel.app/api/db-events
- **Database**: 5 UFC events with 66 fights and AI predictions
- **Architecture**: Vercel + Supabase PostgreSQL with connection pooling
- **Data Pipeline**: Sherdog scraping → PostgreSQL → API → Next.js frontend

## GitHub Pages Deployment (Static)

Switch to the `github-pages-static` branch for static hosting:
```bash
git checkout github-pages-static
npm run pages:build
git add docs/
git commit -m "Update static export"
git push
```

## Local Development

For local development, you can use either SQLite or PostgreSQL:

### SQLite (Quick Start)
```bash
# Use SQLite for local development
DATABASE_URL="file:./dev.db"
npm run dev
```

### PostgreSQL (Production-like)
```bash
# Use local PostgreSQL instance
DATABASE_URL="postgresql://user:password@localhost:5432/finish_finder"
npx prisma migrate dev
npm run dev
```# Force redeploy Sat Sep 20 04:14:09 PM -05 2025
