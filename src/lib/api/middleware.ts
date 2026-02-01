/**
 * API Middleware Utilities
 *
 * Shared middleware functionality for API routes.
 */

import { type NextRequest, type NextResponse } from 'next/server'

import { randomUUID } from 'crypto'

/**
 * Request context with ID and timing
 */
export interface RequestContext {
  requestId: string
  startTime: number
}

/**
 * Extract or generate request ID
 */
export function getRequestId(request: NextRequest): string {
  return (
    request.headers.get('x-request-id') ??
    request.headers.get('x-correlation-id') ??
    randomUUID()
  )
}

/**
 * Add request context to headers for downstream use
 */
export function withRequestContext(
  response: NextResponse,
  context: RequestContext
): NextResponse {
  response.headers.set('x-request-id', context.requestId)
  response.headers.set('x-response-time', `${Date.now() - context.startTime}ms`)
  return response
}

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  requests: number
  windowMs: number
}

/**
 * Simple in-memory rate limiter
 * For production, consider using Redis or Vercel KV
 */
export class RateLimiter {
  private requests = new Map<string, { count: number; resetTime: number }>()
  private config: RateLimitConfig

  constructor(config: RateLimitConfig) {
    this.config = config
  }

  /**
   * Check if request is allowed
   */
  check(identifier: string): {
    allowed: boolean
    remaining: number
    resetIn: number
  } {
    const now = Date.now()
    const record = this.requests.get(identifier)

    // Cleanup old entries periodically (1% chance)
    if (Math.random() < 0.01) {
      this.cleanup(now)
    }

    if (!record || now > record.resetTime) {
      // New window
      this.requests.set(identifier, {
        count: 1,
        resetTime: now + this.config.windowMs,
      })
      return {
        allowed: true,
        remaining: this.config.requests - 1,
        resetIn: this.config.windowMs,
      }
    }

    if (record.count >= this.config.requests) {
      // Rate limited
      return {
        allowed: false,
        remaining: 0,
        resetIn: record.resetTime - now,
      }
    }

    // Increment count
    record.count++
    return {
      allowed: true,
      remaining: this.config.requests - record.count,
      resetIn: record.resetTime - now,
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(now: number): void {
    for (const [key, value] of this.requests.entries()) {
      if (now > value.resetTime) {
        this.requests.delete(key)
      }
    }
  }

  /**
   * Reset all limits (useful for testing)
   */
  reset(): void {
    this.requests.clear()
  }
}

/**
 * Get client IP from request
 */
export function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(
  limit: number,
  remaining: number,
  resetIn: number
): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'Retry-After': String(Math.ceil(resetIn / 1000)),
  }
}
