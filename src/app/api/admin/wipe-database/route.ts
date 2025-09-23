import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Wipe Database API Endpoint
 *
 * DANGER: This endpoint completely wipes all data from the database
 * Should only be used for testing purposes
 */
export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json()
    const { password, confirm } = body

    // Enhanced auth check for production safety
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'

    // Always require correct password
    if (password !== adminPassword) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Extra safety: require explicit environment flag for production wipe
    if (isProduction && process.env.ALLOW_PRODUCTION_WIPE !== 'true') {
      return NextResponse.json(
        {
          error: 'Database wipe is disabled in production. Set ALLOW_PRODUCTION_WIPE=true to enable.',
          environment: 'production'
        },
        { status: 403 }
      )
    }

    // Additional safety check - require explicit confirmation
    if (confirm !== 'WIPE_ALL_DATA') {
      return NextResponse.json(
        { error: 'Confirmation required. Send { "confirm": "WIPE_ALL_DATA", "password": "admin123" }' },
        { status: 400 }
      )
    }

    console.log('🚨 DANGER: Starting database wipe operation...')

    // Track what we're deleting
    const beforeCounts = {
      fights: await prisma.fight.count(),
      fighters: await prisma.fighter.count(),
      events: await prisma.event.count(),
      predictionUsage: await prisma.predictionUsage.count(),
      queryMetrics: await prisma.queryMetric.count(),
      funScoreHistory: await prisma.funScoreHistory.count(),
      predictionModels: await prisma.predictionModel.count()
    }

    // Wipe all tables in correct order (respecting foreign key constraints)
    console.log('Deleting fights...')
    const deletedFights = await prisma.fight.deleteMany()

    console.log('Deleting fighters...')
    const deletedFighters = await prisma.fighter.deleteMany()

    console.log('Deleting prediction usage records...')
    const deletedPredictionUsage = await prisma.predictionUsage.deleteMany()

    console.log('Deleting events...')
    const deletedEvents = await prisma.event.deleteMany()

    console.log('Deleting query metrics...')
    const deletedQueryMetrics = await prisma.queryMetric.deleteMany()

    console.log('Deleting fun score history...')
    const deletedFunScoreHistory = await prisma.funScoreHistory.deleteMany()

    console.log('Deleting prediction models...')
    const deletedPredictionModels = await prisma.predictionModel.deleteMany()

    const afterCounts = {
      fights: await prisma.fight.count(),
      fighters: await prisma.fighter.count(),
      events: await prisma.event.count(),
      predictionUsage: await prisma.predictionUsage.count(),
      queryMetrics: await prisma.queryMetric.count(),
      funScoreHistory: await prisma.funScoreHistory.count(),
      predictionModels: await prisma.predictionModel.count()
    }

    console.log('✅ Database wipe completed successfully')

    return NextResponse.json({
      success: true,
      message: 'Database wiped successfully',
      before: beforeCounts,
      after: afterCounts,
      deleted: {
        fights: deletedFights.count,
        fighters: deletedFighters.count,
        events: deletedEvents.count,
        predictionUsage: deletedPredictionUsage.count,
        queryMetrics: deletedQueryMetrics.count,
        funScoreHistory: deletedFunScoreHistory.count,
        predictionModels: deletedPredictionModels.count
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Database wipe failed:', error)

    return NextResponse.json(
      {
        error: 'Database wipe failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}