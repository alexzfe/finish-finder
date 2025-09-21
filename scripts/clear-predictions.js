#!/usr/bin/env node

/**
 * Clear all AI prediction data from the database
 * This script resets all AI-generated fields in the Fight model to their default values
 * so that the prediction model can be re-run with the new prompt.
 */

const { PrismaClient } = require('@prisma/client');

async function clearPredictions() {
  const prisma = new PrismaClient();

  try {
    console.log('🧹 Starting prediction data cleanup...');

    // Get count of fights with predictions before clearing
    const fightsWithPredictions = await prisma.fight.count({
      where: {
        OR: [
          { funFactor: { not: 0 } },
          { finishProbability: { not: 0 } },
          { entertainmentReason: { not: null } },
          { fightPrediction: { not: null } },
          { riskLevel: { not: null } },
          { predictedFunScore: { not: 0 } },
          { aiDescription: { not: null } }
        ]
      }
    });

    console.log(`📊 Found ${fightsWithPredictions} fights with prediction data`);

    if (fightsWithPredictions === 0) {
      console.log('✅ No prediction data found to clear');
      return;
    }

    // Clear all AI prediction fields
    const result = await prisma.fight.updateMany({
      data: {
        funFactor: 0,
        finishProbability: 0,
        entertainmentReason: null,
        keyFactors: "[]",
        fightPrediction: null,
        riskLevel: null,
        predictedFunScore: 0,
        funFactors: "[]",
        aiDescription: null
      }
    });

    console.log(`🗑️  Cleared prediction data from ${result.count} fights`);

    // Also clear prediction usage history
    const usageResult = await prisma.predictionUsage.deleteMany({});
    console.log(`📋 Cleared ${usageResult.count} prediction usage records`);

    // Verify the cleanup
    const remainingPredictions = await prisma.fight.count({
      where: {
        OR: [
          { funFactor: { not: 0 } },
          { finishProbability: { not: 0 } },
          { entertainmentReason: { not: null } },
          { fightPrediction: { not: null } },
          { riskLevel: { not: null } },
          { predictedFunScore: { not: 0 } },
          { aiDescription: { not: null } }
        ]
      }
    });

    if (remainingPredictions === 0) {
      console.log('✅ All prediction data successfully cleared!');
      console.log('🔄 You can now run the scraper to regenerate predictions with the new prompt');
    } else {
      console.log(`⚠️  Warning: ${remainingPredictions} fights still have prediction data`);
    }

  } catch (error) {
    console.error('❌ Error clearing predictions:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
clearPredictions()
  .then(() => {
    console.log('🎉 Prediction cleanup completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Prediction cleanup failed:', error);
    process.exit(1);
  });