import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET() {
  try {
    const [latest, totals, recent] = await Promise.all([
      prisma.predictionUsage.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      prisma.predictionUsage.aggregate({
        _sum: {
          promptTokensEstimated: true,
          completionTokensEstimated: true,
          totalTokensEstimated: true,
          fightsProcessed: true
        },
        _count: { id: true }
      }),
      prisma.predictionUsage.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        },
        orderBy: { createdAt: 'asc' }
      })
    ])

    const dailyMap = new Map<string, number>()
    recent.forEach(entry => {
      const key = entry.createdAt.toISOString().split('T')[0]
      dailyMap.set(key, (dailyMap.get(key) || 0) + entry.totalTokensEstimated)
    })

    return NextResponse.json({
      success: true,
      data: {
        totals: {
          promptTokens: totals._sum.promptTokensEstimated || 0,
          completionTokens: totals._sum.completionTokensEstimated || 0,
          totalTokens: totals._sum.totalTokensEstimated || 0,
          fightsProcessed: totals._sum.fightsProcessed || 0,
          runs: totals._count.id || 0
        },
        daily: Array.from(dailyMap.entries()).map(([date, tokens]) => ({ date, tokens })),
        latest: latest.map(entry => ({
          id: entry.id,
          eventId: entry.eventId,
          eventName: entry.eventName,
          fightsProcessed: entry.fightsProcessed,
          totalTokensEstimated: entry.totalTokensEstimated,
          promptTokensEstimated: entry.promptTokensEstimated,
          completionTokensEstimated: entry.completionTokensEstimated,
          source: entry.source,
          createdAt: entry.createdAt
        }))
      }
    })
  } catch (error) {
    console.error('❌ Token usage status error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to load token usage summary'
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
