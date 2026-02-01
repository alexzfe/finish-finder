# Scripts

Utility and maintenance scripts for Finish Finder.

## Directory Structure

```
scripts/
├── checks/       # Database verification and inspection scripts
├── duplicates/   # Duplicate detection and cleanup tools
├── maintenance/  # ⚠️ Database maintenance operations
└── reports/      # Report generation and data exports
```

## Quick Reference

### Database Checks
```bash
npx ts-node scripts/checks/check-all-events.ts
npx ts-node scripts/checks/check-database-duplicates.ts
npx ts-node scripts/checks/check-fighter-stats.ts
```

### Duplicate Management
```bash
# Check for duplicates
npx ts-node scripts/duplicates/simple-duplicate-check.ts

# Analyze specific patterns
npx ts-node scripts/duplicates/analyze-specific-duplicates.ts

# Clean up confirmed duplicates (⚠️ destructive)
npx ts-node scripts/duplicates/cleanup-duplicates.ts
```

### Reports
```bash
npx ts-node scripts/reports/generate-csv-report.ts
npx ts-node scripts/reports/show-new-prediction.ts
```

### ⚠️ Maintenance (Use with Caution)
```bash
# Wipe all data (DANGER)
npx ts-node scripts/maintenance/wipe-database.ts
```

## Environment Variables

All scripts that access the database require:

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/db"
```

Optional variables depend on the specific script.
