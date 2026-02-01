# Database Maintenance Scripts

Scripts for database maintenance operations.

## Scripts

- `wipe-database.ts` - ⚠️ **DANGER**: Delete ALL data from database

## Usage

```bash
export DATABASE_URL="postgresql://..."
npx ts-node scripts/maintenance/wipe-database.ts
```

⚠️ **All maintenance scripts should be used with extreme caution!**
