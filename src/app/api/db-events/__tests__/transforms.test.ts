/**
 * Tests for db-events route transformations
 *
 * Critical functionality:
 * - Card position ordering (Main Event → Early Prelims)
 * - Fun score extraction (new predictions table + legacy fallback)
 * - Fight data transformation consistency
 */

import { describe, it, expect } from 'vitest'

import { CARD_POSITION_ORDER } from '@/config/constants'
import { parseJsonArray } from '@/lib/utils/json'

/**
 * Extract predicted fun score from fight data
 */
function extractPredictedFunScore(fight: {
  predictions: Array<{ funScore: number | null }>
  predictedFunScore: number | null
  funFactor: number | null
}): number {
  const prediction = fight.predictions[0]
  if (prediction && typeof prediction.funScore === 'number') {
    return Math.min(100, Math.max(0, Math.round(prediction.funScore)))
  }

  const rawScore = fight.predictedFunScore
  if (typeof rawScore === 'number') {
    const scaled = rawScore <= 10 ? Math.round(rawScore * 10) : Math.round(rawScore)
    return Math.min(100, Math.max(0, scaled))
  }

  if (typeof fight.funFactor === 'number') {
    const fallback = Math.round(fight.funFactor * 10)
    return Math.min(100, Math.max(0, fallback))
  }

  return 0
}

/**
 * Extract finish probability from fight data
 */
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

/**
 * Extract AI description from fight predictions
 */
function extractAiDescription(fight: {
  predictions: Array<{ finishReasoning: unknown }>
  aiDescription: string | null
  entertainmentReason: string | null
}): string | null {
  const prediction = fight.predictions[0]
  if (prediction?.finishReasoning) {
    try {
      const reasoning = typeof prediction.finishReasoning === 'string'
        ? JSON.parse(prediction.finishReasoning)
        : prediction.finishReasoning
      return reasoning.finishAnalysis || reasoning.finalAssessment || null
    } catch {
      return typeof prediction.finishReasoning === 'string'
        ? prediction.finishReasoning
        : null
    }
  }
  return fight.aiDescription || fight.entertainmentReason || null
}

/**
 * Extract fun factors from fight predictions
 */
function extractFunFactors(fight: {
  predictions: Array<{ finishReasoning: unknown; funBreakdown: unknown }>
  keyFactors: string | null
  funFactors: string | null
}): string[] {
  const prediction = fight.predictions[0]
  if (prediction?.finishReasoning && prediction?.funBreakdown) {
    try {
      const finishReasoning = typeof prediction.finishReasoning === 'string'
        ? JSON.parse(prediction.finishReasoning)
        : prediction.finishReasoning
      const funBreakdown = typeof prediction.funBreakdown === 'string'
        ? JSON.parse(prediction.funBreakdown)
        : prediction.funBreakdown

      const finishFactors = Array.isArray(finishReasoning.keyFactors) ? finishReasoning.keyFactors : []
      const funFactors = Array.isArray(funBreakdown.keyFactors) ? funBreakdown.keyFactors : []
      const allFactors = [...finishFactors, ...funFactors]

      return Array.from(new Set(allFactors))
    } catch {
      return parseJsonArray(fight.keyFactors ?? fight.funFactors)
    }
  }
  return parseJsonArray(fight.keyFactors ?? fight.funFactors)
}

/**
 * Sort fights by card position
 */
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

    expect(sorted.map(f => f.cardPosition)).toEqual([
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

  it('should handle preliminary fallback value', () => {
    const fights = [
      { id: '1', cardPosition: 'preliminary' },
      { id: '2', cardPosition: 'Main Event' },
    ]

    const sorted = sortFightsByCardPosition(fights)

    expect(sorted[0].cardPosition).toBe('Main Event')
    expect(sorted[1].cardPosition).toBe('preliminary')
  })

  it('should not mutate original array', () => {
    const fights = [
      { id: '1', cardPosition: 'Prelims' },
      { id: '2', cardPosition: 'Main Event' },
    ]
    const originalOrder = fights.map(f => f.cardPosition)

    sortFightsByCardPosition(fights)

    expect(fights.map(f => f.cardPosition)).toEqual(originalOrder)
  })
})

describe('Predicted Fun Score Extraction', () => {
  it('should use new predictions table data when available', () => {
    const fight = {
      predictions: [{ funScore: 75.5 }],
      predictedFunScore: null,
      funFactor: null,
    }

    expect(extractPredictedFunScore(fight)).toBe(76) // rounded
  })

  it('should clamp fun score to 0-100 range', () => {
    const fight = {
      predictions: [{ funScore: 150 }],
      predictedFunScore: null,
      funFactor: null,
    }

    expect(extractPredictedFunScore(fight)).toBe(100)

    const fight2 = {
      predictions: [{ funScore: -10 }],
      predictedFunScore: null,
      funFactor: null,
    }

    expect(extractPredictedFunScore(fight2)).toBe(0)
  })

  it('should fall back to predictedFunScore when predictions unavailable', () => {
    const fight = {
      predictions: [],
      predictedFunScore: 8.5, // 0-10 scale
      funFactor: null,
    }

    expect(extractPredictedFunScore(fight)).toBe(85) // scaled to 0-100
  })

  it('should handle predictedFunScore already on 0-100 scale', () => {
    const fight = {
      predictions: [],
      predictedFunScore: 75, // already 0-100
      funFactor: null,
    }

    expect(extractPredictedFunScore(fight)).toBe(75)
  })

  it('should fall back to funFactor when other sources unavailable', () => {
    const fight = {
      predictions: [],
      predictedFunScore: null,
      funFactor: 7.5, // 0-10 scale
    }

    expect(extractPredictedFunScore(fight)).toBe(75) // scaled to 0-100
  })

  it('should return 0 when no prediction data available', () => {
    const fight = {
      predictions: [],
      predictedFunScore: null,
      funFactor: null,
    }

    expect(extractPredictedFunScore(fight)).toBe(0)
  })
})

