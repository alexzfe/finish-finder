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
  args?: any
  result?: any
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
  private queryStats: QueryStats[] = []
  private queryFrequency: Map<string, number> = new Map()
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
   * Record a query execution for monitoring
   */
  recordQuery(stats: Omit<QueryStats, 'performance' | 'timestamp'>): void {
    if (!this.enabled) return

    const queryStats: QueryStats = {
      ...stats,
      performance: this.classifyPerformance(stats.duration),
      timestamp: new Date()
    }

    // Store for analysis (keep last 1000 queries in memory)
    this.queryStats.push(queryStats)
    if (this.queryStats.length > 1000) {
      this.queryStats.shift()
    }

    // Track frequency
    const normalizedQuery = this.normalizeQuery(stats.query)
    const currentFreq = this.queryFrequency.get(normalizedQuery) || 0
    this.queryFrequency.set(normalizedQuery, currentFreq + 1)

    // Log performance data
    this.logQueryPerformance(queryStats)

    // Check for alerts
    this.checkAlerts(queryStats, normalizedQuery)
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
   * Check for performance alerts and warnings
   */
  private checkAlerts(stats: QueryStats, normalizedQuery: string): void {
    // Alert on slow queries
    if (stats.performance === 'critical') {
      this.sendAlert('critical', `Critical query took ${stats.duration}ms`, stats)
    } else if (stats.performance === 'slow') {
      this.sendAlert('warning', `Slow query took ${stats.duration}ms`, stats)
    }

    // Alert on frequent queries that might benefit from optimization
    const frequency = this.queryFrequency.get(normalizedQuery) || 0
    if (frequency > 0 && frequency % FREQUENT_QUERY_THRESHOLD === 0) {
      this.sendAlert('info', `Query executed ${frequency} times`, stats)
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
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    if (this.queryStats.length === 0) {
      return {
        totalQueries: 0,
        averageDuration: 0,
        slowQueries: 0,
        criticalQueries: 0,
        queryFrequency: {},
        topSlowQueries: []
      }
    }

    const totalQueries = this.queryStats.length
    const averageDuration = this.queryStats.reduce((sum, stat) => sum + stat.duration, 0) / totalQueries
    const slowQueries = this.queryStats.filter(stat => stat.performance === 'slow').length
    const criticalQueries = this.queryStats.filter(stat => stat.performance === 'critical').length

    // Get top 10 slowest queries
    const topSlowQueries = [...this.queryStats]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10)

    // Convert frequency map to object
    const queryFrequency: Record<string, number> = {}
    this.queryFrequency.forEach((count, query) => {
      queryFrequency[query] = count
    })

    return {
      totalQueries,
      averageDuration: Math.round(averageDuration * 100) / 100,
      slowQueries,
      criticalQueries,
      queryFrequency,
      topSlowQueries
    }
  }

  /**
   * Clear performance data (useful for testing or periodic cleanup)
   */
  clearMetrics(): void {
    this.queryStats = []
    this.queryFrequency.clear()
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
  return async (params: any, next: any) => {
    const startTime = Date.now()

    try {
      const result = await next(params)
      const duration = Date.now() - startTime

      // Record successful query
      queryMonitor.recordQuery({
        query: `${params.model}.${params.action}`,
        model: params.model,
        action: params.action,
        duration,
        args: params.args,
        result: Array.isArray(result) ? `${result.length} records` : 'single record'
      })

      return result
    } catch (error) {
      const duration = Date.now() - startTime

      // Record failed query
      queryMonitor.recordQuery({
        query: `${params.model}.${params.action}`,
        model: params.model,
        action: params.action,
        duration,
        args: params.args,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      throw error
    }
  }
}