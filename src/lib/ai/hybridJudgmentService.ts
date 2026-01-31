/**
 * Hybrid Judgment Prediction Service
 * 
 * Combines:
 * - Deterministic finish probability (from qualitative attributes)
 * - AI judgment fun score (direct 0-100 from AI evaluation)
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import {
  buildJudgmentPredictionPrompt,
  classifyFighterStyle,
  type JudgmentFighterStats,
  type JudgmentPredictionContext,
  type JudgmentPredictionInput,
  type JudgmentPredictionOutput,
  type FightAttributes,
} from './prompts/hybridJudgmentPrompt'
import { getWeightClassRates } from './prompts/weightClassRates'

const RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
}

const MODEL_PRICING = {
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku-20241022': { input: 1.0, output: 5.0 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
} as const

type ModelName = keyof typeof MODEL_PRICING

/**
 * Calculate finish probability deterministically from attributes
 * (Same logic as unified service)
 */
export function calculateFinishProbability(
  attributes: FightAttributes,
  weightClass: string
): number {
  const baseline = getWeightClassRates(weightClass).finishRate
  
  // Convert finishDanger (1-5) to multiplier (0.4 - 1.2)
  const finishDangerMultiplier = 0.4 + (attributes.finishDanger - 1) * 0.2
  
  // Style clash modifier
  const styleMultipliers = {
    Complementary: 1.15,
    Neutral: 1.0,
    Canceling: 0.75,
  }
  const styleMultiplier = styleMultipliers[attributes.styleClash]
  
  // Calculate
  let probability = baseline * finishDangerMultiplier * styleMultiplier
  
  // Clamp
  return Math.min(0.85, Math.max(0.15, probability))
}

/**
 * Prediction result
 */
export interface JudgmentPredictionResult {
  // Deterministic finish probability
  finishProbability: number
  finishConfidence: number
  
  // AI judgment fun score
  funScore: number
  funConfidence: number
  
  // Full output
  output: JudgmentPredictionOutput
  
  // Metadata
  modelUsed: string
  tokensUsed: number
  costUsd: number
}

/**
 * OpenAI-compatible JSON schema for structured output
 */
const JUDGMENT_RESPONSE_FORMAT = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'fight_judgment',
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
            entertainmentJudgment: { type: 'string' },
          },
          required: ['vulnerabilityAnalysis', 'offenseAnalysis', 'styleMatchup', 'entertainmentJudgment'],
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
        funScore: { type: 'integer' },
        keyFactors: {
          type: 'array',
          items: { type: 'string' },
        },
        confidence: { type: 'number' },
      },
      required: ['reasoning', 'finishAnalysis', 'funAnalysis', 'narrative', 'attributes', 'funScore', 'keyFactors', 'confidence'],
      additionalProperties: false,
    },
  },
}

/**
 * Hybrid Judgment Prediction Service
 */
export class HybridJudgmentService {
  private client: Anthropic | OpenAI
  private modelName: ModelName
  private provider: 'anthropic' | 'openai'
  private temperature = 0.4  // Slightly higher for more creative fun judgment

