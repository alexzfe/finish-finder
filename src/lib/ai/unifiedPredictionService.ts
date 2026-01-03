/**
 * Unified Prediction Service - Phase 4 (SOTA Architecture)
 *
 * Generates AI predictions for UFC fights using a single unified prompt
 * with deterministic score calculation.
 *
 * Key innovations over Phase 3:
 * - Single LLM call instead of 4 (finish + fun + 2 extractions)
 * - Qualitative attributes (1-5) instead of direct numbers
 * - Deterministic TypeScript calculation ensures consistency
 * - Multi-persona analysis (Statistician, Tape Watcher, Synthesizer)
 * - Consistency validation with optional LLM critique
 *
 * Supports both Anthropic Claude and OpenAI GPT models.
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import {
  buildUnifiedPredictionPrompt,
  classifyFighterStyle,
  type UnifiedFighterStats,
  type UnifiedPredictionInput,
  type UnifiedPredictionContext,
  type FightSimulationOutput,
} from './prompts'
import {
  calculateAllScores,
  calculateAdjustedConfidence,
  type CalculatedScores,
} from './scoreCalculator'
import {
  validateConsistency,
  buildCritiquePrompt,
  parseCritiqueResponse,
  applyCorrections,
  formatValidationResult,
  type ValidationResult,
} from './consistencyValidator'

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
    input: 3.0,
    output: 15.0,
  },
  'claude-3-5-haiku-20241022': {
    input: 1.0,
    output: 5.0,
  },
  'gpt-4o': {
    input: 2.5,
    output: 10.0,
  },
  'gpt-4o-mini': {
    input: 0.15,
    output: 0.6,
  },
} as const

type ModelName = keyof typeof MODEL_PRICING

/**
 * JSON Schema for structured output (Tool Use / Structured Outputs)
 * Ensures guaranteed JSON compliance from LLM responses
 */
/**
 * Build Anthropic Tool schema for fight simulation
 * Returns a mutable object compatible with Anthropic.Tool type
 */
function buildFightSimulationTool(): Anthropic.Tool {
  return {
    name: 'fight_simulation',
    description: 'Generate a fight simulation analysis with qualitative attributes',
    input_schema: {
      type: 'object',
      properties: {
        reasoning: {
          type: 'object',
          description: 'Step-by-step analysis (Chain-of-Thought)',
          properties: {
            vulnerabilityAnalysis: {
              type: 'string',
              description: 'Statistician view: 2-3 sentences on defensive capabilities and vulnerability to finishes',
            },
            offenseAnalysis: {
              type: 'string',
              description: 'Statistician view: 2-3 sentences on finish capabilities and offensive threats',
            },
            styleMatchup: {
              type: 'string',
              description: 'Tape Watcher view: 2-3 sentences on how styles interact and create action/entertainment',
            },
            finalAssessment: {
              type: 'string',
              description: 'Synthesizer view: 2-3 sentences on overall finish likelihood and entertainment value',
            },
          },
          required: ['vulnerabilityAnalysis', 'offenseAnalysis', 'styleMatchup', 'finalAssessment'],
        },
        finishAnalysis: {
          type: 'string',
          description: 'Concise 1-2 sentences: WHY this fight will or won\'t end in a finish. Focus on key vulnerability vs offense matchup.',
        },
        funAnalysis: {
          type: 'string',
          description: 'Concise 1-2 sentences: WHY this fight will or won\'t be entertaining. Focus on pace, style clash, and action potential.',
        },
        narrative: {
          type: 'string',
          description: '3-4 sentence fight simulation - HOW might this fight unfold',
        },
        attributes: {
          type: 'object',
          description: 'Qualitative attribute ratings',
          properties: {
            pace: {
              type: 'integer',
              description: 'Action level: 1=Stalemate, 3=Average, 5=War/Brawl',
            },
            finishDanger: {
              type: 'integer',
              description: 'Risk of stoppage: 1=Very Low, 3=Average, 5=Very High',
            },
            technicality: {
              type: 'integer',
              description: 'Strategic complexity: 1=Pure chaos, 3=Moderate, 5=High-level chess',
            },
            styleClash: {
              type: 'string',
              enum: ['Complementary', 'Neutral', 'Canceling'],
              description: 'How the fighting styles interact',
            },
            brawlPotential: {
              type: 'boolean',
              description: 'True if both fighters willing to stand and trade',
            },
            groundBattleLikely: {
              type: 'boolean',
              description: 'True if grappling exchange expected',
            },
          },
          required: ['pace', 'finishDanger', 'technicality', 'styleClash', 'brawlPotential', 'groundBattleLikely'],
        },
        keyFactors: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key factors driving the prediction (2-3 words each)',
        },
        confidence: {
          type: 'number',
          description: 'Confidence in the analysis (0.0-1.0 decimal)',
        },
      },
      required: ['reasoning', 'finishAnalysis', 'funAnalysis', 'narrative', 'attributes', 'keyFactors', 'confidence'],
    },
  }
}

