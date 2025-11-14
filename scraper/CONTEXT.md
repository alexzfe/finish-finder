# UFC Scraper Documentation

*This file documents the Python-based Scrapy scraper for collecting UFC fight data from UFCStats.com.*

## Architecture

The scraper uses **Scrapy** framework with custom pipelines for data extraction, validation, and ingestion via Next.js API endpoint.

## UFC-Only Statistics Pattern

**Critical**: UFCStats.com provides overall career records but UFC-only fight statistics. All calculated rates must use UFC wins/losses as denominator.

### Offensive Finish Rate Calculation

Located in `ufc_scraper/parsers.py` (lines 548-565):

```python
# Calculate UFC-only wins (NOT overall career wins)
wins_by_ko = fighter.get('winsByKO', 0)
wins_by_sub = fighter.get('winsBySubmission', 0)
wins_by_decision = fighter.get('winsByDecision', 0)
ufc_wins = wins_by_ko + wins_by_sub + wins_by_decision

# Use UFC wins as denominator for all rates
if ufc_wins > 0:
    finish_rate = (wins_by_ko + wins_by_sub) / ufc_wins
    ko_percentage = wins_by_ko / ufc_wins
    submission_percentage = wins_by_sub / ufc_wins
```

### Defensive Loss Finish Rate Calculation (NEW)

Located in `ufc_scraper/parsers.py` (lines 596-611):

```python
# Calculate UFC-only losses (NOT overall career losses)
losses_by_ko = fighter.get('lossesByKO', 0)
losses_by_sub = fighter.get('lossesBySubmission', 0)
losses_by_decision = fighter.get('lossesByDecision', 0)
ufc_losses = losses_by_ko + losses_by_sub + losses_by_decision

# Use UFC losses as denominator for defensive vulnerability rates
if ufc_losses > 0:
    loss_finish_rate = (losses_by_ko + losses_by_sub) / ufc_losses
    fighter['lossFinishRate'] = round(loss_finish_rate, 3)
    fighter['koLossPercentage'] = round(losses_by_ko / ufc_losses, 3)
    fighter['submissionLossPercentage'] = round(losses_by_sub / ufc_losses, 3)
```

**Why This Matters**: Loss finish rate is the PRIMARY indicator of defensive vulnerability. A fighter with 70% loss finish rate is frequently finished when they lose - critical for predicting finish probability.

Example: Fighter with 5 career losses but only 3 UFC losses (2 KO, 1 SUB) → 100% loss finish rate (highly vulnerable).

## Scraper Behavior

The scraper (`ufc_scraper/spiders/ufcstats.py`) scrapes both upcoming and completed events:
- **Upcoming events**: All events (or limited by `limit` parameter)
- **Completed events**: 2 most recent events (enabled by default via `include_completed=true`)

Completed events provide fight outcome data for cancelled fight detection and reconciliation.

## Integration Points

- **Ingestion API**: `/api/internal/ingest` validates and stores scraped data, performs scoped reconciliation to mark cancelled fights
- **GitHub Actions**: `.github/workflows/scraper.yml` runs daily at 2 AM UTC with `include_completed=true` default
- **Database**: Prisma models (Fighter, Event, Fight) receive scraped data

---

*This file was created as part of the 3-tier documentation system to document the scraper component.*
