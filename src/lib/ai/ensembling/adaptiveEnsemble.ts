/**
 * Adaptive Ensembling Service - Phase 4.1
 *
 * Implements confidence-based adaptive ensembling with persona variation.
 *
 * Key insights from research:
 * - Don't repeat identical prompts - they have the same biases
 * - Vary persona emphasis across calls for true diversity
 * - Use weighted voting based on persona confidence
 *
 * Cost-optimization strategy:
 * - High confidence (>85%): Single call
 * - Moderate confidence (60-85%): 3-call ensemble
 * - Low confidence (<60%): 5-call ensemble
 */

import {
  NewPredictionService,
  type FightPrediction,
} from '../newPredictionService'

import type { FinishProbabilityInput, FunScoreInput } from '../prompts'

/**
 * Persona emphasis for varied predictions
 */
export type PersonaEmphasis =
  | 'statistician'    // Focus on quantitative metrics
  | 'tape_watcher'    // Focus on technical style analysis
  | 'momentum_analyst' // Focus on recent form and trends
  | 'odds_maker'      // Focus on betting market signals
  | 'crowd_favorite'  // Focus on entertainment and fan appeal

/**
 * Ensemble prediction result
 */
export interface EnsemblePrediction {
  // Aggregated values
  finishProbability: number
  finishConfidence: number
  funScore: number
  funConfidence: number

  // Ensemble metadata
  callCount: number
  individualPredictions: FightPrediction[]
  personasUsed: PersonaEmphasis[]
  consensusLevel: 'strong' | 'moderate' | 'weak'

  // Costs
  totalTokensUsed: number
  totalCostUsd: number
}

/**
 * Configuration for adaptive ensembling
 */
export interface EnsembleConfig {
  provider: 'anthropic' | 'openai'
  // Confidence thresholds for deciding ensemble size
  highConfidenceThreshold: number   // Above this = 1 call
  moderateConfidenceThreshold: number // Above this = 3 calls, below = 5 calls
}

const DEFAULT_CONFIG: EnsembleConfig = {
  provider: 'openai',
  highConfidenceThreshold: 0.85,
  moderateConfidenceThreshold: 0.60,
}

/**
 * Persona-specific prompt modifiers
 *
 * These are appended to the base prompt to vary the analysis focus.
 */
const PERSONA_MODIFIERS: Record<PersonaEmphasis, string> = {
  statistician: `
ANALYSIS FOCUS: As a data-driven statistician, prioritize quantitative metrics above all else.
Weight numerical statistics (finish rates, strike differentials, win percentages) heavily.
Be skeptical of narrative factors that lack statistical backing.`,

  tape_watcher: `
ANALYSIS FOCUS: As an experienced tape analyst, focus on technical style matchups.
Analyze how each fighter's techniques and tendencies interact with their opponent's.
Consider cage positioning, footwork patterns, and transition game quality.`,

  momentum_analyst: `
ANALYSIS FOCUS: As a momentum specialist, weight recent form and trajectory heavily.
A fighter's last 3-5 performances matter more than career averages.
Consider training camp reports, layoffs, and psychological factors.`,

  odds_maker: `
ANALYSIS FOCUS: As an odds maker, consider market signals and public perception.
If betting lines strongly favor one fighter, incorporate that edge.
Be contrarian when you have strong evidence against market consensus.`,

  crowd_favorite: `
ANALYSIS FOCUS: As an entertainment analyst, focus on what makes fights exciting.
Prioritize action potential, finish likelihood, and fan appeal.
Consider star power, fighting style entertainment value, and stakes.`,
}

/**
 * Adaptive Ensemble Service
 *
 * Makes multiple prediction calls with varied personas and aggregates results.
 */
export class AdaptiveEnsembleService {
  private config: EnsembleConfig

