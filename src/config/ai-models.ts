/**
 * AI Model Configuration
 *
 * Centralized configuration for AI model pricing and settings.
 * Update these values when pricing changes or new models are added.
 *
 * Pricing source: https://openai.com/pricing and https://anthropic.com/pricing
 * Last updated: 2024-12
 */

/**
 * Model pricing (per 1M tokens)
 */
export const MODEL_PRICING = {
  // Anthropic Claude models
  'claude-3-5-sonnet-20241022': {
    input: 3.0,
    output: 15.0,
  },
  'claude-3-5-haiku-20241022': {
    input: 1.0,
    output: 5.0,
  },
  // OpenAI GPT models
  'gpt-4o': {
    input: 2.5,
    output: 10.0,
  },
  'gpt-4o-mini': {
    input: 0.15,
    output: 0.6,
  },
} as const

export type ModelName = keyof typeof MODEL_PRICING

/**
 * Default model selections by provider
 */
export const DEFAULT_MODELS = {
  anthropic: {
    primary: 'claude-3-5-sonnet-20241022' as ModelName,
    critique: 'claude-3-5-haiku-20241022' as ModelName,
  },
  openai: {
    primary: 'gpt-4o' as ModelName,
    critique: 'gpt-4o-mini' as ModelName,
  },
} as const

/**
 * Calculate cost for a model call
 */
export function calculateCost(
  model: ModelName,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model]
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  )
}
