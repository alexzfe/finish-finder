import { describe, it, expect } from 'vitest'

import { toCanonicalCardPosition } from '../cardPosition'

describe('toCanonicalCardPosition', () => {
  it('maps title-case scraper strings to canonical kebab values', () => {
    expect(toCanonicalCardPosition('Main Event')).toBe('main-event')
    expect(toCanonicalCardPosition('Co-Main Event')).toBe('co-main')
    expect(toCanonicalCardPosition('Main Card')).toBe('main-card')
    expect(toCanonicalCardPosition('Prelims')).toBe('preliminary')
    expect(toCanonicalCardPosition('Early Prelims')).toBe('early-preliminary')
  })

  it('passes already-canonical kebab values through unchanged', () => {
    expect(toCanonicalCardPosition('main-event')).toBe('main-event')
    expect(toCanonicalCardPosition('co-main')).toBe('co-main')
    expect(toCanonicalCardPosition('main-card')).toBe('main-card')
    expect(toCanonicalCardPosition('preliminary')).toBe('preliminary')
    expect(toCanonicalCardPosition('early-preliminary')).toBe('early-preliminary')
  })

  it('falls back to "preliminary" for unknown inputs without throwing', () => {
    expect(toCanonicalCardPosition('Mystery Card')).toBe('preliminary')
    expect(toCanonicalCardPosition('')).toBe('preliminary')
    expect(toCanonicalCardPosition(null)).toBe('preliminary')
    expect(toCanonicalCardPosition(undefined)).toBe('preliminary')
  })

  it('trims whitespace before lookup', () => {
    expect(toCanonicalCardPosition('  Main Event  ')).toBe('main-event')
    expect(toCanonicalCardPosition('\tPrelims\n')).toBe('preliminary')
  })

  it('lower-cases title-case inputs as a defensive fallback', () => {
    expect(toCanonicalCardPosition('PRELIMS')).toBe('preliminary')
    expect(toCanonicalCardPosition('Main')).toBe('main-card')
  })
})
