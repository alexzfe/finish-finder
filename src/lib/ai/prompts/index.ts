/**
 * AI Prediction Prompts - Phase 2
 *
 * Two-prompt architecture for MMA fight predictions:
 * - Finish Probability: Predicts likelihood of finish (KO/TKO/SUB) using 4-step reasoning
 * - Fun Score: Rates entertainment potential using weighted factor analysis
 *
 * Both use Temperature: 0.3 for consistent, deterministic outputs
 * Both output structured JSON validated with TypeScript interfaces
 */

// Finish Probability Exports
export {
  buildFinishProbabilityPrompt,
  type FighterFinishStats,
  type FinishProbabilityContext,
  type FinishProbabilityInput,
  type FinishProbabilityOutput,
} from './finishProbabilityPrompt'

// Fun Score Exports
export {
  buildFunScorePrompt,
  classifyFighterStyle,
  type FighterFunStats,
  type FunScoreContext,
  type FunScoreInput,
  type FunScoreOutput,
  type FunScoreBreakdown,
  type FighterStyle,
} from './funScorePrompt'

// Weight Class Base Rates Exports
export {
  WEIGHT_CLASS_FINISH_RATES,
  getWeightClassRates,
  normalizeWeightClass,
  type WeightClassRates,
} from './weightClassRates'

// Key Factors Extraction Exports (Two-Step Chain - Solution 2)
export {
  buildFinishKeyFactorsExtractionPrompt,
  buildFunKeyFactorsExtractionPrompt,
} from './keyFactorsExtraction'
