/**
 * Tests for API error handling
 */

import { describe, it, expect } from 'vitest'

import {
  ApiError,
  Errors,
  errorResponse,
  successResponse,
} from '../errors'

describe('ApiError', () => {
  it('should create error with correct properties', () => {
    const error = new ApiError('NOT_FOUND', 'Resource not found', { id: '123' }, 'req-123')

    expect(error.code).toBe('NOT_FOUND')
    expect(error.message).toBe('Resource not found')
    expect(error.details).toEqual({ id: '123' })
    expect(error.requestId).toBe('req-123')
    expect(error.statusCode).toBe(404)
    expect(error.name).toBe('ApiError')
  })

  it('should generate request ID if not provided', () => {
    const error = new ApiError('INTERNAL_ERROR', 'Something went wrong')

    expect(error.requestId).toBeDefined()
    expect(typeof error.requestId).toBe('string')
    expect(error.requestId.length).toBeGreaterThan(0)
  })

  it('should have correct status codes for different error types', () => {
    const testCases = [
      { code: 'UNAUTHORIZED' as const, expectedStatus: 401 },
      { code: 'FORBIDDEN' as const, expectedStatus: 403 },
      { code: 'NOT_FOUND' as const, expectedStatus: 404 },
      { code: 'VALIDATION_ERROR' as const, expectedStatus: 400 },
      { code: 'RATE_LIMITED' as const, expectedStatus: 429 },
      { code: 'INTERNAL_ERROR' as const, expectedStatus: 500 },
      { code: 'BAD_REQUEST' as const, expectedStatus: 400 },
      { code: 'CONFLICT' as const, expectedStatus: 409 },
    ]

    testCases.forEach(({ code, expectedStatus }) => {
      const error = new ApiError(code, 'Test message')
      expect(error.statusCode).toBe(expectedStatus)
    })
  })
})

describe('Errors helper', () => {
  it('should create unauthorized error', () => {
    const error = Errors.unauthorized('Invalid token')

    expect(error.code).toBe('UNAUTHORIZED')
    expect(error.message).toBe('Invalid token')
    expect(error.statusCode).toBe(401)
  })

  it('should create notFound error with resource name', () => {
    const error = Errors.notFound('User', { userId: '123' })

    expect(error.code).toBe('NOT_FOUND')
    expect(error.message).toBe('User not found')
    expect(error.details).toEqual({ userId: '123' })
  })

  it('should create validation error', () => {
    const error = Errors.validation('Invalid email format', { field: 'email' })

    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.message).toBe('Invalid email format')
    expect(error.details).toEqual({ field: 'email' })
  })

  it('should create rateLimited error with retryAfter', () => {
    const error = Errors.rateLimited(60, { limit: 100 })

    expect(error.code).toBe('RATE_LIMITED')
    expect(error.details).toEqual({ retryAfter: 60, limit: 100 })
  })

  it('should create internal error', () => {
    const error = Errors.internal('Database connection failed')

    expect(error.code).toBe('INTERNAL_ERROR')
    expect(error.message).toBe('Database connection failed')
  })

  it('should use default messages when not provided', () => {
    expect(Errors.unauthorized().message).toBe('Unauthorized')
    expect(Errors.forbidden().message).toBe('Forbidden')
    expect(Errors.internal().message).toBe('Internal server error')
  })
})

describe('errorResponse', () => {
  it('should create error response for ApiError', async () => {
    const error = new ApiError('NOT_FOUND', 'User not found', { id: '123' }, 'req-456')
    const response = errorResponse(error)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'User not found',
        details: { id: '123' },
        requestId: 'req-456',
      },
    })
  })

  it('should create error response for generic Error', async () => {
    const error = new Error('Something broke')
    const response = errorResponse(error)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.success).toBe(false)
    expect(data.error.code).toBe('INTERNAL_ERROR')
    expect(data.error.message).toBe('Something broke')
    expect(data.error.requestId).toBeDefined()
  })

  it('should use fallback code for generic errors', async () => {
    const error = new Error('Bad request')
    const response = errorResponse(error, 'BAD_REQUEST')
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error.code).toBe('BAD_REQUEST')
  })

  it('should handle errors without message', async () => {
    const error = new Error()
    const response = errorResponse(error)
    const data = await response.json()

    expect(data.error.message).toBe('An unexpected error occurred')
  })
})

describe('successResponse', () => {
  it('should create success response with data', async () => {
    const data = { users: [{ id: '1', name: 'John' }] }
    const response = successResponse(data, 'req-123')
    const responseData = await response.json()

    expect(response.status).toBe(200)
    expect(responseData).toEqual({
      success: true,
      data: { users: [{ id: '1', name: 'John' }] },
      meta: {
        timestamp: expect.any(String),
        requestId: 'req-123',
      },
    })
  })

  it('should include timestamp in meta', async () => {
    const response = successResponse({ test: true })
    const data = await response.json()

    expect(data.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('should handle requestId being undefined', async () => {
    const response = successResponse({ test: true })
    const data = await response.json()

    expect(data.meta.requestId).toBeUndefined()
    expect(data.meta.timestamp).toBeDefined()
  })
})
