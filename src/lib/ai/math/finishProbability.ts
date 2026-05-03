import { getWeightClassRates } from '../prompts/weightClassRates'

import type { FightAttributes } from '../prompts/hybridJudgmentPrompt'

const FINISH_DANGER_BASE = 0.4
const FINISH_DANGER_STEP = 0.2

const STYLE_CLASH_MULTIPLIERS: Record<FightAttributes['styleClash'], number> = {
  Complementary: 1.15,
  Neutral: 1.0,
  Canceling: 0.75,
}

const FLOOR = 0.15
const CEILING = 0.85

export function calculateFinishProbability(
  attributes: FightAttributes,
  weightClass: string
): number {
  const baseline = getWeightClassRates(weightClass).finishRate
  const dangerMultiplier =
    FINISH_DANGER_BASE + (attributes.finishDanger - 1) * FINISH_DANGER_STEP
  const styleMultiplier = STYLE_CLASH_MULTIPLIERS[attributes.styleClash]

  const raw = baseline * dangerMultiplier * styleMultiplier
  return Math.min(CEILING, Math.max(FLOOR, raw))
}
