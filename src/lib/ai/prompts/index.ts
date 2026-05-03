/**
 * AI Prompts barrel export.
 *
 * The active producer is `Predictor` in `src/lib/ai/predictor.ts`. It builds
 * prompts via `buildJudgmentPredictionPrompt` and matches the LLM response
 * against `JUDGMENT_RESPONSE_SCHEMA`.
 */

export {
  WEIGHT_CLASS_FINISH_RATES,
  getWeightClassRates,
  normalizeWeightClass,
  type WeightClassRates,
} from './weightClassRates'

export {
  buildJudgmentPredictionPrompt,
  classifyFighterStyle,
  type FighterStyle,
  type FightAttributes,
  type JudgmentPredictionOutput,
} from './hybridJudgmentPrompt'

export { JUDGMENT_RESPONSE_SCHEMA } from './judgmentResponseSchema'
