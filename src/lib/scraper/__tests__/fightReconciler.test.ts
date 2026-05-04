import { describe, expect, it } from 'vitest'

import { calculateContentHash } from '../contentHash'
import {
  type ExistingFight,
  type ReconciliationInput,
  planFightReconciliation,
} from '../fightReconciler'
import type { ScrapedEvent, ScrapedFight, ScrapedFighter } from '../validation'

function fighter(id: string, sourceUrl = `https://example.com/f/${id}`): ScrapedFighter {
  return { id, name: id, sourceUrl } as ScrapedFighter
}

function event(id: string, sourceUrl = `https://example.com/e/${id}`): ScrapedEvent {
  return {
    id,
    name: id,
    date: '2026-01-01T00:00:00.000Z',
    sourceUrl,
    completed: false,
    cancelled: false,
  } as ScrapedEvent
}

function fight(overrides: Partial<ScrapedFight> & {
  id: string
  eventId: string
  fighter1Id: string
  fighter2Id: string
}): ScrapedFight {
  return {
    sourceUrl: `https://example.com/fight/${overrides.id}`,
    weightClass: 'lightweight',
    titleFight: false,
    mainEvent: false,
    cardPosition: 'preliminary',
    scheduledRounds: 3,
    completed: false,
    winnerId: null,
    method: null,
    round: null,
    time: null,
    ...overrides,
  } as ScrapedFight
}

function existingFight(overrides: Partial<ExistingFight> & {
  id: string
  fighter1Id: string
  fighter2Id: string
}): ExistingFight {
  return {
    sourceUrl: null,
    contentHash: null,
    completed: false,
    isCancelled: false,
    ...overrides,
  }
}

interface BuildOpts {
  scrapedFights?: ScrapedFight[]
  scrapedFighters?: ScrapedFighter[]
  scrapedEvents?: ScrapedEvent[]
  fighterDbIds?: Record<string, string>
  eventDbIds?: Record<string, string>
  existingFightsByEventId?: Record<string, ExistingFight[]>
  scrapedEventUrls?: string[]
}

function buildInput(opts: BuildOpts): ReconciliationInput {
  const scrapedFighters = opts.scrapedFighters ?? []
  const scrapedEvents = opts.scrapedEvents ?? []
  const fighterDbIds = opts.fighterDbIds ?? {}
  const eventDbIds = opts.eventDbIds ?? {}

  const fighterBySourceUrl = new Map(
    scrapedFighters.map((f) => [
      f.sourceUrl,
      { id: fighterDbIds[f.id] ?? `db_${f.id}`, sourceUrl: f.sourceUrl },
    ]),
  )
  const eventBySourceUrl = new Map(
    scrapedEvents.map((e) => [
      e.sourceUrl,
      { id: eventDbIds[e.id] ?? `db_${e.id}`, sourceUrl: e.sourceUrl },
    ]),
  )

  return {
    scrapedFights: opts.scrapedFights ?? [],
    scrapedFighters,
    scrapedEvents,
    fighterBySourceUrl,
    eventBySourceUrl,
    existingFightsByEventId: new Map(
      Object.entries(opts.existingFightsByEventId ?? {}),
    ),
    scrapedEventUrls: opts.scrapedEventUrls ?? [],
  }
}

