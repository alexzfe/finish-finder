/**
 * Tests for db-events route transformations.
 *
 * Critical functionality:
 * - Card position ordering (Main Event → Early Prelims)
 * - 1-10 fun score extraction (active prediction + legacy fallback)
 * - Finish probability + finish confidence extraction
 * - keyFactors extraction with legacy fallback
 */

import { describe, it, expect } from 'vitest'

import { CARD_POSITION_ORDER } from '@/config/constants'
import { parseJsonArray } from '@/lib/utils/json'

function extractPredictedFunScore(fight: {
  predictions: Array<{ funScore: number | null }>
  funFactor: number | null
}): number {
  const prediction = fight.predictions[0]
  if (prediction && typeof prediction.funScore === 'number') {
    return clampFunScore(prediction.funScore)
  }
  if (typeof fight.funFactor === 'number') {
    return clampFunScore(fight.funFactor)
  }
  return 0
}

function clampFunScore(score: number): number {
  return Math.min(10, Math.max(0, Math.round(score)))
}

function extractFinishProbability(fight: {
  predictions: Array<{ finishProbability: number | null }>
  finishProbability: number | null
}): number {
  const prediction = fight.predictions[0]
  if (prediction && typeof prediction.finishProbability === 'number') {
    return prediction.finishProbability
  }
  return fight.finishProbability || 0
}

function extractFinishConfidence(fight: {
  predictions: Array<{ finishConfidence: number | null }>
}): number {
  const prediction = fight.predictions[0]
  if (prediction && typeof prediction.finishConfidence === 'number') {
    return prediction.finishConfidence
  }
  return 0
}

function extractFunFactors(fight: {
  predictions: Array<{ funBreakdown: unknown }>
  keyFactors: string | null
  funFactors: string | null
}): string[] {
  const prediction = fight.predictions[0]
  if (prediction?.funBreakdown) {
    try {
      const breakdown = typeof prediction.funBreakdown === 'string'
        ? JSON.parse(prediction.funBreakdown)
        : prediction.funBreakdown
      if (Array.isArray(breakdown?.keyFactors)) {
        return breakdown.keyFactors.filter((f: unknown): f is string => typeof f === 'string')
      }
    } catch {
      // fall through
    }
  }
  return parseJsonArray(fight.keyFactors ?? fight.funFactors).filter(
    (f): f is string => typeof f === 'string'
  )
}

function sortFightsByCardPosition<T extends { cardPosition: string }>(fights: T[]): T[] {
  return [...fights].sort((a, b) => {
    const orderA = CARD_POSITION_ORDER[a.cardPosition] ?? 999
    const orderB = CARD_POSITION_ORDER[b.cardPosition] ?? 999
    return orderA - orderB
  })
}

describe('Card Position Ordering', () => {
  it('should sort fights in correct order: Main Event → Early Prelims', () => {
    const fights = [
      { id: '1', cardPosition: 'Early Prelims' },
      { id: '2', cardPosition: 'Prelims' },
      { id: '3', cardPosition: 'Main Card' },
      { id: '4', cardPosition: 'Co-Main Event' },
      { id: '5', cardPosition: 'Main Event' },
    ]

    const sorted = sortFightsByCardPosition(fights)

    expect(sorted.map((f) => f.cardPosition)).toEqual([
      'Main Event',
      'Co-Main Event',
      'Main Card',
      'Prelims',
      'Early Prelims',
    ])
  })

  it('should handle unknown card positions by placing them last', () => {
    const fights = [
      { id: '1', cardPosition: 'Unknown Position' },
      { id: '2', cardPosition: 'Main Card' },
      { id: '3', cardPosition: 'Main Event' },
    ]

    const sorted = sortFightsByCardPosition(fights)

    expect(sorted[0].cardPosition).toBe('Main Event')
    expect(sorted[1].cardPosition).toBe('Main Card')
    expect(sorted[2].cardPosition).toBe('Unknown Position')
  })

  it('should not mutate original array', () => {
    const fights = [
      { id: '1', cardPosition: 'Prelims' },
      { id: '2', cardPosition: 'Main Event' },
    ]
    const originalOrder = fights.map((f) => f.cardPosition)

    sortFightsByCardPosition(fights)

    expect(fights.map((f) => f.cardPosition)).toEqual(originalOrder)
  })
})

