-- CreateTable
CREATE TABLE "public"."fighters" (
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fighters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."fights" (
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."fun_score_history" (
    "id" TEXT NOT NULL,
    "fightId" TEXT NOT NULL,
    "predictedScore" DOUBLE PRECISION NOT NULL,
    "actualScore" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "modelVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fun_score_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."prediction_models" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prediction_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."prediction_usage" (
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

-- CreateIndex
CREATE UNIQUE INDEX "prediction_models_version_key" ON "public"."prediction_models"("version");

-- AddForeignKey
ALTER TABLE "public"."fights" ADD CONSTRAINT "fights_fighter1Id_fkey" FOREIGN KEY ("fighter1Id") REFERENCES "public"."fighters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."fights" ADD CONSTRAINT "fights_fighter2Id_fkey" FOREIGN KEY ("fighter2Id") REFERENCES "public"."fighters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."fights" ADD CONSTRAINT "fights_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."prediction_usage" ADD CONSTRAINT "prediction_usage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