/**
 * OpenAI-compatible JSON schema for structured outputs
 */
const OPENAI_RESPONSE_FORMAT = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'fight_simulation',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        reasoning: {
          type: 'object',
          properties: {
            vulnerabilityAnalysis: { type: 'string' },
            offenseAnalysis: { type: 'string' },
            styleMatchup: { type: 'string' },
            finalAssessment: { type: 'string' },
          },
          required: ['vulnerabilityAnalysis', 'offenseAnalysis', 'styleMatchup', 'finalAssessment'],
          additionalProperties: false,
        },
        finishAnalysis: { type: 'string' },
        funAnalysis: { type: 'string' },
        narrative: { type: 'string' },
        attributes: {
          type: 'object',
          properties: {
            pace: { type: 'integer' },
            finishDanger: { type: 'integer' },
            technicality: { type: 'integer' },
            styleClash: { type: 'string', enum: ['Complementary', 'Neutral', 'Canceling'] },
            brawlPotential: { type: 'boolean' },
            groundBattleLikely: { type: 'boolean' },
          },
          required: ['pace', 'finishDanger', 'technicality', 'styleClash', 'brawlPotential', 'groundBattleLikely'],
          additionalProperties: false,
        },
        keyFactors: {
          type: 'array',
          items: { type: 'string' },
        },
        confidence: { type: 'number' },
      },
      required: ['reasoning', 'finishAnalysis', 'funAnalysis', 'narrative', 'attributes', 'keyFactors', 'confidence'],
      additionalProperties: false,
    },
  },
}

/**
 * Combined prediction for a single fight
 */
export interface UnifiedFightPrediction {
  // Calculated scores (deterministic from attributes)
  finishProbability: number
  finishConfidence: number
  funScore: number
  funConfidence: number

  // LLM output (qualitative attributes + reasoning)
  simulation: FightSimulationOutput

  // Reasoning breakdown (for UI display)
  finishReasoning: {
    vulnerabilityAnalysis: string
    offenseAnalysis: string
    styleMatchup: string
    finalAssessment: string
    finishAnalysis: string  // Concise 1-2 sentence WHY finish will/won't happen
    keyFactors: string[]
  }
  funBreakdown: {
    pace: number
    finishDanger: number
    technicality: number
    styleClash: string
    brawlPotential: boolean
    reasoning: string       // Full narrative
    funAnalysis: string     // Concise 1-2 sentence WHY entertaining
    keyFactors: string[]
  }

  // Validation info
  validation: ValidationResult

  // Metadata
  modelUsed: string
  tokensUsed: number
  costUsd: number
}

/**
 * Calculate risk level from AI confidence scores
 */
export function calculateRiskLevel(
  finishConfidence: number,
  funConfidence: number
): 'low' | 'balanced' | 'high' {
  const avgConfidence = (finishConfidence + funConfidence) / 2

  if (avgConfidence >= 0.78) {
    return 'low'
  } else if (avgConfidence >= 0.675) {
    return 'balanced'
  } else {
    return 'high'
  }
}

/**
 * Unified AI Prediction Service
 *
 * Generates predictions using a single LLM call with deterministic scoring.
 */
export class UnifiedPredictionService {
  private client: Anthropic | OpenAI
  private modelName: ModelName
  private critiqueModelName: ModelName
  private provider: 'anthropic' | 'openai'
  private temperature = 0.3