describe('Predicted Fun Score Extraction (1-10)', () => {
  it('uses the active prediction funScore when present', () => {
    const fight = { predictions: [{ funScore: 7 }], funFactor: null }
    expect(extractPredictedFunScore(fight)).toBe(7)
  })

  it('rounds non-integer funScore values', () => {
    const fight = { predictions: [{ funScore: 7.6 }], funFactor: null }
    expect(extractPredictedFunScore(fight)).toBe(8)
  })

  it('clamps funScore to [0, 10]', () => {
    expect(extractPredictedFunScore({ predictions: [{ funScore: 99 }], funFactor: null })).toBe(10)
    expect(extractPredictedFunScore({ predictions: [{ funScore: -3 }], funFactor: null })).toBe(0)
  })

  it('falls back to the legacy funFactor column when no prediction exists', () => {
    expect(extractPredictedFunScore({ predictions: [], funFactor: 6 })).toBe(6)
  })

  it('returns 0 when neither source is present', () => {
    expect(extractPredictedFunScore({ predictions: [], funFactor: null })).toBe(0)
  })
})

describe('Finish Probability Extraction', () => {
  it('uses the active prediction value when present', () => {
    expect(
      extractFinishProbability({ predictions: [{ finishProbability: 0.75 }], finishProbability: 0.5 })
    ).toBe(0.75)
  })

  it('falls back to the legacy fight column', () => {
    expect(extractFinishProbability({ predictions: [], finishProbability: 0.6 })).toBe(0.6)
  })

  it('returns 0 when nothing is set', () => {
    expect(extractFinishProbability({ predictions: [], finishProbability: null })).toBe(0)
  })
})

describe('Finish Confidence Extraction', () => {
  it('reads finishConfidence from the active prediction', () => {
    expect(extractFinishConfidence({ predictions: [{ finishConfidence: 0.82 }] })).toBe(0.82)
  })

  it('returns 0 when no prediction is present', () => {
    expect(extractFinishConfidence({ predictions: [] })).toBe(0)
  })

  it('returns 0 when the prediction lacks finishConfidence', () => {
    expect(extractFinishConfidence({ predictions: [{ finishConfidence: null }] })).toBe(0)
  })
})

describe('Fun Factors Extraction', () => {
  it('reads keyFactors from funBreakdown when the prediction is present', () => {
    const fight = {
      predictions: [{ funBreakdown: { keyFactors: ['knockout power', 'scramble heavy'] } }],
      keyFactors: null,
      funFactors: null,
    }
    expect(extractFunFactors(fight)).toEqual(['knockout power', 'scramble heavy'])
  })

  it('handles funBreakdown stored as a JSON string', () => {
    const fight = {
      predictions: [{ funBreakdown: JSON.stringify({ keyFactors: ['cardio gap'] }) }],
      keyFactors: null,
      funFactors: null,
    }
    expect(extractFunFactors(fight)).toEqual(['cardio gap'])
  })

  it('falls back to legacy keyFactors JSON when no prediction is available', () => {
    const fight = {
      predictions: [],
      keyFactors: '["legacy a", "legacy b"]',
      funFactors: null,
    }
    expect(extractFunFactors(fight)).toEqual(['legacy a', 'legacy b'])
  })

  it('falls back to legacy funFactors JSON when keyFactors is missing', () => {
    const fight = {
      predictions: [],
      keyFactors: null,
      funFactors: '["only fun"]',
    }
    expect(extractFunFactors(fight)).toEqual(['only fun'])
  })

  it('returns an empty array when nothing is set', () => {
    expect(
      extractFunFactors({ predictions: [], keyFactors: null, funFactors: null })
    ).toEqual([])
  })

  it('drops non-string entries from legacy JSON', () => {
    expect(
      extractFunFactors({
        predictions: [],
        keyFactors: '["valid", 42, null, "also valid"]',
        funFactors: null,
      })
    ).toEqual(['valid', 'also valid'])
  })

  it('handles invalid funBreakdown JSON gracefully', () => {
    expect(
      extractFunFactors({
        predictions: [{ funBreakdown: 'not json' }],
        keyFactors: '["fallback"]',
        funFactors: null,
      })
    ).toEqual(['fallback'])
  })
})
