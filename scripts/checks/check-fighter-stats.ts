/**
 * Check if fighters have correct statistics after re-scraping
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkFighterStats() {
  try {
    // Check Adrian Yanez specifically (from our test)
    const yanez = await prisma.fighter.findFirst({
      where: {
        name: { contains: 'Yanez', mode: 'insensitive' }
      }
    })

    if (yanez) {
      console.log('\n=== Adrian Yanez Stats ===')
      console.log('Name:', yanez.name)
      console.log('Record:', yanez.record)
      console.log('Wins/Losses/Draws:', yanez.wins, '/', yanez.losses, '/', yanez.draws)
      console.log('\nStriking:')
      console.log('  Sig Strikes/min:', yanez.significantStrikesLandedPerMinute)
      console.log('  Striking Accuracy:', (yanez.strikingAccuracyPercentage * 100).toFixed(1) + '%')
      console.log('  Strikes Absorbed/min:', yanez.significantStrikesAbsorbedPerMinute)
      console.log('  Striking Defense:', (yanez.strikingDefensePercentage * 100).toFixed(1) + '%')
      console.log('\nGrappling:')
      console.log('  Takedown Avg:', yanez.takedownAverage)
      console.log('  Takedown Accuracy:', (yanez.takedownAccuracyPercentage * 100).toFixed(1) + '%')
      console.log('  Takedown Defense:', (yanez.takedownDefensePercentage * 100).toFixed(1) + '%')
      console.log('  Submission Avg:', yanez.submissionAverage)
      console.log('\nWin Methods:')
      console.log('  Wins by KO:', yanez.winsByKO)  // Critical field!
      console.log('  Wins by Submission:', yanez.winsBySubmission)
      console.log('  Wins by Decision:', yanez.winsByDecision)
      console.log('\nCalculated Stats:')
      console.log('  Finish Rate:', (yanez.finishRate * 100).toFixed(1) + '%')
      console.log('  KO Percentage:', (yanez.koPercentage * 100).toFixed(1) + '%')
      console.log('  Submission Percentage:', (yanez.submissionPercentage * 100).toFixed(1) + '%')
      console.log('\nLast Scraped:', yanez.lastScrapedAt)
    } else {
      console.log('Adrian Yanez not found in database')
    }

    // Get summary stats for all fighters
    const totalFighters = await prisma.fighter.count()
    const fightersWithStats = await prisma.fighter.count({
      where: {
        significantStrikesLandedPerMinute: { gt: 0 }
      }
    })

    console.log('\n=== Overall Database Stats ===')
    console.log('Total fighters:', totalFighters)
    console.log('Fighters with stats (Sig Strikes > 0):', fightersWithStats)
    console.log('Percentage with stats:', ((fightersWithStats / totalFighters) * 100).toFixed(1) + '%')

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkFighterStats()
