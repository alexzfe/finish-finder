-- CreateTable
CREATE TABLE "prediction_usage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "fightsProcessed" INTEGER NOT NULL,
    "chunks" INTEGER NOT NULL,
    "promptTokensEstimated" INTEGER NOT NULL,
    "completionTokensEstimated" INTEGER NOT NULL,
    "totalTokensEstimated" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prediction_usage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
