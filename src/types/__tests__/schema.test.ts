/**
 * Round-trip tests for the canonical wire schema.
 *
 * These exist so future drift between the API response and the static
 * export fails the build — both producers must emit data that satisfies
 * `UFCEventSchema`.
 */

import { describe, it, expect } from 'vitest'

import {
  CardPositionSchema,
  FightSchema,
  FighterSchema,
  PredictionSchema,
  UFCEventSchema,
  WeightClassSchema,
  type UFCEvent,
} from '@/types'

const sampleFighter = {
  id: 'fighter-1',
  name: 'Test Fighter',
  nickname: null,
  record: { wins: 10, losses: 2, draws: 0 },
  weightClass: 'lightweight' as const,
  imageUrl: null,
}

const samplePrediction = {
  funScore: 7,
  finishProbability: 0.42,
  keyFactors: ['knockout power'],
  modelUsed: 'gpt-5.5',
  createdAt: '2026-05-04T12:00:00.000Z',
}

const sampleFight = {
  id: 'fight-1',
  fighter1: sampleFighter,
  fighter2: { ...sampleFighter, id: 'fighter-2', name: 'Other Fighter' },
  weightClass: 'lightweight' as const,
  titleFight: false,
  mainEvent: true,
  cardPosition: 'main-event' as const,
  scheduledRounds: 5,
  fightNumber: 1,
  bookingDate: '2026-05-04T00:00:00.000Z',
  completed: false,
  winnerId: null,
  method: null,
  round: null,
  time: null,
  fightPrediction: null,
  prediction: samplePrediction,
}

const sampleEvent: UFCEvent = {
  id: 'event-1',
  name: 'UFC Test',
  date: '2026-05-04T00:00:00.000Z',
  location: 'Las Vegas',
  venue: 'T-Mobile Arena',
  completed: false,
  fightCard: [sampleFight],
}

describe('UFCEventSchema', () => {
  it('parses a well-formed event', () => {
    expect(() => UFCEventSchema.parse(sampleEvent)).not.toThrow()
  })

  it('survives JSON round-trip (the actual wire path)', () => {
    const wire = JSON.parse(JSON.stringify(sampleEvent))
    const parsed = UFCEventSchema.parse(wire)
    expect(parsed).toEqual(sampleEvent)
  })

  it('accepts a fight with no prediction', () => {
    const event = { ...sampleEvent, fightCard: [{ ...sampleFight, prediction: null }] }
    expect(() => UFCEventSchema.parse(event)).not.toThrow()
  })

  it('rejects a fight with an unknown cardPosition', () => {
    const event = {
      ...sampleEvent,
      fightCard: [{ ...sampleFight, cardPosition: 'Main Event' as never }],
    }
    expect(() => UFCEventSchema.parse(event)).toThrow()
  })

  it('rejects a fight with an unknown weightClass', () => {
    const event = {
      ...sampleEvent,
      fightCard: [{ ...sampleFight, weightClass: 'super_heavyweight' as never }],
    }
    expect(() => UFCEventSchema.parse(event)).toThrow()
  })
})

describe('Sub-schemas', () => {
  it('WeightClassSchema accepts all canonical values', () => {
    const valid = [
      'strawweight', 'flyweight', 'bantamweight', 'featherweight',
      'lightweight', 'welterweight', 'middleweight', 'light_heavyweight',
      'heavyweight', 'womens_strawweight', 'womens_flyweight',
      'womens_bantamweight', 'womens_featherweight', 'catchweight', 'unknown',
    ]
    for (const v of valid) {
      expect(() => WeightClassSchema.parse(v)).not.toThrow()
    }
  })

  it('CardPositionSchema accepts only the canonical kebab values', () => {
    expect(() => CardPositionSchema.parse('main-event')).not.toThrow()
    expect(() => CardPositionSchema.parse('co-main')).not.toThrow()
    expect(() => CardPositionSchema.parse('main-card')).not.toThrow()
    expect(() => CardPositionSchema.parse('preliminary')).not.toThrow()
    expect(() => CardPositionSchema.parse('early-preliminary')).not.toThrow()
    expect(() => CardPositionSchema.parse('Main Event')).toThrow()
    expect(() => CardPositionSchema.parse('main')).toThrow()
  })

  it('FighterSchema requires nullable nickname/imageUrl, not omitted', () => {
    expect(() => FighterSchema.parse(sampleFighter)).not.toThrow()
    const withoutImage: Record<string, unknown> = { ...sampleFighter }
    delete withoutImage.imageUrl
    expect(() => FighterSchema.parse(withoutImage)).toThrow()
  })

  it('PredictionSchema accepts model metadata as null', () => {
    expect(() =>
      PredictionSchema.parse({ ...samplePrediction, modelUsed: null, createdAt: null })
    ).not.toThrow()
  })

  it('FightSchema requires prediction (nullable, not omitted)', () => {
    const withoutPrediction: Record<string, unknown> = { ...sampleFight }
    delete withoutPrediction.prediction
    expect(() => FightSchema.parse(withoutPrediction)).toThrow()
  })
})
