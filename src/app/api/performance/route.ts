import { NextResponse } from 'next/server'
import { queryMonitor } from '@/lib/database/monitoring'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Database Performance Metrics API
 *
 * Provides real-time insights into database query performance including:
 * - Query timing statistics
 * - Slow query detection
 * - Performance trends
 * - Alert summary
 */
export async function GET() {
  try {
    const metrics = queryMonitor.getMetrics()

    // Calculate performance percentages
    const performanceAnalysis = {
      slowQueryRate: metrics.totalQueries > 0
        ? Math.round((metrics.slowQueries / metrics.totalQueries) * 100 * 100) / 100
        : 0,
      criticalQueryRate: metrics.totalQueries > 0
        ? Math.round((metrics.criticalQueries / metrics.totalQueries) * 100 * 100) / 100
        : 0,
      healthScore: calculateHealthScore(metrics)
    }

    // Get top problematic query patterns
    const topProblematicQueries = Object.entries(metrics.queryFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([query, frequency]) => ({ query, frequency }))

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalQueries: metrics.totalQueries,
          averageDuration: metrics.averageDuration,
          healthScore: performanceAnalysis.healthScore,
          monitoringEnabled: queryMonitor.isEnabled()
        },
        performance: {
          slowQueries: metrics.slowQueries,
          criticalQueries: metrics.criticalQueries,
          slowQueryRate: performanceAnalysis.slowQueryRate,
          criticalQueryRate: performanceAnalysis.criticalQueryRate
        },
        topSlowQueries: metrics.topSlowQueries.slice(0, 5).map(query => ({
          duration: query.duration,
          model: query.model,
          action: query.action,
          performance: query.performance,
          timestamp: query.timestamp
        })),
        frequentQueries: topProblematicQueries,
        recommendations: generateRecommendations(metrics, performanceAnalysis)
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Performance metrics API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve performance metrics'
    }, { status: 500 })
  }
}

/**
 * Calculate overall database health score (0-100)
 */
function calculateHealthScore(metrics: typeof queryMonitor.getMetrics extends () => infer R ? R : never): number {
  if (metrics.totalQueries === 0) return 100

  // Base score starts at 100
  let score = 100

  // Deduct points for slow queries
  const slowQueryRate = (metrics.slowQueries / metrics.totalQueries) * 100
  score -= slowQueryRate * 2 // 2 points per % of slow queries

  // Deduct more points for critical queries
  const criticalQueryRate = (metrics.criticalQueries / metrics.totalQueries) * 100
  score -= criticalQueryRate * 5 // 5 points per % of critical queries

  // Deduct points for high average duration
  if (metrics.averageDuration > 100) {
    score -= Math.min(20, (metrics.averageDuration - 100) / 50) // Up to 20 points for slow avg
  }

  return Math.max(0, Math.round(score))
}

/**
 * Generate performance recommendations based on metrics
 */
function generateRecommendations(
  metrics: typeof queryMonitor.getMetrics extends () => infer R ? R : never,
  analysis: { slowQueryRate: number; criticalQueryRate: number; healthScore: number }
): string[] {
  const recommendations: string[] = []

  if (analysis.criticalQueryRate > 1) {
    recommendations.push('🚨 Critical: Address queries taking >5s immediately')
  }

  if (analysis.slowQueryRate > 5) {
    recommendations.push('⚠️ High slow query rate - consider adding indexes or optimizing queries')
  }

  if (metrics.averageDuration > 200) {
    recommendations.push('📊 Average query time is high - review most frequent queries')
  }

  // Check for highly frequent queries that might benefit from caching
  const topQuery = Object.entries(metrics.queryFrequency)
    .sort(([, a], [, b]) => b - a)[0]

  if (topQuery && topQuery[1] > 50) {
    recommendations.push(`🔄 Consider caching: "${topQuery[0]}" executed ${topQuery[1]} times`)
  }

  if (metrics.totalQueries > 500) {
    recommendations.push('📈 High query volume - consider implementing read replicas')
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Database performance looks healthy!')
  }

  return recommendations
}

/**
 * Reset performance metrics (useful for testing or periodic cleanup)
 */
export async function DELETE() {
  try {
    queryMonitor.clearMetrics()

    return NextResponse.json({
      success: true,
      message: 'Performance metrics cleared',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Performance metrics reset error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to reset performance metrics'
    }, { status: 500 })
  }
}