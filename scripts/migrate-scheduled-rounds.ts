/**
 * Migration Script: Update scheduledRounds for all existing fights
 *
 * UFC Rules:
 * - Title fights: always 5 rounds
 * - Non-title main events: 5 rounds (after Jan 1, 2012), 3 rounds (before)
 * - All other fights: 3 rounds
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// UFC changed rules in late 2011 to make non-title main events 5 rounds
const NON_TITLE_MAIN_EVENT_5_ROUNDS_CUTOFF = new Date('2012-01-01T00:00:00Z');

function getScheduledRounds(
  isTitleFight: boolean,
  isMainEvent: boolean,
  eventDate: Date
): number {
  // Rule 1: Title fights are always 5 rounds
  if (isTitleFight) {
    return 5;
  }

  // Rule 2: Non-title main events are 5 rounds after the rule change
  if (isMainEvent && eventDate >= NON_TITLE_MAIN_EVENT_5_ROUNDS_CUTOFF) {
    return 5;
  }

  // Rule 3: All other fights are 3 rounds
  return 3;
}

async function main() {
  console.log('🔄 Starting scheduledRounds migration...\n');

  try {
    // Fetch all fights with their event data
    const fights = await prisma.fight.findMany({
      include: {
        event: {
          select: {
            id: true,
            name: true,
            date: true,
          },
        },
      },
    });

    console.log(`📊 Found ${fights.length} fights to process\n`);

    let updated = 0;
    let unchanged = 0;
    let errors = 0;

    // Process fights in batches
    for (const fight of fights) {
      try {
        if (!fight.event || !fight.event.date) {
          console.log(`⚠️  Skipping fight ${fight.id} - no event date`);
          errors++;
          continue;
        }

        const eventDate = new Date(fight.event.date);
        const correctRounds = getScheduledRounds(
          fight.titleFight,
          fight.mainEvent,
          eventDate
        );

        // Only update if the value is different
        if (fight.scheduledRounds !== correctRounds) {
          await prisma.fight.update({
            where: { id: fight.id },
            data: { scheduledRounds: correctRounds },
          });

          updated++;

          // Log significant changes (3 -> 5 rounds)
          if (fight.scheduledRounds === 3 && correctRounds === 5) {
            console.log(
              `✓ Updated: ${fight.event.name} - ${fight.titleFight ? 'Title' : 'Main Event'} (3 -> 5 rounds)`
            );
          }
        } else {
          unchanged++;
        }
      } catch (error) {
        console.error(`❌ Error processing fight ${fight.id}:`, error);
        errors++;
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`   ✅ Updated: ${updated} fights`);
    console.log(`   ⏭️  Unchanged: ${unchanged} fights`);
    console.log(`   ❌ Errors: ${errors} fights`);
    console.log('\n✨ Migration complete!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
