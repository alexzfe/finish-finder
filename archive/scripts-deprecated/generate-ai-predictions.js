#!/usr/bin/env node

// Separate AI prediction service - runs independently from scraper
require('ts-node/register')

const { HybridUFCService } = require('../src/lib/ai/hybridUFCService.ts')
const { PrismaClient } = require('@prisma/client')

class AIPredictionService {
  constructor() {
    this.prisma = new PrismaClient()
    // Create service WITH AI capabilities (requires OpenAI key)
    this.ufcService = new HybridUFCService(true) // true = enable AI predictions
  }

  async generatePredictionsForEvents() {
    console.log('🤖 Starting AI prediction generation...')

    try {
      // Get events without predictions
      const eventsNeedingPredictions = await this.prisma.event.findMany({
        where: {
          date: {
            gte: new Date() // Only upcoming events
          }
        },
        include: {
          fights: {
            where: {
              OR: [
                { funFactor: 0 },
                { aiDescription: null },
                { entertainmentReason: null }
              ]
            },
            include: {
              fighter1: true,
              fighter2: true
            }
          }
        }
      })

      if (eventsNeedingPredictions.length === 0) {
        console.log('✅ All events already have AI predictions!')
        return
      }

      console.log(`📋 Found ${eventsNeedingPredictions.length} events needing AI predictions`)

      for (const event of eventsNeedingPredictions) {
        if (event.fights.length === 0) {
          console.log(`⏭️ Skipping ${event.name} - no fights needing predictions`)
          continue
        }

        console.log(`\n🎯 Generating predictions for: ${event.name}`)
        console.log(`   📊 ${event.fights.length} fights need predictions`)

        // Convert Prisma fights to service format
        const fightsForPrediction = event.fights.map(fight => ({
          id: fight.id,
          fighter1Id: fight.fighter1Id,
          fighter2Id: fight.fighter2Id,
          fighter1Name: fight.fighter1.name,
          fighter2Name: fight.fighter2.name,
          weightClass: fight.weightClass,
          cardPosition: fight.cardPosition,
          scheduledRounds: fight.scheduledRounds,
          titleFight: fight.titleFight,
          mainEvent: fight.mainEvent,
          fightNumber: fight.fightNumber,
          funFactor: fight.funFactor,
          finishProbability: fight.finishProbability
        }))

        // Generate AI predictions
        const predictedFights = await this.ufcService.generateEventPredictions(
          event.id,
          event.name,
          fightsForPrediction
        )

        // Save predictions back to database
        await this.savePredictions(predictedFights)

        console.log(`✅ Saved predictions for ${event.name}`)
      }

      console.log('\n🎉 AI prediction generation complete!')

    } catch (error) {
      console.error('❌ AI prediction generation failed:', error.message)
    }
  }

  async savePredictions(fights) {
    for (const fight of fights) {
      await this.prisma.fight.update({
        where: { id: fight.id },
        data: {
          funFactor: fight.funFactor || 0,
          finishProbability: fight.finishProbability || 0,
          entertainmentReason: fight.entertainmentReason,
          keyFactors: JSON.stringify(fight.keyFactors || []),
          fightPrediction: fight.fightPrediction,
          riskLevel: fight.riskLevel,
          aiDescription: fight.entertainmentReason, // Legacy field
          predictedFunScore: fight.funFactor || 0 // Legacy field
        }
      })
    }
  }

  async disconnect() {
    await this.prisma.$disconnect()
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is required for AI predictions')
    console.log('💡 Set your OpenAI API key and try again')
    process.exit(1)
  }

  const aiService = new AIPredictionService()

  try {
    await aiService.generatePredictionsForEvents()
  } finally {
    await aiService.disconnect()
  }
}

main().catch(console.error)