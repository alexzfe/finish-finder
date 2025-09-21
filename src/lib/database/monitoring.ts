/**
 * Database Performance Monitoring System
 *
 * This module provides comprehensive query performance monitoring including:
 * - Query timing and frequency tracking
 * - Slow query detection and alerting
 * - Performance metrics collection
 * - Structured logging for analysis
 */

import { PrismaClient } from '@prisma/client'

// Lazy-loaded prisma instance to avoid circular dependencies
let prismaInstance: PrismaClient | null = null

function getPrismaForMonitoring(): PrismaClient | null {
  if (typeof window !== 'undefined') return null // Client-side only

  // Return cached instance if available
  if (prismaInstance) return prismaInstance

  try {
    // Only create instance if DATABASE_URL is available
    if (!process.env.DATABASE_URL) return null

    // Import dynamically to avoid build-time issues
    prismaInstance = new PrismaClient({
      log: [], // Disable logging to prevent recursion
    })

    return prismaInstance
  } catch (error) {
    // Gracefully handle any instantiation errors
    console.warn('Failed to create monitoring Prisma instance:', error)
    return null
  }
}

// Performance thresholds (configurable via environment)
const SLOW_QUERY_THRESHOLD_MS = Number(process.env.SLOW_QUERY_THRESHOLD_MS) || 1000
const CRITICAL_QUERY_THRESHOLD_MS = Number(process.env.CRITICAL_QUERY_THRESHOLD_MS) || 5000
const FREQUENT_QUERY_THRESHOLD = Number(process.env.FREQUENT_QUERY_THRESHOLD) || 100

// Query performance classification
export type QueryPerformance = 'fast' | 'moderate' | 'slow' | 'critical'

// Query statistics interface
export interface QueryStats {
  query: string
  model?: string
  action?: string
  duration: number
  performance: QueryPerformance
  timestamp: Date
  args?: unknown
  result?: unknown
  error?: string
}

// Performance metrics aggregation
export interface PerformanceMetrics {
  totalQueries: number
  averageDuration: number
  slowQueries: number
  criticalQueries: number
  queryFrequency: Record<string, number>
  topSlowQueries: QueryStats[]
}

class QueryPerformanceMonitor {
  private enabled: boolean

  constructor() {
    // Enable monitoring in development and production, disable in test
    this.enabled = process.env.NODE_ENV !== 'test' &&
                   process.env.DISABLE_QUERY_MONITORING !== 'true'
  }

  /**
   * Classify query performance based on duration
   */
  private classifyPerformance(duration: number): QueryPerformance {
    if (duration >= CRITICAL_QUERY_THRESHOLD_MS) return 'critical'
    if (duration >= SLOW_QUERY_THRESHOLD_MS) return 'slow'
    if (duration >= 100) return 'moderate'
    return 'fast'
  }

  /**
   * Generate a normalized query signature for grouping
   */
  private normalizeQuery(query: string): string {
    // Remove specific values and normalize for pattern matching
    return query
      .replace(/\$\d+/g, '$?')                    // Replace parameters
      .replace(/\b\d+\b/g, '?')                  // Replace numbers
      .replace(/'[^']*'/g, "'?'")                // Replace string literals
      .replace(/\s+/g, ' ')                      // Normalize whitespace
      .trim()
  }

  /**
   * Record a query execution for monitoring (Vercel-compatible)
   */
  recordQuery(stats: Omit<QueryStats, 'performance' | 'timestamp'>): void {
    if (!this.enabled) return

    const queryStats: QueryStats = {
      ...stats,
      performance: this.classifyPerformance(stats.duration),
      timestamp: new Date()
    }

    // Store in database for persistence across serverless invocations
    this.storeQueryMetric(queryStats).catch(error => {
      // Gracefully handle storage errors - monitoring shouldn't break the app
      console.warn('Failed to store query metric:', error.message)
    })

    // Log performance data (always works)
    this.logQueryPerformance(queryStats)

    // Check for alerts
    const normalizedQuery = this.normalizeQuery(stats.query)
    this.checkAlerts(queryStats, normalizedQuery)
  }

