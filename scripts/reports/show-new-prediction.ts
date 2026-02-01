/**
 * Display a newly generated prediction with real fighter stats
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function showPrediction() {
  try {
    // Get the first prediction from the new batch (Mayra Bueno Silva vs Jacqueline Cavalcanti)
    const prediction = await prisma.prediction.findFirst({
      where: {
        fight: {
          fighter1: { name: { contains: 'Mayra Bueno Silva' } }
        }
      },
      include: {
        fight: {
          include: {
            fighter1: true,
            fighter2: true,
            event: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    if (!prediction) {
      console.log('Prediction not found')
      return
    }

    const { fight } = prediction

    console.log('\n=== FIGHT ===')
    console.log(`${fight.fighter1.name} vs ${fight.fighter2.name}`)
    console.log(`Event: ${fight.event.name}`)
    console.log(`Date: ${fight.event.date.toISOString().split('T')[0]}`)
    console.log(`Weight Class: ${fight.weightClass}`)

    console.log('\n=== FIGHTER 1: ' + fight.fighter1.name + ' ===')
    console.log('Record:', fight.fighter1.record)
    console.log('Sig Strikes/min:', fight.fighter1.significantStrikesLandedPerMinute)
    console.log('Striking Accuracy:', (fight.fighter1.strikingAccuracyPercentage * 100).toFixed(1) + '%')
    console.log('Striking Defense:', (fight.fighter1.strikingDefensePercentage * 100).toFixed(1) + '%')
    console.log('Takedown Defense:', (fight.fighter1.takedownDefensePercentage * 100).toFixed(1) + '%')

    console.log('\n=== FIGHTER 2: ' + fight.fighter2.name + ' ===')
    console.log('Record:', fight.fighter2.record)
    console.log('Sig Strikes/min:', fight.fighter2.significantStrikesLandedPerMinute)
    console.log('Striking Accuracy:', (fight.fighter2.strikingAccuracyPercentage * 100).toFixed(1) + '%')
    console.log('Striking Defense:', (fight.fighter2.strikingDefensePercentage * 100).toFixed(1) + '%')
    console.log('Takedown Defense:', (fight.fighter2.takedownDefensePercentage * 100).toFixed(1) + '%')

    console.log('\n=== AI PREDICTION ===')
    console.log('Model:', prediction.modelUsed)
    console.log('Tokens:', prediction.tokensUsed)
    console.log('Cost: $' + prediction.costUsd.toFixed(4))
    console.log()
    console.log('FINISH PROBABILITY:', (prediction.finishProbability * 100).toFixed(1) + '%')
    console.log('Confidence:', prediction.finishConfidence)
    console.log('\nReasoning:')
    console.log(prediction.finishReasoning)
    console.log()
    console.log('FUN SCORE:', prediction.funScore + '/100')
    console.log('Confidence:', prediction.funConfidence)
    console.log('\nBreakdown:')
    console.log(prediction.funBreakdown)

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

showPrediction()
