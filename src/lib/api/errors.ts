/**
 * API Error Handling
 *
 * Standardized error responses across all API routes.
 */

import { NextResponse } from 'next/server'

/**
 * Standard error codes used throughout the API
 */
export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'SERVICE_UNAVAILABLE'

/**
 * HTTP status codes mapping
 */
const STATUS_CODES: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  SERVICE_UNAVAILABLE: 503,
}

/**
 * Standard API error structure
 */
export interface ApiErrorResponse {
  success: false
  error: {
    code: ErrorCode
    message: string
    details?: Record<string, unknown>
    requestId?: string
  }
}

/**
 * Standard API success structure
 */
export interface ApiSuccessResponse<T> {
  success: true
  data: T
  meta?: {
    timestamp: string
    requestId?: string
  }
}

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  public readonly code: ErrorCode
  public readonly statusCode: number
  public readonly details?: Record<string, unknown>
  public readonly requestId: string

  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
    requestId?: string
  ) {
    super(message)
    this.code = code
    this.statusCode = STATUS_CODES[code]
    this.details = details
    this.requestId = requestId ?? crypto.randomUUID()
    this.name = 'ApiError'
  }
}

/**
 * Create a standardized error response
 */
export function errorResponse(
  error: ApiError | Error,
  fallbackCode: ErrorCode = 'INTERNAL_ERROR'
): NextResponse<ApiErrorResponse> {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId: error.requestId,
        },
      },
      { status: error.statusCode }
    )
  }

  // Generic error fallback
  const requestId = crypto.randomUUID()
  return NextResponse.json(
    {
      success: false,
      error: {
        code: fallbackCode,
        message: error.message || 'An unexpected error occurred',
        requestId,
      },
    },
    { status: STATUS_CODES[fallbackCode] }
  )
}

/**
 * Create a standardized success response
 */
export function successResponse<T>(
  data: T,
  requestId?: string
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json({
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
    },
  })
}

/**
 * Helper functions for common error types
 */
export const Errors = {
  unauthorized: (message = 'Unauthorized', details?: Record<string, unknown>) =>
    new ApiError('UNAUTHORIZED', message, details),

  forbidden: (message = 'Forbidden', details?: Record<string, unknown>) =>
    new ApiError('FORBIDDEN', message, details),

  notFound: (resource: string, details?: Record<string, unknown>) =>
    new ApiError('NOT_FOUND', `${resource} not found`, details),

  validation: (message: string, details?: Record<string, unknown>) =>
    new ApiError('VALIDATION_ERROR', message, details),

  rateLimited: (retryAfter?: number, details?: Record<string, unknown>) =>
    new ApiError(
      'RATE_LIMITED',
      'Rate limit exceeded. Please try again later.',
      { retryAfter, ...details }
    ),

  internal: (message = 'Internal server error', details?: Record<string, unknown>) =>
    new ApiError('INTERNAL_ERROR', message, details),

  badRequest: (message: string, details?: Record<string, unknown>) =>
    new ApiError('BAD_REQUEST', message, details),

  conflict: (message: string, details?: Record<string, unknown>) =>
    new ApiError('CONFLICT', message, details),
} as const

/**
 * Async handler wrapper for API routes
 * Catches errors and returns standardized responses
 */
export function apiHandler<T>(
  handler: () => Promise<T>,
  requestId?: string
): Promise<NextResponse<ApiSuccessResponse<T> | ApiErrorResponse>> {
  return handler()
    .then((data) => successResponse(data, requestId))
    .catch((error) => {
      if (error instanceof ApiError) {
        return errorResponse(error)
      }
      console.error('Unhandled API error:', error)
      return errorResponse(error)
    })
}
