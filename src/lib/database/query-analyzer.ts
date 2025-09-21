/**
 * Database Query Analysis and Optimization Recommendations
 *
 * This module analyzes query patterns and provides actionable optimization recommendations:
 * - N+1 query detection
 * - Missing index recommendations
 * - Query pattern analysis
 * - Performance optimization suggestions
 */

import type { QueryStats, PerformanceMetrics } from './monitoring'

export interface OptimizationRecommendation {
  type: 'n_plus_one' | 'missing_index' | 'inefficient_pattern' | 'large_result_set'
  severity: 'low' | 'medium' | 'high' | 'critical'
  query: string
  model?: string
  action?: string
  description: string
  suggestion: string
  estimatedImpact: string
  confidence: number // 0-100
}

export interface QueryAnalysis {
  recommendations: OptimizationRecommendation[]
  patterns: {
    nPlusOneQueries: number
    largeResultSets: number
    inefficientQueries: number
    duplicateQueries: number
  }
  summary: {
    totalIssues: number
    highSeverityIssues: number
    estimatedSavings: string
  }
}

class DatabaseQueryAnalyzer {
  /**
   * Analyze query patterns and generate optimization recommendations
   */
  async analyzeQueries(metrics: PerformanceMetrics, recentQueries: QueryStats[]): Promise<QueryAnalysis> {
    const recommendations: OptimizationRecommendation[] = []

    // Detect N+1 queries
    const nPlusOneQueries = this.detectNPlusOneQueries(recentQueries)
    recommendations.push(...nPlusOneQueries)

    // Detect missing indexes
    const missingIndexes = this.detectMissingIndexes(metrics.topSlowQueries)
    recommendations.push(...missingIndexes)

    // Detect inefficient patterns
    const inefficientPatterns = this.detectInefficientPatterns(recentQueries)
    recommendations.push(...inefficientPatterns)

    // Detect large result sets
    const largeResultSets = this.detectLargeResultSets(recentQueries)
    recommendations.push(...largeResultSets)

    // Generate analysis summary
    const patterns = {
      nPlusOneQueries: nPlusOneQueries.length,
      largeResultSets: largeResultSets.length,
      inefficientQueries: inefficientPatterns.length,
      duplicateQueries: this.countDuplicateQueries(recentQueries)
    }

    const highSeverityIssues = recommendations.filter(r => r.severity === 'high' || r.severity === 'critical').length
    const estimatedSavings = this.calculateEstimatedSavings(recommendations)

    return {
      recommendations,
      patterns,
      summary: {
        totalIssues: recommendations.length,
        highSeverityIssues,
        estimatedSavings
      }
    }
  }

  /**
   * Detect N+1 query patterns
   */
  private detectNPlusOneQueries(queries: QueryStats[]): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = []
    const queryGroups = new Map<string, QueryStats[]>()

    // Group queries by normalized pattern
    queries.forEach(query => {
      const key = `${query.model}.${query.action}`
      if (!queryGroups.has(key)) {
        queryGroups.set(key, [])
      }
      queryGroups.get(key)!.push(query)
    })

    // Look for rapid repeated queries (potential N+1)
    queryGroups.forEach((groupQueries, pattern) => {
      if (groupQueries.length >= 10) { // 10+ similar queries
        const timeSpan = Math.max(...groupQueries.map(q => q.timestamp.getTime())) -
                        Math.min(...groupQueries.map(q => q.timestamp.getTime()))

        if (timeSpan < 5000) { // Within 5 seconds
          const avgDuration = groupQueries.reduce((sum, q) => sum + q.duration, 0) / groupQueries.length

          recommendations.push({
            type: 'n_plus_one',
            severity: avgDuration > 100 ? 'high' : 'medium',
            query: pattern,
            model: groupQueries[0].model,
            action: groupQueries[0].action,
            description: `Detected ${groupQueries.length} similar queries within ${Math.round(timeSpan/1000)}s`,
            suggestion: 'Consider using findMany with include/select or implementing batch loading',
            estimatedImpact: `Could reduce ${groupQueries.length} queries to 1-2 queries`,
            confidence: timeSpan < 1000 ? 90 : 75
          })
        }
      }
    })

