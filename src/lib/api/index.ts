/**
 * API Utilities
 *
 * Shared utilities for API routes.
 */

export {
  ApiError,
  Errors,
  errorResponse,
  successResponse,
  apiHandler,
  type ApiErrorResponse,
  type ApiSuccessResponse,
  type ErrorCode,
} from './errors'

export {
  RateLimiter,
  getRequestId,
  getClientIP,
  createRateLimitHeaders,
  withRequestContext,
  type RequestContext,
} from './middleware'
