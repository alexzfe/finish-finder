# Scraper Behavior Reference

Quick reference for how the UFC scraper handles different parameters.

## Default Behavior (No Parameters)

```bash
scrapy crawl ufcstats
```

**Scrapes:**
- ✅ All upcoming events from UFCStats.com
- ❌ No completed events
- ❌ No fight outcomes

**Use Case:** Daily automated runs to get upcoming fight cards

---

## Limit Upcoming Events

```bash
scrapy crawl ufcstats -a limit=5
```

**Scrapes:**
- ✅ 5 nearest upcoming events
- ❌ No completed events
- ❌ No fight outcomes

**Use Case:** Testing or quick checks without scraping everything

---

## Include Completed Events (NEW!)

```bash
scrapy crawl ufcstats -a include_completed=true
```

**Scrapes:**
- ✅ All upcoming events
- ✅ **3 most recent** completed events
- ✅ Fight outcomes (winner, method, round, time)

**Use Case:** Daily runs to capture outcomes + upcoming events

**Why only 3?**
- Captures ~3 weeks of recent outcomes (typical UFC schedule)
- Reduces scraping load (good citizenship)
- Focuses on relevant data for AI evaluation
- Prevents scraping hundreds of historical events

---

## Combined: Limit + Completed

```bash
scrapy crawl ufcstats -a limit=2 -a include_completed=true
```

**Scrapes:**
- ✅ 2 nearest upcoming events
- ✅ **3 most recent** completed events (always exactly 3)
- ✅ Fight outcomes for completed events

**Use Case:** Testing with small dataset but including outcome data

**Important:** The `limit` parameter **only affects upcoming events**. Completed events are always limited to 3 most recent.

---

## Event Sorting

### Upcoming Events
- Sorted **ascending** by date (nearest first)
- Example: Nov 15 → Nov 22 → Nov 29

### Completed Events
- Sorted **descending** by date (most recent first)
- Example: Nov 10 → Nov 3 → Oct 27

This ensures we always get the most relevant data:
- **Upcoming:** Next fights coming up
- **Completed:** Most recent outcomes

---

## Examples with Expected Output

### Example 1: Daily Production Run
```bash
scrapy crawl ufcstats -a include_completed=true
```

**Expected:**
```
✓ Found 4 upcoming events → Will scrape all 4
✓ Found 50 completed events → Will scrape 3 most recent
✓ Total: 7 events, ~70 fights
```

### Example 2: Quick Test
```bash
scrapy crawl ufcstats -a limit=1 -a include_completed=true
```

**Expected:**
```
✓ Found 4 upcoming events → Will scrape 1 (nearest)
✓ Found 50 completed events → Will scrape 3 most recent
✓ Total: 4 events, ~40 fights
```

### Example 3: Upcoming Only (Current Behavior)
```bash
scrapy crawl ufcstats
```

**Expected:**
```
✓ Found 4 upcoming events → Will scrape all 4
✓ Completed events: Not requested
✓ Total: 4 events, ~40 fights (no outcomes)
```

---

## GitHub Actions Workflow

### Manual Trigger Options

**Option 1: Default (Upcoming Only)**
```bash
gh workflow run scraper.yml
```
Scrapes all upcoming events, no outcomes.

**Option 2: Limited Test**
```bash
gh workflow run scraper.yml -f limit=5
```
Scrapes 5 upcoming events, no outcomes.

**Option 3: With Outcomes**
```bash
gh workflow run scraper.yml -f include_completed=true
```
Scrapes all upcoming + 3 most recent completed with outcomes.

**Option 4: Limited Test with Outcomes**
```bash
gh workflow run scraper.yml -f limit=2 -f include_completed=true
```
Scrapes 2 upcoming + 3 most recent completed with outcomes.

### Automated Daily Run

Currently configured to:
```yaml
schedule:
  - cron: '0 2 * * *'  # 2:00 AM UTC daily
```

**Current behavior:** Upcoming events only (no outcomes)

**Recommended for production:**
```bash
# Enable outcomes in daily run by modifying workflow
scrapy crawl ufcstats -a include_completed=true
```

---

## Data Volume Estimates

### Upcoming Only (Current)
- Events: ~4 per week
- Fights: ~40 per event = **160 fights/week**
- Outcomes: None

### With Completed Events (3 limit)
- Upcoming: ~4 events = 40 fights
- Completed: 3 events = 30 fights
- **Total: ~70 fights/day**
- Outcomes: ~30 per day

### Without Limit (Hypothetical - NOT IMPLEMENTED)
- Completed: 50+ events = 500+ fights
- **Would scrape 500+ fights daily** ❌ (too much!)

---

## When to Use Each Mode

| Scenario | Command | Why |
|----------|---------|-----|
| **Daily production** | `include_completed=true` | Get outcomes + upcoming |
| **Testing changes** | `limit=2 include_completed=true` | Small dataset with outcomes |
| **Quick check** | `limit=5` | Fast verification |
| **Backfill outcomes** | Not supported - manual process | Historical data |
| **Current automation** | No parameters | Legacy behavior |

---

## Migration Path

### Current State
```bash
# .github/workflows/scraper.yml (line ~70)
scrapy crawl ufcstats -s LOG_LEVEL=INFO
```
Only scrapes upcoming events.

### Recommended Update
```bash
# .github/workflows/scraper.yml (line ~70)
scrapy crawl ufcstats -a include_completed=true -s LOG_LEVEL=INFO
```
Scrapes upcoming + 3 most recent completed with outcomes.

**Impact:**
- +3 events per run
- +30 fights per run
- Outcomes tracked automatically
- Backwards compatible (all fields optional)

---

## FAQ

**Q: Can I scrape more than 3 completed events?**
A: Not via parameter. The 3-event limit is hardcoded to prevent excessive scraping. To backfill historical data, run manual scrapes or modify the spider code.

**Q: Does the limit affect completed events?**
A: No. `limit` only affects upcoming events. Completed events are always limited to 3 most recent.

**Q: What if I want outcomes without upcoming events?**
A: Not supported. The spider always scrapes both (if `include_completed=true`) or just upcoming (if false).

**Q: Can I change the 3-event limit?**
A: Yes, but requires code change in `ufcstats.py:91`. Not recommended without good reason.

**Q: Why not scrape all completed events?**
A: UFCStats.com has hundreds of historical events. Scraping all of them would:
   - Take hours
   - Risk getting rate-limited or blocked
   - Waste bandwidth on data we don't need daily
   - Violate good web scraping etiquette

---

## Summary Table

| Parameter | Upcoming Events | Completed Events | Outcomes |
|-----------|----------------|------------------|----------|
| *none* | All | None | ❌ |
| `limit=N` | N nearest | None | ❌ |
| `include_completed=true` | All | 3 most recent | ✅ |
| `limit=N include_completed=true` | N nearest | 3 most recent | ✅ |

**Key Takeaway:** Completed events are ALWAYS limited to 3 when enabled. No exceptions.
