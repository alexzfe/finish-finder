# Data Scraping Subsystem - Component Context

## Purpose

The `src/lib/scrapers/` directory implements the **multi-source web scraping infrastructure** for Finish Finder, responsible for automated collection of UFC event data, fight cards, and fighter statistics from public sources (Wikipedia, Tapology, Sherdog).

**Key Responsibilities:**
- Fetch upcoming UFC event schedules from multiple sources
- Extract fight cards with fighter matchups and card positions
- Enrich fighter data with win/loss records and statistics
- Handle rate limiting and request throttling to avoid IP blocking
- Provide fallback chains for data source reliability
- Validate and normalize scraped data before database writes

## Current Status: Production-Operational (Nov 2025)

**Evolution Context:**
- Sep 2024: Enhanced Wikipedia scraper with 90% date accuracy
- Sep 2024: Tapology integration with 4-strategy URL extraction fallback
- Sep 2024: Fighter record enrichment (W-L-D) enabled by default
- Sep 2024: Sherdog disabled in CI (IP blocking avoidance)
- Oct 2024: Human-like delay randomization (0.8-2s per request)
- **Current**: Multi-source pipeline operational with automated GitHub Actions scheduling

**Status Indicators:**
- ✅ Wikipedia scraping: Primary source, 90% date accuracy
- ✅ Tapology enrichment: Fighter records (W-L-D) functional
- ✅ Request rate limiting: Human-like delays (1.2-3s)
- ✅ Error resilience: Graceful fallback chains
- ⚠️ Sherdog scraping: Disabled in CI (local testing only)
- ⚠️ IP blocking risk: Manual monitoring required for Tapology

## Component-Specific Development Guidelines

### Web Scraping Best Practices

**Rate Limiting:**
```typescript
// Human-like delays to avoid bot detection
private async humanLikeDelay(): Promise<void> {
  if (process.env.SCRAPER_FAST === 'true') {
    const delay = 10 + Math.random() * 20  // 10-30ms (testing only)
  } else {
    const delay = 800 + Math.random() * 1200  // 0.8-2s (production)
  }
  return new Promise(resolve => setTimeout(resolve, delay))
}
```

**Browser Headers:**
```typescript
// Rotate user agents to avoid fingerprinting
private getBrowserHeaders(): Record<string, string> {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
    // ... more variations
  ]

  return {
    'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache'
  }
}
```

**Error Handling:**
```typescript
// Retry with exponential backoff
const maxRetries = 3
for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    const response = await axios.get(url, { timeout: 10000 })
    return response.data
  } catch (error) {
    if (attempt === maxRetries) throw error
    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
  }
}
```

### HTML Parsing Conventions

**Cheerio Pattern:**
```typescript
import * as cheerio from 'cheerio'

const $ = cheerio.load(html)

// Multiple selector strategies (handle site changes)
const selectors = [
  'table.wikitable.plainrowheaders',
  'table.infobox',
  'div.event-schedule table'
]

for (const selector of selectors) {
  const table = $(selector).first()
  if (table.length > 0) {
    return this.parseTable($, table)
  }
}
```

**Data Extraction Pattern:**
```typescript
// Extract with validation
const text = $('td.fighter-name').text().trim()
if (!text || text.includes('TBA') || text.includes('vs.')) {
  return null  // Skip invalid data
}

// Normalize before storing
const normalized = text.replace(/\s+/g, ' ')
                       .replace(/[^\w\s-]/g, '')
                       .trim()
```

### Service Architecture Pattern

**Multi-Source Strategy:**
```typescript
// HybridUFCService orchestrates multiple scrapers
export class HybridUFCService {
  private wikipediaService = new WikipediaUFCService()
  private tapologyService = new TapologyUFCService()

  async getUpcomingUFCEvents(limit: number = 50) {
    // 1. Wikipedia (primary)
    const wikipediaEvents = await this.wikipediaService.getUpcomingEvents(limit)

    // 2. Enrich with Tapology fighter records (optional)
    if (process.env.TAPOLOGY_ENRICH_RECORDS !== 'false') {
      await this.enrichWithTapology(fighters)
    }

    // 3. Sherdog fallback (local only)
    if (process.env.SHERDOG_ENABLED === 'true') {
      await this.enrichWithSherdog(events)
    }

    return { events, fighters }
  }
}
```

## Major Subsystem Organization

### Directory Structure

