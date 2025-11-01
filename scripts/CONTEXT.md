# Automation Scripts - Component Context

## Purpose

The `scripts/` directory contains **Node.js automation scripts** for Finish Finder's data pipeline orchestration, including web scraping, AI prediction generation, database maintenance, and static export for GitHub Pages.

**Key Responsibilities:**
- Orchestrate multi-source scraping (Wikipedia, Tapology) with database persistence
- Generate AI-powered fight predictions via OpenAI GPT-4
- Maintain data quality through validation, deduplication, and cleanup
- Export static JSON snapshots for offline/fallback access
- Provide manual tooling for database operations and debugging

## Current Status: Production-Operational (Nov 2025)

**Evolution Context:**
- Sep 2024: Enhanced scraper with multi-source fallback and deduplication
- Sep 2024: Separated AI predictions workflow (independent scheduling)
- Oct 2024: Strike ledger for event/fight cancellation tracking
- Oct 2024: Batch processing with connection pool throttling
- **Current**: Automated via GitHub Actions (daily scraper at 2 AM, predictions at 1:30 AM UTC)

**Status Indicators:**
- ✅ Multi-source scraping operational (Wikipedia primary, Tapology enrichment)
- ✅ AI predictions via OpenAI GPT-4 (chunked batching)
- ✅ Database validation and deduplication working
- ✅ Static export for GitHub Pages functional
- ⚠️ Strike ledger uses JSON files (not database)
- ⚠️ No automated alerting on scraper failures

## Component-Specific Development Guidelines

### Script Execution Patterns

**ES Module Convention:**
```javascript
// All scripts use ES modules (import/export)
import { PrismaClient } from '@prisma/client'
import { HybridUFCService } from '../src/lib/ai/hybridUFCService.js'

const prisma = new PrismaClient()
```

**Command-Line Interface:**
```bash
# Standard pattern: node scripts/<script>.js <command> [options]
node scripts/automated-scraper.js check
node scripts/automated-scraper.js status
node scripts/ai-predictions-runner.js generate --limit 10
```

**Environment Configuration:**
```javascript
// Load environment with validation
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL required')
}

const SCRAPER_LIMIT = parseInt(process.env.SCRAPER_LIMIT || '10')
```

### Error Handling Strategy

**Graceful Degradation:**
```javascript
try {
  const events = await scraper.scrape()
  await db.persist(events)
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    console.error('Database unavailable, retrying...')
    await retry()
  } else if (error.code === 'SHERDOG_BLOCKED') {
    console.warn('Sherdog blocked, using fallback sources')
    // Continue with partial data
  } else {
    throw error  // Fatal error
  }
}
```

**Strike Ledger Pattern:**
```javascript
// Track consecutive failures
const missingEvents = JSON.parse(fs.readFileSync('logs/missing-events.json'))
missingEvents[eventId] = (missingEvents[eventId] || 0) + 1

if (missingEvents[eventId] >= 3) {
  // Mark event as cancelled after 3 consecutive misses
  await prisma.event.update({
    where: { id: eventId },
    data: { completed: true, cancelled: true }
  })
}
```

### Database Transaction Safety

**Batch Upserts with Throttling:**
```javascript
const batchSize = 5
for (let i = 0; i < items.length; i += batchSize) {
  const batch = items.slice(i, i + batchSize)

  const operations = batch.map(item =>
    prisma.item.upsert({
      where: { id: item.id },
      update: { ...item },
      create: { ...item }
    })
  )

  await Promise.all(operations)

  // Delay between batches (avoid pool exhaustion)
  if (i + batchSize < items.length) {
    await new Promise(r => setTimeout(r, 100))
  }
}
```

**Transaction Wrapping:**
```javascript
await prisma.$transaction(async (tx) => {
  // Delete old predictions
  await tx.fight.updateMany({
    where: { eventId },
    data: { funFactor: null, finishProbability: null }
  })

  // Insert new predictions
  await tx.fight.updateMany({
    where: { id: { in: fightIds } },
    data: predictions
  })
})
```

