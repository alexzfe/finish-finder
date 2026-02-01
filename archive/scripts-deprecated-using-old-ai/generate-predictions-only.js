#!/usr/bin/env node

const { HybridUFCService } = require('../src/lib/ai/hybridUFCService.ts')
const { PrismaClient } = require('@prisma/client')

class PredictionGenerator {
  constructor() {
    this.prisma = new PrismaClient()
    this.ufcService = new HybridUFCService()
  }

  async generatePredictionsForEvent(eventId) {
    try {
      console.log(`🤖 Generating predictions for event ID: ${eventId}`)

      // Get event with fights from database
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        include: {
          fights: {
            include: {
              fighter1: true,
              fighter2: true
            }
          }
        }
      })

      if (!event) {
        console.error(`❌ Event not found: ${eventId}`)
        return false
      }

      if (event.fights.length === 0) {
        console.warn(`⚠️ No fights found for event: ${event.name}`)
        return false
      }

      console.log(`📊 Found ${event.fights.length} fights for ${event.name}`)

      // Convert database fights to format expected by AI service
      const fightsForAI = event.fights.map(fight => ({
        id: fight.id,
        fighter1Id: fight.fighter1Id,
        fighter2Id: fight.fighter2Id,
        fighter1Name: fight.fighter1.name,
        fighter2Name: fight.fighter2.name,
        weightClass: fight.weightClass,
        cardPosition: fight.cardPosition,
        titleFight: fight.titleFight,
        mainEvent: fight.mainEvent,
        scheduledRounds: fight.scheduledRounds
      }))

      // Generate predictions using AI service
      console.log(`🎯 Calling AI service for predictions...`)
      const enrichedFights = await this.ufcService.generateEventPredictions(eventId, event.name, fightsForAI)

      // Update fights in database with AI predictions
      let updatedCount = 0
      for (const enrichedFight of enrichedFights) {
        await this.prisma.fight.update({
          where: { id: enrichedFight.id },
          data: {
            funFactor: enrichedFight.funFactor || 0,
            finishProbability: enrichedFight.finishProbability || 0,
            entertainmentReason: enrichedFight.entertainmentReason,
            keyFactors: JSON.stringify(enrichedFight.keyFactors || []),
            fightPrediction: enrichedFight.fightPrediction,
            riskLevel: enrichedFight.riskLevel,
            predictedFunScore: enrichedFight.predictedFunScore || (enrichedFight.funFactor * 10),
            funFactors: JSON.stringify(enrichedFight.funFactors || []),
            aiDescription: enrichedFight.aiDescription || enrichedFight.entertainmentReason,
            updatedAt: new Date()
          }
        })
        updatedCount++
      }

      console.log(`✅ Successfully updated ${updatedCount} fights with AI predictions`)
      return true

    } catch (error) {
      console.error(`❌ Failed to generate predictions:`, error.message)
      return false
    }
  }

  async generatePredictionsForAllEvents() {
    try {
      // Get all upcoming events without predictions
      const events = await this.prisma.event.findMany({
        where: {
          date: {
            gte: new Date()
          },
          completed: false,
          fights: {
            some: {
              funFactor: 0 // Events with fights that have no predictions
            }
          }
        },
        include: {
          fights: true
        }
      })

      console.log(`📋 Found ${events.length} events needing predictions`)

      for (const event of events) {
        const success = await this.generatePredictionsForEvent(event.id)
        if (success) {
          console.log(`✅ Completed predictions for: ${event.name}`)
        } else {
          console.log(`❌ Failed predictions for: ${event.name}`)
        }
      }

      console.log(`🎉 Prediction generation completed for all events`)

    } catch (error) {
      console.error(`❌ Failed to generate predictions for all events:`, error.message)
    }
  }

  async listEventsWithoutPredictions() {
    try {
      const events = await this.prisma.event.findMany({
        where: {
          date: {
            gte: new Date()
          },
          completed: false
        },
        include: {
          fights: {
            select: {
              funFactor: true,
              finishProbability: true
            }
          }
        }
      })

      console.log(`📊 Event Status Report:`)
      console.log(`========================`)

      for (const event of events) {
        const fightsWithPredictions = event.fights.filter(f => f.funFactor > 0).length
        const totalFights = event.fights.length
        const needsPredictions = fightsWithPredictions < totalFights

        console.log(`${needsPredictions ? '🔴' : '✅'} ${event.name}`)
        console.log(`   Fights: ${fightsWithPredictions}/${totalFights} with predictions`)
        console.log(`   Date: ${event.date.toDateString()}`)
        console.log(`   ID: ${event.id}`)
        console.log()
      }

    } catch (error) {
      console.error(`❌ Failed to list events:`, error.message)
    }
  }

  async cleanup() {
    await this.prisma.$disconnect()
  }
}

// CLI interface
async function main() {
  const generator = new PredictionGenerator()

  try {
    const command = process.argv[2] || 'list'
    const eventId = process.argv[3]

    switch (command) {
      case 'event':
        if (!eventId) {
          console.error('Usage: node generate-predictions-only.js event <event-id>')
          process.exit(1)
        }
        await generator.generatePredictionsForEvent(eventId)
        break

      case 'all':
        await generator.generatePredictionsForAllEvents()
        break

      case 'list':
        await generator.listEventsWithoutPredictions()
        break

      default:
        console.log(`Usage: node generate-predictions-only.js [command] [options]

Commands:
  list              List all events and their prediction status (default)
  event <event-id>  Generate predictions for specific event
  all               Generate predictions for all events missing them

Examples:
  node generate-predictions-only.js list
  node generate-predictions-only.js event ufc-fight-night-260
  node generate-predictions-only.js all`)
    }

  } catch (error) {
    console.error('❌ Command failed:', error.message)
    process.exit(1)
  } finally {
    await generator.cleanup()
  }
}

module.exports = { PredictionGenerator }

// Run if called directly
if (require.main === module) {
  main()
}