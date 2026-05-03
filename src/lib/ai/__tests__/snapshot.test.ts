import { describe, expect, it } from 'vitest'

import { buildSnapshot, type FightWithRelations, type FighterWithRelations } from '../snapshot'

import type {
  Event,
  Fight,
  FighterContextChunk,
  FighterEntertainmentProfile as PrismaFighterEntertainmentProfile,
} from '@prisma/client'

function makeFighter(overrides: Partial<FighterWithRelations> = {}): FighterWithRelations {
  return {
    id: 'f1',
    name: 'Test Fighter',
    nickname: null,
    wins: 10,
    losses: 2,
    draws: 0,
    weightClass: 'Lightweight',
    imageUrl: null,
    record: '10-2-0',
    height: null,
    weightLbs: null,
    reach: null,
    reachInches: null,
    stance: null,
    dob: null,
    age: null,
    nationality: null,
    significantStrikesPerMinute: 0,
    significantStrikesLandedPerMinute: 4.5,
    strikingAccuracyPercentage: 0,
    significantStrikesAbsorbedPerMinute: 3.0,
    strikingDefensePercentage: 0.55,
    takedownAverage: 1.0,
    takedownAccuracy: 0,
    takedownAccuracyPercentage: 0,
    takedownDefensePercentage: 0.7,
    submissionAverage: 0.5,
    winsByKO: 4,
    winsBySubmission: 2,
    winsByDecision: 4,
    averageFightTime: 0,
    averageFightTimeSeconds: 600,
    lossesByKO: 1,
    lossesBySubmission: 0,
    lossesByDecision: 1,
    finishRate: 0.6,
    koPercentage: 0.4,
    submissionPercentage: 0.2,
    lossFinishRate: 0.5,
    koLossPercentage: 0.5,
    submissionLossPercentage: 0,
    currentStreak: null,
    ranking: null,
    socialFollowers: 0,
    recentBuzzScore: 0,
    fanFavorite: false,
    funScore: 0,
    fightingStyles: '[]',
    lastFightDate: null,
    sourceUrl: null,
    lastScrapedAt: null,
    contentHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    profileText: null,
    embeddingUpdatedAt: null,
    entertainmentProfile: null,
    contextChunks: [],
    ...overrides,
  } as FighterWithRelations
}

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'e1',
    name: 'UFC 999: Test vs Subject',
    date: new Date('2026-06-01'),
    venue: 'Test Arena',
    location: 'Test City',
    completed: false,
    cancelled: false,
    sourceUrl: null,
    lastScrapedAt: null,
    contentHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Event
}

function makeFight(overrides: Partial<FightWithRelations> = {}): FightWithRelations {
  return {
    id: 'fight-1',
    fighter1Id: 'f1',
    fighter2Id: 'f2',
    eventId: 'e1',
    weightClass: 'Lightweight',
    titleFight: false,
    mainEvent: false,
    cardPosition: 'main',
    scheduledRounds: 3,
    fightNumber: 1,
    funFactor: 0,
    finishProbability: 0,
    entertainmentReason: null,
    keyFactors: '[]',
    fightPrediction: null,
    riskLevel: null,
    predictedFunScore: 0,
    funFactors: '[]',
    aiDescription: null,
    mlTier: null,
    mlTierConfidence: null,
    mlTierProbabilities: null,
    mlTierComputedAt: null,
    completed: false,
    isCancelled: false,
    actualFunScore: null,
    winnerId: null,
    method: null,
    round: null,
    time: null,
    bookingDate: new Date(),
    sourceUrl: null,
    lastScrapedAt: null,
    contentHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    fighter1: makeFighter({ id: 'f1', name: 'Alpha', record: '10-2-0' }),
    fighter2: makeFighter({ id: 'f2', name: 'Bravo', record: '8-3-0' }),
    event: makeEvent(),
    ...overrides,
  } as FightWithRelations
}

