/**
 * Structured Database Query Logger
 *
 * This module provides structured logging for database queries with:
 * - Standardized log format for analysis
 * - Integration with external log aggregation services
 * - Performance-optimized logging
 * - Contextual metadata for debugging
 */

import type { QueryStats } from './monitoring'

export interface StructuredLogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  service: 'database'
  eventType: 'query_executed' | 'query_slow' | 'query_critical' | 'query_error'

  // Query details
  query: {
    normalized: string
    model?: string
    action?: string
    duration: number
    performance: string
  }

  // Context
  context: {
    requestId?: string
    userId?: string
    sessionId?: string
    userAgent?: string
    ip?: string
  }

  // Metadata
  metadata: {
    args?: unknown
    result?: unknown
    error?: string
    stackTrace?: string
  }
}

export interface LogAggregationConfig {
  enabled: boolean
  endpoint?: string
  apiKey?: string
  batchSize: number
  flushInterval: number // milliseconds
}

class StructuredQueryLogger {
  private config: LogAggregationConfig
  private logBuffer: StructuredLogEntry[] = []
  private flushTimer?: NodeJS.Timeout

  constructor() {
    this.config = {
      enabled: process.env.STRUCTURED_LOGGING_ENABLED === 'true',
      endpoint: process.env.LOG_AGGREGATION_ENDPOINT,
      apiKey: process.env.LOG_AGGREGATION_API_KEY,
      batchSize: Number(process.env.LOG_BATCH_SIZE) || 50,
      flushInterval: Number(process.env.LOG_FLUSH_INTERVAL) || 30000 // 30 seconds
    }

    // Start periodic flush if logging is enabled
    if (this.config.enabled) {
      this.startPeriodicFlush()
    }
  }

  /**
   * Log a database query with structured format
   */
  logQuery(stats: QueryStats, context: Partial<StructuredLogEntry['context']> = {}): void {
    if (!this.config.enabled) return

    const eventType = this.determineEventType(stats)
    const level = this.determineLogLevel(stats)

    const logEntry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: 'database',
      eventType,
      query: {
        normalized: stats.query,
        model: stats.model,
        action: stats.action,
        duration: stats.duration,
        performance: stats.performance
      },
      context: {
        requestId: context.requestId,
        userId: context.userId,
        sessionId: context.sessionId,
        userAgent: context.userAgent,
        ip: context.ip
      },
      metadata: {
        args: this.sanitizeArgs(stats.args),
        result: this.sanitizeResult(stats.result),
        error: stats.error,
        stackTrace: stats.error ? this.captureStackTrace() : undefined
      }
    }

    // Add to buffer
    this.logBuffer.push(logEntry)

    // Flush immediately for critical events
    if (eventType === 'query_critical' || eventType === 'query_error') {
      this.flush().catch(error => {
        console.warn('Failed to flush critical log:', error.message)
      })
    }

