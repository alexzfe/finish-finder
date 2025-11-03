-- Migration: Add Fighter Stats and New Prediction System
-- Created: 2025-11-02
-- Description: Adds detailed fighter statistics from UFCStats.com and new prediction tracking models

-- ============================================================================
-- PART 1: Add new fighter statistics columns
-- ============================================================================

-- Physical Attributes
ALTER TABLE "fighters" ADD COLUMN "weightLbs" INTEGER;
ALTER TABLE "fighters" ADD COLUMN "reachInches" INTEGER;
ALTER TABLE "fighters" ADD COLUMN "stance" TEXT;
ALTER TABLE "fighters" ADD COLUMN "dob" TEXT;

-- Striking Statistics (all from UFCStats.com)
ALTER TABLE "fighters" ADD COLUMN "significantStrikesLandedPerMinute" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "fighters" ADD COLUMN "strikingAccuracyPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "fighters" ADD COLUMN "significantStrikesAbsorbedPerMinute" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "fighters" ADD COLUMN "strikingDefensePercentage" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Grappling Statistics
ALTER TABLE "fighters" ADD COLUMN "takedownAverage" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "fighters" ADD COLUMN "takedownAccuracyPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "fighters" ADD COLUMN "takedownDefensePercentage" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "fighters" ADD COLUMN "submissionAverage" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Fight Averages
ALTER TABLE "fighters" ADD COLUMN "averageFightTimeSeconds" INTEGER NOT NULL DEFAULT 0;

-- ============================================================================
-- PART 2: Create new prediction tracking tables
-- ============================================================================

-- PredictionVersion: Tracks different versions of prompts and their accuracy
CREATE TABLE "prediction_versions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "finishPromptHash" TEXT NOT NULL,
    "funScorePromptHash" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Accuracy metrics (updated after events)
    "finishAccuracy" DOUBLE PRECISION,
    "brierScore" DOUBLE PRECISION,
    "funScoreCorrelation" DOUBLE PRECISION,
    "evaluatedAt" TIMESTAMP(3),

    CONSTRAINT "prediction_versions_pkey" PRIMARY KEY ("id")
);

-- Prediction: Individual fight predictions with full tracking
CREATE TABLE "predictions" (
    "id" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,

    -- Finish Probability Prediction
    "finishProbability" DOUBLE PRECISION NOT NULL,
    "finishConfidence" DOUBLE PRECISION NOT NULL,
    "finishReasoning" JSONB NOT NULL,

    -- Fun Score Prediction
    "funScore" DOUBLE PRECISION NOT NULL,
    "funConfidence" DOUBLE PRECISION NOT NULL,
    "funBreakdown" JSONB NOT NULL,

    -- Metadata
    "modelUsed" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Evaluation (filled after fight completes)
    "actualFinish" BOOLEAN,
    "actualFinishMethod" TEXT,
    "actualFunScore" DOUBLE PRECISION,
    "finishPredictionCorrect" BOOLEAN,

    CONSTRAINT "predictions_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- PART 3: Create unique constraints and indexes
-- ============================================================================

-- PredictionVersion unique constraint and indexes
CREATE UNIQUE INDEX "prediction_versions_version_key" ON "prediction_versions"("version");
CREATE INDEX "prediction_versions_active_idx" ON "prediction_versions"("active");
CREATE INDEX "prediction_versions_createdAt_idx" ON "prediction_versions"("createdAt");

-- Prediction unique constraint and indexes
CREATE UNIQUE INDEX "predictions_fightId_versionId_key" ON "predictions"("fightId", "versionId");
CREATE INDEX "predictions_versionId_idx" ON "predictions"("versionId");
CREATE INDEX "predictions_createdAt_idx" ON "predictions"("createdAt");
CREATE INDEX "predictions_actualFinish_idx" ON "predictions"("actualFinish");

-- ============================================================================
-- PART 4: Add foreign key constraints
-- ============================================================================

-- Prediction → Fight foreign key (cascade on delete)
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_fightId_fkey"
    FOREIGN KEY ("fightId") REFERENCES "fights"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prediction → PredictionVersion foreign key
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_versionId_fkey"
    FOREIGN KEY ("versionId") REFERENCES "prediction_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- - Added 13 new statistical fields to fighters table
-- - Created prediction_versions table for tracking prompt iterations
-- - Created predictions table for tracking individual fight predictions
-- - Added proper indexes for query performance
-- - Added foreign key constraints with cascade rules