## Major Subsystem Organization

### Directory Structure

```
scripts/
├── automated-scraper.js         # Main scraper orchestrator (1611 lines)
├── ai-predictions-runner.js     # AI prediction batch generator
├── export-static-data.js        # GitHub Pages JSON export
├── prepare-github-pages.js      # Static site build preparation
├── generate-*.js                # Various utility scripts
└── check-*.js                   # Database inspection utilities
```

### Script Responsibilities

| Script | Purpose | Scheduled | Dependencies |
|--------|---------|-----------|--------------|
| **automated-scraper.js** | Multi-source scraping + persistence | Daily 2 AM UTC | HybridUFCService, Prisma |
| **ai-predictions-runner.js** | AI prediction generation | Daily 1:30 AM UTC | OpenAI, Prisma |
| **export-static-data.js** | Static JSON export | Manual/post-deploy | Prisma |
| **prepare-github-pages.js** | GitHub Pages build | Manual/CI | None |

## Architectural Patterns

### 1. Main Scraper Orchestration

**File:** `scripts/automated-scraper.js`

**Class:** `AutomatedScraper` (lines 57-1611)

**Key Methods:**

**`checkForEventUpdates()`** (lines 57-288)
```javascript
async checkForEventUpdates() {
  console.log('Starting event update check...')

  // 1. Fetch from multi-source service
  const { events, fighters } = await this.hybridService.getUpcomingUFCEvents(
    this.scraperLimit
  )

  // 2. Validate data
  const validatedFighters = fighters.filter(f => {
    const errors = validateFighterData(f)
    if (errors.length > 0) {
      console.warn(`Invalid fighter: ${errors.join(', ')}`)
      return false
    }
    return true
  })

  // 3. Batch upsert fighters
  await this.upsertFighters(validatedFighters)

  // 4. Compare with existing events
  const existingEvents = await this.prisma.event.findMany()
  const newEvents = this.detectNewEvents(events, existingEvents)
  const modifiedEvents = this.detectModifiedEvents(events, existingEvents)
  const missingEvents = this.detectMissingEvents(events, existingEvents)

  // 5. Persist changes
  await this.persistNewEvents(newEvents)
  await this.updateModifiedEvents(modifiedEvents)
  await this.handleMissingEvents(missingEvents)

  return {
    eventsProcessed: events.length,
    newEvents: newEvents.length,
    modifiedEvents: modifiedEvents.length,
    missingEvents: missingEvents.length
  }
}
```

**`ingestFromTapology(limit)`** (lines 1014-1287)
```javascript
async ingestFromTapology(limit = 10) {
  // Tapology-first ingestion with fighter enrichment
  const tapologyEvents = await this.tapologyService.getUpcomingEvents(limit)

  // Enrich fighter records (W-L-D)
  const enrichedFighters = await this.enrichFighterRecords(fighters)

  // Persist to database
  await this.persistEvents(tapologyEvents, enrichedFighters)
}
```

**`enrichWithWikipedia(limit)`** (lines 1289-1415)
```javascript
async enrichWithWikipedia(limit = 10) {
  // Cross-reference events with Wikipedia
  const eventsWithTBA = await this.prisma.event.findMany({
    where: {
      OR: [
        { venue: { contains: 'TBA' } },
        { location: { contains: 'TBA' } }
      ]
    }
  })

  const wikipediaEvents = await this.wikipediaService.getUpcomingEvents(limit)

  // Match events by name/date similarity
  for (const dbEvent of eventsWithTBA) {
    const match = this.findMatchingEvent(dbEvent, wikipediaEvents)
    if (match) {
      await this.prisma.event.update({
        where: { id: dbEvent.id },
        data: {
          venue: match.venue,
          location: match.location
        }
      })
    }
  }
}
```

### 2. Event Deduplication & Matching

**Algorithm:** Multi-stage comparison (lines 1418-1454)

