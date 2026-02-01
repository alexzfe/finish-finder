/**
 * Application Constants
 *
 * Centralized constants to avoid magic numbers and strings throughout the codebase.
 */

/**
 * API Rate Limits (requests per window)
 */
export const RATE_LIMITS = {
  /** Default rate limit for general API endpoints */
  DEFAULT: { requests: 30, windowMs: 60_000 }, // 30 req/min

  /** Rate limit for fighter image endpoint */
  FIGHTER_IMAGE: { requests: 60, windowMs: 60_000 }, // 60 req/min

  /** Rate limit for data ingestion (internal) */
  INGEST: { requests: 120, windowMs: 60_000 }, // 120 req/min
} as const

/**
 * Card position ordering for display
 */
export const CARD_POSITION_ORDER: Record<string, number> = {
  'Main Event': 1,
  'Co-Main Event': 2,
  'Main Card': 3,
  'Prelims': 4,
  'Early Prelims': 5,
  'preliminary': 6, // fallback
} as const

/**
 * Weight class display names
 */
export const WEIGHT_CLASS_NAMES: Record<string, string> = {
  strawweight: 'Strawweight',
  flyweight: 'Flyweight',
  bantamweight: 'Bantamweight',
  featherweight: 'Featherweight',
  lightweight: 'Lightweight',
  welterweight: 'Welterweight',
  middleweight: 'Middleweight',
  light_heavyweight: 'Light Heavyweight',
  heavyweight: 'Heavyweight',
  womens_strawweight: "Women's Strawweight",
  womens_flyweight: "Women's Flyweight",
  womens_bantamweight: "Women's Bantamweight",
  womens_featherweight: "Women's Featherweight",
} as const

/**
 * Fight outcome methods
 */
export const FIGHT_METHODS = {
  KO: 'KO',
  TKO: 'TKO',
  SUBMISSION: 'SUB',
  DECISION: 'DEC',
  DQ: 'DQ',
  NO_CONTEST: 'NC',
} as const

/**
 * Cache durations (in milliseconds)
 */
export const CACHE_DURATIONS = {
  /** Fighter image cache */
  FIGHTER_IMAGE: 24 * 60 * 60 * 1000, // 24 hours

  /** API response cache */
  API_RESPONSE: 5 * 60 * 1000, // 5 minutes

  /** Static data cache */
  STATIC_DATA: 60 * 60 * 1000, // 1 hour
} as const

/**
 * Pagination defaults
 */
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 100,
} as const

/**
 * AI Prediction configuration
 */
export const AI_PREDICTION = {
  /** Minimum confidence threshold for displaying predictions */
  MIN_CONFIDENCE: 0.5,

  /** Fun score range */
  FUN_SCORE_MIN: 0,
  FUN_SCORE_MAX: 100,

  /** Finish probability range */
  FINISH_PROBABILITY_MIN: 0,
  FINISH_PROBABILITY_MAX: 1,

  /** Risk level thresholds */
  RISK_LEVELS: {
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
  } as const,
} as const

/**
 * Scheduled rounds by fight type
 */
export const SCHEDULED_ROUNDS = {
  STANDARD: 3,
  TITLE: 5,
  MAIN_EVENT: 5,
} as const

/**
 * Date/time formats
 */
export const DATE_FORMATS = {
  DISPLAY: 'MMMM d, yyyy',
  API: "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
  SHORT: 'MMM d',
} as const
