-- AlterTable
ALTER TABLE "fighters" ADD COLUMN "sourceUrl" TEXT,
ADD COLUMN "lastScrapedAt" TIMESTAMP(3),
ADD COLUMN "contentHash" TEXT;

-- AlterTable
ALTER TABLE "events" ADD COLUMN "cancelled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sourceUrl" TEXT,
ADD COLUMN "lastScrapedAt" TIMESTAMP(3),
ADD COLUMN "contentHash" TEXT;

-- AlterTable
ALTER TABLE "fights" ADD COLUMN "sourceUrl" TEXT,
ADD COLUMN "lastScrapedAt" TIMESTAMP(3),
ADD COLUMN "contentHash" TEXT;

-- CreateTable
CREATE TABLE "scrape_logs" (
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

-- CreateIndex
CREATE UNIQUE INDEX "fighters_sourceUrl_key" ON "fighters"("sourceUrl");

-- CreateIndex
CREATE UNIQUE INDEX "events_sourceUrl_key" ON "events"("sourceUrl");

-- CreateIndex
CREATE UNIQUE INDEX "fights_sourceUrl_key" ON "fights"("sourceUrl");

-- CreateIndex
CREATE INDEX "scrape_logs_startTime_idx" ON "scrape_logs"("startTime");

-- CreateIndex
CREATE INDEX "scrape_logs_status_idx" ON "scrape_logs"("status");
