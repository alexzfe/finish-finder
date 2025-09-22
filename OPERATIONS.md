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
| `DATABASE_URL` | Server / Scraper | PostgreSQL connection string. Use Supabase in production; SQLite only for local dev. |
| `SHADOW_DATABASE_URL` | CI / Migrations | Required for `prisma migrate deploy` on managed Postgres. |
| `OPENAI_API_KEY` | Scraper / Scripts | Auth for prediction prompts (gpt-4o). |
| `OPENAI_PREDICTION_CHUNK_SIZE` | Scraper / Scripts | Overrides default batch size (6 fights per OpenAI call). |
| `SENTRY_DSN` | Server / Scraper | Backend Sentry project. |
| `NEXT_PUBLIC_SENTRY_DSN` | Client | Frontend Sentry project. |
| `SENTRY_TRACES_SAMPLE_RATE` | Server | Trace sample rate (0.0–1.0). |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Client | Client trace sample rate. |
| `NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE` | Client | Session replay sample rate. |
| `NEXT_PUBLIC_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE` | Client | Replay sampling on errors. |
| `SENTRY_TOKEN` | CI / Operations | Token for Sentry CLI when publishing source maps. |
| `SCRAPER_CANCEL_THRESHOLD` | Scraper | Number of consecutive misses before cancelling an event (default 3). |
| `SCRAPER_FIGHT_CANCEL_THRESHOLD` | Scraper | Misses before removing a fight (default 2). |
| `NEXT_PUBLIC_BASE_PATH` | Client | Base path for static deployments (GitHub Pages). |

Store sensitive values in platform secret managers (Vercel, GitHub Actions, 1Password). Never commit real keys.

## Runbooks

### Daily Scraper Job
**✅ AUTOMATED SCRAPING ENABLED (Wikipedia-first + Tapology enrichment)**

The GitHub Actions workflow runs on schedule with Sherdog disabled to avoid CI IP blocks. Wikipedia provides events/fights; Tapology enriches fighter W‑L‑D records.

**Current Setup:**
1. **Data Scraping**: `.github/workflows/scraper.yml` runs every 4 hours
   - Runs `scripts/automated-scraper.js check`
   - Env flags: `SHERDOG_ENABLED=false`, `TAPOLOGY_ENRICH_RECORDS=true`
   - Creates events and fights without AI predictions

2. **AI Predictions**: `.github/workflows/ai-predictions.yml` runs daily at 1:30 AM UTC
   - Runs `scripts/ai-predictions-runner.js`
   - Finds events with missing predictions and generates them
   - Processes events with proper batching and rate limiting

**Status:**
- **✅ Operational**: Multi-source system running in GitHub Actions
- **✅ Wikipedia Primary**: Stable, comprehensive fight cards
- **✅ Records Enrichment**: Tapology provides fighter records in daily runs
- **🚫 Sherdog in CI**: Disabled due to IP blocking; can be used locally
- Manual trigger: **AVAILABLE** via workflow_dispatch
- Local scraping: **FUNCTIONAL** (see Manual Scrape section below)

### Manual Scrape & Prediction Replay
**✅ RECOMMENDED APPROACH WHILE AUTOMATION IS DISABLED**

```bash
# Ensure DATABASE_URL + OPENAI_API_KEY are exported in your local environment
export DATABASE_URL="your_postgres_connection_string"
export OPENAI_API_KEY="your_openai_api_key"

# Run scraper locally (avoids GitHub Actions IP blocking)
node scripts/automated-scraper.js check

# Generate predictions for events
node scripts/generate-event-predictions.js            # newest event only
node scripts/generate-predictions-only.js all         # full backfill
```

**Troubleshooting:**
- Use `node scripts/automated-scraper.js status` to inspect strike counts.
- For clean-room reruns, execute `node scripts/clear-predictions.js` followed by `node scripts/verify-predictions-cleared.js` before regenerating.
- If you get 403 errors locally (e.g., Sherdog), wait 30-60 minutes or test from a different network.

### Duplicate Event Management
**✅ ENHANCED DEDUPLICATION SYSTEM**

The system now includes comprehensive duplicate detection and cleanup capabilities to handle multi-source data conflicts.

**Database Cleanup (One-time):**
```bash
# Check for existing duplicates
DATABASE_URL="your_connection_string" node check-database-duplicates.js

# Clean up identified duplicates
DATABASE_URL="your_connection_string" npx prisma db execute --file cleanup-duplicates.sql

# Verify cleanup success
DATABASE_URL="your_connection_string" npx prisma db execute --file verify-cleanup.sql
```

