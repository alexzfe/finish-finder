-- CreateTable
CREATE TABLE "query_metrics" (
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

-- CreateIndex
CREATE INDEX "query_metrics_timestamp_idx" ON "query_metrics"("timestamp");

-- CreateIndex
CREATE INDEX "query_metrics_performance_idx" ON "query_metrics"("performance");

-- CreateIndex
CREATE INDEX "query_metrics_model_action_idx" ON "query_metrics"("model", "action");