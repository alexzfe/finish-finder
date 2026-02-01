# Database Check Scripts

These scripts query the database to verify data integrity and state.

## Scripts

- `check-all-events.ts` - List all events with status (completed/upcoming)
- `check-database-duplicates.ts` - Comprehensive duplicate detection analysis
- `check-dates.ts` - Simple check of event dates
- `check-enriched-data.ts` - Display enriched event data with venue/location
- `check-enriched-fights.ts` - Show detailed fight info for a specific event
- `check-fighter-stats.ts` - Verify fighter statistics are populated
- `check-final-results.ts` - Final verification after scraper runs

## Usage

All scripts require `DATABASE_URL` to be set:

```bash
export DATABASE_URL="postgresql://..."
npx ts-node scripts/checks/check-all-events.ts
```
