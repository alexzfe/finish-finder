#!/usr/bin/env node

// Register ts-node to handle TypeScript imports
require('ts-node').register({
  project: './tsconfig.node.json'
})

const { PrismaClient } = require('@prisma/client')
const { HybridUFCService } = require('../src/lib/ai/hybridUFCService.ts')
const fs = require('fs/promises')
const path = require('path')

/**
 * AI Predictions Runner
 *
 * This script runs daily to find events/fights without AI predictions
 * and generates them using the OpenAI service with proper batching.
 */
class AIPredictionsRunner {
  constructor() {
    // Configure Prisma with optimized settings
    const prismaConfig = {
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error']
    }

    // Only add datasources if DATABASE_URL is provided
    if (process.env.DATABASE_URL) {
      prismaConfig.datasources = {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    }

    this.prisma = new PrismaClient(prismaConfig)

    this.ufcService = new HybridUFCService(true) // Enable AI
    this.logFile = path.join(__dirname, '../logs/ai-predictions.log')

    // Configuration
    this.batchSize = Number(process.env.OPENAI_PREDICTION_CHUNK_SIZE || 6)
    this.forceRegenerate = process.env.FORCE_REGENERATE_PREDICTIONS?.toLowerCase() === 'true'

    if (!Number.isFinite(this.batchSize) || this.batchSize < 1) {
      this.batchSize = 6
    }
  }

  async initialize() {
    // Ensure logs directory exists
    try {
      await fs.mkdir(path.dirname(this.logFile), { recursive: true })
    } catch (error) {
      // Directory might already exist
    }
  }

  async log(message, level = 'info') {
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`

    console.log(logEntry.trim())

    try {
      await fs.appendFile(this.logFile, logEntry)
    } catch (error) {
      console.error('Failed to write to log file:', error)
    }
  }

  /**
   * Find all events that need AI predictions
   */
  async findEventsNeedingPredictions() {
    await this.log('🔍 Scanning database for events needing AI predictions...')

    const query = {
      include: {
        fights: {
          select: {
            id: true,
            fighter1Id: true,
            fighter2Id: true,
            funFactor: true,
            finishProbability: true,
            entertainmentReason: true,
            aiDescription: true,
            predictedFunScore: true,
            fighter1: {
              select: { name: true, record: true }
            },
            fighter2: {
              select: { name: true, record: true }
            }
          }
        }
      },
      orderBy: {
        date: 'asc'
      }
    }

    // Add date filter to focus on upcoming events
    if (!this.forceRegenerate) {
      query.where = {
        date: {
          gte: new Date() // Only upcoming events unless force regenerate
        }
      }
    }

    const events = await this.prisma.event.findMany(query)

    const eventsNeedingPredictions = []

    for (const event of events) {
      if (event.fights.length === 0) {
        await this.log(`⚠️ Skipping event "${event.name}" - no fights found`)
        continue
      }

      const fightsNeedingPredictions = event.fights.filter(fight => {
        const hasDescription = Boolean(fight.entertainmentReason || fight.aiDescription)
        const hasNumericPredictions = Boolean(fight.funFactor && fight.finishProbability)

        // If force regenerate, include all fights
        if (this.forceRegenerate) {
          return true
        }

        // Otherwise, only include fights missing predictions
        return !hasDescription || !hasNumericPredictions
      })

      if (fightsNeedingPredictions.length > 0) {
        eventsNeedingPredictions.push({
          ...event,
          fightsNeedingPredictions: fightsNeedingPredictions.length,
          totalFights: event.fights.length
        })
      }
    }

    await this.log(`📊 Found ${eventsNeedingPredictions.length} events needing predictions`)
    eventsNeedingPredictions.forEach(event => {
      this.log(`  - "${event.name}": ${event.fightsNeedingPredictions}/${event.totalFights} fights need predictions`)
    })

    return eventsNeedingPredictions
  }

  /**
   * Generate predictions for a single event
   */
  async generateEventPredictions(event) {
    await this.log(`🤖 Generating predictions for: "${event.name}"`)

    try {
      // Get all fights for this event in the format expected by AI service
      const fightsForAI = event.fights.map(fight => ({
        id: fight.id,
        fighter1Id: fight.fighter1Id,
        fighter2Id: fight.fighter2Id,
        fighter1Name: fight.fighter1.name,
        fighter2Name: fight.fighter2.name,
        weightClass: '', // We don't need this for predictions
        titleFight: false,
        mainEvent: false,
        scheduledRounds: 3
      }))

      // Generate predictions using the AI service
      const enrichedFights = await this.ufcService.generateEventPredictions(
        event.id,
        event.name,
        fightsForAI
      )

      // Update fights in database with AI predictions
      let updatedCount = 0
      for (const enrichedFight of enrichedFights) {
        try {
          await this.prisma.fight.update({
            where: { id: enrichedFight.id },
            data: {
              funFactor: enrichedFight.funFactor || 0,
              finishProbability: enrichedFight.finishProbability || 0,
              predictedFunScore: enrichedFight.predictedFunScore || 0,
              entertainmentReason: enrichedFight.entertainmentReason || null,
              aiDescription: enrichedFight.aiDescription || null,
              keyFactors: JSON.stringify(enrichedFight.keyFactors || []),
              funFactors: JSON.stringify(enrichedFight.funFactors || []),
              updatedAt: new Date()
            }
          })
          updatedCount++
        } catch (updateError) {
          await this.log(`⚠️ Failed to update fight ${enrichedFight.id}: ${updateError.message}`, 'warn')
        }
      }

      await this.log(`✅ Updated ${updatedCount}/${enrichedFights.length} fights with AI predictions`)
      return { success: true, updatedCount }

    } catch (error) {
      await this.log(`❌ Failed to generate predictions for "${event.name}": ${error.message}`, 'error')
      return { success: false, error: error.message }
    }
  }

  /**
   * Main execution method
   */
  async run() {
    await this.log('🚀 Starting AI Predictions Runner')
    await this.log(`Configuration: batch_size=${this.batchSize}, force_regenerate=${this.forceRegenerate}`)

    const results = {
      eventsProcessed: 0,
      fightsUpdated: 0,
      errors: [],
      executionTime: 0
    }

    const startTime = Date.now()

    try {
      // Find events needing predictions
      const eventsNeedingPredictions = await this.findEventsNeedingPredictions()

      if (eventsNeedingPredictions.length === 0) {
        await this.log('✅ No events need AI predictions at this time')
        return results
      }

      // Process events one by one to avoid overwhelming OpenAI API
      for (const event of eventsNeedingPredictions) {
        const result = await this.generateEventPredictions(event)

        results.eventsProcessed++

        if (result.success) {
          results.fightsUpdated += result.updatedCount
        } else {
          results.errors.push(`${event.name}: ${result.error}`)
        }

        // Rate limiting delay between events
        if (results.eventsProcessed < eventsNeedingPredictions.length) {
          await this.log('⏱️ Waiting 5 seconds before next event...')
          await new Promise(resolve => setTimeout(resolve, 5000))
        }
      }

    } catch (error) {
      await this.log(`❌ AI predictions runner failed: ${error.message}`, 'error')
      results.errors.push(error.message)
    }

    results.executionTime = Date.now() - startTime

    // Log summary
    await this.log('\n📊 AI Predictions Summary:')
    await this.log(`Events processed: ${results.eventsProcessed}`)
    await this.log(`Fights updated: ${results.fightsUpdated}`)
    await this.log(`Errors: ${results.errors.length}`)
    await this.log(`Execution time: ${results.executionTime}ms`)

    if (results.errors.length > 0) {
      await this.log('\nErrors:')
      results.errors.forEach(error => this.log(`- ${error}`))
    }

    return results
  }

  async cleanup() {
    await this.prisma.$disconnect()
    await this.log('AI Predictions Runner cleanup completed')
  }
}

// Main execution
async function main() {
  const runner = new AIPredictionsRunner()

  try {
    await runner.initialize()
    await runner.run()
  } catch (error) {
    console.error('AI Predictions Runner failed:', error)
    process.exit(1)
  } finally {
    await runner.cleanup()
  }
}

// Execute if run directly
if (require.main === module) {
  main().catch(console.error)
}

module.exports = { AIPredictionsRunner }