  constructor(provider: 'anthropic' | 'openai' = 'anthropic') {
    this.provider = provider

    if (provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is required')
      }
      this.client = new Anthropic({ apiKey })
      this.modelName = 'claude-3-5-sonnet-20241022'
      this.critiqueModelName = 'claude-3-5-haiku-20241022'
    } else {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required')
      }
      this.client = new OpenAI({ apiKey })
      this.modelName = 'gpt-4o'
      this.critiqueModelName = 'gpt-4o-mini'
    }
  }

  /**
   * Generate complete prediction for a single fight
   *
   * @param input - Unified fighter stats and context
   * @returns Complete prediction with scores and reasoning
   */
  async predictFight(input: UnifiedPredictionInput, useStructuredOutput: boolean = true): Promise<UnifiedFightPrediction> {
    // Step 1: Build unified prompt
    const prompt = buildUnifiedPredictionPrompt(input)

    // Step 2: Call LLM with structured output (guaranteed JSON compliance)
    let simulation: FightSimulationOutput
    let tokensUsed: number
    let costUsd: number

    if (useStructuredOutput) {
      // Use Tool Use (Anthropic) or Structured Outputs (OpenAI) for guaranteed JSON
      const llmResult = await this.callLLMStructuredWithRetry(prompt)
      simulation = llmResult.simulation
      tokensUsed = llmResult.tokensUsed
      costUsd = llmResult.costUsd
    } else {
      // Fallback: Legacy text parsing (less reliable)
      const llmResult = await this.callLLMWithRetry(prompt)
      simulation = this.parseSimulationOutput(llmResult.text)
      tokensUsed = llmResult.tokensUsed
      costUsd = llmResult.costUsd
    }

    // Step 4: Calculate scores deterministically
    let scores = calculateAllScores(simulation, input.context.weightClass, {
      titleFight: input.context.titleFight,
      mainEvent: input.context.mainEvent,
      rivalry: input.context.rivalry,
    })

    // Step 5: Validate consistency
    let validation = validateConsistency(simulation, scores)

    console.log(`  📊 Validation: ${formatValidationResult(validation)}`)

    // Step 6: Optional LLM critique if validation requires it
    let critiqueTokens = 0
    let critiqueCost = 0

    if (validation.requiresLLMCritique && validation.issues.length > 0) {
      console.log('  🔍 Running LLM critique...')

      const critiqueResult = await this.runCritique(simulation, validation)

      if (critiqueResult) {
        critiqueTokens = critiqueResult.tokensUsed
        critiqueCost = critiqueResult.costUsd

        if (critiqueResult.needsCorrection && critiqueResult.correctedSimulation) {
          console.log('  ✓ Applied corrections from critique')
          simulation = critiqueResult.correctedSimulation

          // Recalculate scores with corrected simulation
          scores = calculateAllScores(simulation, input.context.weightClass, {
            titleFight: input.context.titleFight,
            mainEvent: input.context.mainEvent,
            rivalry: input.context.rivalry,
          })

          // Re-validate
          validation = validateConsistency(simulation, scores)
        }
      }
    }

    // Step 7: Build prediction result
    return {
      finishProbability: scores.finishProbability,
      finishConfidence: scores.finishConfidence,
      funScore: scores.funScore,
      funConfidence: scores.funConfidence,
      simulation,
      finishReasoning: {
        vulnerabilityAnalysis: simulation.reasoning.vulnerabilityAnalysis,
        offenseAnalysis: simulation.reasoning.offenseAnalysis,
        styleMatchup: simulation.reasoning.styleMatchup,
        finalAssessment: simulation.reasoning.finalAssessment,
        finishAnalysis: simulation.finishAnalysis,
        keyFactors: simulation.keyFactors,
      },
      funBreakdown: {
        pace: simulation.attributes.pace,
        finishDanger: simulation.attributes.finishDanger,
        technicality: simulation.attributes.technicality,
        styleClash: simulation.attributes.styleClash,
        brawlPotential: simulation.attributes.brawlPotential,
        reasoning: simulation.narrative,
        funAnalysis: simulation.funAnalysis,
        keyFactors: simulation.keyFactors,
      },
      validation,
      modelUsed: this.modelName,
      tokensUsed: tokensUsed + critiqueTokens,
      costUsd: costUsd + critiqueCost,
    }
  }

  /**
   * Call LLM with retry logic
   */
  private async callLLMWithRetry(
    prompt: string,
    model?: ModelName
  ): Promise<{
    text: string
    tokensUsed: number
    costUsd: number
  }> {
    const targetModel = model || this.modelName
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
      try {
        return await this.callLLM(prompt, targetModel)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt < RETRY_CONFIG.maxAttempts) {
          const delayMs =
            RETRY_CONFIG.initialDelayMs *
            Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1)

          console.warn(
            `  ⚠ LLM call attempt ${attempt} failed: ${lastError.message}. Retrying in ${delayMs}ms...`
          )

          await new Promise((resolve) => setTimeout(resolve, delayMs))
        }
      }
    }

    throw new Error(
      `Failed to call LLM after ${RETRY_CONFIG.maxAttempts} attempts: ${lastError?.message}`
    )
  }

  /**
   * Call the LLM API
   */
  private async callLLM(
    prompt: string,
    model: ModelName
  ): Promise<{
    text: string
    tokensUsed: number
    costUsd: number
  }> {
    if (this.client instanceof Anthropic) {
      const message = await this.client.messages.create({
        model,
        max_tokens: 1500,
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

      const pricing = MODEL_PRICING[model]
      const costUsd =
        (inputTokens / 1_000_000) * pricing.input +
        (outputTokens / 1_000_000) * pricing.output

      return { text, tokensUsed: totalTokens, costUsd }
    } else if (this.client instanceof OpenAI) {
      const completion = await this.client.chat.completions.create({
        model,
        max_tokens: 1500,
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

      const pricing = MODEL_PRICING[model]
      const costUsd =
        (inputTokens / 1_000_000) * pricing.input +
        (outputTokens / 1_000_000) * pricing.output

      return { text, tokensUsed: totalTokens, costUsd }
    } else {
      throw new Error('Invalid LLM client')
    }
  }

  /**
   * Call LLM with structured output mode (Tool Use / Structured Outputs)
   * Guarantees JSON compliance - no parsing errors possible
   */
  private async callLLMStructured(
    prompt: string,
    model: ModelName
  ): Promise<{
    simulation: FightSimulationOutput
    tokensUsed: number
    costUsd: number
  }> {
    if (this.client instanceof Anthropic) {
      // Use Tool Use mode for Anthropic
      const message = await this.client.messages.create({
        model,
        max_tokens: 1500,
        temperature: this.temperature,
        tools: [buildFightSimulationTool()],
        tool_choice: { type: 'tool', name: 'fight_simulation' },
        messages: [{ role: 'user', content: prompt }],
      })

      // Extract tool use result
      const toolUse = message.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      )

      if (!toolUse || toolUse.name !== 'fight_simulation') {
        throw new Error('No tool use response from Claude')
      }

      const simulation = toolUse.input as FightSimulationOutput
      this.validateSimulationOutput(simulation)

      const inputTokens = message.usage.input_tokens
      const outputTokens = message.usage.output_tokens
      const totalTokens = inputTokens + outputTokens

      const pricing = MODEL_PRICING[model]
      const costUsd =
        (inputTokens / 1_000_000) * pricing.input +
        (outputTokens / 1_000_000) * pricing.output

      return { simulation, tokensUsed: totalTokens, costUsd }
    } else if (this.client instanceof OpenAI) {
      // Use Structured Outputs mode for OpenAI
      const completion = await this.client.chat.completions.create({
        model,
        max_tokens: 1500,
        temperature: this.temperature,
        messages: [{ role: 'user', content: prompt }],
        response_format: OPENAI_RESPONSE_FORMAT,
      })

      const text = completion.choices[0]?.message?.content

      if (!text) {
        throw new Error('Empty response from OpenAI')
      }

      const simulation = JSON.parse(text) as FightSimulationOutput
      this.validateSimulationOutput(simulation)

      const inputTokens = completion.usage?.prompt_tokens || 0
      const outputTokens = completion.usage?.completion_tokens || 0
      const totalTokens = inputTokens + outputTokens

      const pricing = MODEL_PRICING[model]
      const costUsd =
        (inputTokens / 1_000_000) * pricing.input +
        (outputTokens / 1_000_000) * pricing.output

      return { simulation, tokensUsed: totalTokens, costUsd }
    } else {
      throw new Error('Invalid LLM client')
    }
  }

  /**
   * Call LLM with structured output and retry logic
   */
  private async callLLMStructuredWithRetry(
    prompt: string,
    model?: ModelName
  ): Promise<{
    simulation: FightSimulationOutput
    tokensUsed: number
    costUsd: number
  }> {
    const targetModel = model || this.modelName
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
      try {
        return await this.callLLMStructured(prompt, targetModel)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt < RETRY_CONFIG.maxAttempts) {
          const delayMs =
            RETRY_CONFIG.initialDelayMs *
            Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1)

          console.warn(
            `  ⚠ Structured LLM call attempt ${attempt} failed: ${lastError.message}. Retrying in ${delayMs}ms...`
          )

          await new Promise((resolve) => setTimeout(resolve, delayMs))
        }
      }
    }

    throw new Error(
      `Failed to call LLM (structured) after ${RETRY_CONFIG.maxAttempts} attempts: ${lastError?.message}`
    )
  }

  /**
   * Parse simulation output from LLM response
   */
  private parseSimulationOutput(response: string): FightSimulationOutput {
    // Extract JSON from response
    let jsonText = response.trim()

    // Remove markdown code blocks if present
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1]
    }

    // Extract first JSON object
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in simulation response')
    }

    jsonText = jsonMatch[0]

    // Parse JSON
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText)
    } catch (error) {
      throw new SyntaxError(
        `Invalid JSON in simulation response: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    // Validate structure
    this.validateSimulationOutput(parsed)

    return parsed as FightSimulationOutput
  }

  /**
   * Validate simulation output structure
   */
  private validateSimulationOutput(
    obj: unknown
  ): asserts obj is FightSimulationOutput {
    const o = obj as Record<string, unknown>

    // Check narrative
    if (typeof o.narrative !== 'string') {
      throw new TypeError('narrative must be a string')
    }

    // Check finishAnalysis
    if (typeof o.finishAnalysis !== 'string') {
      throw new TypeError('finishAnalysis must be a string')
    }

    // Check funAnalysis
    if (typeof o.funAnalysis !== 'string') {
      throw new TypeError('funAnalysis must be a string')
    }

    // Check attributes
    if (typeof o.attributes !== 'object' || o.attributes === null) {
      throw new TypeError('attributes must be an object')
    }

    const attrs = o.attributes as Record<string, unknown>
    const requiredAttrs = ['pace', 'finishDanger', 'technicality', 'styleClash', 'brawlPotential', 'groundBattleLikely']
    for (const attr of requiredAttrs) {
      if (attrs[attr] === undefined) {
        throw new TypeError(`attributes.${attr} is required`)
      }
    }

    // Check confidence
    if (typeof o.confidence !== 'number') {
      throw new TypeError('confidence must be a number')
    }

    // Check reasoning
    if (typeof o.reasoning !== 'object' || o.reasoning === null) {
      throw new TypeError('reasoning must be an object')
    }

    const reasoning = o.reasoning as Record<string, unknown>
    const requiredReasoning = ['vulnerabilityAnalysis', 'offenseAnalysis', 'styleMatchup', 'finalAssessment']
    for (const key of requiredReasoning) {
      if (typeof reasoning[key] !== 'string') {
        throw new TypeError(`reasoning.${key} must be a string`)
      }
    }

    // Check keyFactors
    if (!Array.isArray(o.keyFactors)) {
      throw new TypeError('keyFactors must be an array')
    }
  }

  /**
   * Run LLM critique for validation failures
   */
  private async runCritique(
    simulation: FightSimulationOutput,
    validation: ValidationResult
  ): Promise<{
    needsCorrection: boolean
    correctedSimulation?: FightSimulationOutput
    tokensUsed: number
    costUsd: number
  } | null> {
    try {
      const critiquePrompt = buildCritiquePrompt(simulation, validation.issues)
      const critiqueResult = await this.callLLM(critiquePrompt, this.critiqueModelName)

      const critique = parseCritiqueResponse(critiqueResult.text)
      if (!critique) {
        console.warn('  ⚠ Could not parse critique response')
        return {
          needsCorrection: false,
          tokensUsed: critiqueResult.tokensUsed,
          costUsd: critiqueResult.costUsd,
        }
      }

      if (critique.needsRegeneration) {
        console.warn('  ⚠ Critique suggests regeneration needed (not implemented)')
        return {
          needsCorrection: false,
          tokensUsed: critiqueResult.tokensUsed,
          costUsd: critiqueResult.costUsd,
        }
      }

      // Apply corrections if any
      if (Object.keys(critique.suggestedCorrections).length > 0) {
        const correctedSimulation = applyCorrections(
          simulation,
          critique.suggestedCorrections
        )

        return {
          needsCorrection: true,
          correctedSimulation,
          tokensUsed: critiqueResult.tokensUsed,
          costUsd: critiqueResult.costUsd,
        }
      }

      return {
        needsCorrection: false,
        tokensUsed: critiqueResult.tokensUsed,
        costUsd: critiqueResult.costUsd,
      }
    } catch (error) {
      console.warn(
        `  ⚠ Critique failed: ${error instanceof Error ? error.message : String(error)}`
      )
      return null
    }
  }
}

/**
 * Helper to build unified input from fighter data
 */
export function buildUnifiedInput(
  fighter1: {
    name: string
    record: string | null
    significantStrikesAbsorbedPerMinute: number
    strikingDefensePercentage: number
    takedownDefensePercentage: number
    lossFinishRate: number
    koLossPercentage: number
    submissionLossPercentage: number
    finishRate: number
    koPercentage: number
    submissionPercentage: number
    significantStrikesLandedPerMinute: number
    submissionAverage: number
    takedownAverage: number
    averageFightTimeSeconds: number
    winsByDecision: number
    wins: number
  },
  fighter2: {
    name: string
    record: string | null
    significantStrikesAbsorbedPerMinute: number
    strikingDefensePercentage: number
    takedownDefensePercentage: number
    lossFinishRate: number
    koLossPercentage: number
    submissionLossPercentage: number
    finishRate: number
    koPercentage: number
    submissionPercentage: number
    significantStrikesLandedPerMinute: number
    submissionAverage: number
    takedownAverage: number
    averageFightTimeSeconds: number
    winsByDecision: number
    wins: number
  },
  context: {
    eventName: string
    weightClass: string
    titleFight: boolean
    mainEvent: boolean
    rivalry?: boolean
    rematch?: boolean
    rankings?: {
      fighter1Rank: number | null
      fighter2Rank: number | null
    }
  },
  fighter1Context?: string,
  fighter2Context?: string
): UnifiedPredictionInput {
  return {
    fighter1: {
      name: fighter1.name,
      record: fighter1.record || 'Unknown',
      significantStrikesAbsorbedPerMinute: fighter1.significantStrikesAbsorbedPerMinute,
      strikingDefensePercentage: fighter1.strikingDefensePercentage,
      takedownDefensePercentage: fighter1.takedownDefensePercentage,
      lossFinishRate: fighter1.lossFinishRate,
      koLossPercentage: fighter1.koLossPercentage,
      submissionLossPercentage: fighter1.submissionLossPercentage,
      finishRate: fighter1.finishRate,
      koPercentage: fighter1.koPercentage,
      submissionPercentage: fighter1.submissionPercentage,
      significantStrikesLandedPerMinute: fighter1.significantStrikesLandedPerMinute,
      submissionAverage: fighter1.submissionAverage,
      takedownAverage: fighter1.takedownAverage,
      averageFightTimeSeconds: fighter1.averageFightTimeSeconds,
      winsByDecision: fighter1.winsByDecision,
      totalWins: fighter1.wins,
      primaryStyle: classifyFighterStyle({
        significantStrikesLandedPerMinute: fighter1.significantStrikesLandedPerMinute,
        takedownAverage: fighter1.takedownAverage,
        submissionAverage: fighter1.submissionAverage,
      }),
      recentContext: fighter1Context,
    },
    fighter2: {
      name: fighter2.name,
      record: fighter2.record || 'Unknown',
      significantStrikesAbsorbedPerMinute: fighter2.significantStrikesAbsorbedPerMinute,
      strikingDefensePercentage: fighter2.strikingDefensePercentage,
      takedownDefensePercentage: fighter2.takedownDefensePercentage,
      lossFinishRate: fighter2.lossFinishRate,
      koLossPercentage: fighter2.koLossPercentage,
      submissionLossPercentage: fighter2.submissionLossPercentage,
      finishRate: fighter2.finishRate,
      koPercentage: fighter2.koPercentage,
      submissionPercentage: fighter2.submissionPercentage,
      significantStrikesLandedPerMinute: fighter2.significantStrikesLandedPerMinute,
      submissionAverage: fighter2.submissionAverage,
      takedownAverage: fighter2.takedownAverage,
      averageFightTimeSeconds: fighter2.averageFightTimeSeconds,
      winsByDecision: fighter2.winsByDecision,
      totalWins: fighter2.wins,
      primaryStyle: classifyFighterStyle({
        significantStrikesLandedPerMinute: fighter2.significantStrikesLandedPerMinute,
        takedownAverage: fighter2.takedownAverage,
        submissionAverage: fighter2.submissionAverage,
      }),
      recentContext: fighter2Context,
    },
    context,
  }
}
