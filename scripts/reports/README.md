# Report Generation Scripts

Scripts for generating data reports and exports.

## Scripts

- `generate-csv-report.ts` - Generate CSV reports of events and fights
- `show-new-prediction.ts` - Display details of latest AI predictions

## Usage

```bash
export DATABASE_URL="postgresql://..."
npx ts-node scripts/reports/generate-csv-report.ts
```

Output files are written to project root.
