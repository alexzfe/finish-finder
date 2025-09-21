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
Set up GitHub Actions or another cron service to run the scraper every 4 hours:
```bash
node scripts/automated-scraper.js check
```

## ✅ Deployment Status

**Production deployment successfully completed!**

- **Live Site**: https://finish-finder.vercel.app/
- **API Endpoints**:
  - Main Data: https://finish-finder.vercel.app/api/db-events ✅
  - Health Check: https://finish-finder.vercel.app/api/health ✅
  - Performance: https://finish-finder.vercel.app/api/performance ✅
- **Admin Dashboard**: https://finish-finder.vercel.app/admin ✅
- **Database**: 5 UFC events with 66 fights and AI predictions
- **Architecture**: Vercel + Supabase PostgreSQL with connection pooling + monitoring
- **Data Pipeline**: Sherdog scraping → PostgreSQL → API → Next.js frontend
- **Monitoring**: Real-time query performance tracking and admin dashboard

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
