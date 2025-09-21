#!/usr/bin/env node

/**
 * Verify that prediction data has been cleared from the database
 */

const { PrismaClient } = require('@prisma/client');

async function verifyPredictionsCleared() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Verifying prediction data has been cleared...');

    // Check for any remaining prediction data
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

    // Get total fight count
    const totalFights = await prisma.fight.count();

    // Sample a few fights to show their current state
    const sampleFights = await prisma.fight.findMany({
      take: 3,
      select: {
        id: true,
        funFactor: true,
        finishProbability: true,
        entertainmentReason: true,
        fightPrediction: true,
        riskLevel: true,
        predictedFunScore: true,
        aiDescription: true,
        fighter1: { select: { name: true } },
        fighter2: { select: { name: true } }
      }
    });

    console.log(`📊 Database Status:`);
    console.log(`   Total fights: ${totalFights}`);
    console.log(`   Fights with predictions: ${fightsWithPredictions}`);
    console.log(`   Fights cleared: ${totalFights - fightsWithPredictions}`);

    if (fightsWithPredictions === 0) {
      console.log('✅ SUCCESS: All prediction data has been cleared!');
    } else {
      console.log(`❌ WARNING: ${fightsWithPredictions} fights still have prediction data`);
    }

    console.log('\n🔍 Sample fight data:');
    sampleFights.forEach((fight, index) => {
      console.log(`${index + 1}. ${fight.fighter1.name} vs ${fight.fighter2.name}`);
      console.log(`   funFactor: ${fight.funFactor}`);
      console.log(`   finishProbability: ${fight.finishProbability}`);
      console.log(`   entertainmentReason: ${fight.entertainmentReason}`);
      console.log(`   aiDescription: ${fight.aiDescription}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error verifying predictions:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
verifyPredictionsCleared()
  .then(() => {
    console.log('✅ Verification completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Verification failed:', error);
    process.exit(1);
  });