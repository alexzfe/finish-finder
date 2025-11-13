#!/usr/bin/env node
/**
 * Cleanup duplicate fights before applying unique constraint
 *
 * This script finds and removes duplicate fight records where the same
 * fighter pairing exists multiple times for the same event.
 *
 * Strategy: Keep the most recent fight (by createdAt) and delete older duplicates.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL,
});

async function findDuplicates() {
  console.log('='.repeat(70));
  console.log('FINDING DUPLICATE FIGHTS');
  console.log('='.repeat(70));

  // Find all fights grouped by the composite key
  const duplicates = await prisma.$queryRaw`
    SELECT
      "eventId",
      "fighter1Id",
      "fighter2Id",
      COUNT(*) as count,
      array_agg(id ORDER BY "createdAt" DESC) as fight_ids,
      array_agg("createdAt" ORDER BY "createdAt" DESC) as created_dates
    FROM fights
    GROUP BY "eventId", "fighter1Id", "fighter2Id"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC;
  `;

  if (duplicates.length === 0) {
    console.log('\n✅ No duplicates found! Database is clean.');
    return [];
  }

  console.log(`\n⚠️  Found ${duplicates.length} duplicate fight groups\n`);

  let totalDuplicates = 0;
  for (const dup of duplicates) {
    totalDuplicates += Number(dup.count) - 1;
  }

  console.log(`Total fights to delete: ${totalDuplicates}\n`);

  // Show details
  console.log('Duplicate groups (showing first 10):');
  console.log('-'.repeat(70));

  for (let i = 0; i < Math.min(10, duplicates.length); i++) {
    const dup = duplicates[i];
    console.log(`\nGroup ${i + 1}: ${dup.count} duplicates`);
    console.log(`  Event ID: ${dup.eventId}`);
    console.log(`  Fighter 1 ID: ${dup.fighter1Id}`);
    console.log(`  Fighter 2 ID: ${dup.fighter2Id}`);
    console.log(`  Will keep: ${dup.fight_ids[0]} (most recent)`);
    console.log(`  Will delete: ${dup.fight_ids.slice(1).join(', ')}`);
  }

  if (duplicates.length > 10) {
    console.log(`\n... and ${duplicates.length - 10} more duplicate groups`);
  }

  return duplicates;
}

async function cleanupDuplicates(duplicates, dryRun = true) {
  if (duplicates.length === 0) {
    return { deleted: 0, kept: 0 };
  }

  console.log('\n' + '='.repeat(70));
  if (dryRun) {
    console.log('DRY RUN - NO CHANGES WILL BE MADE');
  } else {
    console.log('CLEANING UP DUPLICATES');
  }
  console.log('='.repeat(70));

  let totalDeleted = 0;
  let totalKept = 0;

  for (const dup of duplicates) {
    const fightIds = dup.fight_ids;
    const keepId = fightIds[0]; // Most recent
    const deleteIds = fightIds.slice(1); // Older duplicates

    console.log(`\nProcessing: Event ${dup.eventId}`);
    console.log(`  Keeping: ${keepId}`);
    console.log(`  Deleting: ${deleteIds.length} older duplicate(s)`);

    if (!dryRun) {
      // Delete older duplicates
      const result = await prisma.fight.deleteMany({
        where: {
          id: { in: deleteIds },
        },
      });

      console.log(`  ✅ Deleted ${result.count} fight(s)`);
      totalDeleted += result.count;
    } else {
      console.log(`  [DRY RUN] Would delete ${deleteIds.length} fight(s)`);
      totalDeleted += deleteIds.length;
    }

    totalKept++;
  }

  console.log('\n' + '='.repeat(70));
  console.log('CLEANUP SUMMARY');
  console.log('='.repeat(70));
  console.log(`Unique fights kept: ${totalKept}`);
  console.log(`Duplicate fights ${dryRun ? 'to be ' : ''}deleted: ${totalDeleted}`);

  return { deleted: totalDeleted, kept: totalKept };
}

async function verifyNoDuplicates() {
  console.log('\n' + '='.repeat(70));
  console.log('VERIFYING NO DUPLICATES REMAIN');
  console.log('='.repeat(70));

  const remaining = await prisma.$queryRaw`
    SELECT
      "eventId",
      "fighter1Id",
      "fighter2Id",
      COUNT(*) as count
    FROM fights
    GROUP BY "eventId", "fighter1Id", "fighter2Id"
    HAVING COUNT(*) > 1;
  `;

  if (remaining.length === 0) {
    console.log('\n✅ SUCCESS: No duplicates found!');
    console.log('Database is ready for unique constraint migration.');
    return true;
  } else {
    console.log(`\n❌ ERROR: ${remaining.length} duplicate groups still exist!`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  console.log('\n' + '='.repeat(70));
  console.log('DUPLICATE FIGHT CLEANUP SCRIPT');
  console.log('='.repeat(70));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'EXECUTE (will delete duplicates)'}`);
  console.log('Database:', process.env.DATABASE_URL ? 'Production' : 'Local');
  console.log('='.repeat(70));

  try {
    // Step 1: Find duplicates
    const duplicates = await findDuplicates();

    if (duplicates.length === 0) {
      await prisma.$disconnect();
      return;
    }

    // Step 2: Clean up duplicates
    await cleanupDuplicates(duplicates, dryRun);

    // Step 3: Verify (only if not dry run)
    if (!dryRun) {
      const success = await verifyNoDuplicates();
      if (!success) {
        console.log('\n⚠️  Please re-run the script to clean up remaining duplicates.');
        process.exit(1);
      }
    } else {
      console.log('\n' + '='.repeat(70));
      console.log('DRY RUN COMPLETE');
      console.log('='.repeat(70));
      console.log('To actually delete duplicates, run:');
      console.log('  node scripts/cleanup-duplicate-fights.js --execute');
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
