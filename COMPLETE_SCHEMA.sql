-- Complete Finish Finder Database Schema
-- Run this in Supabase SQL Editor for a fresh database

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Fighters table
CREATE TABLE IF NOT EXISTS "fighters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nickname" TEXT,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "weightClass" TEXT NOT NULL,
    "imageUrl" TEXT,
    "record" TEXT,
    "height" TEXT,
    "reach" TEXT,
    "age" INTEGER,
    "nationality" TEXT,
    "winsByKO" INTEGER NOT NULL DEFAULT 0,
    "winsBySubmission" INTEGER NOT NULL DEFAULT 0,
    "winsByDecision" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" TEXT,
    "ranking" INTEGER,
    "finishRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "koPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "submissionPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageFightTime" INTEGER NOT NULL DEFAULT 0,
    "significantStrikesPerMinute" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "takedownAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "socialFollowers" INTEGER NOT NULL DEFAULT 0,
    "recentBuzzScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fanFavorite" BOOLEAN NOT NULL DEFAULT false,
    "funScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fightingStyles" TEXT NOT NULL DEFAULT '[]',
    "lastFightDate" TIMESTAMP(3),
    "sourceUrl" TEXT,
    "lastScrapedAt" TIMESTAMP(3),
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fighters_pkey" PRIMARY KEY ("id")
);

-- Events table
CREATE TABLE IF NOT EXISTS "events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "sourceUrl" TEXT,
    "lastScrapedAt" TIMESTAMP(3),
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- Fights table
CREATE TABLE IF NOT EXISTS "fights" (
    "id" TEXT NOT NULL,
    "fighter1Id" TEXT NOT NULL,
    "fighter2Id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "weightClass" TEXT NOT NULL,
    "titleFight" BOOLEAN NOT NULL DEFAULT false,
    "mainEvent" BOOLEAN NOT NULL DEFAULT false,
    "cardPosition" TEXT NOT NULL DEFAULT 'preliminary',
    "scheduledRounds" INTEGER NOT NULL DEFAULT 3,
    "fightNumber" INTEGER,
    "funFactor" INTEGER NOT NULL DEFAULT 0,
    "finishProbability" INTEGER NOT NULL DEFAULT 0,
    "entertainmentReason" TEXT,
    "keyFactors" TEXT NOT NULL DEFAULT '[]',
    "fightPrediction" TEXT,
    "riskLevel" TEXT,
    "predictedFunScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "funFactors" TEXT NOT NULL DEFAULT '[]',
    "aiDescription" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "actualFunScore" DOUBLE PRECISION,
    "winnerId" TEXT,
    "method" TEXT,
    "round" INTEGER,
    "time" TEXT,
    "bookingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceUrl" TEXT,
    "lastScrapedAt" TIMESTAMP(3),
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fights_pkey" PRIMARY KEY ("id")
);

-- Fun Score History table
CREATE TABLE IF NOT EXISTS "fun_score_history" (
    "id" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "predictedScore" DOUBLE PRECISION NOT NULL,
    "actualScore" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "modelVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fun_score_history_pkey" PRIMARY KEY ("id")
);

-- Prediction Models table
CREATE TABLE IF NOT EXISTS "prediction_models" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "finishRateWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "stylisticWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "popularityWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "stakesWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "historicalWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trainingAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prediction_models_pkey" PRIMARY KEY ("id")
);

-- Prediction Usage table
CREATE TABLE IF NOT EXISTS "prediction_usage" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "fightsProcessed" INTEGER NOT NULL,
    "chunks" INTEGER NOT NULL,
    "promptTokensEstimated" INTEGER NOT NULL,
    "completionTokensEstimated" INTEGER NOT NULL,
    "totalTokensEstimated" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prediction_usage_pkey" PRIMARY KEY ("id")
);

-- Query Metrics table
CREATE TABLE IF NOT EXISTS "query_metrics" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "model" TEXT,
    "action" TEXT,
    "duration" INTEGER NOT NULL,
    "performance" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_metrics_pkey" PRIMARY KEY ("id")
);

-- Scrape Logs table (NEW)
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

-- Create unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS "prediction_models_version_key" ON "prediction_models"("version");
CREATE UNIQUE INDEX IF NOT EXISTS "fighters_sourceUrl_key" ON "fighters"("sourceUrl");
CREATE UNIQUE INDEX IF NOT EXISTS "events_sourceUrl_key" ON "events"("sourceUrl");
CREATE UNIQUE INDEX IF NOT EXISTS "fights_sourceUrl_key" ON "fights"("sourceUrl");

-- Create indexes for query performance
CREATE INDEX IF NOT EXISTS "query_metrics_timestamp_idx" ON "query_metrics"("timestamp");
CREATE INDEX IF NOT EXISTS "query_metrics_performance_idx" ON "query_metrics"("performance");
CREATE INDEX IF NOT EXISTS "query_metrics_model_action_idx" ON "query_metrics"("model", "action");
CREATE INDEX IF NOT EXISTS "scrape_logs_startTime_idx" ON "scrape_logs"("startTime");
CREATE INDEX IF NOT EXISTS "scrape_logs_status_idx" ON "scrape_logs"("status");

-- Add foreign key constraints
ALTER TABLE "fights" DROP CONSTRAINT IF EXISTS "fights_eventId_fkey";
ALTER TABLE "fights" ADD CONSTRAINT "fights_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fights" DROP CONSTRAINT IF EXISTS "fights_fighter1Id_fkey";
ALTER TABLE "fights" ADD CONSTRAINT "fights_fighter1Id_fkey"
    FOREIGN KEY ("fighter1Id") REFERENCES "fighters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fights" DROP CONSTRAINT IF EXISTS "fights_fighter2Id_fkey";
ALTER TABLE "fights" ADD CONSTRAINT "fights_fighter2Id_fkey"
    FOREIGN KEY ("fighter2Id") REFERENCES "fighters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prediction_usage" DROP CONSTRAINT IF EXISTS "prediction_usage_eventId_fkey";
ALTER TABLE "prediction_usage" ADD CONSTRAINT "prediction_usage_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
