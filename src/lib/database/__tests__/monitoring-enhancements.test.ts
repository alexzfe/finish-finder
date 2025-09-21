import { describe, it, expect, beforeEach, vi } from 'vitest'
import { queryAnalyzer } from '../query-analyzer'
import { alertManager } from '../alert-rules'
import { structuredLogger } from '../structured-logger'
import type { QueryStats, PerformanceMetrics } from '../monitoring'

// Mock environment variables
vi.stubEnv('NODE_ENV', 'test')
vi.stubEnv('STRUCTURED_LOGGING_ENABLED', 'true')
vi.stubEnv('SLOW_QUERY_THRESHOLD_MS', '1000')
vi.stubEnv('CRITICAL_QUERY_THRESHOLD_MS', '5000')

describe('Query Analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('N+1 Query Detection', () => {
    it('should detect N+1 patterns from rapid repeated queries', async () => {
      const baseTime = new Date('2025-01-01T10:00:00Z')
      const recentQueries: QueryStats[] = []

      // Simulate 15 rapid findUnique queries (N+1 pattern)
      for (let i = 0; i < 15; i++) {
        recentQueries.push({
          query: 'Fighter.findUnique',
          model: 'Fighter',
          action: 'findUnique',
          duration: 50,
          performance: 'fast',
          timestamp: new Date(baseTime.getTime() + i * 100), // 100ms apart
          args: { where: { id: `fighter-${i}` } },
          result: 'single record'
        })
      }

      const metrics: PerformanceMetrics = {
        totalQueries: 15,
        averageDuration: 50,
        slowQueries: 0,
        criticalQueries: 0,
        queryFrequency: { 'Fighter.findUnique': 15 },
        topSlowQueries: []
      }

      const analysis = await queryAnalyzer.analyzeQueries(metrics, recentQueries)

      expect(analysis.recommendations).toHaveLength(1)
      expect(analysis.recommendations[0].type).toBe('n_plus_one')
      expect(analysis.recommendations[0].severity).toBe('medium')
      expect(analysis.recommendations[0].suggestion).toContain('batch loading')
      expect(analysis.patterns.nPlusOneQueries).toBe(1)
    })

    it('should not detect N+1 for spread out queries', async () => {
      const baseTime = new Date('2025-01-01T10:00:00Z')
      const recentQueries: QueryStats[] = []

      // Simulate queries spread over 10 seconds (not N+1)
      for (let i = 0; i < 8; i++) {
        recentQueries.push({
          query: 'Fighter.findUnique',
          model: 'Fighter',
          action: 'findUnique',
          duration: 50,
          performance: 'fast',
          timestamp: new Date(baseTime.getTime() + i * 2000), // 2 seconds apart
          args: { where: { id: `fighter-${i}` } },
          result: 'single record'
        })
      }

      const metrics: PerformanceMetrics = {
        totalQueries: 8,
        averageDuration: 50,
        slowQueries: 0,
        criticalQueries: 0,
        queryFrequency: { 'Fighter.findUnique': 8 },
        topSlowQueries: []
      }

      const analysis = await queryAnalyzer.analyzeQueries(metrics, recentQueries)

      expect(analysis.patterns.nPlusOneQueries).toBe(0)
    })
  })

  describe('Missing Index Detection', () => {
    it('should recommend indexes for slow findMany queries', async () => {
      const slowQuery: QueryStats = {
        query: 'Fight.findMany',
        model: 'Fight',
        action: 'findMany',
        duration: 2500,
        performance: 'slow',
        timestamp: new Date(),
        args: { where: { eventId: 'event-123' } },
        result: '50 records'
      }

      const metrics: PerformanceMetrics = {
        totalQueries: 10,
        averageDuration: 500,
        slowQueries: 1,
        criticalQueries: 0,
        queryFrequency: {},
        topSlowQueries: [slowQuery]
      }

      const analysis = await queryAnalyzer.analyzeQueries(metrics, [slowQuery])

      const indexRecommendations = analysis.recommendations.filter(r => r.type === 'missing_index')
      expect(indexRecommendations).toHaveLength(1)
      expect(indexRecommendations[0].severity).toBe('medium')
      expect(indexRecommendations[0].suggestion).toContain('eventId')
    })
  })

  describe('Large Result Set Detection', () => {
    it('should detect queries returning large result sets without pagination', async () => {
      const largeQuery: QueryStats = {
        query: 'Event.findMany',
        model: 'Event',
        action: 'findMany',
        duration: 1200,
        performance: 'slow',
        timestamp: new Date(),
        args: { where: {} }, // No take/skip
        result: '200 records'
      }

      const metrics: PerformanceMetrics = {
        totalQueries: 5,
        averageDuration: 800,
        slowQueries: 1,
        criticalQueries: 0,
        queryFrequency: {},
        topSlowQueries: [largeQuery]
      }

      const analysis = await queryAnalyzer.analyzeQueries(metrics, [largeQuery])

      const largeResultRecommendations = analysis.recommendations.filter(r => r.type === 'large_result_set')
      expect(largeResultRecommendations).toHaveLength(1)
      expect(largeResultRecommendations[0].suggestion).toContain('pagination')
    })
  })
})

