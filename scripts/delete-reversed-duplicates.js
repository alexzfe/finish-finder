#!/usr/bin/env node
/**
 * Delete duplicate fights where fighter1/fighter2 are reversed
 *
 * Example:
 *   Fight 1: Fighter A vs Fighter B
 *   Fight 2: Fighter B vs Fighter A  <-- This is a duplicate!
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

async function main() {
  const dryRun = !process.argv.includes('--execute');

  console.log('='.repeat(70));
  console.log('FINDING REVERSED DUPLICATE FIGHTS');
  console.log('='.repeat(70));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}\n`);

  const fights = await prisma.fight.findMany({
    include: {
      fighter1: { select: { name: true } },
      fighter2: { select: { name: true } },
      event: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Total fights: ${fights.length}\n`);

  // Find reversed duplicates
  const toDelete = [];
  const seen = new Set();

  for (const fight of fights) {
    // Create normalized key (sorted fighter IDs)
    const [id1, id2] = [fight.fighter1Id, fight.fighter2Id].sort();
    const key = `${fight.eventId}|${id1}|${id2}`;

    if (seen.has(key)) {
      // This is a duplicate (reversed)
      toDelete.push(fight);
    } else {
      // First occurrence, keep it
      seen.add(key);
    }
  }

  if (toDelete.length === 0) {
    console.log('✅ No reversed duplicates found!\n');
    await prisma.$disconnect();
    return;
  }

  console.log(`⚠️  Found ${toDelete.length} reversed duplicates:\n`);

  // Show first 20
  for (let i = 0; i < Math.min(20, toDelete.length); i++) {
    const fight = toDelete[i];
    console.log(`${i + 1}. ${fight.event.name}`);
    console.log(`   ${fight.fighter1.name} vs ${fight.fighter2.name}`);
    console.log(`   ID: ${fight.id}`);
    console.log(`   Created: ${fight.createdAt}\n`);
  }

  if (toDelete.length > 20) {
    console.log(`... and ${toDelete.length - 20} more\n`);
  }

  if (dryRun) {
    console.log('='.repeat(70));
    console.log('DRY RUN COMPLETE - NO CHANGES MADE');
    console.log('='.repeat(70));
    console.log('\nTo delete these duplicates, run:');
    console.log('  DATABASE_URL="..." node scripts/delete-reversed-duplicates.js --execute\n');
  } else {
    console.log('='.repeat(70));
    console.log('DELETING DUPLICATES');
    console.log('='.repeat(70));

    const deleteIds = toDelete.map(f => f.id);
    const result = await prisma.fight.deleteMany({
      where: { id: { in: deleteIds } },
    });

    console.log(`\n✅ Deleted ${result.count} duplicate fights\n`);

    // Verify
    const remaining = await prisma.fight.findMany();
    console.log(`Remaining fights: ${remaining.length}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
