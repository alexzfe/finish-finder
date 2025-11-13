#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

async function main() {
  console.log('Checking for duplicate fights...\n');

  // Get all fights
  const fights = await prisma.fight.findMany({
    select: {
      id: true,
      eventId: true,
      fighter1Id: true,
      fighter2Id: true,
      createdAt: true,
      event: {
        select: {
          name: true,
        },
      },
      fighter1: {
        select: {
          name: true,
        },
      },
      fighter2: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  console.log(`Total fights in database: ${fights.length}\n`);

  // Group fights by composite key
  const groups = new Map();

  for (const fight of fights) {
    const key = `${fight.eventId}|${fight.fighter1Id}|${fight.fighter2Id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(fight);
  }

  // Find duplicates
  const duplicates = [];
  for (const [key, fights] of groups.entries()) {
    if (fights.length > 1) {
      duplicates.push({ key, fights });
    }
  }

  if (duplicates.length === 0) {
    console.log('✅ No duplicates found!');
  } else {
    console.log(`⚠️  Found ${duplicates.length} duplicate groups:\n`);

    let totalDups = 0;
    for (let i = 0; i < Math.min(20, duplicates.length); i++) {
      const dup = duplicates[i];
      const fight = dup.fights[0];
      console.log(`Group ${i + 1}: ${dup.fights.length} copies`);
      console.log(`  Event: ${fight.event.name}`);
      console.log(`  Fighters: ${fight.fighter1.name} vs ${fight.fighter2.name}`);
      console.log(`  IDs to delete: ${dup.fights.slice(1).map(f => f.id).join(', ')}`);
      console.log(`  Keep: ${dup.fights[0].id} (most recent)\n`);
      totalDups += dup.fights.length - 1;
    }

    console.log(`Total duplicate fights to delete: ${totalDups}`);
  }

  await prisma.$disconnect();
}

main();
