import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { validateJsonField, validateFightData, validateFighterData } from '../validation'

describe('Database Validation Utilities', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('validateJsonField', () => {
    it('should return empty array string for null/undefined', () => {
      expect(validateJsonField(null, 'testField')).toBe('[]')
      expect(validateJsonField(undefined, 'testField')).toBe('[]')
    })

    it('should validate and return valid JSON strings', () => {
      expect(validateJsonField('[]', 'testField')).toBe('[]')
      expect(validateJsonField('[1,2,3]', 'testField')).toBe('[1,2,3]')
      expect(validateJsonField('{"key":"value"}', 'testField')).toBe('{"key":"value"}')
      expect(validateJsonField('"string"', 'testField')).toBe('"string"')
    })

    it('should handle invalid JSON strings gracefully', () => {
      expect(validateJsonField('invalid json', 'testField')).toBe('[]')
      expect(validateJsonField('[1,2,3', 'testField')).toBe('[]') // missing bracket
      expect(validateJsonField('{"key": value}', 'testField')).toBe('[]') // unquoted value

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Invalid JSON in field testField, falling back to empty array:',
        expect.objectContaining({
          value: expect.any(String),
          error: expect.any(String)
        })
      )
    })

    it('should stringify arrays and objects', () => {
      expect(validateJsonField([1, 2, 3], 'testField')).toBe('[1,2,3]')
      expect(validateJsonField({ key: 'value' }, 'testField')).toBe('{"key":"value"}')
      expect(validateJsonField([], 'testField')).toBe('[]')
      expect(validateJsonField({}, 'testField')).toBe('{}')
    })

    it('should handle non-serializable objects', () => {
      const circular: Record<string, unknown> = { a: 1 }
      circular.self = circular

      expect(validateJsonField(circular, 'circularField')).toBe('[]')
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to stringify circularField, falling back to empty array:',
        expect.objectContaining({
          error: expect.any(String)
        })
      )
    })

    it('should handle unexpected types', () => {
      expect(validateJsonField(123, 'numberField')).toBe('[]')
      expect(validateJsonField(true, 'booleanField')).toBe('[]')
      expect(validateJsonField(() => {}, 'functionField')).toBe('[]')

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unexpected type for JSON field'),
        expect.objectContaining({
          type: expect.any(String),
          value: expect.anything()
        })
      )
    })

    it('should truncate long values in error logging', () => {
      const longString = 'a'.repeat(200)
      validateJsonField(longString, 'longField')

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Invalid JSON in field longField, falling back to empty array:',
        expect.objectContaining({
          value: longString.slice(0, 100)
        })
      )
    })
  })

  describe('validateFightData', () => {
    const validFight = {
      id: 'fight-123',
      fighter1Id: 'fighter-1',
      fighter2Id: 'fighter-2',
      eventId: 'event-123',
      weightClass: 'lightweight',
      titleFight: false,
      mainEvent: false,
      scheduledRounds: 3
    }

    it('should validate correct fight data', () => {
      const result = validateFightData(validFight)
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('should require fight ID', () => {
      const invalidFight = { ...validFight, id: null }
      const result = validateFightData(invalidFight)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Fight ID is required and must be a string')
    })

    it('should validate string fields', () => {
      const tests = [
        { field: 'id', value: 123 },
        { field: 'fighter1Id', value: null },
        { field: 'fighter2Id', value: '' },
        { field: 'weightClass', value: undefined }
      ]

      tests.forEach(({ field, value }) => {
        const invalidFight = { ...validFight, [field]: value }
        const result = validateFightData(invalidFight)
        expect(result.valid).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
      })
    })

    it('should validate boolean fields', () => {
      const booleanTests = [
        { field: 'titleFight', value: 'not boolean' },
        { field: 'titleFight', value: 123 }
      ]

      booleanTests.forEach(({ field, value }) => {
        const invalidFight = { ...validFight, [field]: value }
        const result = validateFightData(invalidFight)
        expect(result.valid).toBe(false)
      })
    })

    it('should validate numeric fields', () => {
      const invalidFight = { ...validFight, scheduledRounds: 'not a number' }
      const result = validateFightData(invalidFight)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Scheduled rounds must be a positive number')
    })

    it('should handle optional fields gracefully', () => {
      const minimalFight = {
        id: 'fight-123',
        fighter1Id: 'fighter-1',
        fighter2Id: 'fighter-2',
        eventId: 'event-123',
        weightClass: 'lightweight',
        titleFight: false,
        mainEvent: false,
        scheduledRounds: 3
      }

      const result = validateFightData(minimalFight)
      expect(result.valid).toBe(true)
    })

    it('should accumulate multiple errors', () => {
      const invalidFight = {
        id: null,
        fighter1Id: 123,
        weightClass: '',
        scheduledRounds: -1
      }

      const result = validateFightData(invalidFight)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(1)
    })
  })

  describe('validateFighterData', () => {
    const validFighter = {
      id: 'fighter-123',
      name: 'John Doe',
      wins: 10,
      losses: 2,
      draws: 0
    }

    it('should validate correct fighter data', () => {
      const result = validateFighterData(validFighter)
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('should require fighter ID and name', () => {
      const tests = [
        { ...validFighter, id: null },
        { ...validFighter, id: '' },
        { ...validFighter, name: null },
        { ...validFighter, name: '' }
      ]

      tests.forEach(invalidFighter => {
        const result = validateFighterData(invalidFighter)
        expect(result.valid).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
      })
    })

    it('should validate numeric record fields', () => {
      const numericTests = [
        { field: 'wins', value: -1 },
        { field: 'losses', value: 'not a number' },
        { field: 'draws', value: -5 }
      ]

      numericTests.forEach(({ field, value }) => {
        const invalidFighter = { ...validFighter, [field]: value }
        const result = validateFighterData(invalidFighter)
        expect(result.valid).toBe(false)
      })
    })

    it('should allow null/undefined for optional numeric fields', () => {
      const fighterWithNulls = {
        ...validFighter,
        wins: null,
        losses: undefined,
        draws: null
      }

      const result = validateFighterData(fighterWithNulls)
      expect(result.valid).toBe(true)
    })

    it('should handle edge cases', () => {
      // Test with all zeros (valid case for new fighter)
      const newFighter = {
        ...validFighter,
        wins: 0,
        losses: 0,
        draws: 0
      }

      const result = validateFighterData(newFighter)
      expect(result.valid).toBe(true)
    })

    it('should validate type constraints', () => {
      const result = validateFighterData(null)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('Integration scenarios', () => {
    it('should handle real-world fight data', () => {
      const realisticFight = {
        id: 'ufc-123-main-event',
        fighter1Id: 'conor-mcgregor',
        fighter2Id: 'nate-diaz',
        eventId: 'ufc-123',
        weightClass: 'welterweight',
        titleFight: false,
        mainEvent: true,
        scheduledRounds: 5,
        cardPosition: 'main',
        venue: 'T-Mobile Arena',
        fightNumber: 1
      }

      const result = validateFightData(realisticFight)
      expect(result.valid).toBe(true)
    })

    it('should handle real-world fighter data', () => {
      const realisticFighter = {
        id: 'conor-mcgregor',
        name: 'Conor McGregor',
        nickname: 'The Notorious',
        wins: 22,
        losses: 6,
        draws: 0,
        height: "5'9\"",
        reach: "74\"",
        weightClass: 'lightweight'
      }

      const result = validateFighterData(realisticFighter)
      expect(result.valid).toBe(true)
    })

    it('should handle scraped data with potential issues', () => {
      const scrapedFight = {
        id: 'scraped-fight-001',
        fighter1Id: '  fighter-with-spaces  ',
        fighter2Id: 'UPPERCASE-FIGHTER',
        eventId: 'scraped-event-001',
        weightClass: 'Light Heavyweight', // Common scraping variation
        titleFight: 'false', // String instead of boolean
        scheduledRounds: '3' // String instead of number
      }

      const result = validateFightData(scrapedFight)
      // Should catch type mismatches
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })
})