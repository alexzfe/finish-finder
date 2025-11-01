# Deployment Guide

## Branch Strategy

- **`main`**: Production deployment on Vercel with PostgreSQL database
- **`github-pages-static`**: Static export for GitHub Pages hosting

## Production Deployment (Vercel + Supabase)

### 1. Database Setup
**Current Production Database:**
- **Project**: `niaiixwcxvkohtsmatvc` (Supabase)
- **Region**: `aws-1-us-east-1`
- **Connection Pooler** (port 6543): For runtime (Next.js app, scraper ingestion)
- **Direct Connection** (port 5432): For migrations only

Connection strings are configured in Vercel environment variables (see step 2 below).

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
   - `SHERDOG_ENABLED`: (optional) Set to `false` for CI/deploy contexts
   - `TAPOLOGY_ENRICH_RECORDS`: (optional) Set to `true` for daily runs
   - `SLOW_QUERY_THRESHOLD_MS`: (optional) Default: 1000
   - `CRITICAL_QUERY_THRESHOLD_MS`: (optional) Default: 5000
   - `FREQUENT_QUERY_THRESHOLD`: (optional) Default: 100
   - `DISABLE_QUERY_MONITORING`: (optional) Default: false
   - `QUERY_LOGGING_VERBOSE`: (optional) Default: false

### 3. Database Migration
After deployment, run migrations to create the monitoring tables:
```bash
npx prisma migrate deploy
```

**Important**: The new query performance monitoring system requires the `query_metrics` table. Ensure this migration is applied for the admin dashboard to work:
- Migration: `20250921051500_add_query_metrics_for_monitoring`

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
Python/Scrapy scraper runs automatically via GitHub Actions daily at 2:00 AM UTC. Workflow file: `.github/workflows/scraper.yml`
```bash
# Manual trigger (GitHub CLI)
gh workflow run scraper.yml -f limit=1

# Local testing (requires Python 3.11+)
cd scraper && scrapy crawl ufcstats -a limit=1
```

### Build Configuration on Vercel
To avoid blocking deployments on lint/type errors while refactors are in progress, production builds on Vercel ignore ESLint and TypeScript errors (`next.config.ts`). Enforce `npm run lint` and `npx tsc --noEmit` in CI prior to deploys.

Future step: once lint/type cleanup is finished, revert `eslint.ignoreDuringBuilds` and `typescript.ignoreBuildErrors` to `false` to restore strict build gates on Vercel.

## ✅ Deployment Status

**Production deployment successfully completed! (Updated: 2025-11-01)**

- **Live Site**: https://finish-finder.vercel.app/
- **API Endpoints**:
  - Main Data: https://finish-finder.vercel.app/api/db-events ✅
  - Health Check: https://finish-finder.vercel.app/api/health ✅
  - Performance: https://finish-finder.vercel.app/api/performance ✅
- **Admin Dashboard**: https://finish-finder.vercel.app/admin ✅
- **Database**: New Supabase instance (`niaiixwcxvkohtsmatvc`) with 1 UFC event, 13 fights, 26 fighters
- **Architecture**: Vercel + Supabase PostgreSQL with connection pooling + monitoring
- **Data Pipeline**: Python/Scrapy scraper (UFCStats.com) → Next.js Ingestion API → PostgreSQL → API → Next.js frontend
- **Monitoring**: Real-time query performance tracking and admin dashboard
- **Recent Updates**:
  - 2025-11-01: Connected UI to new database, fixed Prisma export issue
  - 2025-11-01: Updated environment variables with new database connection strings

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
```

## Monitoring System Deployment

### Admin Dashboard Access
After migration, the admin dashboard will be available at:
- **URL**: https://finish-finder.vercel.app/admin
- **Password**: "admin123" (development mode)

### API Endpoints
- **Health Check**: `/api/health` - System status and connectivity
- **Performance**: `/api/performance` - Database query metrics and analysis

### Troubleshooting Monitoring

#### 404 Errors on New Endpoints
If monitoring endpoints return 404:
1. **Run Migration**: `npx prisma migrate deploy`
2. **Check Environment Variables**: Ensure monitoring variables are set in Vercel
3. **Force Redeploy**: Trigger new deployment in Vercel dashboard

#### Empty Monitoring Data
If admin dashboard shows no data:
1. **Generate Traffic**: Visit main site to trigger database queries
2. **Check Database**: Verify `query_metrics` table exists
3. **Environment Check**: Ensure `DISABLE_QUERY_MONITORING=false`

#### Admin Dashboard Not Loading
1. **Check Migration**: Verify database schema is updated
2. **Check Build**: Ensure no TypeScript/build errors
3. **Check Routes**: Verify `/admin` route exists in build output

### Testing Checklist
- [ ] Health endpoint responds with system status
- [ ] Performance endpoint returns metrics
- [ ] Admin dashboard loads authentication form
- [ ] Database migration applied successfully
- [ ] Monitoring data accumulates over time

# Force redeploy Sat Sep 20 04:14:09 PM -05 2025
