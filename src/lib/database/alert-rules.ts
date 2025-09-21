/**
 * Advanced Database Performance Alert Rules
 *
 * This module provides sophisticated alerting rules for database performance monitoring:
 * - Threshold-based alerts
 * - Pattern-based detection
 * - Rate-limiting to prevent alert spam
 * - Severity escalation
 */

import type { QueryStats, PerformanceMetrics } from './monitoring'

export interface AlertRule {
  id: string
  name: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  condition: (stats: QueryStats, metrics?: PerformanceMetrics) => boolean
  cooldownMinutes: number // Minimum time between alerts of same type
  escalationThreshold?: number // How many times to trigger before escalating
}

export interface Alert {
  id: string
  ruleId: string
  ruleName: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  timestamp: Date
  queryStats: QueryStats
  context: {
    triggerCount: number
    escalated: boolean
    lastOccurrence: Date
  }
}

class DatabaseAlertManager {
  private alertHistory = new Map<string, { lastTriggered: Date; count: number }>()

  private alertRules: AlertRule[] = [
    {
      id: 'critical_query_duration',
      name: 'Critical Query Duration',
      description: 'Query taking longer than 5 seconds',
      severity: 'critical',
      condition: (stats) => stats.duration > 5000,
      cooldownMinutes: 5,
      escalationThreshold: 3
    },
    {
      id: 'slow_query_duration',
      name: 'Slow Query Duration',
      description: 'Query taking longer than 1 second',
      severity: 'high',
      condition: (stats) => stats.duration > 1000 && stats.duration <= 5000,
      cooldownMinutes: 10,
      escalationThreshold: 5
    },
    {
      id: 'frequent_slow_queries',
      name: 'Frequent Slow Queries',
      description: 'Multiple slow queries from same pattern within short time',
      severity: 'medium',
      condition: (stats, metrics) => {
        if (!metrics) return false
        const pattern = `${stats.model}.${stats.action}`
        const frequency = metrics.queryFrequency[pattern] || 0
        return frequency > 20 && stats.performance === 'slow'
      },
      cooldownMinutes: 15
    },
    {
      id: 'query_error_rate',
      name: 'Query Error Rate',
      description: 'High rate of query errors detected',
      severity: 'high',
      condition: (stats) => !!stats.error,
      cooldownMinutes: 5,
      escalationThreshold: 2
    },
    {
      id: 'n_plus_one_pattern',
      name: 'Potential N+1 Query Pattern',
      description: 'Rapid succession of similar queries detected',
      severity: 'medium',
      condition: (stats, metrics) => {
        if (!metrics) return false
        const pattern = `${stats.model}.${stats.action}`
        const frequency = metrics.queryFrequency[pattern] || 0
        // Alert if we see the same query pattern more than 15 times
        return frequency > 15 && stats.action === 'findUnique'
      },
      cooldownMinutes: 20
    },
    {
      id: 'large_result_set',
      name: 'Large Result Set',
      description: 'Query returning potentially large result set',
      severity: 'low',
      condition: (stats) => {
        // Infer large result set from duration and action type
        return stats.action === 'findMany' &&
               stats.duration > 800 &&
               !stats.query.includes('take') // No pagination
      },
      cooldownMinutes: 30
    },
    {
      id: 'database_health_degradation',
      name: 'Database Health Degradation',
      description: 'Overall database performance declining',
      severity: 'medium',
      condition: (stats, metrics) => {
        if (!metrics) return false
        const slowQueryRate = metrics.totalQueries > 0
          ? (metrics.slowQueries / metrics.totalQueries) * 100
          : 0
        return slowQueryRate > 10 // More than 10% slow queries
      },
      cooldownMinutes: 45
    }
  ]

  /**
   * Evaluate all alert rules against query statistics
   */
  evaluateAlerts(stats: QueryStats, metrics?: PerformanceMetrics): Alert[] {
    const triggeredAlerts: Alert[] = []

    for (const rule of this.alertRules) {
      try {
        if (this.shouldEvaluateRule(rule) && rule.condition(stats, metrics)) {
          const alert = this.createAlert(rule, stats)
          if (alert) {
            triggeredAlerts.push(alert)
            this.updateAlertHistory(rule.id)
          }
        }
      } catch (error) {
        console.warn(`Alert rule evaluation failed for ${rule.id}:`, error)
      }
    }

    return triggeredAlerts
  }