```javascript
eventsAreSame(event1, event2) {
  // Stage 1: Exact name match
  if (event1.name === event2.name) return true

  // Stage 2: Normalized name match
  const normalize = (s) => s.toLowerCase()
                            .replace(/ufc\s+/i, '')
                            .replace(/fight night/i, '')
                            .trim()

  if (normalize(event1.name) === normalize(event2.name)) return true

  // Stage 3: Date + UFC number match
  const dateDiff = Math.abs(event1.date - event2.date) / (1000 * 60 * 60 * 24)
  if (dateDiff <= 7 && event1.name.includes('UFC')) {
    const num1 = event1.name.match(/UFC\s+(\d+)/)?.[1]
    const num2 = event2.name.match(/UFC\s+(\d+)/)?.[1]
    if (num1 && num2 && num1 === num2) return true
  }

  // Stage 4: Fighter extraction (main event match)
  const fighters1 = this.extractFighters(event1)
  const fighters2 = this.extractFighters(event2)

  const commonFighters = fighters1.filter(f => fighters2.includes(f))
  return commonFighters.length >= 2  // Main event overlap
}
```

**String Similarity:** Levenshtein distance (used for fighter name matching)

```javascript
calculateStringSimilarity(str1, str2) {
  const len1 = str1.length
  const len2 = str2.length
  const matrix = []

  // Compute edit distance matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
    for (let j = 1; j <= len2; j++) {
      if (i === 0) {
        matrix[i][j] = j
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,        // deletion
          matrix[i][j - 1] + 1,        // insertion
          matrix[i - 1][j - 1] + (str1[i - 1] === str2[j - 1] ? 0 : 1)  // substitution
        )
      }
    }
  }

  const distance = matrix[len1][len2]
  const maxLen = Math.max(len1, len2)
  return 1 - (distance / maxLen)  // 0-1 similarity score
}
```

### 3. AI Prediction Generation

**File:** `scripts/ai-predictions-runner.js`

**Workflow:**
```javascript
async generatePredictions() {
  // 1. Query fights without predictions
  const fights = await prisma.fight.findMany({
    where: {
      OR: [
        { funFactor: null },
        { finishProbability: null }
      ]
    },
    include: {
      fighter1: true,
      fighter2: true,
      event: true
    }
  })

  // 2. Group by event
  const eventGroups = this.groupByEvent(fights)

  // 3. Process each event
  for (const [eventId, eventFights] of Object.entries(eventGroups)) {
    // 4. Chunk fights (default: 6 per OpenAI call)
    const chunkSize = parseInt(process.env.OPENAI_PREDICTION_CHUNK_SIZE || '6')
    const chunks = this.chunkArray(eventFights, chunkSize)

    for (const chunk of chunks) {
      // 5. Build prompt
      const prompt = buildPredictionPrompt(event.name, chunk)

      // 6. Call OpenAI
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      })

      // 7. Parse predictions
      const predictions = JSON.parse(response.choices[0].message.content)

      // 8. Update fights
      for (const prediction of predictions) {
        await prisma.fight.update({
          where: { id: prediction.fightId },
          data: {
            funFactor: prediction.funFactor,
            finishProbability: prediction.finishProbability,
            entertainmentReason: prediction.entertainmentReason,
            keyFactors: prediction.keyFactors,
            riskLevel: prediction.riskLevel
          }
        })
      }

      // 9. Track usage
      await prisma.predictionUsage.create({
        data: {
          eventId,
          fightsProcessed: chunk.length,
          chunks: chunks.length,
          tokens: response.usage.total_tokens
        }
      })
    }
  }
}
```

### 4. Strike Ledger (Event Cancellation Tracking)

**Pattern:** JSON-based state persistence

**Files:**
- `logs/missing-events.json` - Event absence tracking
- `logs/missing-fights.json` - Fight removal tracking

