/**
 * Configuration Module
 *
 * Centralized application configuration.
 *
 * @example
 * ```typescript
 * import { env, FEATURES, RATE_LIMITS } from '@/config'
 *
 * if (FEATURES.SENTRY_ENABLED) {
 *   // Initialize Sentry
 * }
 * ```
 */

export { env, FEATURES, DATABASE_CONFIG, AI_CONFIG } from './env'
export {
  RATE_LIMITS,
  CARD_POSITION_ORDER,
  WEIGHT_CLASS_NAMES,
  FIGHT_METHODS,
  CACHE_DURATIONS,
  PAGINATION,
  AI_PREDICTION,
  SCHEDULED_ROUNDS,
  DATE_FORMATS,
} from './constants'
export { MODEL_PRICING, DEFAULT_MODELS, calculateCost, type ModelName } from './ai-models'