```
src/lib/scrapers/
├── wikipediaService.ts          # Wikipedia UFC scraper (primary source)
├── tapologyService.ts           # Tapology fighter enrichment
├── requestPolicy.ts             # Rate limiting & retry logic
└── __tests__/                   # Unit tests (if any)
```

### Service Responsibilities

| Service | Source | Purpose | Reliability |
|---------|--------|---------|-------------|
| **WikipediaUFCService** | en.wikipedia.org | Event schedules, fight cards, venues | ✅ Primary (90% accuracy) |
| **TapologyUFCService** | tapology.com | Fighter records (W-L-D), nicknames | ✅ Enrichment (optional) |
| **Sherdog** (disabled) | sherdog.com | Historical fight data | ⚠️ Local only (IP blocking) |

## Architectural Patterns

### 1. Multi-Source Scraping with Fallback

**Wikipedia Service** (`wikipediaService.ts`)

**Entry Point:** `getUpcomingEvents(limit: number)` (lines 61-284)
```typescript
async getUpcomingEvents(limit: number = 50): Promise<UFCEvent[]> {
  await this.humanLikeDelay()

  const url = 'https://en.wikipedia.org/wiki/List_of_UFC_events'
  const response = await axios.get(url, {
    headers: this.getBrowserHeaders(),
    timeout: 10000
  })

  const $ = cheerio.load(response.data)

  // Strategy 1-7: Find "Scheduled events" table
  const table = this.findScheduledEventsTable($)
  if (!table) {
    throw new Error('Could not locate scheduled events table')
  }

  // Parse rows
  const events = this.parseEventTable($, table)

  // Filter future events only
  const now = new Date()
  return events.filter(e => e.date > now).slice(0, limit)
}
```

**Key Strategies:**
1. **Table detection** (7 strategies): `wikitable.plainrowheaders`, `infobox`, `div.schedule table`, etc.
2. **Date parsing** (multiple formats): "January 25, 2025", "Sep 13, 2025", "TBA"
3. **Year inference**: Adds current/next year if missing
4. **Validation**: Filters out "TBA" dates, past events, non-UFC events

**Tapology Service** (`tapologyService.ts`)

**Entry Point:** `getUpcomingEvents(limit: number)` (lines 233-337)
```typescript
async getUpcomingEvents(limit: number = 50): Promise<TapologyUFCEvent[]> {
  const url = 'https://www.tapology.com/fightcenter/promotions/1-ultimate-fighting-championship-ufc'

  const response = await axios.get(url, {
    headers: this.getBrowserHeaders(),
    timeout: 15000
  })

  const $ = cheerio.load(response.data)

  // 4 fallback parsing strategies for HTML structure changes
  const events = this.parseWithStrategy1($) ||
                 this.parseWithStrategy2($) ||
                 this.parseWithStrategy3($) ||
                 this.parseWithStrategy4($)

  return events.slice(0, limit)
}
```

**Fighter Record Enrichment:** `getFighterRecordByName(name: string)` (lines 199-231)
```typescript
async getFighterRecordByName(name: string): Promise<FighterRecord | null> {
  // Search Tapology for fighter
  const searchUrl = `https://www.tapology.com/search?term=${encodeURIComponent(name)}`
  const results = await this.search(searchUrl)

  // Navigate to fighter profile
  const fighterUrl = results.firstResult.url
  const profile = await this.fetchProfile(fighterUrl)

  // Extract "Pro MMA Record: 15-3-0"
  const recordMatch = profile.match(/Pro MMA Record:\s*(\d+)-(\d+)-(\d+)/)
  if (recordMatch) {
    return {
      record: recordMatch[0],
      wins: parseInt(recordMatch[1]),
      losses: parseInt(recordMatch[2]),
      draws: parseInt(recordMatch[3])
    }
  }

  return null
}
```

### 2. Request Throttling & Rate Limiting

**Pattern:** Centralized request policy (lines 16-45 in `requestPolicy.ts`)

```typescript
export class RequestPolicy {
  private lastRequestTime = 0
  private minDelay = 1200  // 1.2 seconds
  private maxDelay = 3000  // 3 seconds

  async throttle(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastRequestTime

    if (elapsed < this.minDelay) {
      const delay = this.minDelay + Math.random() * (this.maxDelay - this.minDelay)
      await new Promise(r => setTimeout(r, delay))
    }

    this.lastRequestTime = Date.now()
  }

