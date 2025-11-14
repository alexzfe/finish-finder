/**
 * One-time migration script to convert winnerId from scraper hex IDs to database CUIDs
 *
 * Problem: winnerId field stores scraper's short hex IDs (e.g., "01641ba5df0c69b0")
 * but needs to store database CUIDs to match fighter.id for UI comparisons.
 *
 * Solution: For each fight with a winnerId:
 * 1. Extract the hex ID from both fighters' sourceUrls
 * 2. If winnerId matches either hex ID, update it to that fighter's CUID
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateWinnerIds() {
  console.log('Starting winnerId migration...\n');

  // Get all completed fights with winners
  const fights = await prisma.fight.findMany({
    where: {
      completed: true,
      winnerId: { not: null }
    },
    include: {
      fighter1: { select: { id: true, sourceUrl: true, name: true } },
      fighter2: { select: { id: true, sourceUrl: true, name: true } }
    }
  });

  console.log(`Found ${fights.length} completed fights with winners\n`);

  let updated = 0;
  let alreadyCorrect = 0;
  let failed = 0;

  for (const fight of fights) {
    // Check if winnerId is already a CUID (25 chars)
    if (fight.winnerId.length === 25) {
      alreadyCorrect++;
      continue;
    }

    // Extract hex IDs from fighter sourceUrls
    // Format: http://ufcstats.com/fighter-details/{hex_id}
    const extractHexId = (sourceUrl) => {
      if (!sourceUrl) return null;
      const match = sourceUrl.match(/([a-f0-9]{16})$/i);
      return match ? match[1] : null;
    };

    const fighter1HexId = extractHexId(fight.fighter1.sourceUrl);
    const fighter2HexId = extractHexId(fight.fighter2.sourceUrl);

    // Determine which fighter won based on hex ID match
    let newWinnerId = null;
    if (fight.winnerId === fighter1HexId) {
      newWinnerId = fight.fighter1.id;
    } else if (fight.winnerId === fighter2HexId) {
      newWinnerId = fight.fighter2.id;
    }

    if (newWinnerId) {
      await prisma.fight.update({
        where: { id: fight.id },
        data: { winnerId: newWinnerId }
      });
      console.log(`✓ Updated: ${fight.fighter1.name} vs ${fight.fighter2.name}`);
      console.log(`  Old: ${fight.winnerId} (16 chars) → New: ${newWinnerId} (25 chars)\n`);
      updated++;
    } else {
      console.log(`✗ Failed: ${fight.fighter1.name} vs ${fight.fighter2.name}`);
      console.log(`  Could not match winnerId ${fight.winnerId}\n`);
      failed++;
    }
  }

  console.log('\n=== Migration Summary ===');
  console.log(`Total fights: ${fights.length}`);
  console.log(`✓ Updated: ${updated}`);
  console.log(`✓ Already correct: ${alreadyCorrect}`);
  console.log(`✗ Failed: ${failed}`);

  await prisma.$disconnect();
}

migrateWinnerIds().catch(error => {
  console.error('Migration error:', error);
  process.exit(1);
});
