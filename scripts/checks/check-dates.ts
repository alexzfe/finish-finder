import { PrismaClient } from '@prisma/client'

async function main() {
  const prisma = new PrismaClient()

  try {
    console.log('📊 Current events in database:')
    const events = await prisma.event.findMany({
      orderBy: { date: 'asc' },
      take: 10
    })

    events.forEach(event => {
      console.log(`- ${event.name}: ${event.date}`)
    })

    console.log(`\nTotal events: ${events.length}`)
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error))
  } finally {
    await prisma.$disconnect()
  }
}

main()