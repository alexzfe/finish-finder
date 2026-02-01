import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
})

async function check() {
  const allEvents = await prisma.event.findMany({
    orderBy: { date: 'desc' }
  });

  console.log('ALL EVENTS IN DATABASE:');
  console.log('='.repeat(70));

  for (const event of allEvents) {
    const status = event.completed ? '✅ COMPLETED' : '⏰ UPCOMING';
    console.log(`\n${status}: ${event.name}`);
    console.log(`   Date: ${event.date.toISOString().split('T')[0]}`);
    console.log(`   Location: ${event.location}`);
  }

  console.log('\n' + '='.repeat(70));
  const completedCount = allEvents.filter(e => e.completed).length;
  const upcomingCount = allEvents.filter(e => !e.completed).length;
  console.log(`Total: ${allEvents.length} events (${completedCount} completed, ${upcomingCount} upcoming)`);

  await prisma.$disconnect();
}

check().catch(console.error);
