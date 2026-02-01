import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient();

async function checkLatestEvent() {
  // Find the specific event
  const latestEvent = await prisma.event.findFirst({
    where: { name: 'UFC Fight Night: Bonfim vs. Brown' },
    include: {
      fights: {
        include: {
          fighter1: { select: { name: true } },
          fighter2: { select: { name: true } }
        }
      }
    }
  });

  if (latestEvent === null) {
    console.log('No events found');
    return;
  }

  // Sort fights by ID for consistent ordering
  latestEvent.fights.sort((a, b) => a.id.localeCompare(b.id));

  console.log(`\n=== Event: ${latestEvent.name} ===`);
  console.log(`Last scraped: ${latestEvent.lastScrapedAt}`);
  console.log(`Total fights: ${latestEvent.fights.length}\n`);

  latestEvent.fights.forEach((f, i) => {
    const title = f.titleFight ? '[TITLE]' : '       ';
    const main = f.mainEvent ? '[MAIN]' : '      ';
    const position = (f.cardPosition || 'N/A').padEnd(16);
    const weight = (f.weightClass || 'Unknown').padEnd(20);

    console.log(`${(i+1).toString().padStart(2)}. ${position} ${title} ${main} | ${weight} | ${f.fighter1.name} vs ${f.fighter2.name}`);
  });

  const titleCount = latestEvent.fights.filter(f => f.titleFight).length;
  const mainCount = latestEvent.fights.filter(f => f.mainEvent).length;

  console.log(`\nTitle fights: ${titleCount}`);
  console.log(`Main events: ${mainCount}`);

  await prisma.$disconnect();
}

checkLatestEvent().catch(console.error);
