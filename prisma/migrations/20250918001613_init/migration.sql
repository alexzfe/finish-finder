-- CreateTable
CREATE TABLE "fighters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nickname" TEXT,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "weightClass" TEXT NOT NULL,
    "imageUrl" TEXT,
    "finishRate" REAL NOT NULL DEFAULT 0,
    "koPercentage" REAL NOT NULL DEFAULT 0,
    "submissionPercentage" REAL NOT NULL DEFAULT 0,
    "averageFightTime" INTEGER NOT NULL DEFAULT 0,
    "significantStrikesPerMinute" REAL NOT NULL DEFAULT 0,
    "takedownAccuracy" REAL NOT NULL DEFAULT 0,
    "socialFollowers" INTEGER NOT NULL DEFAULT 0,
    "recentBuzzScore" REAL NOT NULL DEFAULT 0,
    "fanFavorite" BOOLEAN NOT NULL DEFAULT false,
    "funScore" REAL NOT NULL DEFAULT 0,
    "fightingStyles" TEXT NOT NULL DEFAULT '[]',
    "lastFightDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "location" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "fights" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fighter1Id" TEXT NOT NULL,
    "fighter2Id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "weightClass" TEXT NOT NULL,
    "titleFight" BOOLEAN NOT NULL DEFAULT false,
    "mainEvent" BOOLEAN NOT NULL DEFAULT false,
    "cardPosition" INTEGER NOT NULL DEFAULT 0,
    "predictedFunScore" REAL NOT NULL DEFAULT 0,
    "funFactors" TEXT NOT NULL,
    "aiDescription" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "actualFunScore" REAL,
    "winnerId" TEXT,
    "method" TEXT,
    "round" INTEGER,
    "time" TEXT,
    "bookingDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "fights_fighter1Id_fkey" FOREIGN KEY ("fighter1Id") REFERENCES "fighters" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fights_fighter2Id_fkey" FOREIGN KEY ("fighter2Id") REFERENCES "fighters" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fights_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fun_score_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fightId" TEXT NOT NULL,
    "predictedScore" REAL NOT NULL,
    "actualScore" REAL,
    "accuracy" REAL,
    "modelVersion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "prediction_models" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" TEXT NOT NULL,
    "finishRateWeight" REAL NOT NULL DEFAULT 0.3,
    "stylisticWeight" REAL NOT NULL DEFAULT 0.25,
    "popularityWeight" REAL NOT NULL DEFAULT 0.15,
    "stakesWeight" REAL NOT NULL DEFAULT 0.2,
    "historicalWeight" REAL NOT NULL DEFAULT 0.1,
    "confidence" REAL NOT NULL DEFAULT 0,
    "trainingAccuracy" REAL NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "prediction_models_version_key" ON "prediction_models"("version");
