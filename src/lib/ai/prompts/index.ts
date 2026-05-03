/**
 * AI Prediction Prompts barrel export.
 *
 * The active prediction service is `hybridJudgmentService.ts`. It imports
 * directly from `./hybridJudgmentPrompt`; this barrel only re-exports the
 * shared weight-class rate helpers that other modules consume.
 */

export {
  WEIGHT_CLASS_FINISH_RATES,
  getWeightClassRates,
  normalizeWeightClass,
  type WeightClassRates,
} from './weightClassRates'