describe('buildSnapshot', () => {
  it('maps Fighter columns onto the snapshot 1:1, preserving stat values', () => {
    const fighter = makeFighter({
      id: 'f1',
      name: 'Alpha',
      record: '12-3-0',
      finishRate: 0.7,
      koPercentage: 0.5,
      submissionPercentage: 0.2,
      significantStrikesLandedPerMinute: 5.2,
      submissionAverage: 0.8,
      takedownAverage: 1.5,
      strikingDefensePercentage: 0.6,
      takedownDefensePercentage: 0.75,
      significantStrikesAbsorbedPerMinute: 2.8,
      lossFinishRate: 0.4,
      koLossPercentage: 0.4,
      submissionLossPercentage: 0,
      averageFightTimeSeconds: 720,
      winsByDecision: 5,
      wins: 12,
    })
    const snapshot = buildSnapshot(makeFight({ fighter1: fighter }))

    expect(snapshot.fighter1).toMatchObject({
      name: 'Alpha',
      record: '12-3-0',
      finishRate: 0.7,
      koPercentage: 0.5,
      submissionPercentage: 0.2,
      significantStrikesLandedPerMinute: 5.2,
      submissionAverage: 0.8,
      takedownAverage: 1.5,
      strikingDefensePercentage: 0.6,
      takedownDefensePercentage: 0.75,
      significantStrikesAbsorbedPerMinute: 2.8,
      lossFinishRate: 0.4,
      koLossPercentage: 0.4,
      submissionLossPercentage: 0,
      averageFightTimeSeconds: 720,
      winsByDecision: 5,
      totalWins: 12,
    })
  })

  it("substitutes 'Unknown' when Fighter.record is null", () => {
    const fighter = makeFighter({ record: null })
    const snapshot = buildSnapshot(makeFight({ fighter1: fighter }))
    expect(snapshot.fighter1.record).toBe('Unknown')
  })

  it('omits entertainmentProfile when the relation is null', () => {
    const snapshot = buildSnapshot(
      makeFight({ fighter1: makeFighter({ entertainmentProfile: null }) })
    )
    expect(snapshot.fighter1.entertainmentProfile).toBeUndefined()
  })

  it('omits recentContext when contextChunks is empty', () => {
    const snapshot = buildSnapshot(
      makeFight({ fighter1: makeFighter({ contextChunks: [] }) })
    )
    expect(snapshot.fighter1.recentContext).toBeUndefined()
  })

  it('uses the first contextChunk content as recentContext (caller orders by recency)', () => {
    const chunks: FighterContextChunk[] = [
      {
        id: 'c1',
        fighterId: 'f1',
        content: 'most recent',
        contentType: 'news',
        sourceUrl: null,
        publishedAt: null,
        expiresAt: null,
        createdAt: new Date(),
      } as FighterContextChunk,
      {
        id: 'c2',
        fighterId: 'f1',
        content: 'older',
        contentType: 'news',
        sourceUrl: null,
        publishedAt: null,
        expiresAt: null,
        createdAt: new Date(),
      } as FighterContextChunk,
    ]
    const snapshot = buildSnapshot(
      makeFight({ fighter1: makeFighter({ contextChunks: chunks }) })
    )
    expect(snapshot.fighter1.recentContext).toBe('most recent')
  })

  it('translates a snake_case Prisma entertainment profile into the camelCase context shape', () => {
    const profile = {
      id: 'p1',
      fighterId: 'f1',
      primaryArchetype: 'brawler',
      secondaryArchetype: 'pressure_fighter',
      archetypeReasoning: 'reasons',
      archetypeConfidence: 80,
      mentality: 'finisher',
      mentalityReasoning: 'reasons',
      mentalityConfidence: 75,
      reputationTags: ['iron chin', 'always comes forward'],
      notableWars: null,
      bonusHistory: { fotn_count: 2, potn_count: 1, total_bonuses: 3, bonus_rate_estimate: 0.3 },
      knownBoringFights: [],
      rivalries: null,
      entertainmentPrediction: 'high',
      extractionNotes: null,
      sources: [],
      searchTokens: 0,
      extractionTokens: 0,
      totalCostUsd: 0,
      searchedAt: new Date(),
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as PrismaFighterEntertainmentProfile

    const snapshot = buildSnapshot(
      makeFight({ fighter1: makeFighter({ entertainmentProfile: profile }) })
    )
    expect(snapshot.fighter1.entertainmentProfile).toEqual({
      primary_archetype: 'brawler',
      secondary_archetype: 'pressure_fighter',
      archetype_confidence: 80,
      mentality: 'finisher',
      mentality_confidence: 75,
      reputation_tags: ['iron chin', 'always comes forward'],
      bonus_history: { fotn_count: 2, potn_count: 1, total_bonuses: 3, bonus_rate_estimate: 0.3 },
      entertainment_prediction: 'high',
    })
  })

  it('falls back to a zeroed bonus_history when the profile JSON is null', () => {
    const profile = {
      id: 'p1',
      fighterId: 'f1',
      primaryArchetype: 'unknown',
      secondaryArchetype: null,
      archetypeReasoning: '',
      archetypeConfidence: 0,
      mentality: 'unknown',
      mentalityReasoning: '',
      mentalityConfidence: 0,
      reputationTags: [],
      notableWars: null,
      bonusHistory: null,
      knownBoringFights: [],
      rivalries: null,
      entertainmentPrediction: 'unknown',
      extractionNotes: null,
      sources: [],
      searchTokens: 0,
      extractionTokens: 0,
      totalCostUsd: 0,
      searchedAt: new Date(),
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as PrismaFighterEntertainmentProfile

    const snapshot = buildSnapshot(
      makeFight({ fighter1: makeFighter({ entertainmentProfile: profile }) })
    )
    expect(snapshot.fighter1.entertainmentProfile?.bonus_history).toEqual({
      fotn_count: 0,
      potn_count: 0,
      total_bonuses: 0,
      bonus_rate_estimate: null,
    })
  })

  it("classifies primaryStyle as 'striker' when SLpM clears the threshold", () => {
    const fighter = makeFighter({
      significantStrikesLandedPerMinute: 5.0,
      takedownAverage: 0.5,
      submissionAverage: 0.2,
    })
    const snapshot = buildSnapshot(makeFight({ fighter1: fighter }))
    expect(snapshot.fighter1.primaryStyle).toBe('striker')
  })

  it("classifies primaryStyle as 'wrestler' when TD avg is high but submissions are low", () => {
    const fighter = makeFighter({
      significantStrikesLandedPerMinute: 2.0,
      takedownAverage: 3.0,
      submissionAverage: 0.3,
    })
    const snapshot = buildSnapshot(makeFight({ fighter1: fighter }))
    expect(snapshot.fighter1.primaryStyle).toBe('wrestler')
  })

  it("classifies primaryStyle as 'grappler' when submission average is high", () => {
    const fighter = makeFighter({
      significantStrikesLandedPerMinute: 2.0,
      takedownAverage: 2.5,
      submissionAverage: 1.5,
    })
    const snapshot = buildSnapshot(makeFight({ fighter1: fighter }))
    expect(snapshot.fighter1.primaryStyle).toBe('grappler')
  })

  it("classifies primaryStyle as 'balanced' when no thresholds are met", () => {
    const fighter = makeFighter({
      significantStrikesLandedPerMinute: 2.0,
      takedownAverage: 0.5,
      submissionAverage: 0.2,
    })
    const snapshot = buildSnapshot(makeFight({ fighter1: fighter }))
    expect(snapshot.fighter1.primaryStyle).toBe('balanced')
  })

  it('lifts fight-level context fields onto snapshot.context', () => {
    const snapshot = buildSnapshot(
      makeFight({
        weightClass: 'Heavyweight',
        titleFight: true,
        mainEvent: true,
        event: makeEvent({ name: 'UFC 1000' }),
      })
    )
    expect(snapshot.context).toEqual({
      eventName: 'UFC 1000',
      weightClass: 'Heavyweight',
      titleFight: true,
      mainEvent: true,
    })
  })

  it('throws if Fighter.name is empty (Zod refuses an unnamed Fighter)', () => {
    expect(() =>
      buildSnapshot(makeFight({ fighter1: makeFighter({ name: '' }) }))
    ).toThrow()
  })

  it('throws if event name is missing', () => {
    expect(() =>
      buildSnapshot(makeFight({ event: makeEvent({ name: '' }) }))
    ).toThrow()
  })

  it('throws when an entertainment profile carries an unknown archetype value', () => {
    const profile = {
      id: 'p1',
      fighterId: 'f1',
      primaryArchetype: 'jazz_dancer',
      secondaryArchetype: null,
      archetypeReasoning: '',
      archetypeConfidence: 0,
      mentality: 'unknown',
      mentalityReasoning: '',
      mentalityConfidence: 0,
      reputationTags: [],
      notableWars: null,
      bonusHistory: null,
      knownBoringFights: [],
      rivalries: null,
      entertainmentPrediction: 'unknown',
      extractionNotes: null,
      sources: [],
      searchTokens: 0,
      extractionTokens: 0,
      totalCostUsd: 0,
      searchedAt: new Date(),
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as PrismaFighterEntertainmentProfile

    expect(() =>
      buildSnapshot(
        makeFight({ fighter1: makeFighter({ entertainmentProfile: profile }) })
      )
    ).toThrow()
  })
})
