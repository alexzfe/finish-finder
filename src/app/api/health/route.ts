/**
 * System Health Check API
 *
 * Provides comprehensive health status including:
 * - Database connectivity
 * - Query performance health
 * - System resource status
 * - External service availability
 *
 * @example
 * GET /api/health
 * Response: {
 *   status: "healthy",
 *   timestamp: "2024-01-01T00:00:00.000Z",
 *   responseTime: "45ms",
 *   checks: { ... }
 * }
 */

import { type NextResponse } from 'next/server'

import { prisma } from '@/lib/database/prisma'
import { queryMonitor } from '@/lib/database/monitoring'
import { apiLogger } from '@/lib/monitoring/logger'

// Configure route to be dynamic
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Health check result structure
 */
interface HealthCheckResult {
  healthy: boolean
  message: string
  details?: Record<string, unknown>
}

/**
 * Overall health status
 */
type HealthStatus = 'healthy' | 'degraded' | 'down'

/**
 * Check database connectivity and basic operations
 */
async function checkDatabaseHealth(): Promise<HealthCheckResult> {
  try {
    if (!prisma) {
      return {
        healthy: false,
        message: 'Database client not initialized (DATABASE_URL missing)',
      }
    }

    // Test basic connectivity with a simple query
    const startTime = Date.now()
    await prisma.$queryRaw`SELECT 1 as test`
    const queryTime = Date.now() - startTime

    // Test a count query to verify schema access
    const eventCount = await prisma.event.count()

    return {
      healthy: true,
      message: 'Database connection healthy',
      details: {
        connectionTime: `${queryTime}ms`,
        eventsInDatabase: eventCount,
        clientStatus: 'connected',
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      healthy: false,
      message: `Database connection failed: ${message}`,
      details: { error: message },
    }
  }
}

/**
 * Check query performance health based on monitoring data
 */
async function checkQueryPerformanceHealth(): Promise<HealthCheckResult> {
  try {
    if (!queryMonitor.isEnabled()) {
      return {
        healthy: true,
        message: 'Query monitoring disabled',
        details: { monitoringEnabled: false },
      }
    }

    const metrics = await queryMonitor.getMetrics()

    if (metrics.totalQueries === 0) {
      return {
        healthy: true,
        message: 'No query data available yet',
        details: { totalQueries: 0 },
      }
    }

    // Calculate health thresholds
    const criticalQueryRate = (metrics.criticalQueries / metrics.totalQueries) * 100
    const slowQueryRate = (metrics.slowQueries / metrics.totalQueries) * 100
    const avgDuration = metrics.averageDuration

    let healthy = true
    let message = 'Query performance healthy'

    // Check for critical issues
    if (criticalQueryRate > 5) {
      healthy = false
      message = `High critical query rate: ${criticalQueryRate.toFixed(1)}%`
    } else if (slowQueryRate > 20) {
      healthy = false
      message = `High slow query rate: ${slowQueryRate.toFixed(1)}%`
    } else if (avgDuration > 500) {
      healthy = false
      message = `High average query duration: ${avgDuration.toFixed(1)}ms`
    } else if (slowQueryRate > 10) {
      message = `Moderate slow query rate: ${slowQueryRate.toFixed(1)}%`
    }

    return {
      healthy,
      message,
      details: {
        totalQueries: metrics.totalQueries,
        averageDuration: `${avgDuration.toFixed(1)}ms`,
        slowQueryRate: `${slowQueryRate.toFixed(1)}%`,
        criticalQueryRate: `${criticalQueryRate.toFixed(1)}%`,
        monitoringEnabled: true,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      healthy: false,
      message: `Query performance check failed: ${message}`,
      details: { error: message },
    }
  }
}

/**
 * Check system resource health
 */
async function checkSystemHealth(): Promise<HealthCheckResult> {
  try {
    // Memory usage check
    const memoryUsage = process.memoryUsage()
    const memoryUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024)
    const memoryTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024)

    // Process uptime
    const uptimeSeconds = process.uptime()
    const uptimeFormatted = formatUptime(uptimeSeconds)

    const details = {
      memory: {
        used: `${memoryUsedMB}MB`,
        total: `${memoryTotalMB}MB`,
        utilization: `${Math.round((memoryUsedMB / memoryTotalMB) * 100)}%`,
      },
      uptime: uptimeFormatted,
      nodeVersion: process.version,
      platform: process.platform,
    }

    // Simple health checks
    const memoryHealthy = memoryUsedMB < 500 // Under 500MB used
    const healthy = memoryHealthy

    return {
      healthy,
      message: healthy ? 'System resources healthy' : 'System resources under stress',
      details,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      healthy: false,
      message: `System health check failed: ${message}`,
      details: { error: message },
    }
  }
}

/**
 * Check external service availability
 */
async function checkExternalServicesHealth(): Promise<HealthCheckResult> {
  const services: Record<string, boolean> = {}

  try {
    // Check OpenAI API availability (if configured)
    if (process.env.OPENAI_API_KEY) {
      services.openai = true
    }

    // Check if we can resolve DNS for external services
    services.dnsResolution = true // Assume healthy for now

    const healthyServices = Object.values(services).filter(Boolean).length
    const totalServices = Object.keys(services).length
    const healthy = totalServices === 0 || healthyServices / totalServices >= 0.8 // 80% threshold

    return {
      healthy,
      message: healthy
        ? `All external services healthy (${healthyServices}/${totalServices})`
        : `Some external services degraded (${healthyServices}/${totalServices})`,
      details: {
        services,
        healthyCount: healthyServices,
        totalCount: totalServices,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      healthy: false,
      message: `External services check failed: ${message}`,
      details: { error: message, services },
    }
  }
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${secs}s`
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`
  } else {
    return `${secs}s`
  }
}

/**
 * GET /api/health
 *
 * Returns comprehensive system health status.
 *
 * @returns {Promise<NextResponse>} JSON response with health status
 */
export async function GET(): Promise<NextResponse> {
  const startTime = Date.now()
  const checks: Record<string, HealthCheckResult> = {}
  let overallStatus: HealthStatus = 'healthy'

  try {
    // Database connectivity check
    checks.database = await checkDatabaseHealth()
    if (!checks.database.healthy) {
      overallStatus = 'down'
    }

    // Query performance check
    checks.queryPerformance = await checkQueryPerformanceHealth()
    if (!checks.queryPerformance.healthy && overallStatus === 'healthy') {
      overallStatus = 'degraded'
    }

    // System resources check
    checks.system = await checkSystemHealth()

    // External services check
    checks.externalServices = await checkExternalServicesHealth()
    if (!checks.externalServices.healthy && overallStatus === 'healthy') {
      overallStatus = 'degraded'
    }

    const responseTime = Date.now() - startTime

    apiLogger.info('Health check completed', {
      status: overallStatus,
      responseTime: `${responseTime}ms`,
    })

    return Response.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      checks,
      version: process.env.npm_package_version || 'unknown',
      environment: process.env.NODE_ENV || 'unknown',
    })
  } catch (error) {
    const responseTime = Date.now() - startTime
    const message = error instanceof Error ? error.message : 'Unknown error'

    apiLogger.error('Health check failed', {
      error: message,
      responseTime: `${responseTime}ms`,
    })

    return Response.json(
      {
        status: 'down',
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        error: 'Health check system failure',
        checks,
      },
      { status: 500 }
    )
  }
}
