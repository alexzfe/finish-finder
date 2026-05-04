import { calculateFinishProbability } from './math/finishProbability'
import { buildJudgmentPredictionPrompt } from './prompts/hybridJudgmentPrompt'
import { JUDGMENT_RESPONSE_SCHEMA } from './prompts/judgmentResponseSchema'

import type { LLMAdapter } from './adapters/llmAdapter'
import type { Prediction } from './prediction'
import type { JudgmentPredictionOutput } from './prompts/hybridJudgmentPrompt'
import type { FightSnapshot } from './snapshot'

const FUN_SCORE_FLOOR = 1
const FUN_SCORE_CEILING = 10

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

    return {
      finishProbability,
      funScore,
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