  /**
   * Store query metrics in database for Vercel compatibility
   */
  private async storeQueryMetric(stats: QueryStats): Promise<void> {
    const prisma = getPrismaForMonitoring()
    if (!prisma) return // Gracefully skip if no database

    try {
      await prisma.queryMetric.create({
        data: {
          query: this.normalizeQuery(stats.query),
          model: stats.model || null,
          action: stats.action || null,
          duration: stats.duration,
          performance: stats.performance,
          timestamp: stats.timestamp,
        }
      })
    } catch (error) {
      // Don't let monitoring errors break the application
      console.warn('QueryMetric storage failed:', error)
    }
  }

  /**
   * Log query performance in structured format
   */
  private logQueryPerformance(stats: QueryStats): void {
    const logData = {
      timestamp: stats.timestamp.toISOString(),
      query: {
        duration: stats.duration,
        performance: stats.performance,
        model: stats.model,
        action: stats.action,
        signature: this.normalizeQuery(stats.query)
      },
      context: {
        service: 'database',
        component: 'query-monitor',
        environment: process.env.NODE_ENV
      }
    }

    // Use different log levels based on performance
    switch (stats.performance) {
      case 'critical':
        console.error('🚨 CRITICAL QUERY DETECTED', logData)
        break
      case 'slow':
        console.warn('⚠️ SLOW QUERY DETECTED', logData)
        break
      case 'moderate':
        if (process.env.NODE_ENV === 'development') {
          console.info('📊 Query Performance', logData)
        }
        break
      case 'fast':
        // Only log fast queries in verbose mode
        if (process.env.QUERY_LOGGING_VERBOSE === 'true') {
          console.debug('✅ Fast Query', logData)
        }
        break
    }
  }

  /**
   * Check for performance alerts and warnings (Vercel-compatible)
   */
  private checkAlerts(stats: QueryStats, normalizedQuery: string): void {
    // Alert on slow queries
    if (stats.performance === 'critical') {
      this.sendAlert('critical', `Critical query took ${stats.duration}ms`, stats)
    } else if (stats.performance === 'slow') {
      this.sendAlert('warning', `Slow query took ${stats.duration}ms`, stats)
    }

    // For frequent query alerts, we'll check periodically rather than on every query
    // This avoids the need for in-memory frequency tracking in serverless
    this.checkFrequentQueryAlerts(normalizedQuery, stats).catch(error => {
      console.warn('Failed to check frequent query alerts:', error.message)
    })
  }

  /**
   * Check for frequent query alerts using database lookup
   */
  private async checkFrequentQueryAlerts(normalizedQuery: string, stats: QueryStats): Promise<void> {
    const prisma = getPrismaForMonitoring()
    if (!prisma) return

    try {
      // Check frequency from last hour to avoid too many alerts
      const lastHour = new Date(Date.now() - 60 * 60 * 1000)
      const frequency = await prisma.queryMetric.count({
        where: {
          query: normalizedQuery,
          timestamp: { gte: lastHour }
        }
      })

      // Alert on significant frequency milestones
      if (frequency > 0 && frequency % FREQUENT_QUERY_THRESHOLD === 0) {
        this.sendAlert('info', `Query executed ${frequency} times in last hour`, stats)
      }
    } catch (error) {
      // Silently handle errors to avoid breaking the application
    }
  }

  /**
   * Send performance alerts (can be extended to integrate with monitoring services)
   */
  private sendAlert(level: 'info' | 'warning' | 'critical', message: string, stats: QueryStats): void {
    const alert = {
      level,
      message,
      timestamp: new Date().toISOString(),
      query: {
        duration: stats.duration,
        model: stats.model,
        action: stats.action,
        signature: this.normalizeQuery(stats.query)
      },
      metadata: {
        service: 'finish-finder',
        component: 'database-monitor'
      }
    }

    // Log alert (in production, this could be sent to Sentry, DataDog, etc.)
    console.warn(`🔔 DATABASE ALERT [${level.toUpperCase()}]`, alert)

    // TODO: In production, integrate with:
    // - Sentry for error tracking
    // - Slack/Discord for team notifications
    // - DataDog/NewRelic for APM
    // - Custom webhook endpoints
  }

