# Scraper Enhancement: Completed Events & Fight Outcomes

## Problem Statement
The scraper currently only processes **upcoming events** from UFCStats.com. It cannot:
1. Track completed events
2. Record fight outcomes (winner, method, round, time)
3. Mark cancelled fights

## Database Schema (Already Ready!)
The schema already has all necessary fields:

**Fight Model:**
```prisma
completed: Boolean @default(false)
winnerId: String?
method: String?     // KO, TKO, SUB, DEC
round: Int?
time: String?
```

**Event Model:**
```prisma
completed: Boolean @default(false)
cancelled: Boolean @default(false)
```

## UFCStats.com Data Structure

### Upcoming Events
- URL: `http://ufcstats.com/statistics/events/upcoming`
- Fight table columns: W/L (empty), Fighter, Stats, Weight Class

### Completed Events
- URL: `http://ufcstats.com/statistics/events/completed`
- Fight table columns: W/L (win/loss), Fighter, Stats, Weight Class, **Method**, **Round**, **Time**

**Example Completed Fight Row:**
```
Column 0: "win" (W/L flag for first fighter listed)
Column 1: Fighter names (both fighters)
Column 6: Weight class
Column 7: Method (e.g., "U-DEC", "KO/TKO", "SUB", "S-DEC")
Column 8: Round (e.g., 3, 5)
Column 9: Time (e.g., "5:00", "3:04")
```

## Implementation Changes Needed

### 1. Spider (`scraper/ufc_scraper/spiders/ufcstats.py`)

**Current:**
```python
start_urls = ["http://ufcstats.com/statistics/events/upcoming"]
```

**Enhanced:**
```python
def __init__(self, limit=None, include_completed=None, *args, **kwargs):
    self.include_completed = include_completed  # New parameter

def start_requests(self):
    # Always scrape upcoming events
    yield scrapy.Request(
        url="http://ufcstats.com/statistics/events/upcoming",
        callback=self.parse,
        meta={'event_type': 'upcoming'}
    )

    # Optionally scrape recent completed events
    if self.include_completed:
        yield scrapy.Request(
            url="http://ufcstats.com/statistics/events/completed",
            callback=self.parse,
            meta={'event_type': 'completed'}
        )
```

### 2. Parsers (`scraper/ufc_scraper/parsers.py`)

**New Function:**
```python
def parse_fight_outcome(row: element.Tag, event_completed: bool) -> Dict:
    """
    Extract fight outcome data from completed event row.

    Args:
        row: BeautifulSoup table row element
        event_completed: Whether the event is completed

    Returns:
        Dictionary with outcome data or None for upcoming fights
    """
    if not event_completed:
        return {
            'completed': False,
            'winnerId': None,
            'method': None,
            'round': None,
            'time': None
        }

    cols = row.find_all('td')
    if len(cols) < 10:
        return None

    # Column 0: W/L flag determines winner
    wl_flag = cols[0].find('i', class_='b-flag__text')
    result = wl_flag.text.strip().lower() if wl_flag else None

    # Column 7: Method
    method_text = cols[7].get_text(strip=True)

    # Column 8: Round
    round_text = cols[8].get_text(strip=True)

    # Column 9: Time
    time_text = cols[9].get_text(strip=True)

    return {
        'completed': True,
        'result': result,  # 'win' or 'loss' for first fighter
        'method': normalize_method(method_text),
        'round': int(round_text) if round_text.isdigit() else None,
        'time': time_text if time_text else None
    }

def normalize_method(method: str) -> str:
    """Normalize method strings to standard codes."""
    method_upper = method.upper()

    if 'U-DEC' in method_upper or 'UNANIMOUS' in method_upper:
        return 'DEC'
    elif 'S-DEC' in method_upper or 'SPLIT' in method_upper:
        return 'DEC'
    elif 'M-DEC' in method_upper or 'MAJORITY' in method_upper:
        return 'DEC'
    elif 'KO' in method_upper or 'TKO' in method_upper:
        return 'KO/TKO'
    elif 'SUB' in method_upper:
        return 'SUB'
    elif 'DQ' in method_upper:
        return 'DQ'
    elif 'NC' in method_upper:
        return 'NC'
    else:
        return method  # Return original if unknown
```

**Update `parse_event_detail()`:**
```python
def parse_event_detail(soup: BeautifulSoup, event_url: str, event_completed: bool = False) -> Dict:
    # ... existing code ...

    # Determine if event is completed from date
    if event_date_obj:
        event_completed = event_date_obj < datetime.now().date()

    for idx, row in enumerate(fight_rows, start=1):
        # ... existing fight extraction ...

        # Extract outcome data for completed fights
        outcome = parse_fight_outcome(row, event_completed)
        if outcome and outcome['completed']:
            fight['completed'] = True
            fight['method'] = outcome['method']
            fight['round'] = outcome['round']
            fight['time'] = outcome['time']

            # Determine winner (first fighter if result='win', second if 'loss')
            if outcome['result'] == 'win':
                fight['winnerId'] = fighter1_id
            elif outcome['result'] == 'loss':
                fight['winnerId'] = fighter2_id
```

### 3. Validation Schemas (`src/lib/scraper/validation.ts`)

