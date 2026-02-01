/**
 * Environment Variable Configuration
 *
 * Centralized, validated environment variable access.
 * Uses Zod for runtime validation and type safety.
 */

import { z } from 'zod'

/**
 * Environment variable schema
 * Add all environment variables here to ensure they're validated at startup
 */
const envSchema = z.object({
  // Database (required)
  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url().optional(),
  SHADOW_DATABASE_URL: z.string().url().optional(),

  // API Keys (required for production)
  INGEST_API_SECRET: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  BRAVE_SEARCH_API_KEY: z.string().min(1).optional(),

  // Sentry (optional)
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  SENTRY_TOKEN: z.string().optional(),

  // Application settings
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_BASE_PATH: z.string().optional(),

  // Admin
  ADMIN_PASSWORD: z.string().default('admin123'),
  ALLOW_PRODUCTION_WIPE: z.enum(['true', 'false']).default('false'),

  // AI Configuration
  AI_PROVIDER: z.enum(['openai', 'anthropic']).default('anthropic'),
  OPENAI_PREDICTION_CHUNK_SIZE: z.coerce.number().default(6),
})

/**
 * Validate and parse environment variables
 */
function parseEnv() {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    const errors = result.error.errors.map((err) => {
      return `  - ${err.path.join('.')}: ${err.message}`
    })

    console.error('❌ Environment variable validation failed:\n')
    console.error(errors.join('\n'))
    console.error('\nPlease check your .env.local file or environment configuration.')

    // In development, show which variables are missing
    if (process.env.NODE_ENV === 'development') {
      console.error('\n💡 Required variables for development:')
      console.error('  - DATABASE_URL (or use SQLite default)')
      console.error('  - INGEST_API_SECRET')
    }

    process.exit(1)
  }

  return result.data
}

/**
 * Validated environment variables
 * Use this instead of process.env throughout the application
 */
export const env = parseEnv()

/**
 * Feature flags derived from environment
 */
export const FEATURES = {
  // Admin features
  ADMIN_DEV_PASSWORD: env.NODE_ENV === 'development',
  ALLOW_PRODUCTION_WIPE: env.ALLOW_PRODUCTION_WIPE === 'true',

  // AI features
  WEB_SEARCH: !!env.BRAVE_SEARCH_API_KEY,
  ANTHROPIC_AI: !!env.ANTHROPIC_API_KEY,
  OPENAI_AI: !!env.OPENAI_API_KEY,

  // Monitoring
  SENTRY_ENABLED: !!env.SENTRY_DSN,

  // Environment
  IS_DEVELOPMENT: env.NODE_ENV === 'development',
  IS_PRODUCTION: env.NODE_ENV === 'production',
  IS_TEST: env.NODE_ENV === 'test',
} as const

/**
 * Database configuration
 */
export const DATABASE_CONFIG = {
  url: env.DATABASE_URL,
  directUrl: env.DIRECT_DATABASE_URL,
  shadowUrl: env.SHADOW_DATABASE_URL,
} as const

/**
 * AI configuration
 */
export const AI_CONFIG = {
  provider: env.AI_PROVIDER,
  openaiKey: env.OPENAI_API_KEY,
  anthropicKey: env.ANTHROPIC_API_KEY,
  braveSearchKey: env.BRAVE_SEARCH_API_KEY,
  chunkSize: env.OPENAI_PREDICTION_CHUNK_SIZE,
} as const
