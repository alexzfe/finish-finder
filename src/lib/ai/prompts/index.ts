/**
 * AI Prediction Prompts - Phase 4 (SOTA Architecture)
 *
 * STATUS: ACTIVE - Unified prediction architecture for MMA fight predictions
 * 
 * Architecture:
 * - Single "Fight Simulation" prompt outputs qualitative attributes
 * - Deterministic score calculation in TypeScript (not LLM arithmetic)
 * - Guaranteed consistency between finish probability and fun score
 *
 * Temperature: 0.3 for consistent, deterministic outputs
 * Output: Structured JSON validated with TypeScript interfaces
 * 
 * LEGEND:
 * ✅ CURRENT - Active, recommended for use
 * 🚫 LEGACY - Deprecated, kept for backwards compatibility only
 */

// ============================================
// ✅ PHASE 4: UNIFIED PREDICTION (CURRENT - Primary)
// ============================================

// Unified Prediction Prompt
export {
  buildUnifiedPredictionPrompt,
  classifyFighterStyle,
  type UnifiedFighterStats,
  type UnifiedPredictionContext,
  type UnifiedPredictionInput,
  type FightAttributes,
  type PredictionReasoning,
  type FightSimulationOutput,
  type StyleClash,
  type FighterStyle,
} from './unifiedPredictionPrompt'

// Weight Class Base Rates
export {
  WEIGHT_CLASS_FINISH_RATES,
  getWeightClassRates,
  normalizeWeightClass,
  type WeightClassRates,
} from './weightClassRates'

// Few-Shot Anchor Examples (Phase 1.2)
export {
  buildFewShotExamplesSection,
  getAnchorsByTier,
  HIGH_ENTERTAINMENT_ANCHORS,
  MEDIUM_ENTERTAINMENT_ANCHORS,
  LOW_ENTERTAINMENT_ANCHORS,
  type AnchorExample,
  // DSPy-Optimized Examples (calibrated on 240 real 2024 UFC fights)
  buildDSPyFinishExamplesSection,
  buildDSPyFunExamplesSection,
  DSPY_FINISH_EXAMPLES,
  DSPY_FUN_EXAMPLES,
  type DSPyFinishExample,
  type DSPyFunExample,
} from './anchorExamples'

// ============================================
// 🚫 LEGACY EXPORTS (Deprecated - Backwards Compatibility Only)
// ============================================

// 🚫 Finish Probability Exports (Legacy - Use unifiedPredictionPrompt instead)
export {
  buildFinishProbabilityPrompt,
  type FighterFinishStats,
  type FinishProbabilityContext,
  type FinishProbabilityInput,
  type FinishProbabilityOutput,
} from './finishProbabilityPrompt'

// 🚫 Fun Score Exports (Legacy - Use unifiedPredictionPrompt instead)
export {
  buildFunScorePrompt,
  classifyFighterStyle as classifyFighterStyleLegacy,
  type FighterFunStats,
  type FunScoreContext,
  type FunScoreInput,
  type FunScoreOutput,
  type FunScoreBreakdown,
} from './funScorePrompt'

// 🚫 Key Factors Extraction (Legacy - No longer needed with unified prompt)
export {
  buildFinishKeyFactorsExtractionPrompt,
  buildFunKeyFactorsExtractionPrompt,
} from './keyFactorsExtraction'
