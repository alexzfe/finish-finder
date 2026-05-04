import type { JudgmentPredictionOutput } from './prompts/hybridJudgmentPrompt'

/**
 * In-memory result produced by a Predictor. Distinct from the persisted
 * `Prediction` Prisma row — see persistence/predictionStore.ts for the
 * shape that lands in the database.
 */
export interface Prediction {
  /** Deterministic, derived from `output.attributes` and the fight's weight class. */
  finishProbability: number

  /** AI-judged 1-10 integer entertainment score, clamped to that range. */
  funScore: number

  /** Full structured LLM response, retained for persistence and debugging. */
  output: JudgmentPredictionOutput

  /** Provenance from the adapter used. */
  modelUsed: string
  tokensUsed: number
  costUsd: number
}
