import { calculateFinishProbability } from './math/finishProbability'
import { buildJudgmentPredictionPrompt } from './prompts/hybridJudgmentPrompt'
import { JUDGMENT_RESPONSE_SCHEMA } from './prompts/judgmentResponseSchema'

import type { LLMAdapter } from './adapters/llmAdapter'
import type { Prediction } from './prediction'
import type { JudgmentPredictionOutput } from './prompts/hybridJudgmentPrompt'
import type { FightSnapshot } from './snapshot'

const FUN_SCORE_FLOOR = 0
const FUN_SCORE_CEILING = 100
const CONFIDENCE_FLOOR = 0.3
const CONFIDENCE_CEILING = 1.0
const INCONSISTENCY_PENALTY = 0.9

export class Predictor {
  constructor(private readonly adapter: LLMAdapter) {}

  async predict(snapshot: FightSnapshot): Promise<Prediction> {
    const prompt = buildJudgmentPredictionPrompt(snapshot)
    const result = await this.adapter.call({ prompt, output: JUDGMENT_RESPONSE_SCHEMA })

    const output = result.output as JudgmentPredictionOutput

    const finishProbability = calculateFinishProbability(
      output.attributes,
      snapshot.context.weightClass
    )
    const funScore = clampFunScore(output.funScore)
    const confidence = adjustConfidence(output)

    return {
      finishProbability,
      finishConfidence: confidence,
      funScore,
      funConfidence: confidence,
      output,
      modelUsed: result.modelUsed,
      tokensUsed: result.tokensUsed,
      costUsd: result.costUsd,
    }
  }
}

function clampFunScore(score: number): number {
  return Math.min(FUN_SCORE_CEILING, Math.max(FUN_SCORE_FLOOR, Math.round(score)))
}

/**
 * Penalise the LLM's stated confidence when its qualitative attributes contradict
 * the funScore it returned (e.g. high-pace + high-finishDanger + lowFun is
 * incoherent).
 */
function adjustConfidence(output: JudgmentPredictionOutput): number {
  const { attributes, funScore } = output
  const highPace = attributes.pace >= 4
  const highFinish = attributes.finishDanger >= 4
  const lowFun = funScore < 40
  const highFun = funScore > 75

  const inconsistent =
    (highPace && highFinish && lowFun) || (!highPace && !highFinish && highFun)

  const adjusted = inconsistent ? output.confidence * INCONSISTENCY_PENALTY : output.confidence
  return Math.min(CONFIDENCE_CEILING, Math.max(CONFIDENCE_FLOOR, adjusted))
}
