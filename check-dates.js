const { PrismaClient } = require('@prisma/client')

async function main() {
  const prisma = new PrismaClient()

  try {
    console.log('📊 Current events in database:')
    const events = await prisma.event.findMany({
      orderBy: { date: 'asc' },
      take: 10
    })

    events.forEach(event => {
      console.log(`- ${event.name}: ${event.date} (${event.source})`)
    })

    console.log(`\nTotal events: ${events.length}`)
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

main()