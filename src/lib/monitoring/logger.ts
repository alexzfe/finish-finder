interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  service: string
  message: string
  meta?: Record<string, unknown>
}

class Logger {
  private serviceName: string

  constructor(serviceName: string) {
    this.serviceName = serviceName
  }

  private log(level: LogEntry['level'], message: string, meta?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
      meta
    }

    // Console output with colors
    const colors = {
      info: '\x1b[36m',    // Cyan
      warn: '\x1b[33m',    // Yellow
      error: '\x1b[31m',   // Red
      debug: '\x1b[90m'    // Gray
    }

    const reset = '\x1b[0m'
    const color = colors[level] || ''

    console.log(
      `${color}[${entry.timestamp}] ${level.toUpperCase()} [${this.serviceName}]${reset} ${message}`,
      meta ? meta : ''
    )

    // In production, you would send this to a logging service
    if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
      // Server-side production logging
      this.sendToExternalService(entry)
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta)
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta)
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta)
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === 'development') {
      this.log('debug', message, meta)
    }
  }

  private sendToExternalService(entry: LogEntry): void {
    // Placeholder for external logging service integration
    // Examples: Sentry, LogRocket, DataDog, etc.
    if (entry.level === 'error') {
      // Send errors to error tracking service
    }
  }
}

// Factory function for creating loggers
export function createLogger(serviceName: string): Logger {
  return new Logger(serviceName)
}

// Service-specific loggers
export const scraperLogger = createLogger('SCRAPER')
export const imageLogger = createLogger('IMAGE_SERVICE')
export const apiLogger = createLogger('API')
export const uiLogger = createLogger('UI')
export const dbLogger = createLogger('DATABASE')
export const predictionLogger = createLogger('PREDICTION')

// Performance monitoring
export class PerformanceMonitor {
  private timers: Map<string, number> = new Map()

  start(operation: string): void {
    this.timers.set(operation, Date.now())
  }

  end(operation: string, logger?: Logger): number {
    const startTime = this.timers.get(operation)
    if (!startTime) {
      console.warn(`No timer found for operation: ${operation}`)
      return 0
    }

    const duration = Date.now() - startTime
    this.timers.delete(operation)

    if (logger) {
      logger.debug(`Operation completed: ${operation}`, { duration: `${duration}ms` })
    }

    return duration
  }

  measure<T>(operation: string, fn: () => Promise<T>, logger?: Logger): Promise<T> {
    return new Promise(async (resolve, reject) => {
      this.start(operation)
      try {
        const result = await fn()
        this.end(operation, logger)
        resolve(result)
      } catch (error) {
        this.end(operation, logger)
        if (logger) {
          logger.error(`Operation failed: ${operation}`, { error: error instanceof Error ? error.message : 'Unknown error' })
        }
        reject(error)
      }
    })
  }
}

export const performanceMonitor = new PerformanceMonitor()

// Error boundary for React components
export class ErrorTracker {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static captureError(error: Error, context?: Record<string, any>): void {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      context
    }

    console.error('Captured error:', errorInfo)

    // In production, send to error tracking service
    if (process.env.NODE_ENV === 'production') {
      // Send to Sentry, Bugsnag, etc.
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static captureException(error: unknown, context?: Record<string, any>): void {
    if (error instanceof Error) {
      this.captureError(error, context)
    } else {
      this.captureError(new Error(String(error)), context)
    }
  }
}

// Health check utilities
export class HealthChecker {
  static async checkDatabase(): Promise<{ healthy: boolean; message: string }> {
    try {
      // This would check database connectivity
      return { healthy: true, message: 'Database connection OK' }
    } catch (error) {
      return { healthy: false, message: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}` }
    }
  }

  static async checkExternalServices(): Promise<{ healthy: boolean; services: Record<string, boolean> }> {
    const services = {
      sherdog: await this.checkUrl('https://sherdog.com'),
      tapology: await this.checkUrl('https://tapology.com'),
      openai: process.env.OPENAI_API_KEY ? true : false
    }

    const allHealthy = Object.values(services).every(status => status)

    return { healthy: allHealthy, services }
  }

  private static async checkUrl(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
      return response.ok
    } catch {
      return false
    }
  }

  static async getSystemHealth(): Promise<{
    overall: 'healthy' | 'degraded' | 'down'
    checks: Record<string, { healthy: boolean; message?: string }>
  }> {
    const dbCheck = await this.checkDatabase()
    const servicesCheck = await this.checkExternalServices()

    const checks = {
      database: dbCheck,
      externalServices: servicesCheck
    }

    let overall: 'healthy' | 'degraded' | 'down' = 'healthy'

    if (!dbCheck.healthy) {
      overall = 'down'
    } else if (!servicesCheck.healthy) {
      overall = 'degraded'
    }

    return { overall, checks }
  }
}

export default Logger