describe('Finish Probability Extraction', () => {
  it('should use new predictions table data when available', () => {
    const fight = {
      predictions: [{ finishProbability: 0.75 }],
      finishProbability: 0.5,
    }

    expect(extractFinishProbability(fight)).toBe(0.75)
  })

  it('should fall back to fight.finishProbability when predictions unavailable', () => {
    const fight = {
      predictions: [],
      finishProbability: 0.6,
    }

    expect(extractFinishProbability(fight)).toBe(0.6)
  })

  it('should return 0 when no probability data available', () => {
    const fight = {
      predictions: [],
      finishProbability: null,
    }

    expect(extractFinishProbability(fight)).toBe(0)
  })
})

describe('AI Description Extraction', () => {
  it('should extract finishAnalysis from JSON reasoning', () => {
    const fight = {
      predictions: [{
        finishReasoning: JSON.stringify({
          finishAnalysis: 'High finish probability due to striking matchup',
          finalAssessment: 'Should be an exciting fight',
        }),
      }],
      aiDescription: null,
      entertainmentReason: null,
    }

    expect(extractAiDescription(fight)).toBe('High finish probability due to striking matchup')
  })

  it('should fall back to finalAssessment if finishAnalysis unavailable', () => {
    const fight = {
      predictions: [{
        finishReasoning: JSON.stringify({
          finalAssessment: 'Should be an exciting fight',
        }),
      }],
      aiDescription: null,
      entertainmentReason: null,
    }

    expect(extractAiDescription(fight)).toBe('Should be an exciting fight')
  })

  it('should handle string reasoning directly', () => {
    const fight = {
      predictions: [{
        finishReasoning: 'Raw string reasoning',
      }],
      aiDescription: null,
      entertainmentReason: null,
    }

    expect(extractAiDescription(fight)).toBe('Raw string reasoning')
  })

  it('should fall back to aiDescription when predictions unavailable', () => {
    const fight = {
      predictions: [],
      aiDescription: 'Legacy AI description',
      entertainmentReason: null,
    }

    expect(extractAiDescription(fight)).toBe('Legacy AI description')
  })

  it('should fall back to entertainmentReason when aiDescription unavailable', () => {
    const fight = {
      predictions: [],
      aiDescription: null,
      entertainmentReason: 'Legacy entertainment reason',
    }

    expect(extractAiDescription(fight)).toBe('Legacy entertainment reason')
  })

  it('should return null when no description available', () => {
    const fight = {
      predictions: [],
      aiDescription: null,
      entertainmentReason: null,
    }

    expect(extractAiDescription(fight)).toBeNull()
  })
})

describe('Fun Factors Extraction', () => {
  it('should combine key factors from both predictions', () => {
    const fight = {
      predictions: [{
        finishReasoning: JSON.stringify({
          keyFactors: ['Striker vs Striker', 'High finish rate'],
        }),
        funBreakdown: JSON.stringify({
          keyFactors: ['Fan favorites', 'High finish rate'], // duplicate
        }),
      }],
      keyFactors: null,
      funFactors: null,
    }

    const factors = extractFunFactors(fight)
    expect(factors).toContain('Striker vs Striker')
    expect(factors).toContain('High finish rate')
    expect(factors).toContain('Fan favorites')
    expect(factors).toHaveLength(3) // no duplicates
  })

  it('should fall back to keyFactors JSON when predictions unavailable', () => {
    const fight = {
      predictions: [],
      keyFactors: '["Legacy factor 1", "Legacy factor 2"]',
      funFactors: null,
    }

    const factors = extractFunFactors(fight)
    expect(factors).toEqual(['Legacy factor 1', 'Legacy factor 2'])
  })

  it('should fall back to funFactors when keyFactors unavailable', () => {
    const fight = {
      predictions: [],
      keyFactors: null,
      funFactors: '["Fun factor 1"]',
    }

    const factors = extractFunFactors(fight)
    expect(factors).toEqual(['Fun factor 1'])
  })

  it('should return empty array when no factors available', () => {
    const fight = {
      predictions: [],
      keyFactors: null,
      funFactors: null,
    }

    const factors = extractFunFactors(fight)
    expect(factors).toEqual([])
  })

  it('should handle invalid JSON gracefully', () => {
    const fight = {
      predictions: [{
        finishReasoning: 'invalid json',
        funBreakdown: '{"keyFactors": ["Valid factor"]}',
      }],
      keyFactors: null,
      funFactors: null,
    }

    // Should fall back to parseJsonArray which returns [] for invalid
    const factors = extractFunFactors(fight)
    expect(Array.isArray(factors)).toBe(true)
  })
})
