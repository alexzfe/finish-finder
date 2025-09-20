-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_fighters" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
INSERT INTO "new_fighters" ("averageFightTime", "createdAt", "draws", "fanFavorite", "fightingStyles", "finishRate", "funScore", "id", "imageUrl", "koPercentage", "lastFightDate", "losses", "name", "nickname", "recentBuzzScore", "significantStrikesPerMinute", "socialFollowers", "submissionPercentage", "takedownAccuracy", "updatedAt", "weightClass", "wins") SELECT "averageFightTime", "createdAt", "draws", "fanFavorite", "fightingStyles", "finishRate", "funScore", "id", "imageUrl", "koPercentage", "lastFightDate", "losses", "name", "nickname", "recentBuzzScore", "significantStrikesPerMinute", "socialFollowers", "submissionPercentage", "takedownAccuracy", "updatedAt", "weightClass", "wins" FROM "fighters";
DROP TABLE "fighters";
ALTER TABLE "new_fighters" RENAME TO "fighters";
CREATE TABLE "new_fights" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "predictedFunScore" REAL NOT NULL DEFAULT 0,
    "funFactors" TEXT NOT NULL DEFAULT '[]',
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
INSERT INTO "new_fights" ("actualFunScore", "aiDescription", "bookingDate", "cardPosition", "completed", "createdAt", "eventId", "fighter1Id", "fighter2Id", "funFactors", "id", "mainEvent", "method", "predictedFunScore", "round", "time", "titleFight", "updatedAt", "weightClass", "winnerId") SELECT "actualFunScore", "aiDescription", "bookingDate", "cardPosition", "completed", "createdAt", "eventId", "fighter1Id", "fighter2Id", "funFactors", "id", "mainEvent", "method", "predictedFunScore", "round", "time", "titleFight", "updatedAt", "weightClass", "winnerId" FROM "fights";
DROP TABLE "fights";
ALTER TABLE "new_fights" RENAME TO "fights";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
