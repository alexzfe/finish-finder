import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseJsonArray, parseJsonSafe, stringifyJsonSafe } from '../json'

describe('JSON Utilities', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('parseJsonArray', () => {
    it('should return empty array for non-string input', () => {
      expect(parseJsonArray(null)).toEqual([])
      expect(parseJsonArray(undefined)).toEqual([])
      expect(parseJsonArray(123)).toEqual([])
      expect(parseJsonArray({})).toEqual([])
      expect(parseJsonArray([])).toEqual([])
    })

    it('should return empty array for empty or whitespace string', () => {
      expect(parseJsonArray('')).toEqual([])
      expect(parseJsonArray('   ')).toEqual([])
      expect(parseJsonArray('\t\n')).toEqual([])
    })

    it('should parse valid JSON arrays', () => {
      expect(parseJsonArray('[]')).toEqual([])
      expect(parseJsonArray('[1,2,3]')).toEqual([1, 2, 3])
      expect(parseJsonArray('["a","b","c"]')).toEqual(['a', 'b', 'c'])
      expect(parseJsonArray('[{"key":"value"}]')).toEqual([{ key: 'value' }])
    })

    it('should return empty array for valid JSON that is not an array', () => {
      expect(parseJsonArray('{"key":"value"}')).toEqual([])
      expect(parseJsonArray('"string"')).toEqual([])
      expect(parseJsonArray('123')).toEqual([])
      expect(parseJsonArray('true')).toEqual([])
      expect(parseJsonArray('null')).toEqual([])
    })

    it('should handle invalid JSON gracefully', () => {
      expect(parseJsonArray('invalid json')).toEqual([])
      expect(parseJsonArray('[1,2,3')).toEqual([]) // missing closing bracket
      expect(parseJsonArray('{"key": "value"')).toEqual([]) // malformed object
      expect(parseJsonArray('[1,2,3,]')).toEqual([]) // trailing comma

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to parse JSON payload from database, falling back to empty array.',
        expect.objectContaining({
          error: expect.any(Object),
          payloadPreview: expect.any(String)
        })
      )
    })

    it('should truncate long payloads in error logging', () => {
      const longString = 'a'.repeat(200)
      parseJsonArray(longString)

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to parse JSON payload from database, falling back to empty array.',
        expect.objectContaining({
          payloadPreview: longString.slice(0, 120)
        })
      )
    })

    it('should handle complex nested arrays', () => {
      const complexArray = [
        { id: 1, tags: ['tag1', 'tag2'] },
        { id: 2, tags: ['tag3'] },
        [1, [2, [3]]]
      ]
      const jsonString = JSON.stringify(complexArray)
      expect(parseJsonArray(jsonString)).toEqual(complexArray)
    })
  })

  describe('parseJsonSafe', () => {
    it('should return fallback for non-string input', () => {
      expect(parseJsonSafe(null, 'fallback')).toBe('fallback')
      expect(parseJsonSafe(undefined, { default: true })).toEqual({ default: true })
      expect(parseJsonSafe(123, [])).toEqual([])
    })

    it('should return fallback for empty or whitespace string', () => {
      expect(parseJsonSafe('', 'fallback')).toBe('fallback')
      expect(parseJsonSafe('   ', 'fallback')).toBe('fallback')
    })

    it('should parse valid JSON with correct type', () => {
      expect(parseJsonSafe('{"key":"value"}', {})).toEqual({ key: 'value' })
      expect(parseJsonSafe('[1,2,3]', [])).toEqual([1, 2, 3])
      expect(parseJsonSafe('"string"', 'fallback')).toBe('string')
      expect(parseJsonSafe('123', 0)).toBe(123)
      expect(parseJsonSafe('true', false)).toBe(true)
    })

    it('should return fallback for invalid JSON', () => {
      expect(parseJsonSafe('invalid json', 'fallback')).toBe('fallback')
      expect(parseJsonSafe('{invalid}', {})).toEqual({})

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to parse JSON payload, using fallback value.',
        expect.objectContaining({
          error: expect.any(Object),
          payloadPreview: expect.any(String),
          fallback: expect.anything()
        })
      )
    })

    it('should handle different fallback types', () => {
      expect(parseJsonSafe('invalid', 'string')).toBe('string')
      expect(parseJsonSafe('invalid', 42)).toBe(42)
      expect(parseJsonSafe('invalid', true)).toBe(true)
      expect(parseJsonSafe('invalid', null)).toBe(null)
      expect(parseJsonSafe('invalid', { complex: 'object' })).toEqual({ complex: 'object' })
    })
  })

  describe('stringifyJsonSafe', () => {
    it('should return empty array string for null/undefined', () => {
      expect(stringifyJsonSafe(null)).toBe('[]')
      expect(stringifyJsonSafe(undefined)).toBe('[]')
    })

    it('should stringify valid values', () => {
      expect(stringifyJsonSafe([])).toBe('[]')
      expect(stringifyJsonSafe([1, 2, 3])).toBe('[1,2,3]')
      expect(stringifyJsonSafe({ key: 'value' })).toBe('{"key":"value"}')
      expect(stringifyJsonSafe('string')).toBe('"string"')
      expect(stringifyJsonSafe(123)).toBe('123')
      expect(stringifyJsonSafe(true)).toBe('true')
    })

    it('should handle circular references gracefully', () => {
      const circular: any = { a: 1 }
      circular.self = circular

      expect(stringifyJsonSafe(circular, 'testField')).toBe('[]')
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to stringify testField, falling back to empty array:',
        expect.objectContaining({
          error: expect.any(String),
          type: 'object'
        })
      )
    })

    it('should handle BigInt values gracefully', () => {
      const bigIntValue = BigInt(123456789012345678901234567890n)
      expect(stringifyJsonSafe(bigIntValue, 'bigintField')).toBe('[]')
      expect(consoleWarnSpy).toHaveBeenCalled()
    })

    it('should include field name in error messages', () => {
      const circular: any = {}
      circular.self = circular

      stringifyJsonSafe(circular, 'customField')
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to stringify customField, falling back to empty array:',
        expect.any(Object)
      )
    })

    it('should handle field name being undefined', () => {
      const circular: any = {}
      circular.self = circular

      stringifyJsonSafe(circular)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to stringify value, falling back to empty array:',
        expect.any(Object)
      )
    })
  })
})