describe('planFightReconciliation', () => {
  describe('matching', () => {
    it('creates a fight when no existing match is found', () => {
      const f1 = fighter('f1')
      const f2 = fighter('f2')
      const e = event('e1')
      const sf = fight({ id: 'fight1', eventId: 'e1', fighter1Id: 'f1', fighter2Id: 'f2' })

      const plan = planFightReconciliation(
        buildInput({
          scrapedFights: [sf],
          scrapedFighters: [f1, f2],
          scrapedEvents: [e],
        }),
      )

      expect(plan.toCreate).toHaveLength(1)
      expect(plan.toUpdate).toHaveLength(0)
      expect(plan.toCancel).toHaveLength(0)
      expect(plan.toCreate[0].data.eventId).toBe('db_e1')
      // Fighters are normalized alphabetically
      expect(plan.toCreate[0].data.fighter1Id).toBe('db_f1')
      expect(plan.toCreate[0].data.fighter2Id).toBe('db_f2')
      expect(plan.reversedOrderHits).toBe(0)
    })

    it('updates an existing fight when content hash differs', () => {
      const f1 = fighter('f1')
      const f2 = fighter('f2')
      const e = event('e1')
      const sf = fight({
        id: 'fight1',
        eventId: 'e1',
        fighter1Id: 'f1',
        fighter2Id: 'f2',
        weightClass: 'welterweight',
      })

      const plan = planFightReconciliation(
        buildInput({
          scrapedFights: [sf],
          scrapedFighters: [f1, f2],
          scrapedEvents: [e],
          existingFightsByEventId: {
            db_e1: [
              existingFight({
                id: 'existing1',
                fighter1Id: 'db_f1',
                fighter2Id: 'db_f2',
                contentHash: 'stale',
              }),
            ],
          },
        }),
      )

      expect(plan.toCreate).toHaveLength(0)
      expect(plan.toUpdate).toHaveLength(1)
      expect(plan.toUpdate[0].existingId).toBe('existing1')
      expect(plan.toUpdate[0].data.weightClass).toBe('welterweight')
    })

    it('emits no update when content hash is unchanged', () => {
      const f1 = fighter('f1')
      const f2 = fighter('f2')
      const e = event('e1')
      const sf = fight({ id: 'fight1', eventId: 'e1', fighter1Id: 'f1', fighter2Id: 'f2' })
      const sameHash = calculateContentHash(sf as unknown as Record<string, unknown>)

      const plan = planFightReconciliation(
        buildInput({
          scrapedFights: [sf],
          scrapedFighters: [f1, f2],
          scrapedEvents: [e],
          existingFightsByEventId: {
            db_e1: [
              existingFight({
                id: 'existing1',
                fighter1Id: 'db_f1',
                fighter2Id: 'db_f2',
                contentHash: sameHash,
              }),
            ],
          },
        }),
      )

      expect(plan.toCreate).toHaveLength(0)
      expect(plan.toUpdate).toHaveLength(0)
    })

    it('matches in reversed fighter order and counts the legacy hit', () => {
      const f1 = fighter('f1')
      const f2 = fighter('f2')
      const e = event('e1')
      const sf = fight({ id: 'fight1', eventId: 'e1', fighter1Id: 'f1', fighter2Id: 'f2' })

      const plan = planFightReconciliation(
        buildInput({
          scrapedFights: [sf],
          scrapedFighters: [f1, f2],
          scrapedEvents: [e],
          existingFightsByEventId: {
            // Existing row has fighters in non-normalized order (legacy data)
            db_e1: [
              existingFight({
                id: 'existing1',
                fighter1Id: 'db_f2',
                fighter2Id: 'db_f1',
                contentHash: 'stale',
              }),
            ],
          },
        }),
      )

      expect(plan.toCreate).toHaveLength(0)
      expect(plan.toUpdate).toHaveLength(1)
      expect(plan.toUpdate[0].existingId).toBe('existing1')
      expect(plan.reversedOrderHits).toBe(1)
    })

    it('falls back to sourceUrl when fighter IDs do not match (e.g. fighter ID changed)', () => {
      const f1 = fighter('f1')
      const f2 = fighter('f2')
      const e = event('e1')
      const sf = fight({
        id: 'fight1',
        eventId: 'e1',
        fighter1Id: 'f1',
        fighter2Id: 'f2',
        sourceUrl: 'https://example.com/fight/legacy',
      })

      const plan = planFightReconciliation(
        buildInput({
          scrapedFights: [sf],
          scrapedFighters: [f1, f2],
          scrapedEvents: [e],
          existingFightsByEventId: {
            db_e1: [
              existingFight({
                id: 'existing1',
                fighter1Id: 'db_other1',
                fighter2Id: 'db_other2',
                sourceUrl: 'https://example.com/fight/legacy',
                contentHash: 'stale',
              }),
            ],
          },
        }),
      )

      expect(plan.toUpdate).toHaveLength(1)
      expect(plan.toUpdate[0].existingId).toBe('existing1')
      expect(plan.reversedOrderHits).toBe(0)
    })
  })

  describe('skipping', () => {
    it('skips a fight whose event is missing from the upsert maps', () => {
      const f1 = fighter('f1')
      const f2 = fighter('f2')
      const sf = fight({ id: 'fight1', eventId: 'unknown', fighter1Id: 'f1', fighter2Id: 'f2' })

      const plan = planFightReconciliation(
        buildInput({
          scrapedFights: [sf],
          scrapedFighters: [f1, f2],
          scrapedEvents: [],
        }),
      )

      expect(plan.toCreate).toHaveLength(0)
      expect(plan.skipped).toEqual([{ scrapedFightId: 'fight1', reason: 'missing-event' }])
    })

    it('skips a fight whose fighter is missing from the upsert maps', () => {
      const f1 = fighter('f1')
      const e = event('e1')
      const sf = fight({ id: 'fight1', eventId: 'e1', fighter1Id: 'f1', fighter2Id: 'unknown' })

      const plan = planFightReconciliation(
        buildInput({
          scrapedFights: [sf],
          scrapedFighters: [f1],
          scrapedEvents: [e],
        }),
      )

      expect(plan.toCreate).toHaveLength(0)
      expect(plan.skipped).toEqual([{ scrapedFightId: 'fight1', reason: 'missing-fighter' }])
    })
  })

  describe('cancellation', () => {
    it('marks an existing fight as cancelled when no scraped fight matches it', () => {
      const f1 = fighter('f1')
      const f2 = fighter('f2')
      const f3 = fighter('f3')
      const e = event('e1')
      const sf = fight({ id: 'fight1', eventId: 'e1', fighter1Id: 'f1', fighter2Id: 'f2' })

      const plan = planFightReconciliation(
        buildInput({
          scrapedFights: [sf],
          scrapedFighters: [f1, f2, f3],
          scrapedEvents: [e],
          existingFightsByEventId: {
            db_e1: [
              // This one matches the scraped fight
              existingFight({
                id: 'kept',
                fighter1Id: 'db_f1',
                fighter2Id: 'db_f2',
                contentHash: 'stale',
              }),
              // This one was on the card but is no longer scraped
              existingFight({
                id: 'cancelled',
                fighter1Id: 'db_f1',
                fighter2Id: 'db_f3',
              }),
            ],
          },
          scrapedEventUrls: [e.sourceUrl],
        }),
      )

      expect(plan.toCancel).toEqual([{ existingId: 'cancelled' }])
    })

    it('does not cancel a completed or already-cancelled fight', () => {
      const f1 = fighter('f1')
      const f2 = fighter('f2')
      const e = event('e1')

      const plan = planFightReconciliation(
        buildInput({
          scrapedFights: [],
          scrapedFighters: [f1, f2],
          scrapedEvents: [e],
          existingFightsByEventId: {
            db_e1: [
              existingFight({
                id: 'completed',
                fighter1Id: 'db_f1',
                fighter2Id: 'db_f2',
                completed: true,
              }),
              existingFight({
                id: 'already-cancelled',
                fighter1Id: 'db_f1',
                fighter2Id: 'db_f2',
                isCancelled: true,
              }),
            ],
          },
          scrapedEventUrls: [e.sourceUrl],
        }),
      )

      expect(plan.toCancel).toEqual([])
    })

    it('does not cancel anything when scrapedEventUrls is empty', () => {
      const f1 = fighter('f1')
      const f2 = fighter('f2')
      const e = event('e1')

      const plan = planFightReconciliation(
        buildInput({
          scrapedFights: [],
          scrapedFighters: [f1, f2],
          scrapedEvents: [e],
          existingFightsByEventId: {
            db_e1: [
              existingFight({
                id: 'orphan',
                fighter1Id: 'db_f1',
                fighter2Id: 'db_f2',
              }),
            ],
          },
          scrapedEventUrls: [],
        }),
      )

      expect(plan.toCancel).toEqual([])
    })

    it('only reconciles events listed in scrapedEventUrls', () => {
      const f1 = fighter('f1')
      const f2 = fighter('f2')
      const e1 = event('e1')
      const e2 = event('e2')

      const plan = planFightReconciliation(
        buildInput({
          scrapedFights: [],
          scrapedFighters: [f1, f2],
          scrapedEvents: [e1, e2],
          existingFightsByEventId: {
            db_e1: [
              existingFight({ id: 'e1-orphan', fighter1Id: 'db_f1', fighter2Id: 'db_f2' }),
            ],
            db_e2: [
              existingFight({ id: 'e2-orphan', fighter1Id: 'db_f1', fighter2Id: 'db_f2' }),
            ],
          },
          // Only e1 is in scope; e2's orphan must be left alone.
          scrapedEventUrls: [e1.sourceUrl],
        }),
      )

      expect(plan.toCancel).toEqual([{ existingId: 'e1-orphan' }])
    })
  })

  describe('winnerId resolution', () => {
    it('resolves winnerId pointing to fighter1Id', () => {
      const f1 = fighter('f1')
      const f2 = fighter('f2')
      const e = event('e1')
      const sf = fight({
        id: 'fight1',
        eventId: 'e1',
        fighter1Id: 'f1',
        fighter2Id: 'f2',
        winnerId: 'f1',
        completed: true,
        method: 'KO/TKO',
      })

      const plan = planFightReconciliation(
        buildInput({
          scrapedFights: [sf],
          scrapedFighters: [f1, f2],
          scrapedEvents: [e],
        }),
      )

      expect(plan.toCreate[0].data.winnerId).toBe('db_f1')
    })

    it('resolves winnerId pointing to fighter2Id', () => {
      const f1 = fighter('f1')
      const f2 = fighter('f2')
      const e = event('e1')
      const sf = fight({
        id: 'fight1',
        eventId: 'e1',
        fighter1Id: 'f1',
        fighter2Id: 'f2',
        winnerId: 'f2',
        completed: true,
        method: 'SUB',
      })

      const plan = planFightReconciliation(
        buildInput({
          scrapedFights: [sf],
          scrapedFighters: [f1, f2],
          scrapedEvents: [e],
        }),
      )

      expect(plan.toCreate[0].data.winnerId).toBe('db_f2')
    })

    it('returns null winnerId for draws / no-contests / upcoming fights', () => {
      const f1 = fighter('f1')
      const f2 = fighter('f2')
      const e = event('e1')
      const sf = fight({
        id: 'fight1',
        eventId: 'e1',
        fighter1Id: 'f1',
        fighter2Id: 'f2',
        winnerId: null,
      })

      const plan = planFightReconciliation(
        buildInput({
          scrapedFights: [sf],
          scrapedFighters: [f1, f2],
          scrapedEvents: [e],
        }),
      )

      expect(plan.toCreate[0].data.winnerId).toBeNull()
    })
  })
})