**Logic:**
```javascript
// Load existing strikes
const strikes = JSON.parse(
  fs.readFileSync('logs/missing-events.json', 'utf-8')
)

// Increment strike for missing events
for (const missingEvent of detectedMissingEvents) {
  strikes[missingEvent.id] = (strikes[missingEvent.id] || 0) + 1

  // Threshold: 3 consecutive misses = cancellation
  if (strikes[missingEvent.id] >= 3) {
    console.warn(`Event ${missingEvent.name} cancelled after 3 misses`)

    await prisma.event.update({
      where: { id: missingEvent.id },
      data: { completed: true, cancelled: true }
    })

    delete strikes[missingEvent.id]  // Clear strike
  }
}

// Save updated strikes
fs.writeFileSync(
  'logs/missing-events.json',
  JSON.stringify(strikes, null, 2)
)
```

**Thresholds:**
- Events: 3 consecutive absences
- Fights: 2 consecutive absences

**Configurable via:**
```bash
SCRAPER_CANCEL_THRESHOLD=3
SCRAPER_FIGHT_CANCEL_THRESHOLD=2
```

### 5. Static Export for GitHub Pages

**File:** `scripts/export-static-data.js`

**Workflow:**
```javascript
async exportStaticData() {
  // 1. Query all events with fights
  const events = await prisma.event.findMany({
    where: { completed: false },
    include: {
      fights: {
        include: {
          fighter1: true,
          fighter2: true
        }
      }
    },
    orderBy: { date: 'asc' }
  })

  // 2. Transform to client format
  const transformed = events.map(event => ({
    id: event.id,
    name: event.name,
    date: event.date.toISOString(),
    venue: event.venue,
    location: event.location,
    fightCard: event.fights.map(fight => ({
      id: fight.id,
      fighter1: {
        name: fight.fighter1.name,
        record: fight.fighter1.record,
        // ...
      },
      fighter2: { /* ... */ },
      funFactor: fight.funFactor,
      finishProbability: fight.finishProbability,
      // ...
    }))
  }))

  // 3. Write to public/data/events.json
  fs.writeFileSync(
    'public/data/events.json',
    JSON.stringify(transformed, null, 2)
  )

  console.log(`Exported ${events.length} events to static JSON`)
}
```

**Trigger:** Manual or post-deploy CI step

## Integration Points

### GitHub Actions Workflows

**Scraper Workflow:** `.github/workflows/scraper.yml`

```yaml
name: Daily Scraper

on:
  schedule:
    - cron: '0 2 * * *'  # 2:00 AM UTC daily
  workflow_dispatch:
    inputs:
      limit:
        description: 'Event limit'
        required: false
        default: '10'

jobs:
  scrape:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run scraper
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          SCRAPER_LIMIT: ${{ github.event.inputs.limit || '10' }}
          SHERDOG_ENABLED: 'false'
          TAPOLOGY_ENRICH_RECORDS: 'true'
        run: node scripts/automated-scraper.js check
```

**AI Predictions Workflow:** `.github/workflows/ai-predictions.yml`

```yaml
name: AI Predictions

on:
  schedule:
    - cron: '30 1 * * *'  # 1:30 AM UTC (before scraper)
  workflow_dispatch:
    inputs:
      batch_size:
        description: 'Chunk size'
        default: '6'

jobs:
  predict:
    runs-on: ubuntu-latest
    timeout-minutes: 45

    steps:
      - name: Generate predictions
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          OPENAI_PREDICTION_CHUNK_SIZE: ${{ github.event.inputs.batch_size || '6' }}
        run: node scripts/ai-predictions-runner.js generate
```

### Database Connection

**Pattern:** Shared PrismaClient singleton

```javascript
import { prisma } from '../src/lib/database/prisma.js'

// Scripts use same singleton as API routes
const events = await prisma.event.findMany()
```

**Connection Pooling:**
- CI: `connection_limit=1` (avoid pool exhaustion)
- Local: Default pool size (5-10)

### Monitoring & Logging

**Sentry Integration:**
```javascript
import * as Sentry from '@sentry/node'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development'
})

try {
  await scraper.run()
} catch (error) {
  Sentry.captureException(error, {
    tags: { script: 'automated-scraper' },
    extra: { limit: scraperLimit }
  })
  throw error
}
```

