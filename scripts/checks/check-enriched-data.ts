import { PrismaClient } from '@prisma/client'

async function main() {
  const prisma = new PrismaClient()

  try {
    console.log('🎯 Enriched Events in Database:')
    const events = await prisma.event.findMany({
      include: { fights: { include: { fighter1: true, fighter2: true } } },
      orderBy: { date: 'asc' }
    })

    events.forEach(event => {
      console.log(`\n📅 ${event.name}`)
      console.log(`   Date: ${event.date}`)
      console.log(`   Venue: ${event.venue}`)
      console.log(`   Location: ${event.location}`)
      console.log(`   Fights: ${event.fights.length}`)

      event.fights.slice(0, 3).forEach((fight, idx) => {
        const f1Name = fight.fighter1.nickname ?
          `${fight.fighter1.name} "${fight.fighter1.nickname}"` :
          fight.fighter1.name
        const f2Name = fight.fighter2.nickname ?
          `${fight.fighter2.name} "${fight.fighter2.nickname}"` :
          fight.fighter2.name
        console.log(`     ${idx + 1}. ${f1Name} vs ${f2Name} (${fight.weightClass})`)
      })

      if (event.fights.length > 3) {
        console.log(`     ... and ${event.fights.length - 3} more fights`)
      }
    })

    console.log(`\n✨ Total: ${events.length} events, ${events.reduce((sum, e) => sum + e.fights.length, 0)} fights`)
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error))
  } finally {
    await prisma.$disconnect()
  }
}

main()