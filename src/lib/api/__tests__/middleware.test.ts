/**
 * Tests for API middleware
 */

import { describe, it, expect, beforeEach } from 'vitest'

import { RateLimiter } from '../middleware'

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter

  beforeEach(() => {
    rateLimiter = new RateLimiter({ requests: 5, windowMs: 1000 })
  })

  it('should allow first request', () => {
    const result = rateLimiter.check('user-1')

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
    expect(result.resetIn).toBe(1000)
  })

  it('should track multiple requests from same identifier', () => {
    rateLimiter.check('user-1')
    rateLimiter.check('user-1')
    rateLimiter.check('user-1')

    const result = rateLimiter.check('user-1')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(1)
  })

  it('should block requests when limit exceeded', () => {
    // Use up all requests
    for (let i = 0; i < 5; i++) {
      rateLimiter.check('user-1')
    }

    const result = rateLimiter.check('user-1')
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.resetIn).toBeGreaterThan(0)
    expect(result.resetIn).toBeLessThanOrEqual(1000)
  })

  it('should track different identifiers separately', () => {
    rateLimiter.check('user-1')
    rateLimiter.check('user-1')
    rateLimiter.check('user-1')

    const result = rateLimiter.check('user-2')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('should reset after window expires', () => {
    // Use up all requests
    for (let i = 0; i < 5; i++) {
      rateLimiter.check('user-1')
    }

    // Should be blocked
    let result = rateLimiter.check('user-1')
    expect(result.allowed).toBe(false)

    // Create new rate limiter with expired window for testing
    const expiredLimiter = new RateLimiter({ requests: 5, windowMs: 0 })
    expiredLimiter.check('user-1') // Use one request

    // Manually override the reset time to be in the past
    const record = { count: 5, resetTime: Date.now() - 100 }
    // @ts-expect-error - accessing private property for test
    expiredLimiter.requests.set('user-1', record)

    // Next request should trigger cleanup and reset
    result = expiredLimiter.check('user-1')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('should handle empty identifier', () => {
    const result = rateLimiter.check('')
    expect(result.allowed).toBe(true)
  })

  it('should reset all limits when reset() called', () => {
    rateLimiter.check('user-1')
    rateLimiter.check('user-2')
    rateLimiter.check('user-3')

    rateLimiter.reset()

    // All users should have fresh limits
    const result1 = rateLimiter.check('user-1')
    const result2 = rateLimiter.check('user-2')

    expect(result1.remaining).toBe(4)
    expect(result2.remaining).toBe(4)
  })

  it('should handle cleanup of expired entries', () => {
    const limiter = new RateLimiter({ requests: 5, windowMs: 100 })

    // Add multiple entries
    limiter.check('user-1')
    limiter.check('user-2')
    limiter.check('user-3')

    // Wait for window to expire
    setTimeout(() => {
      // This request should trigger cleanup
      limiter.check('user-4')

      // @ts-expect-error - accessing private property for test
      expect(limiter.requests.size).toBeLessThanOrEqual(1)
    }, 150)
  })
})
