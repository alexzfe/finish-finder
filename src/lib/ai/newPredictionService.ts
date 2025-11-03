/**
 * New AI Prediction Service - Phase 3
 *
 * Generates AI predictions for UFC fights using:
 * - Finish Probability: Chain-of-thought reasoning (4 steps)
 * - Fun Score: Weighted factor analysis
 *
 * Supports both Anthropic Claude and OpenAI GPT models.
 * Uses 1 fight per API call for maximum quality (can batch later if needed).
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import {
  buildFinishProbabilityPrompt,
  buildFunScorePrompt,
  buildFinishKeyFactorsExtractionPrompt,
  buildFunKeyFactorsExtractionPrompt,
  type FinishProbabilityInput,
  type FinishProbabilityOutput,
  type FunScoreInput,
  type FunScoreOutput,
} from './prompts'

/**
 * Configuration for retry logic
 */
const RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
}

/**
 * Model pricing (per 1M tokens) - as of 2024
 */
const MODEL_PRICING = {
  'claude-3-5-sonnet-20241022': {
    input: 3.0,   // $3 per 1M input tokens
    output: 15.0, // $15 per 1M output tokens
  },
  'gpt-4o': {
    input: 2.5,   // $2.50 per 1M input tokens
    output: 10.0, // $10 per 1M output tokens
  },
} as const

/**
 * Result from a single prediction (finish or fun)
 */
interface PredictionResult {
  output: FinishProbabilityOutput | FunScoreOutput
  tokensUsed: number
  costUsd: number
  modelUsed: string
}

/**
 * Combined prediction for a single fight
 */
export interface FightPrediction {
  finishProbability: number
  finishConfidence: number
  finishReasoning: FinishProbabilityOutput['reasoning'] & { keyFactors: string[] }
  funScore: number
  funConfidence: number
  funBreakdown: FunScoreOutput['breakdown'] & { keyFactors: string[] }
  modelUsed: string
  tokensUsed: number
  costUsd: number
}

/**
 * Calculate risk level from AI confidence scores
 *
 * Risk level represents how unpredictable the fight outcome is.
 * Thresholds calibrated to actual confidence distribution for ~21-69-11 split:
 * - "low" = High confidence (>= 0.78 avg) → Very predictable outcome (~11%)
 * - "balanced" = Medium confidence (0.675-0.78 avg) → Moderate uncertainty (~69%)
 * - "high" = Low confidence (< 0.675 avg) → Unpredictable outcome (~21%)
 *
 * Based on analysis of 207 predictions:
 * - Min confidence: 0.40, Max: 0.85, Median: 0.725
 * - 25th percentile: 0.70, 75th percentile: 0.775
 *
 * @param finishConfidence - Confidence in finish probability prediction (0-1)
 * @param funConfidence - Confidence in fun score prediction (0-1)
 * @returns Risk level: "low", "balanced", or "high"
 */
export function calculateRiskLevel(
  finishConfidence: number,
  funConfidence: number
): 'low' | 'balanced' | 'high' {
  // Average the two confidence scores
  const avgConfidence = (finishConfidence + funConfidence) / 2

  // Map confidence to risk (inverse relationship)
  // Thresholds: 0.78 and 0.675 for balanced 21-69-11 distribution
  if (avgConfidence >= 0.78) {
    return 'low' // Top ~11%: Very high confidence = predictable = low risk
  } else if (avgConfidence >= 0.675) {
    return 'balanced' // Middle ~69%: Medium confidence = moderate risk
  } else {
    return 'high' // Bottom ~21%: Low confidence = unpredictable = high risk
  }
}

/**
 * AI Prediction Service
 *
 * Generates finish probability and fun score predictions for MMA fights.
 */
export class NewPredictionService {
  private client: Anthropic | OpenAI
  private modelName: string
  private provider: 'anthropic' | 'openai'
  private temperature = 0.3 // Low temp for consistency

