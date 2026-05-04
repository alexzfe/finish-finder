/**
 * Tests for db-events route transformations.
 *
 * Critical functionality:
 * - Card position ordering (canonical kebab enum: main → early-preliminary)
 * - PredictionStore.toCurrentPrediction (active prediction → CurrentPrediction
 *   view, with the legacy-column compat shim)
 */

import { describe, it, expect } from 'vitest'

import { CARD_POSITION_ORDER } from '@/config/constants'
import {
  toCurrentPrediction,
  type FightWithMaybePrediction,
} from '@/lib/ai/persistence/predictionStore'

function makeFight(overrides: Partial<FightWithMaybePrediction> = {}): FightWithMaybePrediction {
  return {
    predictions: [],
    funFactor: null,
    finishProbability: null,
    keyFactors: null,
    funFactors: null,
    ...overrides,
  }
}

function sortFightsByCardPosition<T extends { cardPosition: string }>(fights: T[]): T[] {
  return [...fights].sort((a, b) => {
    const orderA = CARD_POSITION_ORDER[a.cardPosition] ?? 999
    const orderB = CARD_POSITION_ORDER[b.cardPosition] ?? 999
    return orderA - orderB
  })
}

describe('Card Position Ordering', () => {
  it('sorts canonical card positions: main → co-main → preliminary → early-preliminary', () => {
    const fights = [
      { id: '1', cardPosition: 'early-preliminary' },
      { id: '2', cardPosition: 'preliminary' },
      { id: '3', cardPosition: 'co-main' },
      { id: '4', cardPosition: 'main' },
    ]

    const sorted = sortFightsByCardPosition(fights)

    expect(sorted.map((f) => f.cardPosition)).toEqual([
      'main',
      'co-main',
      'preliminary',
      'early-preliminary',
    ])
  })

  it('places unknown card positions last', () => {
    const fights = [
      { id: '1', cardPosition: 'unknown-bucket' },
      { id: '2', cardPosition: 'preliminary' },
      { id: '3', cardPosition: 'main' },
    ]

    const sorted = sortFightsByCardPosition(fights)

    expect(sorted[0].cardPosition).toBe('main')
    expect(sorted[1].cardPosition).toBe('preliminary')
    expect(sorted[2].cardPosition).toBe('unknown-bucket')
  })

  it('does not mutate the original array', () => {
    const fights = [
      { id: '1', cardPosition: 'preliminary' },
      { id: '2', cardPosition: 'main' },
    ]
    const originalOrder = fights.map((f) => f.cardPosition)

    sortFightsByCardPosition(fights)

    expect(fights.map((f) => f.cardPosition)).toEqual(originalOrder)
  })
})

describe('toCurrentPrediction — prediction row path', () => {
  it('reads funScore, finishProbability, and finishConfidence from the active prediction', () => {
    const current = toCurrentPrediction(
      makeFight({
        predictions: [
          {
            funScore: 7,
            finishProbability: 0.6,
            finishConfidence: 0.82,
            funBreakdown: { keyFactors: ['knockout power'] },
          },
        ],
      })
    )
    expect(current).toMatchObject({
      funScore: 7,
      finishProbability: 0.6,
      finishConfidence: 0.82,
      funFactors: ['knockout power'],
      source: 'prediction',
    })
  })

  it('rounds non-integer funScore values', () => {
    const current = toCurrentPrediction(
      makeFight({
        predictions: [
          { funScore: 7.6, finishProbability: 0.5, finishConfidence: 0.8, funBreakdown: null },
        ],
      })
    )
    expect(current?.funScore).toBe(8)
  })

  it('clamps funScore to [0, 10]', () => {
    const high = toCurrentPrediction(
      makeFight({
        predictions: [
          { funScore: 99, finishProbability: 0, finishConfidence: 0, funBreakdown: null },
        ],
      })
    )
    const low = toCurrentPrediction(
      makeFight({
        predictions: [
          { funScore: -3, finishProbability: 0, finishConfidence: 0, funBreakdown: null },
        ],
      })
    )
    expect(high?.funScore).toBe(10)
    expect(low?.funScore).toBe(0)
  })

  it('reads keyFactors from a funBreakdown object', () => {
    const current = toCurrentPrediction(
      makeFight({
        predictions: [
          {
            funScore: 7,
            finishProbability: 0.5,
            finishConfidence: 0.8,
            funBreakdown: { keyFactors: ['knockout power', 'scramble heavy'] },
          },
        ],
      })
    )
    expect(current?.funFactors).toEqual(['knockout power', 'scramble heavy'])
  })

  it('handles funBreakdown stored as a JSON string', () => {
    const current = toCurrentPrediction(
      makeFight({
        predictions: [
          {
            funScore: 7,
            finishProbability: 0.5,
            finishConfidence: 0.8,
            funBreakdown: JSON.stringify({ keyFactors: ['cardio gap'] }),
          },
        ],
      })
    )
    expect(current?.funFactors).toEqual(['cardio gap'])
  })

  it('returns empty funFactors when funBreakdown is unparseable', () => {
    const current = toCurrentPrediction(
      makeFight({
        predictions: [
          {
            funScore: 7,
            finishProbability: 0.5,
            finishConfidence: 0.8,
            funBreakdown: 'not json',
          },
        ],
      })
    )
    expect(current?.funFactors).toEqual([])
  })
})

describe('toCurrentPrediction — legacy compat shim', () => {
  it('returns a legacy CurrentPrediction when funFactor is non-zero', () => {
    const current = toCurrentPrediction(
      makeFight({ predictions: [], funFactor: 6 })
    )
    expect(current).toMatchObject({
      funScore: 6,
      finishProbability: 0,
      funFactors: [],
      source: 'legacy',
    })
  })

  it('returns a legacy CurrentPrediction when keyFactors JSON has values', () => {
    const current = toCurrentPrediction(
      makeFight({
        predictions: [],
        keyFactors: '["legacy a", "legacy b"]',
      })
    )
    expect(current?.source).toBe('legacy')
    expect(current?.funFactors).toEqual(['legacy a', 'legacy b'])
  })

  it('reads from legacy funFactors when keyFactors is missing', () => {
    const current = toCurrentPrediction(
      makeFight({ predictions: [], funFactors: '["only fun"]' })
    )
    expect(current?.funFactors).toEqual(['only fun'])
  })

  it('drops non-string entries from legacy JSON', () => {
    const current = toCurrentPrediction(
      makeFight({ predictions: [], keyFactors: '["valid", 42, null, "also valid"]' })
    )
    expect(current?.funFactors).toEqual(['valid', 'also valid'])
  })
})

describe('toCurrentPrediction — empty', () => {
  it('returns null when nothing is set', () => {
    expect(toCurrentPrediction(makeFight())).toBeNull()
  })

  it('returns null when legacy fields are all zero/empty (post-wipe state)', () => {
    expect(
      toCurrentPrediction(
        makeFight({ funFactor: 0, finishProbability: 0, keyFactors: '[]', funFactors: '[]' })
      )
    ).toBeNull()
  })
})
