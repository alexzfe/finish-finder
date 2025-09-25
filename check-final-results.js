const { PrismaClient } = require('@prisma/client')

async function checkFinalResults() {
  const prisma = new PrismaClient()

  try {
    console.log('🔍 Checking final scraper results...\n')

    // Get all events with their fights
    const events = await prisma.event.findMany({
      include: {
        fights: {
          include: {
            fighter1: true,
            fighter2: true
          }
        }
      },
      orderBy: { date: 'asc' }
    })

    console.log(`📊 TOTAL EVENTS: ${events.length}`)
    console.log(`📊 TOTAL FIGHTS: ${events.reduce((sum, e) => sum + e.fights.length, 0)}`)
    console.log('\n' + '='.repeat(50))

    events.forEach((event, idx) => {
      console.log(`\n${idx + 1}. ${event.name}`)
      console.log(`   Date: ${event.date}`)
      console.log(`   Venue: ${event.venue || 'TBA'}`)
      console.log(`   Location: ${event.location || 'TBA'}`)
      console.log(`   Fights: ${event.fights.length}`)

      // Show first 3 fights as sample
      event.fights.slice(0, 3).forEach((fight, fightIdx) => {
        const f1Name = fight.fighter1.name
        const f1Nick = fight.fighter1.nickname ? ` "${fight.fighter1.nickname}"` : ''
        const f2Name = fight.fighter2.name
        const f2Nick = fight.fighter2.nickname ? ` "${fight.fighter2.nickname}"` : ''
        console.log(`     ${fightIdx + 1}. ${f1Name}${f1Nick} vs ${f2Name}${f2Nick}`)
      })

      if (event.fights.length > 3) {
        console.log(`     ... and ${event.fights.length - 3} more fights`)
      }
    })

    console.log('\n' + '='.repeat(50))
    console.log('✅ Database verification complete!')

  } catch (error) {
    console.error('❌ Error checking results:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

checkFinalResults()