import { describe, expect, it } from 'vitest'

import { funScoreColor } from '../funScoreColor'

describe('funScoreColor', () => {
  it('returns the cold anchor at score 1', () => {
    expect(funScoreColor(1).color).toBe('#94a3b8')
  })

  it('returns the cool anchor at score 3', () => {
    expect(funScoreColor(3).color).toBe('#38bdf8')
  })

  it('returns the warm anchor at score 5', () => {
    expect(funScoreColor(5).color).toBe('#fbbf24')
  })

  it('returns the hot anchor at score 7', () => {
    expect(funScoreColor(7).color).toBe('#f97316')
  })

  it('returns the fire anchor at score 10', () => {
    expect(funScoreColor(10).color).toBe('#ef4444')
  })

  it('interpolates between adjacent anchors at non-anchor scores', () => {
    const four = funScoreColor(4).color
    expect(four).not.toBe('#38bdf8')
    expect(four).not.toBe('#fbbf24')
    // Halfway sky→amber: each channel halfway between the two anchors
    expect(four).toBe('#9abe8e')
  })

  it('produces 10 distinct colours for integer scores 1-10', () => {
    const colours = new Set<string>()
    for (let s = 1; s <= 10; s++) colours.add(funScoreColor(s).color)
    expect(colours.size).toBe(10)
  })

  it('attaches the fire glow at score 9 and 10', () => {
    expect(funScoreColor(9).textShadow).toBeDefined()
    expect(funScoreColor(10).textShadow).toBeDefined()
  })

  it('omits the fire glow below score 9', () => {
    expect(funScoreColor(8).textShadow).toBeUndefined()
    expect(funScoreColor(1).textShadow).toBeUndefined()
  })

  it('clamps below 1 to the cold anchor', () => {
    expect(funScoreColor(0).color).toBe('#94a3b8')
    expect(funScoreColor(-99).color).toBe('#94a3b8')
  })

  it('clamps above 10 to the fire anchor', () => {
    expect(funScoreColor(11).color).toBe('#ef4444')
    expect(funScoreColor(99).color).toBe('#ef4444')
  })

  it('produces a strong red shift across the warm half of the gradient', () => {
    // Once we hit the warm zone (score >= 5) red dominates; this guards against
    // accidentally swapping anchors so warm scores end up greenish or blueish.
    for (let s = 5; s <= 10; s++) {
      const hex = funScoreColor(s).color
      const r = parseInt(hex.slice(1, 3), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      expect(r).toBeGreaterThan(b)
    }
  })
})
