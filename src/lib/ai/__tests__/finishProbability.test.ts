import { describe, expect, it } from 'vitest'

import { calculateFinishProbability } from '../math/finishProbability'

import type { FightAttributes } from '../prompts/hybridJudgmentPrompt'

const baseAttrs: FightAttributes = {
  pace: 3,
  finishDanger: 3,
  technicality: 3,
  styleClash: 'Neutral',
  brawlPotential: false,
  groundBattleLikely: false,
}

describe('calculateFinishProbability', () => {
  it('matches the heavyweight baseline at danger=3 and Neutral clash', () => {
    // Heavyweight baseline is 0.70; danger=3 multiplier is 0.4 + 2*0.2 = 0.8;
    // Neutral clash is 1.0 → 0.70 * 0.8 * 1.0 = 0.56
    expect(calculateFinishProbability(baseAttrs, 'Heavyweight')).toBeCloseTo(0.56, 5)
  })

  it('boosts probability for Complementary style clashes', () => {
    const complementary = { ...baseAttrs, styleClash: 'Complementary' as const }
    const neutral = { ...baseAttrs, styleClash: 'Neutral' as const }
    expect(calculateFinishProbability(complementary, 'Lightweight')).toBeGreaterThan(
      calculateFinishProbability(neutral, 'Lightweight')
    )
  })

  it('suppresses probability for Canceling style clashes', () => {
    const canceling = { ...baseAttrs, styleClash: 'Canceling' as const }
    const neutral = { ...baseAttrs, styleClash: 'Neutral' as const }
    expect(calculateFinishProbability(canceling, 'Lightweight')).toBeLessThan(
      calculateFinishProbability(neutral, 'Lightweight')
    )
  })

  it('clamps at the 0.85 ceiling for danger=5 in a high-finish division', () => {
    const dangerous = { ...baseAttrs, finishDanger: 5 as const, styleClash: 'Complementary' as const }
    expect(calculateFinishProbability(dangerous, 'Heavyweight')).toBe(0.85)
  })

  it('clamps at the 0.15 floor for danger=1 with Canceling clash in a low-finish division', () => {
    const safe = { ...baseAttrs, finishDanger: 1 as const, styleClash: 'Canceling' as const }
    expect(calculateFinishProbability(safe, "Women's Strawweight")).toBe(0.15)
  })

  it('falls back to the middleweight baseline for unknown weight classes', () => {
    const known = calculateFinishProbability(baseAttrs, 'Middleweight')
    const unknown = calculateFinishProbability(baseAttrs, 'Made-up Weight Class')
    expect(unknown).toBeCloseTo(known, 5)
  })

  it('produces a monotonically increasing curve as finishDanger climbs', () => {
    const probs = ([1, 2, 3, 4, 5] as const).map((d) =>
      calculateFinishProbability({ ...baseAttrs, finishDanger: d }, 'Lightweight')
    )
    for (let i = 1; i < probs.length; i++) {
      expect(probs[i]).toBeGreaterThanOrEqual(probs[i - 1])
    }
  })
})
