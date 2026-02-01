# Duplicate Detection & Cleanup Scripts

Scripts for finding and resolving duplicate events/fights in the database.

## Scripts

- `analyze-specific-duplicates.ts` - Deep analysis of specific duplicate patterns
- `cleanup-duplicates.ts` - Remove confirmed duplicates from database
- `fresh-duplicate-check.ts` - Fresh analysis without connection conflicts
- `simple-duplicate-check.ts` - Quick duplicate detection
- `test-deduplication.ts` - Test deduplication logic against test cases

## Usage

```bash
export DATABASE_URL="postgresql://..."
npx ts-node scripts/duplicates/simple-duplicate-check.ts
```

⚠️ **Warning**: `cleanup-duplicates.ts` modifies the database. Run checks first!
