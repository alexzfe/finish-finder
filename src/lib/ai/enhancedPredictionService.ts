/**
 * Enhanced Prediction Service - Phase 4 Integration - 🚫 LEGACY (DEPRECATED)
 *
 * STATUS: LEGACY - This wrapper around NewPredictionService (Phase 3) is deprecated.
 * Use UnifiedPredictionService instead for all new predictions.
 * 
 * Originally intended to wrap the base prediction service with:
 * - Platt scaling calibration for finish probability
 * - Conformal prediction intervals for fun score
 * - Enriched fighter context from embeddings
 * - Prediction logging for future calibration
 * 
 * NOTE: This service wraps NewPredictionService (Phase 3) which makes 4 API calls.
 * The UnifiedPredictionService (Phase 4) is cheaper and more consistent.
 */

import OpenAI from 'openai'
import { prisma } from '../database/prisma'
import {
  NewPredictionService,
  type FightPrediction,
  calculateRiskLevel,
} from './newPredictionService'
import type { FinishProbabilityInput, FunScoreInput } from './prompts'
import {
  applyPlattScaling,
  loadActivePlattParams,
  type PlattParams,
} from './calibration'
import {
  getPredictionInterval,
  loadConformalParams,
  type ConformalParams,
  type PredictionInterval,
} from './calibration'
import {
  getPredictionContext,
  type PredictionContext,
} from './embeddings'

/**
 * Enhanced prediction with calibration and intervals
 */
export interface EnhancedFightPrediction extends FightPrediction {
  // Calibrated values
  calibratedFinishProbability: number
  calibrationApplied: boolean

  // Conformal prediction interval for fun score
  funScoreInterval: PredictionInterval | null
  coverageLevel: number

  // Context quality
  contextEnhanced: boolean
  contextQuality: 'high' | 'medium' | 'low' | 'none'

  // Prediction ID for logging
  predictionId: string | null
}

/**
 * Configuration for enhanced predictions
 */
export interface EnhancedPredictionConfig {
  applyCalibration: boolean
  includeConformalIntervals: boolean
  useEnrichedContext: boolean
  logPrediction: boolean
  ensembleForHighStakes: boolean
}

const DEFAULT_CONFIG: EnhancedPredictionConfig = {
  applyCalibration: true,
  includeConformalIntervals: true,
  useEnrichedContext: true,
  logPrediction: true,
  ensembleForHighStakes: false, // Disabled by default due to cost
}

/**
 * Enhanced Prediction Service
 *
 * Production-ready prediction service with full calibration pipeline.
 */
export class EnhancedPredictionService {
  private baseService: NewPredictionService
  private openaiClient: OpenAI | null = null
  private plattParams: PlattParams | null = null
  private conformalParams: ConformalParams | null = null
  private config: EnhancedPredictionConfig

  constructor(
    provider: 'anthropic' | 'openai' = 'openai',
    config: Partial<EnhancedPredictionConfig> = {}
  ) {
    this.baseService = new NewPredictionService(provider)
    this.config = { ...DEFAULT_CONFIG, ...config }

    // Initialize OpenAI client for embeddings if needed
    if (this.config.useEnrichedContext) {
      const openaiKey = process.env.OPENAI_API_KEY
      if (openaiKey) {
        this.openaiClient = new OpenAI({ apiKey: openaiKey })
      }
    }
  }

  /**
   * Initialize calibration parameters from database
   *
   * Call this once before making predictions to load cached calibration.
   */
  async initialize(): Promise<void> {
    // Load Platt scaling parameters for finish probability
    if (this.config.applyCalibration) {
      try {
        this.plattParams = await loadActivePlattParams()
        if (this.plattParams) {
          console.log(
            `Loaded Platt scaling params: A=${this.plattParams.a.toFixed(4)}, B=${this.plattParams.b.toFixed(4)}`
          )
        }
      } catch (error) {
        console.warn('Failed to load Platt scaling params:', error)
      }
    }

    // Load conformal prediction parameters for fun score
    if (this.config.includeConformalIntervals) {
      try {
        this.conformalParams = await loadConformalParams('fun')
        if (this.conformalParams) {
          console.log(
            `Loaded conformal params: coverage=${this.conformalParams.coverageLevel}, threshold=${this.conformalParams.threshold.toFixed(2)}`
          )
        }
      } catch (error) {
        console.warn('Failed to load conformal params:', error)
      }
    }
  }