  /**
   * Check if rule should be evaluated (respects cooldown)
   */
  private shouldEvaluateRule(rule: AlertRule): boolean {
    const history = this.alertHistory.get(rule.id)
    if (!history) return true

    const cooldownMs = rule.cooldownMinutes * 60 * 1000
    const timeSinceLastAlert = Date.now() - history.lastTriggered.getTime()

    return timeSinceLastAlert > cooldownMs
  }

  /**
   * Create alert from triggered rule
   */
  private createAlert(rule: AlertRule, stats: QueryStats): Alert | null {
    const history = this.alertHistory.get(rule.id)
    const triggerCount = (history?.count || 0) + 1

    // Check for escalation
    let severity = rule.severity
    let escalated = false

    if (rule.escalationThreshold && triggerCount >= rule.escalationThreshold) {
      escalated = true
      // Escalate severity
      if (severity === 'low') severity = 'medium'
      else if (severity === 'medium') severity = 'high'
      else if (severity === 'high') severity = 'critical'
    }

    const alert: Alert = {
      id: `${rule.id}_${Date.now()}`,
      ruleId: rule.id,
      ruleName: rule.name,
      severity,
      message: this.generateAlertMessage(rule, stats, triggerCount, escalated),
      timestamp: new Date(),
      queryStats: stats,
      context: {
        triggerCount,
        escalated,
        lastOccurrence: new Date()
      }
    }

    return alert
  }

  /**
   * Generate contextual alert message
   */
  private generateAlertMessage(rule: AlertRule, stats: QueryStats, count: number, escalated: boolean): string {
    const escalationPrefix = escalated ? '🚨 ESCALATED: ' : ''
    const repeatSuffix = count > 1 ? ` (${count}x occurrence)` : ''

    switch (rule.id) {
      case 'critical_query_duration':
        return `${escalationPrefix}Critical query: ${stats.model}.${stats.action} took ${stats.duration}ms${repeatSuffix}`

      case 'slow_query_duration':
        return `${escalationPrefix}Slow query: ${stats.model}.${stats.action} took ${stats.duration}ms${repeatSuffix}`

      case 'frequent_slow_queries':
        return `${escalationPrefix}Frequent slow queries detected for ${stats.model}.${stats.action}${repeatSuffix}`

      case 'query_error_rate':
        return `${escalationPrefix}Query error: ${stats.model}.${stats.action} failed - ${stats.error}${repeatSuffix}`

      case 'n_plus_one_pattern':
        return `${escalationPrefix}Potential N+1 pattern: Multiple ${stats.model}.${stats.action} queries${repeatSuffix}`

      case 'large_result_set':
        return `${escalationPrefix}Large result set: ${stats.model}.${stats.action} took ${stats.duration}ms without pagination${repeatSuffix}`

      case 'database_health_degradation':
        return `${escalationPrefix}Database health declining: High slow query rate detected${repeatSuffix}`

      default:
        return `${escalationPrefix}${rule.description}${repeatSuffix}`
    }
  }

  /**
   * Update alert history for rate limiting
   */
  private updateAlertHistory(ruleId: string): void {
    const existing = this.alertHistory.get(ruleId)
    this.alertHistory.set(ruleId, {
      lastTriggered: new Date(),
      count: (existing?.count || 0) + 1
    })
  }

  /**
   * Get alert statistics
   */
  getAlertStats(): {
    totalRules: number
    activeAlerts: number
    recentAlerts: number
    topAlertRules: Array<{ ruleId: string; count: number }>
  } {
    const now = Date.now()
    const lastHour = now - (60 * 60 * 1000)

    const recentAlerts = Array.from(this.alertHistory.entries())
      .filter(([, history]) => history.lastTriggered.getTime() > lastHour)
      .length

    const topAlertRules = Array.from(this.alertHistory.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 5)
      .map(([ruleId, history]) => ({ ruleId, count: history.count }))

    return {
      totalRules: this.alertRules.length,
      activeAlerts: this.alertHistory.size,
      recentAlerts,
      topAlertRules
    }
  }

  /**
   * Clear alert history (useful for testing)
   */
  clearHistory(): void {
    this.alertHistory.clear()
  }

  /**
   * Get all configured alert rules
   */
  getAlertRules(): AlertRule[] {
    return [...this.alertRules]
  }

  /**
   * Add custom alert rule
   */
  addCustomRule(rule: AlertRule): void {
    this.alertRules.push(rule)
  }

  /**
   * Remove alert rule
   */
  removeRule(ruleId: string): boolean {
    const index = this.alertRules.findIndex(rule => rule.id === ruleId)
    if (index >= 0) {
      this.alertRules.splice(index, 1)
      this.alertHistory.delete(ruleId)
      return true
    }
    return false
  }
}

export const alertManager = new DatabaseAlertManager()