  getBrowserHeaders(): Record<string, string> {
    // Rotate user agents
  }
}
```

**Usage in Services:**
```typescript
// Before each request
await this.requestPolicy.throttle()
const response = await axios.get(url, {
  headers: this.requestPolicy.getBrowserHeaders()
})
```

### 3. Weight Class Normalization

**Pattern:** 8 CSS selector strategies (lines 75-155 in `tapologyService.ts`)

```typescript
private extractWeightClass($: CheerioAPI, row: Cheerio<Element>): string {
  // Strategy 1: CSS class .weight_class
  let wc = row.find('.weight_class').text().trim()
  if (wc) return this.normalizeWeightClass(wc)

  // Strategy 2: Ranking links
  wc = row.find('a[href*="/rankings/"]').text().trim()
  if (wc) return this.normalizeWeightClass(wc)

  // Strategy 3-8: More fallbacks...

  return 'unknown'
}

private normalizeWeightClass(text: string): WeightClass {
  const normalized = text.toLowerCase().replace(/\s+/g, '_')

  const mappings: Record<string, WeightClass> = {
    'lhw': 'light_heavyweight',
    'light_heavy': 'light_heavyweight',
    'fw': 'featherweight',
    'wfw': 'womens_featherweight',
    // ... 15+ variations
  }

  return mappings[normalized] || 'lightweight'  // Safe fallback
}
```

### 4. Data Validation Before Scraping

**Pattern:** Pre-flight validation (used by `automated-scraper.js`)

```typescript
// src/lib/database/validation.ts
export function validateFighterData(fighter: Partial<Fighter>): string[] {
  const errors: string[] = []

  if (!fighter.id) errors.push('Fighter missing ID')
  if (!fighter.name) errors.push('Fighter missing name')
  if (typeof fighter.wins !== 'number') errors.push('Invalid wins count')

  return errors
}
```

**Usage in Scraper:**
```typescript
const validationErrors = validateFighterData(fighter)
if (validationErrors.length > 0) {
  console.warn(`Skipping invalid fighter: ${validationErrors.join(', ')}`)
  continue  // Skip, don't crash
}

await prisma.fighter.upsert({...})
```

## Integration Points

### Orchestration Layer (HybridUFCService)

**Location:** `src/lib/ai/hybridUFCService.ts`

**Integration:**
```typescript
export class HybridUFCService {
  async getUpcomingUFCEvents(limit: number) {
    // 1. Wikipedia scraping
    const wikipediaEvents = await this.wikipediaService.getUpcomingEvents(limit)
    const wikipediaFights = await this.getEventDetails(wikipediaEvents)

    // 2. Fighter record enrichment (Tapology)
    if (process.env.TAPOLOGY_ENRICH_RECORDS !== 'false') {
      for (const fighter of fighters) {
        const record = await this.tapologyService.getFighterRecordByName(fighter.name)
        if (record) {
          fighter.wins = record.wins
          fighter.losses = record.losses
          fighter.draws = record.draws
        }
      }
    }

    return { events, fighters }
  }
}
```

**Data Flow:**
```
Wikipedia
  → Event list (name, date, venue, location)
    → Event details (fight cards)
      → Fighter names
        → Tapology enrichment (W-L-D records)
          → Return to orchestrator
```

### Database Writes (via Automation Scripts)

**Location:** `scripts/automated-scraper.js`

**Integration:**
```typescript
// Batch upsert fighters (5 at a time to avoid pool exhaustion)
const batchSize = 5
for (let i = 0; i < fighters.length; i += batchSize) {
  const batch = fighters.slice(i, i + batchSize)

  const upserts = batch.map(f => prisma.fighter.upsert({
    where: { id: f.id },
    update: { wins: f.wins, losses: f.losses, ... },
    create: { id: f.id, name: f.name, ... }
  }))

  await Promise.all(upserts)

  // Throttle between batches
  await new Promise(r => setTimeout(r, 100))
}
```

**Error Handling:**
```typescript
try {
  const events = await hybridService.getUpcomingUFCEvents(15)
  await this.persistEvents(events)
} catch (error) {
  if (error.code === 'SHERDOG_BLOCKED') {
    console.warn('Sherdog blocked; skipping (non-fatal)')
    // Continue with Wikipedia/Tapology data
  } else {
    throw error  // Critical error
  }
}
```

### GitHub Actions Automation

**Workflow:** `.github/workflows/scraper.yml`

**Schedule:**
```yaml
schedule:
  - cron: '0 2 * * *'  # Daily at 2:00 AM UTC
```

**Configuration:**
```yaml
env:
  SCRAPER_SOURCE: 'tapology'
  SCRAPER_LIMIT: 10
  SHERDOG_ENABLED: 'false'
  TAPOLOGY_ENRICH_RECORDS: 'true'
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