  constructor(provider: 'anthropic' | 'openai' = 'anthropic') {
    this.provider = provider

    if (provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY required')
      this.client = new Anthropic({ apiKey })
      this.modelName = 'claude-3-5-sonnet-20241022'
    } else {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) throw new Error('OPENAI_API_KEY required')
      this.client = new OpenAI({ apiKey })
      this.modelName = 'gpt-4o'
    }
  }

  /**
   * Generate prediction using hybrid approach
   */
  async predictFight(input: JudgmentPredictionInput): Promise<JudgmentPredictionResult> {
    const prompt = buildJudgmentPredictionPrompt(input)
    
    // Call LLM with structured output
    const { output, tokensUsed, costUsd } = await this.callLLMStructured(prompt)
    
    // Calculate finish probability deterministically
    const finishProbability = calculateFinishProbability(
      output.attributes,
      input.context.weightClass
    )
    
    // Fun score comes directly from AI judgment
    const funScore = Math.min(100, Math.max(0, Math.round(output.funScore)))
    
    // Confidence adjustment
    const adjustedConfidence = this.adjustConfidence(output)
    
    return {
      finishProbability,
      finishConfidence: adjustedConfidence,
      funScore,
      funConfidence: adjustedConfidence,
      output,
      modelUsed: this.modelName,
      tokensUsed,
      costUsd,
    }
  }

  /**
   * Call LLM with structured output
   */
  private async callLLMStructured(
    prompt: string
  ): Promise<{
    output: JudgmentPredictionOutput
    tokensUsed: number
    costUsd: number
  }> {
    if (this.client instanceof Anthropic) {
      // Build tool for structured output
      const tool: Anthropic.Tool = {
        name: 'fight_judgment',
        description: 'Generate fight analysis with deterministic attributes and AI fun score judgment',
        input_schema: {
          type: 'object' as const,
          properties: {
            reasoning: {
              type: 'object',
              properties: {
                vulnerabilityAnalysis: { type: 'string' },
                offenseAnalysis: { type: 'string' },
                styleMatchup: { type: 'string' },
                entertainmentJudgment: { type: 'string' },
              },
              required: ['vulnerabilityAnalysis', 'offenseAnalysis', 'styleMatchup', 'entertainmentJudgment'],
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
            },
            funScore: { type: 'integer' },
            keyFactors: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'number' },
          },
          required: ['reasoning', 'finishAnalysis', 'funAnalysis', 'narrative', 'attributes', 'funScore', 'keyFactors', 'confidence'],
        },
      }

      const message = await this.client.messages.create({
        model: this.modelName,
        max_tokens: 2000,
        temperature: this.temperature,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'fight_judgment' },
        messages: [{ role: 'user', content: prompt }],
      })

      const toolUse = message.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      )

      if (!toolUse || toolUse.name !== 'fight_judgment') {
        throw new Error('No tool use response from Claude')
      }

      const output = toolUse.input as JudgmentPredictionOutput
      
      const inputTokens = message.usage.input_tokens
      const outputTokens = message.usage.output_tokens
      const totalTokens = inputTokens + outputTokens
      
      const pricing = MODEL_PRICING[this.modelName]
      const costUsd = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output

      return { output, tokensUsed: totalTokens, costUsd }

    } else if (this.client instanceof OpenAI) {
      const completion = await this.client.chat.completions.create({
        model: this.modelName,
        max_tokens: 2000,
        temperature: this.temperature,
        messages: [{ role: 'user', content: prompt }],
        response_format: JUDGMENT_RESPONSE_FORMAT,
      })

      const text = completion.choices[0]?.message?.content
      if (!text) throw new Error('Empty response from OpenAI')

      const output = JSON.parse(text) as JudgmentPredictionOutput
      
      const inputTokens = completion.usage?.prompt_tokens || 0
      const outputTokens = completion.usage?.completion_tokens || 0
      const totalTokens = inputTokens + outputTokens
      
      const pricing = MODEL_PRICING[this.modelName]
      const costUsd = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output

      return { output, tokensUsed: totalTokens, costUsd }
    }

    throw new Error('Invalid LLM client')
  }

  /**
   * Adjust confidence based on output quality
   */
  private adjustConfidence(output: JudgmentPredictionOutput): number {
    let adjusted = output.confidence
    
    // Reduce confidence for extreme fun scores (AI might be overconfident)
    if (output.funScore < 20 || output.funScore > 85) {
      adjusted *= 0.9
    }
    
    // Reduce confidence for inconsistent attributes vs fun score
    const { attributes } = output
    const highPace = attributes.pace >= 4
    const highFinish = attributes.finishDanger >= 4
    const lowFun = output.funScore < 40
    const highFun = output.funScore > 75
    
    if ((highPace && highFinish && lowFun) || (!highPace && !highFinish && highFun)) {
      adjusted *= 0.85  // Inconsistency between attributes and fun score
    }
    
    return Math.min(1.0, Math.max(0.3, adjusted))
  }
}

/**
 * Helper to build input from fighter data
 */
export function buildJudgmentInput(
  fighter1: any,
  fighter2: any,
  context: JudgmentPredictionContext,
  fighter1Context?: string,
  fighter2Context?: string,
  fighter1Profile?: any,
  fighter2Profile?: any
): JudgmentPredictionInput {
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
      entertainmentProfile: fighter1Profile,
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
      entertainmentProfile: fighter2Profile,
    },
    context,
  }
}