    return recommendations
  }

  /**
   * Detect missing indexes based on slow queries
   */
  private detectMissingIndexes(slowQueries: QueryStats[]): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = []

    slowQueries.forEach(query => {
      // Analyze query patterns that might benefit from indexes
      if (query.action === 'findMany' && query.duration > 1000) {
        let indexSuggestion = ''
        let confidence = 60

        // Common patterns that benefit from indexes
        if (query.model === 'Fight' && query.duration > 2000) {
          indexSuggestion = 'Consider adding indexes on eventId, weightClass, or date fields'
          confidence = 80
        } else if (query.model === 'Event' && query.duration > 1500) {
          indexSuggestion = 'Consider adding indexes on date, venue, or status fields'
          confidence = 75
        } else if (query.model === 'Fighter') {
          indexSuggestion = 'Consider adding indexes on name or searchable fields'
          confidence = 70
        }

        if (indexSuggestion) {
          recommendations.push({
            type: 'missing_index',
            severity: query.duration > 3000 ? 'high' : 'medium',
            query: query.query,
            model: query.model,
            action: query.action,
            description: `Slow ${query.action} query taking ${query.duration}ms`,
            suggestion: indexSuggestion,
            estimatedImpact: `Could reduce query time by 50-80%`,
            confidence
          })
        }
      }
    })

    return recommendations
  }

  /**
   * Detect inefficient query patterns
   */
  private detectInefficientPatterns(queries: QueryStats[]): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = []

    queries.forEach(query => {
      // Look for queries that select all fields when only some are needed
      if (query.action === 'findMany' && query.duration > 500) {
        recommendations.push({
          type: 'inefficient_pattern',
          severity: 'medium',
          query: query.query,
          model: query.model,
          action: query.action,
          description: 'Query may be selecting unnecessary fields',
          suggestion: 'Use select: {} to only fetch required fields',
          estimatedImpact: 'Could reduce data transfer and parsing time by 20-40%',
          confidence: 65
        })
      }

      // Look for queries without proper pagination
      if (query.action === 'findMany' && !query.query.includes('take') && query.duration > 800) {
        recommendations.push({
          type: 'inefficient_pattern',
          severity: 'medium',
          query: query.query,
          model: query.model,
          action: query.action,
          description: 'Query may be returning unbounded results',
          suggestion: 'Add pagination with take/skip or cursor-based pagination',
          estimatedImpact: 'Could prevent performance degradation as data grows',
          confidence: 70
        })
      }
    })

    return recommendations
  }

  /**
   * Detect large result sets that might need pagination
   */
  private detectLargeResultSets(queries: QueryStats[]): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = []

    queries.forEach(query => {
      if (query.action === 'findMany' && query.duration > 1000) {
        // Infer large result set from duration and lack of take/skip
        if (!query.query.includes('take') && !query.query.includes('skip')) {
          recommendations.push({
            type: 'large_result_set',
            severity: query.duration > 3000 ? 'high' : 'medium',
            query: query.query,
            model: query.model,
            action: query.action,
            description: `Query taking ${query.duration}ms likely returning large result set`,
            suggestion: 'Implement pagination or add filters to limit results',
            estimatedImpact: 'Could improve initial page load by 60-90%',
            confidence: 75
          })
        }
      }
    })

    return recommendations
  }

  /**
   * Count duplicate queries that could be cached
   */
  private countDuplicateQueries(queries: QueryStats[]): number {
    const querySignatures = new Map<string, number>()

    queries.forEach(query => {
      const signature = `${query.model}.${query.action}`
      querySignatures.set(signature, (querySignatures.get(signature) || 0) + 1)
    })

    return Array.from(querySignatures.values()).filter(count => count > 1).length
  }

  /**
   * Calculate estimated performance savings from recommendations
   */
  private calculateEstimatedSavings(recommendations: OptimizationRecommendation[]): string {
    const highImpactCount = recommendations.filter(r => r.severity === 'high' || r.severity === 'critical').length
    const mediumImpactCount = recommendations.filter(r => r.severity === 'medium').length

    if (highImpactCount > 0) {
      return `${highImpactCount * 40 + mediumImpactCount * 20}% potential performance improvement`
    } else if (mediumImpactCount > 0) {
      return `${mediumImpactCount * 20}% potential performance improvement`
    } else {
      return 'No significant optimization opportunities detected'
    }
  }
}

export const queryAnalyzer = new DatabaseQueryAnalyzer()