  /**
   * Get current performance metrics (Vercel-compatible - from database)
   */
  async getMetrics(): Promise<PerformanceMetrics> {
    const prisma = getPrismaForMonitoring()
    if (!prisma) {
      // Return empty metrics if no database
      return {
        totalQueries: 0,
        averageDuration: 0,
        slowQueries: 0,
        criticalQueries: 0,
        queryFrequency: {},
        topSlowQueries: []
      }
    }

    try {
      // Get metrics from last 24 hours for reasonable performance
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

      const [metrics, slowCount, criticalCount, topSlow, frequencyData] = await Promise.all([
        // Basic aggregations
        prisma.queryMetric.aggregate({
          where: { timestamp: { gte: since } },
          _count: { id: true },
          _avg: { duration: true }
        }),
        // Slow query count
        prisma.queryMetric.count({
          where: {
            timestamp: { gte: since },
            performance: 'slow'
          }
        }),
        // Critical query count
        prisma.queryMetric.count({
          where: {
            timestamp: { gte: since },
            performance: 'critical'
          }
        }),
        // Top slowest queries
        prisma.queryMetric.findMany({
          where: { timestamp: { gte: since } },
          orderBy: { duration: 'desc' },
          take: 10,
          select: {
            query: true,
            model: true,
            action: true,
            duration: true,
            performance: true,
            timestamp: true
          }
        }),
        // Query frequency analysis
        prisma.queryMetric.groupBy({
          by: ['query'],
          where: { timestamp: { gte: since } },
          _count: { query: true },
          orderBy: { _count: { query: 'desc' } },
          take: 20
        })
      ])

      // Convert frequency data to expected format
      const queryFrequency: Record<string, number> = {}
      frequencyData.forEach(item => {
        queryFrequency[item.query] = item._count.query
      })

      // Convert topSlow to expected format
      const topSlowQueries: QueryStats[] = topSlow.map(item => ({
        query: item.query,
        model: item.model || undefined,
        action: item.action || undefined,
        duration: item.duration,
        performance: item.performance as QueryPerformance,
        timestamp: item.timestamp
      }))

      return {
        totalQueries: metrics._count.id || 0,
        averageDuration: Math.round((metrics._avg.duration || 0) * 100) / 100,
        slowQueries: slowCount,
        criticalQueries: criticalCount,
        queryFrequency,
        topSlowQueries
      }
    } catch (error) {
      console.warn('Failed to fetch query metrics:', error)
      // Return empty metrics on database error
      return {
        totalQueries: 0,
        averageDuration: 0,
        slowQueries: 0,
        criticalQueries: 0,
        queryFrequency: {},
        topSlowQueries: []
      }
    }
  }

  /**
   * Clear performance data (useful for testing or periodic cleanup) - Vercel-compatible
   */
  async clearMetrics(): Promise<void> {
    const prisma = getPrismaForMonitoring()
    if (!prisma) return

    try {
      await prisma.queryMetric.deleteMany({})
      console.log('Query metrics cleared successfully')
    } catch (error) {
      console.warn('Failed to clear query metrics:', error)
    }
  }

  /**
   * Clean up old metrics (keep last 7 days) - for production maintenance
   */
  async cleanupOldMetrics(): Promise<void> {
    const prisma = getPrismaForMonitoring()
    if (!prisma) return

    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const result = await prisma.queryMetric.deleteMany({
        where: {
          timestamp: { lt: weekAgo }
        }
      })
      console.log(`Cleaned up ${result.count} old query metrics`)
    } catch (error) {
      console.warn('Failed to cleanup old query metrics:', error)
    }
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  /**
   * Check if monitoring is enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }
}

// Global singleton instance
export const queryMonitor = new QueryPerformanceMonitor()

/**
 * Prisma middleware factory for query performance monitoring
 */
export function createQueryMonitoringMiddleware() {
  // Prisma middleware types are not well-defined, using unknown
  return async (params: unknown, next: unknown) => {
    const startTime = Date.now()
    // Type assertion for Prisma middleware parameters
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queryParams = params as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nextFn = next as any

    try {
      const result = await nextFn(params)
      const duration = Date.now() - startTime

      // Record successful query
      queryMonitor.recordQuery({
        query: `${queryParams.model}.${queryParams.action}`,
        model: queryParams.model,
        action: queryParams.action,
        duration,
        args: queryParams.args,
        result: Array.isArray(result) ? `${result.length} records` : 'single record'
      })

      return result
    } catch (error) {
      const duration = Date.now() - startTime

      // Record failed query
      queryMonitor.recordQuery({
        query: `${queryParams.model}.${queryParams.action}`,
        model: queryParams.model,
        action: queryParams.action,
        duration,
        args: queryParams.args,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      throw error
    }
  }
}