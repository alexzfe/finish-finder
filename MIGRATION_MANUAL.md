# Manual Database Migration Instructions

## Run This SQL in Supabase Dashboard

1. Go to your Supabase project: https://supabase.com/dashboard
2. Navigate to **SQL Editor** (in left sidebar)
3. Click **"New Query"**
4. Copy the SQL below and paste it into the editor
5. Click **"Run"** (or press Ctrl+Enter)

---

## Migration SQL

```sql
-- AlterTable - Add scraper fields to fighters
ALTER TABLE "fighters" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT,
ADD COLUMN IF NOT EXISTS "lastScrapedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "contentHash" TEXT;

-- AlterTable - Add scraper fields to events
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "cancelled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT,
ADD COLUMN IF NOT EXISTS "lastScrapedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "contentHash" TEXT;

-- AlterTable - Add scraper fields to fights
ALTER TABLE "fights" ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT,
ADD COLUMN IF NOT EXISTS "lastScrapedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "contentHash" TEXT;

-- CreateTable - scrape_logs
CREATE TABLE IF NOT EXISTS "scrape_logs" (
    "id" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "eventsFound" INTEGER NOT NULL DEFAULT 0,
    "fightsAdded" INTEGER NOT NULL DEFAULT 0,
    "fightsUpdated" INTEGER NOT NULL DEFAULT 0,
    "fightersAdded" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scrape_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex - Add indexes for better query performance
CREATE UNIQUE INDEX IF NOT EXISTS "fighters_sourceUrl_key" ON "fighters"("sourceUrl");
CREATE UNIQUE INDEX IF NOT EXISTS "events_sourceUrl_key" ON "events"("sourceUrl");
CREATE UNIQUE INDEX IF NOT EXISTS "fights_sourceUrl_key" ON "fights"("sourceUrl");
CREATE INDEX IF NOT EXISTS "scrape_logs_startTime_idx" ON "scrape_logs"("startTime");
CREATE INDEX IF NOT EXISTS "scrape_logs_status_idx" ON "scrape_logs"("status");
```

---

## What This Migration Does

This migration adds the necessary fields and tables for the new Python scraper:

### New Fields Added:
- **sourceUrl** - URL from UFCStats.com (unique identifier)
- **lastScrapedAt** - Timestamp of last scrape
- **contentHash** - SHA256 hash for change detection
- **cancelled** - Boolean flag for cancelled events (events table only)

### New Table:
- **scrape_logs** - Tracks each scraper run with counts and errors

---

## After Running

Once the SQL executes successfully (you should see "Success" message):

1. Come back to the terminal
2. Type "done" and I'll complete the setup
3. I'll generate the Prisma client with the new schema

---

## Troubleshooting

If you get errors about tables not existing:
- Make sure you selected the correct Supabase project
- Check that the `fighters`, `events`, and `fights` tables already exist
- If starting fresh, you may need to run the full Prisma migration first

If you get errors about columns already existing:
- The migration is idempotent (safe to run multiple times)
- The `IF NOT EXISTS` clauses will skip existing columns
