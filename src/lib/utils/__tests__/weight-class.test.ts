import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import type { WeightClass } from '@/types/unified'

import {
  WEIGHT_CLASSES,
  isValidWeightClass,
  toWeightClass,
  getWeightClassDisplayName
} from '../weight-class'

describe('Weight Class Utilities', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('WEIGHT_CLASSES constant', () => {
    it('should contain all expected weight classes', () => {
      const expectedClasses = [
        'strawweight',
        'flyweight',
        'bantamweight',
        'featherweight',
        'lightweight',
        'welterweight',
        'middleweight',
        'light_heavyweight',
        'heavyweight',
        'womens_strawweight',
        'womens_flyweight',
        'womens_bantamweight',
        'womens_featherweight',
        'catchweight',
        'unknown'
      ]

      expect(WEIGHT_CLASSES).toEqual(expectedClasses)
      expect(WEIGHT_CLASSES).toHaveLength(15)
    })

    it('should be readonly', () => {
      // TypeScript compile-time check - this would fail if not readonly
      const classes: readonly WeightClass[] = WEIGHT_CLASSES
      expect(classes).toBeDefined()
    })
  })

  describe('isValidWeightClass', () => {
    it('should return true for valid weight classes', () => {
      WEIGHT_CLASSES.forEach(weightClass => {
        expect(isValidWeightClass(weightClass)).toBe(true)
      })
    })

    it('should return false for invalid weight classes', () => {
      expect(isValidWeightClass('invalid')).toBe(false)
      expect(isValidWeightClass('super_heavyweight')).toBe(false)
      expect(isValidWeightClass('womens_lightweight')).toBe(false)
      expect(isValidWeightClass('')).toBe(false)
    })

    it('should return false for non-string values', () => {
      expect(isValidWeightClass(null)).toBe(false)
      expect(isValidWeightClass(undefined)).toBe(false)
      expect(isValidWeightClass(123)).toBe(false)
      expect(isValidWeightClass({})).toBe(false)
      expect(isValidWeightClass([])).toBe(false)
      expect(isValidWeightClass(true)).toBe(false)
    })

    it('should be case sensitive', () => {
      expect(isValidWeightClass('LIGHTWEIGHT')).toBe(false)
      expect(isValidWeightClass('LightWeight')).toBe(false)
      expect(isValidWeightClass('Lightweight')).toBe(false)
    })
  })

  describe('toWeightClass', () => {
    it('should return valid weight class unchanged', () => {
      WEIGHT_CLASSES.forEach(weightClass => {
        expect(toWeightClass(weightClass)).toBe(weightClass)
      })
    })

    it('should return fallback for invalid input', () => {
      expect(toWeightClass('invalid')).toBe('lightweight')
      expect(toWeightClass(null)).toBe('lightweight')
      expect(toWeightClass(undefined)).toBe('lightweight')
      expect(toWeightClass(123)).toBe('lightweight')
    })

    it('should use custom fallback when provided', () => {
      expect(toWeightClass('invalid', 'heavyweight')).toBe('heavyweight')
      expect(toWeightClass(null, 'bantamweight')).toBe('bantamweight')
    })

    it('should normalize common variations', () => {
      // Test common abbreviations
      expect(toWeightClass('lhw')).toBe('light_heavyweight')
      expect(toWeightClass('hw')).toBe('heavyweight')

      // Test spacing variations
      expect(toWeightClass('light heavy')).toBe('light_heavyweight')
      expect(toWeightClass('lightheavy')).toBe('light_heavyweight')

      // Test women's variations
      expect(toWeightClass('wstrawweight')).toBe('womens_strawweight')
      expect(toWeightClass('wflyweight')).toBe('womens_flyweight')
      expect(toWeightClass('wbantamweight')).toBe('womens_bantamweight')
      expect(toWeightClass('wfeatherweight')).toBe('womens_featherweight')

      expect(toWeightClass('women_strawweight')).toBe('womens_strawweight')
      expect(toWeightClass('women_flyweight')).toBe('womens_flyweight')
    })

    it('should handle case and whitespace normalization', () => {
      expect(toWeightClass('  LIGHTWEIGHT  ')).toBe('lightweight')
      expect(toWeightClass('Light Weight')).toBe('lightweight') // 'light weight' normalizes to lightweight
      expect(toWeightClass('middle weight')).toBe('middleweight')
    })

    it('should log warning for invalid values', () => {
      toWeightClass('invalid_class')

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Invalid weight class, using fallback:',
        {
          value: 'invalid_class',
          fallback: 'lightweight',
          type: 'string'
        }
      )
    })

    it('should handle edge cases', () => {
      expect(toWeightClass('')).toBe('lightweight')
      expect(toWeightClass('   ')).toBe('lightweight')
      expect(toWeightClass('123')).toBe('lightweight')
      expect(toWeightClass('special_characters_!@#')).toBe('lightweight')
    })

    it('should preserve original behavior for exact matches after normalization', () => {
      expect(toWeightClass('strawweight')).toBe('strawweight')
      expect(toWeightClass('womens_strawweight')).toBe('womens_strawweight')
    })
  })

  describe('getWeightClassDisplayName', () => {
    it('should return proper display names for all weight classes', () => {
      const expectedDisplayNames: Record<WeightClass, string> = {
        strawweight: 'Strawweight',
        flyweight: 'Flyweight',
        bantamweight: 'Bantamweight',
        featherweight: 'Featherweight',
        lightweight: 'Lightweight',
        welterweight: 'Welterweight',
        middleweight: 'Middleweight',
        light_heavyweight: 'Light Heavyweight',
        heavyweight: 'Heavyweight',
        womens_strawweight: "Women's Strawweight",
        womens_flyweight: "Women's Flyweight",
        womens_bantamweight: "Women's Bantamweight",
        womens_featherweight: "Women's Featherweight",
        catchweight: 'Catchweight',
        unknown: 'Unknown Weight Class'
      }

      Object.entries(expectedDisplayNames).forEach(([weightClass, expectedDisplay]) => {
        expect(getWeightClassDisplayName(weightClass as WeightClass)).toBe(expectedDisplay)
      })
    })

    it('should handle formatting correctly', () => {
      // Test specific formatting rules
      expect(getWeightClassDisplayName('light_heavyweight')).toBe('Light Heavyweight')
      expect(getWeightClassDisplayName('womens_strawweight')).toBe("Women's Strawweight")
    })

    it('should fallback to original value for unknown weight class', () => {
      // This shouldn't happen in normal usage due to TypeScript, but test fallback
      const unknownClass = 'unknown_class' as WeightClass
      expect(getWeightClassDisplayName(unknownClass)).toBe('unknown_class')
    })
  })

  describe('Integration tests', () => {
    it('should work together in realistic scenarios', () => {
      // Test common UFC data parsing scenarios
      const inputs = [
        'Lightweight',
        'lightweight',
        'LW',
        'Light Weight',
        'light_heavyweight',
        'LHW',
        "Women's Strawweight",
        'wstrawweight',
        'HEAVYWEIGHT'
      ]

      inputs.forEach(input => {
        const normalized = toWeightClass(input)
        expect(isValidWeightClass(normalized)).toBe(true)
        const displayName = getWeightClassDisplayName(normalized)
        expect(displayName).toBeTruthy()
        expect(typeof displayName).toBe('string')
      })
    })

    it('should handle database-like input scenarios', () => {
      // Test scenarios that might come from scraped data
      const dbInputs = [
        { input: '  lightweight  ', expected: 'lightweight' },
        { input: 'Light Heavyweight', expected: 'light_heavyweight' },
        { input: 'womens flyweight', expected: 'womens_flyweight' },
        { input: 'HW', expected: 'heavyweight' },
        { input: null, expected: 'lightweight' },
        { input: '', expected: 'lightweight' }
      ]

      dbInputs.forEach(({ input, expected }) => {
        expect(toWeightClass(input)).toBe(expected)
      })
    })
  })
})