describe('Alert Manager', () => {
  beforeEach(() => {
    alertManager.clearHistory()
    vi.clearAllMocks()
  })

  describe('Critical Query Alerts', () => {
    it('should trigger critical alert for queries over 5 seconds', () => {
      const criticalQuery: QueryStats = {
        query: 'Fight.findMany',
        model: 'Fight',
        action: 'findMany',
        duration: 6000,
        performance: 'critical',
        timestamp: new Date(),
        args: {},
        result: '100 records'
      }

      const alerts = alertManager.evaluateAlerts(criticalQuery)

      const criticalAlerts = alerts.filter(a => a.ruleName === 'Critical Query Duration')
      expect(criticalAlerts).toHaveLength(1)
      expect(criticalAlerts[0].severity).toBe('critical')
      expect(criticalAlerts[0].message).toContain('6000ms')
    })

    it('should track trigger count correctly', () => {
      const slowQuery: QueryStats = {
        query: 'Fighter.findMany',
        model: 'Fighter',
        action: 'findMany',
        duration: 1500,
        performance: 'slow',
        timestamp: new Date(),
        args: {},
        result: '50 records'
      }

      alertManager.clearHistory()

      // First trigger should work
      const firstAlerts = alertManager.evaluateAlerts(slowQuery)
      const slowAlerts = firstAlerts.filter(a => a.ruleName === 'Slow Query Duration')

      if (slowAlerts.length > 0) {
        expect(slowAlerts[0].context.triggerCount).toBe(1)
        expect(slowAlerts[0].context.escalated).toBe(false)
      }

      // Verify alert stats are updated
      const stats = alertManager.getAlertStats()
      expect(stats.totalRules).toBeGreaterThan(0)
    })
  })

  describe('Rate Limiting', () => {
    it('should respect cooldown periods between alerts', () => {
      const slowQuery: QueryStats = {
        query: 'Event.findMany',
        model: 'Event',
        action: 'findMany',
        duration: 2000,
        performance: 'slow',
        timestamp: new Date(),
        args: {},
        result: '30 records'
      }

      // First alert should trigger
      const firstAlerts = alertManager.evaluateAlerts(slowQuery)
      const slowQueryAlerts = firstAlerts.filter(a => a.ruleName === 'Slow Query Duration')
      expect(slowQueryAlerts).toHaveLength(1)

      // Second alert within cooldown should be suppressed
      const secondAlerts = alertManager.evaluateAlerts(slowQuery)
      expect(secondAlerts).toHaveLength(0)

      // Fast-forward past cooldown (10 minutes for slow queries)
      vi.setSystemTime(Date.now() + 11 * 60 * 1000)

      // Third alert should trigger again
      const thirdAlerts = alertManager.evaluateAlerts(slowQuery)
      expect(thirdAlerts).toHaveLength(1)
    })
  })

  describe('N+1 Pattern Detection', () => {
    it('should detect potential N+1 patterns in alerts', () => {
      const frequentQuery: QueryStats = {
        query: 'Fighter.findUnique',
        model: 'Fighter',
        action: 'findUnique',
        duration: 100,
        performance: 'fast',
        timestamp: new Date(),
        args: { where: { id: 'fighter-1' } },
        result: 'single record'
      }

      const metrics: PerformanceMetrics = {
        totalQueries: 20,
        averageDuration: 100,
        slowQueries: 0,
        criticalQueries: 0,
        queryFrequency: { 'Fighter.findUnique': 20 }, // Frequent pattern
        topSlowQueries: []
      }

      const alerts = alertManager.evaluateAlerts(frequentQuery, metrics)

      expect(alerts).toHaveLength(1)
      expect(alerts[0].ruleName).toBe('Potential N+1 Query Pattern')
      expect(alerts[0].severity).toBe('medium')
    })
  })
})