  constructor(config: Partial<EnsembleConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Generate ensemble prediction with adaptive call count
   *
   * @param finishInput - Fighter stats for finish probability
   * @param funInput - Fighter stats for fun score
   * @param forceEnsembleSize - Override adaptive sizing (for testing)
   */
  async predictWithEnsemble(
    finishInput: FinishProbabilityInput,
    funInput: FunScoreInput,
    forceEnsembleSize?: 1 | 3 | 5
  ): Promise<EnsemblePrediction> {
    // Step 1: Make initial prediction to gauge confidence
    const service = new NewPredictionService(this.config.provider)
    const initialPrediction = await service.predictFight(finishInput, funInput)

    // Step 2: Determine ensemble size based on confidence
    const avgConfidence =
      (initialPrediction.finishConfidence + initialPrediction.funConfidence) / 2

    let ensembleSize: 1 | 3 | 5
    if (forceEnsembleSize) {
      ensembleSize = forceEnsembleSize
    } else if (avgConfidence >= this.config.highConfidenceThreshold) {
      ensembleSize = 1 // High confidence - single call is enough
    } else if (avgConfidence >= this.config.moderateConfidenceThreshold) {
      ensembleSize = 3 // Moderate confidence - 3 calls
    } else {
      ensembleSize = 5 // Low confidence - 5 calls
    }

    // If single call, return initial prediction
    if (ensembleSize === 1) {
      return this.wrapSinglePrediction(initialPrediction)
    }

    // Step 3: Make additional calls with varied personas
    const personas = this.selectPersonas(ensembleSize)
    const predictions: FightPrediction[] = [initialPrediction]

    for (let i = 1; i < ensembleSize; i++) {
      const persona = personas[i]

      // Add persona modifier to inputs
      const modifiedFinishInput = this.addPersonaContext(finishInput, persona)
      const modifiedFunInput = this.addPersonaContext(funInput, persona)

      try {
        const prediction = await service.predictFight(
          modifiedFinishInput,
          modifiedFunInput
        )
        predictions.push(prediction)

        // Rate limit delay
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        console.warn(`Ensemble call ${i + 1} failed:`, error)
      }
    }

    // Step 4: Aggregate predictions
    return this.aggregatePredictions(predictions, personas)
  }

  /**
   * Select personas for ensemble based on size
   */
  private selectPersonas(size: 1 | 3 | 5): PersonaEmphasis[] {
    if (size === 1) {
      return ['statistician']
    }

    if (size === 3) {
      // Core trio for moderate uncertainty
      return ['statistician', 'tape_watcher', 'momentum_analyst']
    }

    // Full ensemble for high uncertainty
    return [
      'statistician',
      'tape_watcher',
      'momentum_analyst',
      'odds_maker',
      'crowd_favorite',
    ]
  }

  /**
   * Add persona context to input
   */
  private addPersonaContext<T extends { fighter1: { recentContext?: string } }>(
    input: T,
    persona: PersonaEmphasis
  ): T {
    const modifier = PERSONA_MODIFIERS[persona]

    return {
      ...input,
      fighter1: {
        ...input.fighter1,
        recentContext: input.fighter1.recentContext
          ? `${input.fighter1.recentContext}\n\n${modifier}`
          : modifier,
      },
    }
  }

  /**
   * Aggregate predictions using weighted voting
   */
  private aggregatePredictions(
    predictions: FightPrediction[],
    personas: PersonaEmphasis[]
  ): EnsemblePrediction {
    const n = predictions.length

    // Calculate weighted averages (weight by confidence)
    let finishProbSum = 0
    let finishConfSum = 0
    let funScoreSum = 0
    let funConfSum = 0
    let totalWeight = 0

    for (const pred of predictions) {
      const weight = pred.finishConfidence + pred.funConfidence
      finishProbSum += pred.finishProbability * weight
      finishConfSum += pred.finishConfidence
      funScoreSum += pred.funScore * weight
      funConfSum += pred.funConfidence
      totalWeight += weight
    }

    const finishProbability = finishProbSum / totalWeight
    const funScore = Math.round(funScoreSum / totalWeight)

    // Calculate consensus level
    const finishStdDev = this.calculateStdDev(
      predictions.map((p) => p.finishProbability)
    )
    const funStdDev = this.calculateStdDev(predictions.map((p) => p.funScore))

    let consensusLevel: 'strong' | 'moderate' | 'weak'
    if (finishStdDev < 0.1 && funStdDev < 10) {
      consensusLevel = 'strong'
    } else if (finishStdDev < 0.2 && funStdDev < 20) {
      consensusLevel = 'moderate'
    } else {
      consensusLevel = 'weak'
    }

    // Sum costs
    const totalTokensUsed = predictions.reduce(
      (sum, p) => sum + p.tokensUsed,
      0
    )
    const totalCostUsd = predictions.reduce((sum, p) => sum + p.costUsd, 0)

    return {
      finishProbability,
      finishConfidence: finishConfSum / n,
      funScore,
      funConfidence: funConfSum / n,
      callCount: n,
      individualPredictions: predictions,
      personasUsed: personas.slice(0, n),
      consensusLevel,
      totalTokensUsed,
      totalCostUsd,
    }
  }

  /**
   * Wrap single prediction in ensemble format
   */
  private wrapSinglePrediction(pred: FightPrediction): EnsemblePrediction {
    return {
      finishProbability: pred.finishProbability,
      finishConfidence: pred.finishConfidence,
      funScore: pred.funScore,
      funConfidence: pred.funConfidence,
      callCount: 1,
      individualPredictions: [pred],
      personasUsed: ['statistician'],
      consensusLevel: 'strong',
      totalTokensUsed: pred.tokensUsed,
      totalCostUsd: pred.costUsd,
    }
  }

  /**
   * Calculate standard deviation
   */
  private calculateStdDev(values: number[]): number {
    const n = values.length
    if (n === 0) return 0

    const mean = values.reduce((a, b) => a + b, 0) / n
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2))
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / n

    return Math.sqrt(avgSquaredDiff)
  }
}

/**
 * Create an adaptive ensemble service
 */
export function createEnsembleService(
  config: Partial<EnsembleConfig> = {}
): AdaptiveEnsembleService {
  return new AdaptiveEnsembleService(config)
}