**Update ScrapedFightSchema:**
```typescript
export const ScrapedFightSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  fighter1Id: z.string(),
  fighter2Id: z.string(),
  weightClass: z.string().optional(),
  titleFight: z.boolean().optional().default(false),
  mainEvent: z.boolean().optional().default(false),
  cardPosition: z.string().optional(),
  sourceUrl: z.string().url(),

  // NEW: Outcome fields
  completed: z.boolean().optional().default(false),
  winnerId: z.string().optional(),
  method: z.string().optional(),  // KO/TKO, SUB, DEC, DQ, NC
  round: z.number().int().min(1).max(5).optional(),
  time: z.string().optional(),    // Format: "M:SS"
})
```

**Update ScrapedEventSchema:**
```typescript
export const ScrapedEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string().datetime(),
  venue: z.string().optional(),
  location: z.string().optional(),
  sourceUrl: z.string().url(),

  // NEW: Completion status
  completed: z.boolean().optional().default(false),
  cancelled: z.boolean().optional().default(false),
})
```

### 4. Ingestion API (`src/app/api/internal/ingest/route.ts`)

**Update Fight Upsert Logic:**
```typescript
// Around line 275-305
if (!existing) {
  // Create new fight
  await tx.fight.create({
    data: {
      fighter1Id: fighter1.id,
      fighter2Id: fighter2.id,
      eventId: event.id,
      weightClass: fight.weightClass ?? 'Unknown',
      titleFight: fight.titleFight ?? false,
      mainEvent: fight.mainEvent ?? false,
      cardPosition: fight.cardPosition ?? 'preliminary',

      // NEW: Outcome fields
      completed: fight.completed ?? false,
      winnerId: fight.winnerId,  // Can be null for upcoming
      method: fight.method,
      round: fight.round,
      time: fight.time,

      sourceUrl: fight.sourceUrl,
      lastScrapedAt: new Date(),
      contentHash,
    },
  })
} else if (existing.contentHash !== contentHash) {
  // Update existing fight (including outcome data)
  await tx.fight.update({
    where: { sourceUrl: fight.sourceUrl },
    data: {
      weightClass: fight.weightClass ?? existing.weightClass,
      titleFight: fight.titleFight ?? existing.titleFight,
      mainEvent: fight.mainEvent ?? existing.mainEvent,
      cardPosition: fight.cardPosition ?? existing.cardPosition,

      // NEW: Update outcome when fight completes
      completed: fight.completed ?? existing.completed,
      winnerId: fight.winnerId ?? existing.winnerId,
      method: fight.method ?? existing.method,
      round: fight.round ?? existing.round,
      time: fight.time ?? existing.time,

      lastScrapedAt: new Date(),
      contentHash,
    },
  })
}
```

**Update Event Upsert Logic:**
```typescript
// Around line 222-247
await tx.event.create({
  data: {
    name: event.name,
    date: new Date(event.date),
    venue: event.venue ?? 'TBA',
    location: event.location ?? 'TBA',

    // NEW: Completion status
    completed: event.completed ?? false,
    cancelled: event.cancelled ?? false,

    sourceUrl: event.sourceUrl,
    lastScrapedAt: new Date(),
    contentHash,
  },
})
```

## Testing Plan

### 1. Unit Tests
```bash
# Test outcome parsing with completed event fixture
pytest scraper/tests/test_parsers.py::test_parse_fight_outcome -v
```

### 2. Integration Test
```bash
# Scrape one completed event locally
cd scraper
export INGEST_API_URL="http://localhost:3000/api/internal/ingest"
export INGEST_API_SECRET="test-secret"
scrapy crawl ufcstats -a limit=1 -a include_completed=1
```

### 3. Production Test
```bash
# GitHub Actions manual trigger with completed events
gh workflow run scraper.yml -f limit=5 -f include_completed=true
```

## Rollout Strategy

### Phase 1: Add Outcome Parsing (No Breaking Changes)
1. Update parsers to extract outcome data
2. Update validation schemas (optional fields)
3. Update ingestion API (backward compatible)
4. Test with completed event fixture

### Phase 2: Enable Completed Event Scraping
1. Add `include_completed` parameter to spider
2. Test locally with manual runs
3. Update GitHub Actions workflow with parameter

### Phase 3: Production Deployment
1. Deploy API changes to Vercel
2. Run manual scraper with completed events
3. Verify outcome data in database
4. Enable automated scraping of completed events

## Expected Results

After implementation:
- ✅ Scraper extracts outcome data from completed events
- ✅ Database tracks fight results (winner, method, round, time)
- ✅ Cancelled fights can be marked in database
- ✅ Content hash detection works for outcome updates
- ✅ No breaking changes to existing functionality

## Files to Modify

1. `scraper/ufc_scraper/spiders/ufcstats.py` - Add completed events URL
2. `scraper/ufc_scraper/parsers.py` - Add outcome parsing functions
3. `scraper/ufc_scraper/items.py` - Add outcome fields to FightItem
4. `src/lib/scraper/validation.ts` - Update Zod schemas
5. `src/app/api/internal/ingest/route.ts` - Handle outcome fields
6. `.github/workflows/scraper.yml` - Add include_completed parameter
7. `scraper/tests/test_parsers.py` - Add outcome parsing tests