**Execution:**
```bash
node scripts/automated-scraper.js check
```

## Development Patterns

### Adding a New Data Source

1. **Create service file:** `src/lib/scrapers/mySourceService.ts`
2. **Implement interface:**
   ```typescript
   export class MySourceService {
     async getUpcomingEvents(limit: number): Promise<UFCEvent[]> {
       // Implementation
     }

     async getEventDetails(event: UFCEvent): Promise<Fight[]> {
       // Implementation
     }
   }
   ```
3. **Add to HybridUFCService:**
   ```typescript
   private mySourceService = new MySourceService()

   async getUpcomingUFCEvents(limit: number) {
     // Try new source as fallback
     if (wikipediaEvents.length === 0) {
       events = await this.mySourceService.getUpcomingEvents(limit)
     }
   }
   ```
4. **Add feature flag:** `MY_SOURCE_ENABLED` in env vars
5. **Update documentation:** Add to ARCHITECTURE.md §External Integrations

### Testing Scrapers Locally

**Fast Mode (Testing Only):**
```bash
SCRAPER_FAST=true npm run scraper:check
```

**Single Event Test:**
```bash
SCRAPER_LIMIT=1 npm run scraper:check
```

**Skip Fighter Enrichment:**
```bash
TAPOLOGY_ENRICH_RECORDS=false npm run scraper:check
```

**Enable Sherdog (Local Only):**
```bash
SHERDOG_ENABLED=true npm run scraper:check
```

### Debugging Scraper Failures

**Check HTML Structure:**
```typescript
// Add logging before parsing
const html = response.data
console.log('HTML preview:', html.substring(0, 500))

// Save to file for inspection
fs.writeFileSync('debug-response.html', html)
```

**Test Selectors in Browser:**
1. Open source URL in browser
2. Open DevTools Console
3. Test selectors:
   ```javascript
   document.querySelectorAll('table.wikitable.plainrowheaders')
   ```

**Verify Rate Limiting:**
```typescript
// Add timing logs
console.log(`[${new Date().toISOString()}] Request started`)
await this.humanLikeDelay()
console.log(`[${new Date().toISOString()}] Request sent`)
```

### Handling Site Structure Changes

**Pattern:** Multi-strategy parsing with graceful degradation

```typescript
// Try multiple selectors
const strategies = [
  () => this.parseWithSelector1($),
  () => this.parseWithSelector2($),
  () => this.parseWithSelector3($),
]

for (const strategy of strategies) {
  try {
    const result = strategy()
    if (result && result.length > 0) {
      return result
    }
  } catch (error) {
    console.warn('Strategy failed, trying next:', error.message)
  }
}

throw new Error('All parsing strategies exhausted')
```

## Key Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `wikipediaService.ts` | 901 | Wikipedia UFC event/fight scraper |
| `tapologyService.ts` | 906 | Tapology fighter record enrichment |
| `requestPolicy.ts` | 61 | Rate limiting and request headers |
| `src/lib/ai/hybridUFCService.ts` | 100+ | Multi-source orchestration |
| `scripts/automated-scraper.js` | 1611 | Automation orchestrator |

## Related Documentation

- `/docs/ARCHITECTURE.md` §External Integrations - Source selection rationale
- `/docs/OPERATIONS.md` §Daily Scraper Job - Automation workflow
- `/scripts/CONTEXT.md` - Automation scripts documentation
- `/docs/TESTING.md` - Scraper testing strategy

## Maintenance Notes

**Regular Checks:**
- Monitor GitHub Actions scraper runs (daily at 2 AM UTC)
- Check Sentry for scraping errors
- Verify Wikipedia/Tapology site structure hasn't changed
- Review IP blocking warnings

**Known Issues:**
- Sherdog blocks GitHub Actions IPs (local testing only)
- Tapology occasionally changes HTML structure (4 fallback strategies mitigate)
- Wikipedia "TBA" dates require manual cleanup
- Fighter name variations ("Jon Jones" vs "Jonathan Jones") need deduplication

**Performance:**
- Wikipedia event list: 15-30s (human-like delays)
- Tapology fighter enrichment: 5-10s per fighter
- Full scraper run (10 events): ~3-5 minutes

**Future Enhancements:**
- Puppeteer fallback for JavaScript-heavy sites
- Distributed request queue (Bull/RabbitMQ)
- Scraper health monitoring dashboard
- Automated selector update detection