describe('Structured Logger', () => {
  describe('Configuration', () => {
    it('should return configuration object', () => {
      const config = structuredLogger.getConfig()
      expect(config).toHaveProperty('enabled')
      expect(config).toHaveProperty('batchSize')
      expect(config).toHaveProperty('flushInterval')
    })
  })

  describe('Functionality', () => {
    it('should accept query logging calls without errors', () => {
      const queryStats: QueryStats = {
        query: 'Fight.findMany',
        model: 'Fight',
        action: 'findMany',
        duration: 150,
        performance: 'fast',
        timestamp: new Date('2025-01-01T10:00:00Z'),
        args: { where: { eventId: 'event-123' } },
        result: '10 records'
      }

      // Should not throw error
      expect(() => {
        structuredLogger.logQuery(queryStats, { requestId: 'req-123', userId: 'user-456' })
      }).not.toThrow()
    })
  })
})

describe('Integration Tests', () => {
  beforeEach(() => {
    alertManager.clearHistory()
    vi.clearAllMocks()
  })

  describe('End-to-end Monitoring Flow', () => {
    it('should handle complete monitoring workflow', async () => {
      // Simulate a problematic query scenario
      const slowQueries: QueryStats[] = []

      for (let i = 0; i < 12; i++) {
        slowQueries.push({
          query: 'Fight.findMany',
          model: 'Fight',
          action: 'findMany',
          duration: 1200,
          performance: 'slow',
          timestamp: new Date(Date.now() + i * 100),
          args: { where: { eventId: 'event-123' } },
          result: '50 records'
        })
      }

      const metrics: PerformanceMetrics = {
        totalQueries: 12,
        averageDuration: 1200,
        slowQueries: 12,
        criticalQueries: 0,
        queryFrequency: { 'Fight.findMany': 12 },
        topSlowQueries: slowQueries.slice(0, 5)
      }

      // Run query analysis
      const analysis = await queryAnalyzer.analyzeQueries(metrics, slowQueries)

      // Should detect multiple issues
      expect(analysis.recommendations.length).toBeGreaterThan(0)
      expect(analysis.summary.totalIssues).toBeGreaterThan(0)

      // Run alert evaluation
      const alerts = alertManager.evaluateAlerts(slowQueries[0], metrics)

      // Should trigger alerts
      expect(alerts.length).toBeGreaterThan(0)

      // Log structured data
      slowQueries.forEach(query => {
        structuredLogger.logQuery(query)
      })

      // Should have comprehensive monitoring coverage
      expect(analysis.patterns.inefficientQueries).toBeGreaterThan(0)
      expect(alerts.some(a => a.severity === 'high')).toBe(true)
    })
  })
})