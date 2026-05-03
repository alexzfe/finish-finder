import { describe, expect, it } from 'vitest'

import { deriveRiskLevel } from '../persistence/predictionRepository'

describe('deriveRiskLevel', () => {
  it("maps confidence ≥ 0.78 to 'low'", () => {
    expect(deriveRiskLevel(0.78)).toBe('low')
    expect(deriveRiskLevel(0.95)).toBe('low')
  })

  it("maps confidence in [0.675, 0.78) to 'balanced'", () => {
    expect(deriveRiskLevel(0.675)).toBe('balanced')
    expect(deriveRiskLevel(0.7)).toBe('balanced')
    expect(deriveRiskLevel(0.7799)).toBe('balanced')
  })

  it("maps confidence < 0.675 to 'high'", () => {
    expect(deriveRiskLevel(0.6749)).toBe('high')
    expect(deriveRiskLevel(0.3)).toBe('high')
  })
})