**Structured Logging:**
```javascript
import { scraperLogger } from '../src/lib/monitoring/logger.js'

scraperLogger.info('Scraper started', {
  limit: scraperLimit,
  source: 'wikipedia'
})

scraperLogger.error('Scraper failed', {
  error: error.message,
  stack: error.stack
})
```

## Development Patterns

### Running Scripts Locally

**Standard Execution:**
```bash
# Main scraper
npm run scraper:check

# With custom limit
SCRAPER_LIMIT=5 npm run scraper:check

# Fast mode (no delays)
SCRAPER_FAST=true npm run scraper:check

# Skip enrichment
TAPOLOGY_ENRICH_RECORDS=false npm run scraper:check
```

**AI Predictions:**
```bash
# Generate predictions for all unpredicted fights
npm run predict:all

# Regenerate for specific event
npm run predict:event -- <event-id>

# Custom chunk size
OPENAI_PREDICTION_CHUNK_SIZE=10 npm run predict:all
```

**Database Utilities:**
```bash
# Check database status
node scripts/check-database-progress.js

# Verify duplicates
node scripts/check-current-duplicates.js

# Show recent events
node scripts/show-events.js
```

### Debugging Script Failures

**Check Logs:**
```bash
# View scraper logs
cat logs/scraper.log

# View missing events
cat logs/missing-events.json

# View missing fights
cat logs/missing-fights.json
```

**Database Inspection:**
```bash
# Count events
DATABASE_URL="..." node -e "import('@prisma/client').then(m => {
  const p = new m.PrismaClient()
  p.event.count().then(console.log)
})"

# Show latest events
DATABASE_URL="..." node scripts/show-events.js
```

**GitHub Actions:**
```bash
# View workflow runs
gh run list --workflow=scraper.yml

# Watch live run
gh run watch <run-id>

# View logs
gh run view <run-id> --log
```

### Adding a New Script

1. **Create file:** `scripts/my-script.js`
2. **ES module structure:**
   ```javascript
   import { PrismaClient } from '@prisma/client'

   const prisma = new PrismaClient()

   async function main() {
     // Implementation
   }

   main()
     .catch(error => {
       console.error(error)
       process.exit(1)
     })
     .finally(() => prisma.$disconnect())
   ```
3. **Add npm script:** `package.json`
   ```json
   {
     "scripts": {
       "my-script": "node scripts/my-script.js"
     }
   }
   ```
4. **Add to documentation:** Update OPERATIONS.md runbooks

## Key Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `automated-scraper.js` | 1611 | Main scraper orchestrator with deduplication |
| `ai-predictions-runner.js` | ~500 | AI prediction batch generator |
| `export-static-data.js` | ~200 | Static JSON export for fallback |
| `prepare-github-pages.js` | ~100 | GitHub Pages build preparation |
| `check-database-progress.js` | ~150 | Database inspection utility |

## Related Documentation

- `/docs/ARCHITECTURE.md` §External Integrations - Data sources
- `/docs/OPERATIONS.md` §Daily Scraper Job - Automation workflow
- `/src/lib/scrapers/CONTEXT.md` - Scraper services documentation
- `/.github/workflows/` - CI/CD workflow definitions

## Maintenance Notes

**Regular Checks:**
- Monitor GitHub Actions runs (daily at 1:30 AM and 2:00 AM UTC)
- Review Sentry for script errors
- Check strike ledger for event cancellations
- Verify AI prediction token usage (cost tracking)

**Known Limitations:**
- Strike ledger uses JSON files (not database-persisted)
- No automated alerting on scraper failures (manual checks required)
- Connection pool can be exhausted if batch size too large
- OpenAI rate limits (500 requests/min) may throttle predictions

**Performance:**
- Full scraper run (10 events): 3-5 minutes
- AI predictions (50 fights): 5-10 minutes
- Static export: <30 seconds
- Database cleanup: <1 minute

**Future Enhancements:**
- Move strike ledger to database (ScraperMetric table)
- Add Slack/email alerts for scraper failures
- Implement retry logic for transient OpenAI errors
- Distributed queue for parallel scraping