  constructor(provider: 'anthropic' | 'openai' = 'anthropic') {
    this.provider = provider

    if (provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is required')
      }
      this.client = new Anthropic({ apiKey })
      this.modelName = 'claude-3-5-sonnet-20241022'
    } else {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required')
      }
      this.client = new OpenAI({ apiKey })
      this.modelName = 'gpt-4o'
    }
  }

  /**
   * Generate complete prediction for a single fight
   *
   * @param finishInput - Fighter stats for finish probability
   * @param funInput - Fighter stats for fun score
   * @returns Combined prediction with costs and tokens
   */
  async predictFight(
    finishInput: FinishProbabilityInput,
    funInput: FunScoreInput
  ): Promise<FightPrediction> {
    // Step 1: Run both main predictions in parallel (2 API calls)
    const [finishResult, funResult] = await Promise.all([
      this.predictFinishProbability(finishInput),
      this.predictFunScore(funInput),
    ])

    const finishOutput = finishResult.output as FinishProbabilityOutput
    const funOutput = funResult.output as FunScoreOutput

    // Step 2: Extract key factors from reasoning texts (2 more API calls)
    const [finishKeyFactors, funKeyFactors] = await Promise.all([
      this.extractKeyFactors(finishOutput.reasoning.finalAssessment, 'finish'),
      this.extractKeyFactors(funOutput.breakdown.reasoning, 'fun'),
    ])

    // Calculate total tokens and cost (including extraction calls)
    const extractionTokens = finishKeyFactors.length > 0 ? 400 : 0 // Estimate ~200 per extraction
    const extractionCost =
      extractionTokens > 0
        ? (extractionTokens / 1_000_000) *
          MODEL_PRICING[this.modelName as keyof typeof MODEL_PRICING].input
        : 0

    return {
      finishProbability: finishOutput.finishProbability,
      finishConfidence: finishOutput.confidence,
      finishReasoning: {
        ...finishOutput.reasoning,
        keyFactors: finishKeyFactors,
      },
      funScore: funOutput.funScore,
      funConfidence: funOutput.confidence,
      funBreakdown: {
        ...funOutput.breakdown,
        keyFactors: funKeyFactors,
      },
      modelUsed: this.modelName,
      tokensUsed: finishResult.tokensUsed + funResult.tokensUsed + extractionTokens,
      costUsd: finishResult.costUsd + funResult.costUsd + extractionCost,
    }
  }

  /**
   * Predict finish probability for a single fight
   */
  private async predictFinishProbability(
    input: FinishProbabilityInput
  ): Promise<PredictionResult> {
    const prompt = buildFinishProbabilityPrompt(input)
    return this.callLLMWithRetry<FinishProbabilityOutput>(prompt, 'finish')
  }

  /**
   * Predict fun score for a single fight
   */
  private async predictFunScore(input: FunScoreInput): Promise<PredictionResult> {
    const prompt = buildFunScorePrompt(input)
    return this.callLLMWithRetry<FunScoreOutput>(prompt, 'fun')
  }

  /**
   * Call LLM with retry logic and exponential backoff
   */
  private async callLLMWithRetry<T extends FinishProbabilityOutput | FunScoreOutput>(
    prompt: string,
    predictionType: 'finish' | 'fun'
  ): Promise<PredictionResult> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
      try {
        const response = await this.callLLM(prompt)

        // Parse and validate JSON
        const output = this.parseJSON<T>(response.text, predictionType)

        return {
          output: output as FinishProbabilityOutput | FunScoreOutput,
          tokensUsed: response.tokensUsed,
          costUsd: response.costUsd,
          modelUsed: this.modelName,
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Don't retry on parse errors (bad prompt)
        if (error instanceof SyntaxError || error instanceof TypeError) {
          throw lastError
        }

        // Retry on API errors
        if (attempt < RETRY_CONFIG.maxAttempts) {
          const delayMs =
            RETRY_CONFIG.initialDelayMs *
            Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1)

          console.warn(
            `Prediction attempt ${attempt} failed: ${lastError.message}. Retrying in ${delayMs}ms...`
          )

          await new Promise((resolve) => setTimeout(resolve, delayMs))
        }
      }
    }

    throw new Error(
      `Failed to generate ${predictionType} prediction after ${RETRY_CONFIG.maxAttempts} attempts: ${lastError?.message}`
    )
  }

  /**
   * Call the LLM API (Anthropic or OpenAI)
   */
  private async callLLM(prompt: string): Promise<{
    text: string
    tokensUsed: number
    costUsd: number
  }> {
    if (this.client instanceof Anthropic) {
      const message = await this.client.messages.create({
        model: this.modelName,
        max_tokens: 1000,
        temperature: this.temperature,
        messages: [{ role: 'user', content: prompt }],
      })

      const text =
        message.content[0]?.type === 'text' ? message.content[0].text : ''

      if (!text) {
        throw new Error('Empty response from Claude')
      }

      // Calculate token usage and cost
      const inputTokens = message.usage.input_tokens
      const outputTokens = message.usage.output_tokens
      const totalTokens = inputTokens + outputTokens

      const pricing =
        MODEL_PRICING[this.modelName as keyof typeof MODEL_PRICING]
      const costUsd =
        (inputTokens / 1_000_000) * pricing.input +
        (outputTokens / 1_000_000) * pricing.output

      return {
        text,
        tokensUsed: totalTokens,
        costUsd,
      }
    } else if (this.client instanceof OpenAI) {
      const completion = await this.client.chat.completions.create({
        model: this.modelName,
        max_tokens: 1000,
        temperature: this.temperature,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = completion.choices[0]?.message?.content

      if (!text) {
        throw new Error('Empty response from OpenAI')
      }

      // Calculate token usage and cost
      const inputTokens = completion.usage?.prompt_tokens || 0
      const outputTokens = completion.usage?.completion_tokens || 0
      const totalTokens = inputTokens + outputTokens

      const pricing =
        MODEL_PRICING[this.modelName as keyof typeof MODEL_PRICING]
      const costUsd =
        (inputTokens / 1_000_000) * pricing.input +
        (outputTokens / 1_000_000) * pricing.output

      return {
        text,
        tokensUsed: totalTokens,
        costUsd,
      }
    } else {
      throw new Error('Invalid LLM client')
    }
  }

  /**
   * Parse JSON from LLM response
   *
   * Handles markdown code blocks and validates structure
   */
  private parseJSON<T>(response: string, predictionType: 'finish' | 'fun'): T {
    // Remove markdown code blocks if present
    let jsonText = response.trim()

    // Extract JSON from ```json...``` blocks
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1]
    }

    // Extract first JSON object if no code block
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error(`No JSON found in ${predictionType} prediction response`)
    }

    jsonText = jsonMatch[0]

    // Parse JSON
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText)
    } catch (error) {
      throw new SyntaxError(
        `Invalid JSON in ${predictionType} prediction: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    // Basic validation
    if (typeof parsed !== 'object' || parsed === null) {
      throw new TypeError(`Parsed ${predictionType} prediction is not an object`)
    }

    // Type-specific validation
    if (predictionType === 'finish') {
      this.validateFinishOutput(parsed)
    } else {
      this.validateFunOutput(parsed)
    }

    return parsed as T
  }

  /**
   * Validate finish probability output structure
   */
  private validateFinishOutput(obj: unknown): asserts obj is FinishProbabilityOutput {
    const o = obj as Record<string, unknown>

    if (typeof o.finishProbability !== 'number') {
      throw new TypeError('finishProbability must be a number')
    }
    if (o.finishProbability < 0 || o.finishProbability > 1) {
      throw new TypeError('finishProbability must be between 0 and 1')
    }
    if (typeof o.confidence !== 'number') {
      throw new TypeError('confidence must be a number')
    }
    if (typeof o.reasoning !== 'object' || o.reasoning === null) {
      throw new TypeError('reasoning must be an object')
    }

    const reasoning = o.reasoning as Record<string, unknown>
    const requiredKeys = [
      'defensiveComparison',
      'finishRateComparison',
      'weightClassAdjustment',
      'finalAssessment',
    ]

    for (const key of requiredKeys) {
      if (typeof reasoning[key] !== 'string') {
        throw new TypeError(`reasoning.${key} must be a string`)
      }
    }
  }

  /**
   * Validate fun score output structure
   */
  private validateFunOutput(obj: unknown): asserts obj is FunScoreOutput {
    const o = obj as Record<string, unknown>

    if (typeof o.funScore !== 'number') {
      throw new TypeError('funScore must be a number')
    }
    if (o.funScore < 0 || o.funScore > 100) {
      throw new TypeError('funScore must be between 0 and 100')
    }
    if (typeof o.confidence !== 'number') {
      throw new TypeError('confidence must be a number')
    }
    if (typeof o.breakdown !== 'object' || o.breakdown === null) {
      throw new TypeError('breakdown must be an object')
    }

    const breakdown = o.breakdown as Record<string, unknown>
    const requiredNumericKeys = [
      'paceScore',
      'finishRateScore',
      'secondaryScore',
      'styleMatchupScore',
      'contextBonus',
      'penalties',
    ]

    for (const key of requiredNumericKeys) {
      if (typeof breakdown[key] !== 'number') {
        throw new TypeError(`breakdown.${key} must be a number`)
      }
    }

    if (typeof breakdown.reasoning !== 'string') {
      throw new TypeError('breakdown.reasoning must be a string')
    }
  }

  /**
   * Extract key factors from reasoning text (Two-Step Chain - Solution 2)
   *
   * Uses a second, focused API call with simple extraction prompt.
   * Much cheaper than main prediction (~200-300 tokens vs 4000+ tokens).
   * Near 100% reliability vs 80-95% for single-step approach.
   *
   * @param reasoningText - The reasoning text to extract factors from
   * @param extractionType - 'finish' (1-2 factors) or 'fun' (2-3 factors)
   * @returns Array of key factors (1-2 words each)
   */
  private async extractKeyFactors(
    reasoningText: string,
    extractionType: 'finish' | 'fun'
  ): Promise<string[]> {
    // Build extraction prompt
    const prompt =
      extractionType === 'finish'
        ? buildFinishKeyFactorsExtractionPrompt(reasoningText)
        : buildFunKeyFactorsExtractionPrompt(reasoningText)

    try {
      // Call LLM with lower max_tokens since we only expect a small JSON array
      const response = await this.callLLMWithLowerTokens(prompt, 200)

      // Parse the JSON array
      const jsonMatch = response.text.match(/\[[\s\S]*?\]/)
      if (!jsonMatch) {
        console.warn(
          `No JSON array found in ${extractionType} key factors extraction. Using empty array.`
        )
        return []
      }

      const parsed = JSON.parse(jsonMatch[0])

      // Validate it's an array of strings
      if (!Array.isArray(parsed)) {
        console.warn(
          `${extractionType} key factors is not an array. Using empty array.`
        )
        return []
      }

      // Filter to only strings and limit count
      const factors = parsed.filter((f) => typeof f === 'string')
      const maxFactors = extractionType === 'finish' ? 2 : 3
      return factors.slice(0, maxFactors)
    } catch (error) {
      // Graceful degradation: If extraction fails, return empty array
      console.warn(
        `Failed to extract ${extractionType} key factors: ${error instanceof Error ? error.message : String(error)}. Using empty array.`
      )
      return []
    }
  }

  /**
   * Call LLM with lower token limit for extraction tasks
   */
  private async callLLMWithLowerTokens(
    prompt: string,
    maxTokens: number
  ): Promise<{
    text: string
    tokensUsed: number
    costUsd: number
  }> {
    if (this.client instanceof Anthropic) {
      const message = await this.client.messages.create({
        model: this.modelName,
        max_tokens: maxTokens,
        temperature: this.temperature,
        messages: [{ role: 'user', content: prompt }],
      })

      const text =
        message.content[0]?.type === 'text' ? message.content[0].text : ''

      if (!text) {
        throw new Error('Empty response from Claude')
      }

      const inputTokens = message.usage.input_tokens
      const outputTokens = message.usage.output_tokens
      const totalTokens = inputTokens + outputTokens

      const pricing =
        MODEL_PRICING[this.modelName as keyof typeof MODEL_PRICING]
      const costUsd =
        (inputTokens / 1_000_000) * pricing.input +
        (outputTokens / 1_000_000) * pricing.output

      return { text, tokensUsed: totalTokens, costUsd }
    } else if (this.client instanceof OpenAI) {
      const completion = await this.client.chat.completions.create({
        model: this.modelName,
        max_tokens: maxTokens,
        temperature: this.temperature,
        messages: [{ role: 'user', content: prompt }],
      })

      const text = completion.choices[0]?.message?.content

      if (!text) {
        throw new Error('Empty response from OpenAI')
      }

      const inputTokens = completion.usage?.prompt_tokens || 0
      const outputTokens = completion.usage?.completion_tokens || 0
      const totalTokens = inputTokens + outputTokens

      const pricing =
        MODEL_PRICING[this.modelName as keyof typeof MODEL_PRICING]
      const costUsd =
        (inputTokens / 1_000_000) * pricing.input +
        (outputTokens / 1_000_000) * pricing.output

      return { text, tokensUsed: totalTokens, costUsd }
    } else {
      throw new Error('Invalid LLM client')
    }
  }
}