**Enhanced Deduplication Algorithm:**
The scraper now includes improved duplicate detection that handles:
- UFC Fight Night naming variations (`UFC Fight Night: Fighter vs Fighter` ↔ `UFC Fight Night ### - Fighter vs Fighter`)
- Cross-source name differences between Wikipedia and Tapology
- String similarity matching (90%+ threshold for normalized names)
- Fighter name extraction and matching for same-date events
- Levenshtein distance calculation for typo detection

**Test Deduplication Logic:**
```bash
# Test the deduplication algorithm
node test-deduplication.js
```

**Monitoring for Duplicates:**
- The automated scraper now prevents duplicate creation during regular runs
- Use `fresh-duplicate-check.js` to analyze potential duplicates in production
- Check scraper logs for deduplication actions during automated runs

### AI Predictions Management
**✅ SEPARATED WORKFLOW SYSTEM**

AI predictions are now handled by a dedicated daily workflow separate from data scraping for improved reliability.

**Manual AI Predictions:**
```bash
# Generate predictions for all events missing them
OPENAI_API_KEY="your_key" DATABASE_URL="your_url" \
node scripts/ai-predictions-runner.js

# Force regenerate all predictions (including existing ones)
OPENAI_API_KEY="your_key" DATABASE_URL="your_url" \
FORCE_REGENERATE_PREDICTIONS=true node scripts/ai-predictions-runner.js

# Generate for specific event only
OPENAI_API_KEY="your_key" DATABASE_URL="your_url" \
node scripts/generate-event-predictions.js --name "UFC Event Name"
```

**AI Workflow Monitoring:**
- Check `.github/workflows/ai-predictions.yml` runs for daily execution status
- Review `logs/ai-predictions.log` for detailed prediction generation logs
- Manual trigger available via GitHub Actions workflow_dispatch
- Configurable batch size and force regeneration options

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
  - Client: `sentry.client.config.ts` configured via `NEXT_PUBLIC_SENTRY_*`.
  - Server & Edge: `sentry.server.config.ts`, `sentry.edge.config.ts` use `SENTRY_DSN`.
  - Scraper: Initialised inside automation scripts when env vars are present (TODO in ROADMAP to wire fully).
- **Logs**
  - `logs/scraper.log` – append-only log with timestamps.
  - `logs/missing-events.json` / `logs/missing-fights.json` – track absence counts.
  - `src/lib/monitoring/logger.ts` – use `scraperLogger`, `apiLogger`, etc. for structured console output.
- **Metrics** – Not yet implemented. ROADMAP recommends adding basic scrape duration and OpenAI usage metrics.

## Incident Response
| Symptom | Checks | Remediation |
| --- | --- | --- |
| **No events in UI** | `/api/db-events` returns 500 or empty. Check Postgres availability and scrape logs. | Run manual scrape. If API parsing fails, inspect `Sentry` breadcrumb and `logs/scraper.log`. Static fallback available at `public/data/events.json`. |
| **Event removed unexpectedly** | Strike ledger counts may have crossed threshold. | Lower thresholds or reset counters by deleting entry in `logs/missing-events.json`. Confirm Sherdog still lists event before reinstating manually. |
| **Sherdog 403 blocks scraper** | Scraper logs warning with code `SHERDOG_BLOCKED`. GH Actions IPs are commonly blocked. | In CI, Sherdog is disabled (`SHERDOG_ENABLED=false`). Use local scraping to test Sherdog or keep relying on Wikipedia + Tapology. |
| **OpenAI failures** | Look for rate-limit or auth errors in scraper log. | Back off for a few minutes. Verify key validity. Switch to smaller batch size by setting `OPENAI_PREDICTION_CHUNK_SIZE=3`. |
| **Fighter images missing** | `fighter-image` route currently returns placeholder. | No action required. Feature gated until rate-limiting strategy is in place. |
| **Duplicate events in UI** | Multiple events with same fighters/date visible on frontend. Check database for actual duplicates. | Run `fresh-duplicate-check.js` to identify duplicates, then use `cleanup-duplicates.sql` to remove. Enhanced deduplication should prevent new ones. |
| **Deduplication not working** | New duplicates appearing despite algorithm improvements. | Test deduplication logic with `test-deduplication.js`. Check scraper logs for algorithm execution. May need to adjust similarity thresholds. |

## Backups & Data Retention
- **Database** – Rely on managed Postgres backups (Supabase PITR or provider snapshots). Schedule nightly exports at minimum.
- **Static Data** – `public/data/events.json` can be archived per release tag for forensic comparisons.
- **Logs** – Ship `logs/*.json` and `logs/*.log` to long-term storage (S3, CloudWatch) before rotation if you need historical strike ledger context.
