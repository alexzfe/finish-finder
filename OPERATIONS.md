# Operations

## Table of Contents
1. [Environment Variables](#environment-variables)
2. [Runbooks](#runbooks)
   - [Daily Scraper Job](#daily-scraper-job)
   - [Manual Scrape & Prediction Replay](#manual-scrape--prediction-replay)
   - [Static Export Refresh](#static-export-refresh)
   - [Database Migration](#database-migration)
3. [Observability](#observability)
4. [Incident Response](#incident-response)
5. [Backups & Data Retention](#backups--data-retention)

## Environment Variables
| Name | Scope | Description |
| --- | --- | --- |
| `DATABASE_URL` | Server / Scripts | PostgreSQL connection string. Use Supabase in production; SQLite only for local dev. |
| `DIRECT_DATABASE_URL` | Migrations | Direct database connection for Prisma migrations (bypasses connection pooling). |
| `SHADOW_DATABASE_URL` | CI / Migrations | Required for `prisma migrate deploy` on managed Postgres. |
| `INGEST_API_URL` | Python Scraper | Next.js ingestion API endpoint (e.g., `https://finish-finder.vercel.app/api/internal/ingest`). |
| `INGEST_API_SECRET` | Python Scraper | Bearer token for authenticating scraper API requests. |
| `ANTHROPIC_API_KEY` | AI Predictions (New) | Auth for Claude 3.5 Sonnet predictions (Phase 3+). Get from https://console.anthropic.com/ |
| `OPENAI_API_KEY` | AI Predictions | Auth for GPT-4o predictions (legacy + new system fallback). |
| `AI_PROVIDER` | AI Predictions (New) | AI provider to use: `anthropic` (default) or `openai`. |
| `OPENAI_PREDICTION_CHUNK_SIZE` | Scripts (Legacy) | Overrides default batch size (6 fights per OpenAI call) in old system. |
| `SENTRY_DSN` | Server | Backend Sentry project. |
| `NEXT_PUBLIC_SENTRY_DSN` | Client | Frontend Sentry project. |
| `SENTRY_TRACES_SAMPLE_RATE` | Server | Trace sample rate (0.0–1.0). |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Client | Client trace sample rate. |
| `NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE` | Client | Session replay sample rate. |
| `NEXT_PUBLIC_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE` | Client | Replay sampling on errors. |
| `SENTRY_TOKEN` | CI / Operations | Token for Sentry CLI when publishing source maps. |
| `NEXT_PUBLIC_BASE_PATH` | Client | Base path for static deployments (GitHub Pages). |

Store sensitive values in platform secret managers (Vercel, GitHub Actions, 1Password). Never commit real keys.

## Runbooks

### Daily Scraper Job
**✅ AUTOMATED SCRAPING FULLY OPERATIONAL (Python/Scrapy + UFCStats.com)**

The Python/Scrapy scraper runs automatically via GitHub Actions, scraping UFC event data from UFCStats.com and posting to the Next.js ingestion API.

**Current Setup:**
1. **AI Predictions**: `.github/workflows/ai-predictions.yml` runs daily at 1:30 AM UTC
   - Runs `scripts/ai-predictions-runner.js`
   - Finds events with missing predictions and generates them
   - Processes events with proper batching and rate limiting

2. **Data Scraping**: `.github/workflows/scraper.yml` runs daily at 2:00 AM UTC
   - Python/Scrapy spider scrapes all upcoming events from UFCStats.com
   - Source URL: `http://ufcstats.com/statistics/events/upcoming`
   - Scrapes all events by default (no limit); use `-a limit=N` to restrict
   - Extracts events, fights, and **comprehensive fighter profiles**:
     * Basic: wins/losses/draws, record, weight class
     * Physical: height, weight (lbs), reach (inches), stance, DOB
     * Striking: sig strikes/min (landed & absorbed), accuracy %, defense %
     * Grappling: takedown avg, accuracy %, defense %, submission avg
     * Win Methods: KO count, submission count, decision count
     * Calculated: finish rate, KO %, submission %, avg fight time
   - Includes fight enrichment: title fights, card position, main event flags
   - Posts to `/api/internal/ingest` with Bearer token authentication
   - Content hash change detection enables automatic event updates and stat refreshes
   - Creates ScrapeLog audit entries for monitoring

**Architecture:**
```
Python Scrapy Spider → Next.js Ingestion API → PostgreSQL Database
        ↑                       ↓
   UFCStats.com            Transaction-safe
                           upserts with SHA256
                           change detection
```

**Status:**
- **✅ Production Ready**: Complete end-to-end scraper operational
- **✅ Comprehensive Fighter Statistics**: 17 stats per fighter including striking, grappling, and win methods
- **✅ AI Prediction Foundation**: Database schema enhanced with PredictionVersion and Prediction models
- **✅ Fight Enrichment**: Title fights, card position, main event detection
- **✅ Content Hash Detection**: SHA256-based change detection for efficiency (skips unchanged fighters)
- **✅ Audit Trail**: ScrapeLog table tracks every scraper execution
- **✅ Manual Trigger**: Available via workflow_dispatch with optional event limit
- **✅ Local Testing**: Full development environment support

**For detailed scraper operations**, see `/scraper/OPERATIONS.md`

### Fighter Image Backfill

Backfill fighter images from ESPN API and Wikipedia:

```bash
cd scraper

# Set database connection
export DATABASE_URL="postgresql://user:pass@host:5432/db"

# Backfill images for fighters without photos (default: 50 at a time)
python3 scripts/backfill_fighter_images.py

# Process more fighters
python3 scripts/backfill_fighter_images.py --limit 100

# Force update existing images
python3 scripts/backfill_fighter_images.py --force

# Dry run (see what would be updated)
python3 scripts/backfill_fighter_images.py --dry-run
```

**Image Sources (in priority order):**
1. **ESPN API** - Most reliable with predictable URLs
2. **Wikipedia** - Legally safe CC-licensed images

**Current Status:**
- 188/190 fighters have images (97.7% coverage)
- Missing: Josh Hokit, Zach Reese (newer fighters without photos)

### Manual Scrape & Prediction Replay

**Manual Python Scraper Execution:**
```bash
# Via GitHub Actions (recommended)
gh workflow run scraper.yml                  # Scrape all upcoming events (default)
gh workflow run scraper.yml -f limit=1       # Test with 1 event
gh workflow run scraper.yml -f limit=5       # Test with 5 events

# Local development (requires Python 3.11+)
cd scraper
export INGEST_API_URL="https://finish-finder.vercel.app/api/internal/ingest"
export INGEST_API_SECRET="your-secret-token"

scrapy crawl ufcstats                        # All upcoming events (default)
scrapy crawl ufcstats -a limit=1             # Limit to 1 event
scrapy crawl ufcstats -s LOG_LEVEL=DEBUG     # Verbose logging
```

**Hybrid Judgment AI Predictions (Current - v3.0):**
```bash
# Set required environment variables
export DATABASE_URL="postgresql://user:pass@host:5432/db?pgbouncer=true"
export OPENAI_API_KEY="sk-..."

# Generate predictions for all fights without v3.0-hybrid predictions
npx ts-node scripts/generate-hybrid-predictions-all.ts

# The script automatically:
# - Finds fights without v3.0-hybrid predictions
# - Uses single OpenAI call per fight (structured output)
# - Calculates finish probability deterministically from attributes
# - AI judges fun score (0-100) holistically
# - Updates database with predictions and risk levels

# Cost estimates:
# - ~$0.009 per fight (single API call with structured output)
# - ~13 fights per event = $0.12 per event
# - ~4 events per month = $0.50/month total
```

**Legacy AI Prediction Systems:**
```bash
# Unified Predictions (v2.0) - Deterministic scoring for both metrics
npx ts-node scripts/unified-ai-predictions-runner.ts

# OLD SYSTEMS - Will be removed after migration
node scripts/ai-predictions-runner.js                    # Original
npx ts-node scripts/new-ai-predictions-runner.ts         # Phase 3 experimental
```

**Monitoring:**
```bash
# Check recent scraper runs
gh run list --workflow=scraper.yml --limit=10

# View specific run logs
gh run view <run-id> --log

# Watch live execution
gh run watch <run-id>
```

**For detailed troubleshooting**, see `/scraper/OPERATIONS.md`

### Scraper Monitoring

**Check ScrapeLog Database Table:**
```sql
-- View recent scraper runs
SELECT
  "startTime",
  "endTime",
  "status",
  "eventsFound",
  "fightsAdded",
  "fightsUpdated",
  "fightersAdded",
  "errorMessage"
FROM "ScrapeLog"
ORDER BY "startTime" DESC
LIMIT 10;

-- Check scraper success rate (last 7 days)
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM "ScrapeLog"
WHERE "startTime" > NOW() - INTERVAL '7 days'
GROUP BY status;
```

**Common Issues:**
- **0 events scraped**: UFCStats.com HTML structure may have changed - update parsers in `/scraper/ufc_scraper/parsers.py`
- **API authentication failures**: Verify `INGEST_API_SECRET` matches between GitHub secrets and Vercel
- **Database connection errors**: Check Supabase database status and connection string
- **High parsing errors**: Run parser tests with `pytest tests/test_parsers.py -v`

**Detailed troubleshooting guide**: See `/scraper/OPERATIONS.md`

### Static Export Refresh
```bash
npm run pages:build
```
This writes:
- `public/data/events.json` – canonical JSON feed.
- `docs/` – static Next.js export for GitHub Pages. Ensure GitHub Pages is configured to serve from `docs/` on `main`.

### Database Migration
1. Update `prisma/schema.prisma`.
2. Generate migration:
   ```bash
   npm run db:migrate
   ```
3. Apply to Prod:
   ```bash
   DATABASE_URL=... SHADOW_DATABASE_URL=... npx prisma migrate deploy
   ```
4. Confirm schema:
   ```bash
   npx prisma db pull
   ```
5. Update relevant runbooks and docs if new columns impact scraper or UI.

## Observability
- **Sentry**
  - Client: `sentry.client.config.ts` configured via `NEXT_PUBLIC_SENTRY_*`
  - Server & Edge: `sentry.server.config.ts`, `sentry.edge.config.ts` use `SENTRY_DSN`
- **Database Monitoring**
  - `ScrapeLog` table: Audit trail of all scraper executions with metrics
  - Admin dashboard: `/admin` (password: "admin123" in dev) for database performance
  - Health check: `/api/health` endpoint for system status
  - Performance metrics: `/api/performance` endpoint for query analysis
- **Logs**
  - Python scraper: Scrapy logs with configurable `LOG_LEVEL` (INFO, DEBUG, WARNING)
  - GitHub Actions: Workflow logs retained for 7 days as artifacts
  - `src/lib/monitoring/logger.ts` – use `apiLogger`, etc. for structured console output
- **Metrics** – ROADMAP recommends adding scrape duration and OpenAI usage metrics

## Incident Response
| Symptom | Checks | Remediation |
| --- | --- | --- |
| **No events in UI** | `/api/db-events` returns 500 or empty. Check Postgres availability and `ScrapeLog` table. | Run manual scrape via `gh workflow run scraper.yml -f limit=1`. Check Sentry for API errors. Static fallback available at `public/data/events.json`. |
| **Scraper returns 0 events** | Check `ScrapeLog.errorMessage` and GitHub Actions logs. | UFCStats.com HTML may have changed. Update parsers in `/scraper/ufc_scraper/parsers.py`. Run tests: `pytest tests/test_parsers.py -v`. |
| **API authentication failures** | Scraper logs show 401/403 errors. | Verify `INGEST_API_SECRET` matches in GitHub secrets and Vercel environment variables. Rotate secret if compromised. |
| **Database connection errors** | Scraper logs show "Can't reach database server". | Check Supabase database status. Verify `DATABASE_URL` in Vercel. Test connection: `node -e "require('@prisma/client').PrismaClient().$connect()"` |
| **OpenAI prediction failures** | Look for rate-limit or auth errors in AI prediction logs. | Back off for a few minutes. Verify `OPENAI_API_KEY` validity. Switch to smaller batch size: `OPENAI_PREDICTION_CHUNK_SIZE=3`. |
| **Fighter images missing** | `fighter-image` route returns placeholder. | Expected behavior. Feature disabled until rate-limiting strategy implemented. |
| **Duplicate fights in database** | Same fight appears multiple times with different `sourceUrl`. | Check `Fight.sourceUrl` uniqueness. Should be `{event_url}#fight-{fight_id}`. See `/scraper/OPERATIONS.md` for duplicate detection queries. |

## Backups & Data Retention
- **Database** – Rely on managed Postgres backups (Supabase PITR or provider snapshots). Schedule nightly exports at minimum.
- **Static Data** – `public/data/events.json` can be archived per release tag for forensic comparisons.
- **Scrape Logs** – GitHub Actions artifacts retained for 7 days. ScrapeLog database table provides long-term audit trail. Consider archiving old ScrapeLog entries (>90 days) for historical analysis.