  /**
   * Generate enhanced prediction for a single fight
   *
   * @param finishInput - Fighter stats for finish probability
   * @param funInput - Fighter stats for fun score
   * @param fighter1Id - Fighter 1 database ID (for context retrieval)
   * @param fighter2Id - Fighter 2 database ID (for context retrieval)
   * @param fightId - Fight database ID (for logging)
   * @param isHighStakes - Whether this is a title fight or main event
   */
  async predictFight(
    finishInput: FinishProbabilityInput,
    funInput: FunScoreInput,
    fighter1Id?: string,
    fighter2Id?: string,
    fightId?: string,
    isHighStakes: boolean = false
  ): Promise<EnhancedFightPrediction> {
    let contextEnhanced = false
    let contextQuality: 'high' | 'medium' | 'low' | 'none' = 'none'

    // Step 1: Enrich context if enabled and IDs provided
    if (
      this.config.useEnrichedContext &&
      this.openaiClient &&
      fighter1Id &&
      fighter2Id
    ) {
      try {
        const context = await getPredictionContext(
          fighter1Id,
          fighter2Id,
          this.openaiClient
        )

        // Inject enriched context into inputs
        if (context.fighter1Context) {
          finishInput.fighter1.recentContext = context.fighter1Context
          funInput.fighter1.recentContext = context.fighter1Context
        }
        if (context.fighter2Context) {
          finishInput.fighter2.recentContext = context.fighter2Context
          funInput.fighter2.recentContext = context.fighter2Context
        }

        contextEnhanced = true
        contextQuality = context.contextQuality
      } catch (error) {
        console.warn('Failed to get enriched context:', error)
      }
    }

    // Step 2: Get base prediction
    const basePrediction = await this.baseService.predictFight(finishInput, funInput)

    // Step 3: Apply Platt scaling to finish probability
    let calibratedFinishProbability = basePrediction.finishProbability
    let calibrationApplied = false

    if (this.config.applyCalibration && this.plattParams) {
      calibratedFinishProbability = applyPlattScaling(
        basePrediction.finishProbability,
        this.plattParams
      )
      calibrationApplied = true
    }

    // Step 4: Get conformal prediction interval for fun score
    let funScoreInterval: PredictionInterval | null = null
    let coverageLevel = 0.9

    if (this.config.includeConformalIntervals && this.conformalParams) {
      funScoreInterval = getPredictionInterval(
        basePrediction.funScore,
        this.conformalParams
      )
      coverageLevel = this.conformalParams.coverageLevel
    }

    // Step 5: Log prediction for future calibration
    let predictionId: string | null = null

    if (this.config.logPrediction && fightId) {
      try {
        predictionId = await this.logPrediction(
          fightId,
          basePrediction,
          calibratedFinishProbability,
          funScoreInterval
        )
      } catch (error) {
        console.warn('Failed to log prediction:', error)
      }
    }

    return {
      ...basePrediction,
      // Override with calibrated finish probability
      finishProbability: calibratedFinishProbability,
      calibratedFinishProbability,
      calibrationApplied,
      funScoreInterval,
      coverageLevel,
      contextEnhanced,
      contextQuality,
      predictionId,
    }
  }

  /**
   * Log prediction to database for future calibration
   */
  private async logPrediction(
    fightId: string,
    prediction: FightPrediction,
    calibratedFinishProb: number,
    funInterval: PredictionInterval | null
  ): Promise<string> {
    // Store in a predictions log table (create if needed)
    const logEntry = await prisma.predictionLog.create({
      data: {
        fightId,
        rawFinishProbability: prediction.finishProbability,
        calibratedFinishProbability: calibratedFinishProb,
        finishConfidence: prediction.finishConfidence,
        rawFunScore: prediction.funScore,
        funScoreLower: funInterval?.lower ?? null,
        funScoreUpper: funInterval?.upper ?? null,
        funConfidence: prediction.funConfidence,
        modelUsed: prediction.modelUsed,
        tokensUsed: prediction.tokensUsed,
        costUsd: prediction.costUsd,
        // Will be filled in after fight completes
        actualFinish: null,
        actualEntertainment: null,
      },
    })

    return logEntry.id
  }

  /**
   * Batch predict multiple fights
   *
   * @param fights - Array of fight inputs with IDs
   */
  async predictBatch(
    fights: Array<{
      finishInput: FinishProbabilityInput
      funInput: FunScoreInput
      fighter1Id?: string
      fighter2Id?: string
      fightId?: string
      isHighStakes?: boolean
    }>
  ): Promise<EnhancedFightPrediction[]> {
    const results: EnhancedFightPrediction[] = []

    for (const fight of fights) {
      try {
        const prediction = await this.predictFight(
          fight.finishInput,
          fight.funInput,
          fight.fighter1Id,
          fight.fighter2Id,
          fight.fightId,
          fight.isHighStakes ?? false
        )
        results.push(prediction)

        // Add delay to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 500))
      } catch (error) {
        console.error(`Failed to predict fight ${fight.fightId}:`, error)
      }
    }

    return results
  }

  /**
   * Check if calibration is available
   */
  hasCalibration(): boolean {
    return this.plattParams !== null
  }

  /**
   * Check if conformal intervals are available
   */
  hasConformalIntervals(): boolean {
    return this.conformalParams !== null
  }

  /**
   * Get current calibration parameters (for debugging)
   */
  getCalibrationInfo(): {
    plattParams: PlattParams | null
    conformalParams: ConformalParams | null
  } {
    return {
      plattParams: this.plattParams,
      conformalParams: this.conformalParams,
    }
  }
}

/**
 * Create and initialize an enhanced prediction service
 *
 * Convenience function that creates and initializes the service.
 */
export async function createEnhancedPredictionService(
  provider: 'anthropic' | 'openai' = 'openai',
  config: Partial<EnhancedPredictionConfig> = {}
): Promise<EnhancedPredictionService> {
  const service = new EnhancedPredictionService(provider, config)
  await service.initialize()
  return service
}