    // Flush if buffer is full
    if (this.logBuffer.length >= this.config.batchSize) {
      this.flush().catch(error => {
        console.warn('Failed to flush log buffer:', error.message)
      })
    }
  }

  /**
   * Determine event type based on query performance
   */
  private determineEventType(stats: QueryStats): StructuredLogEntry['eventType'] {
    if (stats.error) return 'query_error'
    if (stats.performance === 'critical') return 'query_critical'
    if (stats.performance === 'slow') return 'query_slow'
    return 'query_executed'
  }

  /**
   * Determine log level based on query performance
   */
  private determineLogLevel(stats: QueryStats): StructuredLogEntry['level'] {
    if (stats.error) return 'error'
    if (stats.performance === 'critical' || stats.performance === 'slow') return 'warn'
    return 'info'
  }

  /**
   * Sanitize query arguments for logging (remove sensitive data)
   */
  private sanitizeArgs(args: unknown): unknown {
    if (!args || typeof args !== 'object') return args

    try {
      const sanitized = JSON.parse(JSON.stringify(args))
      return this.redactSensitiveFields(sanitized)
    } catch {
      return '[Failed to serialize args]'
    }
  }

  /**
   * Sanitize query result for logging
   */
  private sanitizeResult(result: unknown): unknown {
    if (!result) return result

    // For large results, just log metadata
    if (typeof result === 'string' && result.includes('records')) {
      return result // Already sanitized by monitoring system
    }

    return '[Result data redacted for privacy]'
  }

  /**
   * Redact sensitive fields from objects
   */
  private redactSensitiveFields(obj: any): any {
    const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'email', 'phone']

    if (Array.isArray(obj)) {
      return obj.map(item => this.redactSensitiveFields(item))
    }

    if (obj && typeof obj === 'object') {
      const redacted = { ...obj }

      for (const key of Object.keys(redacted)) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
          redacted[key] = '[REDACTED]'
        } else if (typeof redacted[key] === 'object') {
          redacted[key] = this.redactSensitiveFields(redacted[key])
        }
      }

      return redacted
    }

    return obj
  }

  /**
   * Capture stack trace for error context
   */
  private captureStackTrace(): string | undefined {
    try {
      const stack = new Error().stack
      return stack?.split('\n').slice(2, 6).join('\n') // Get relevant stack frames
    } catch {
      return undefined
    }
  }

  /**
   * Start periodic log flushing
   */
  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(() => {
      if (this.logBuffer.length > 0) {
        this.flush().catch(error => {
          console.warn('Periodic log flush failed:', error.message)
        })
      }
    }, this.config.flushInterval)
  }

  /**
   * Flush logs to external aggregation service
   */
  private async flush(): Promise<void> {
    if (this.logBuffer.length === 0) return

    const logsToFlush = [...this.logBuffer]
    this.logBuffer = [] // Clear buffer immediately

    try {
      if (this.config.endpoint && this.config.apiKey) {
        // Send to external log aggregation service
        await this.sendToAggregationService(logsToFlush)
      } else {
        // Fallback to structured console logging
        this.logToConsole(logsToFlush)
      }
    } catch (error) {
      console.warn('Log flush failed, falling back to console:', error)
      this.logToConsole(logsToFlush)
    }
  }

  /**
   * Send logs to external aggregation service (e.g., Logtail, DataDog)
   */
  private async sendToAggregationService(logs: StructuredLogEntry[]): Promise<void> {
    if (!this.config.endpoint || !this.config.apiKey) return

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({ logs })
    })

    if (!response.ok) {
      throw new Error(`Log aggregation failed: ${response.status} ${response.statusText}`)
    }
  }

  /**
   * Fallback to structured console logging
   */
  private logToConsole(logs: StructuredLogEntry[]): void {
    logs.forEach(log => {
      const logMessage = {
        timestamp: log.timestamp,
        level: log.level,
        service: log.service,
        event: log.eventType,
        duration: log.query.duration,
        query: `${log.query.model}.${log.query.action}`,
        performance: log.query.performance,
        context: log.context,
        error: log.metadata.error
      }

      switch (log.level) {
        case 'error':
          console.error('DB_QUERY_ERROR:', JSON.stringify(logMessage))
          break
        case 'warn':
          console.warn('DB_QUERY_SLOW:', JSON.stringify(logMessage))
          break
        default:
          console.log('DB_QUERY:', JSON.stringify(logMessage))
      }
    })
  }

  /**
   * Gracefully shutdown logger
   */
  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }

    // Flush remaining logs
    if (this.logBuffer.length > 0) {
      this.flush().catch(error => {
        console.warn('Shutdown flush failed:', error.message)
      })
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): LogAggregationConfig {
    return { ...this.config }
  }

  /**
   * Check if structured logging is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled
  }
}

export const structuredLogger = new StructuredQueryLogger()

// Graceful shutdown handling
if (typeof process !== 'undefined') {
  process.on('SIGINT', () => structuredLogger.shutdown())
  process.on('SIGTERM', () => structuredLogger.shutdown())
}