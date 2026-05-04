import { describe, expect, it } from 'vitest'

import type { DbRef, UpsertResult } from '@/lib/database/fighterStore'

import { calculateContentHash } from '../contentHash'
import {
  type ExistingFight,
  type FightReconciliationPlan,
} from '../fightReconciler'
import { IngestOrchestrator, type RunInTransaction } from '../ingestOrchestrator'

import type {
  ScrapedData,
  ScrapedEvent,
  ScrapedFight,
  ScrapedFighter,
} from '../validation'


// Stateful in-memory fakes. They mirror the real Stores' contract — including
// content-hash gating — so end-to-end orchestrator behavior (idempotency,
// reconciliation, cancellation) is observable without a database.

class FakeFighterStore {
  private rows = new Map<string, { id: string; sourceUrl: string; contentHash: string }>()
  private counter = 0

  async upsertMany(fighters: ScrapedFighter[]): Promise<UpsertResult> {
    let added = 0
    let updated = 0
    let skipped = 0
    for (const f of fighters) {
      const hash = calculateContentHash(f as unknown as Record<string, unknown>)
      const existing = this.rows.get(f.sourceUrl)
      if (!existing) {
        this.rows.set(f.sourceUrl, {
          id: `fighter-${++this.counter}`,
          sourceUrl: f.sourceUrl,
          contentHash: hash,
        })
        added++
      } else if (existing.contentHash !== hash) {
        existing.contentHash = hash
        updated++
      } else {
        skipped++
      }
    }
    return { added, updated, skipped }
  }

  async findBySourceUrls(sourceUrls: string[]): Promise<Map<string, DbRef>> {
    const map = new Map<string, DbRef>()
    for (const url of sourceUrls) {
      const row = this.rows.get(url)
      if (row) map.set(url, { id: row.id, sourceUrl: row.sourceUrl })
    }
    return map
  }
}

class FakeEventStore {
  private rows = new Map<string, { id: string; sourceUrl: string; contentHash: string }>()
  private counter = 0

  async upsertMany(events: ScrapedEvent[]): Promise<UpsertResult> {
    let added = 0
    let updated = 0
    let skipped = 0
    for (const e of events) {
      const hash = calculateContentHash(e as unknown as Record<string, unknown>)
      const existing = this.rows.get(e.sourceUrl)
      if (!existing) {
        this.rows.set(e.sourceUrl, {
          id: `event-${++this.counter}`,
          sourceUrl: e.sourceUrl,
          contentHash: hash,
        })
        added++
      } else if (existing.contentHash !== hash) {
        existing.contentHash = hash
        updated++
      } else {
        skipped++
      }
    }
    return { added, updated, skipped }
  }

  async findBySourceUrls(sourceUrls: string[]): Promise<Map<string, DbRef>> {
    const map = new Map<string, DbRef>()
    for (const url of sourceUrls) {
      const row = this.rows.get(url)
      if (row) map.set(url, { id: row.id, sourceUrl: row.sourceUrl })
    }
    return map
  }
}

interface FakeFightRow extends ExistingFight {
  eventId: string
}

class FakeFightStore {
  rows: FakeFightRow[] = []
  private counter = 0

  async findExistingForReconciliation(
    eventIds: string[],
  ): Promise<Map<string, ExistingFight[]>> {
    const map = new Map<string, ExistingFight[]>()
    for (const id of eventIds) {
      const matches = this.rows.filter((r) => r.eventId === id)
      if (matches.length > 0) map.set(id, matches)
    }
    return map
  }

  async applyReconciliationPlan(
    plan: FightReconciliationPlan,
  ): Promise<{ created: number; updated: number; cancelled: number }> {
    for (const create of plan.toCreate) {
      this.rows.push({
        id: `fight-${++this.counter}`,
        eventId: create.data.eventId,
        fighter1Id: create.data.fighter1Id,
        fighter2Id: create.data.fighter2Id,
        sourceUrl: create.data.sourceUrl,
        contentHash: create.data.contentHash,
        completed: create.data.completed,
        isCancelled: false,
      })
    }
    for (const update of plan.toUpdate) {
      const row = this.rows.find((r) => r.id === update.existingId)
      if (row) {
        row.contentHash = update.data.contentHash
        if (update.data.completed !== undefined) row.completed = update.data.completed
      }
    }
    for (const cancel of plan.toCancel) {
      const row = this.rows.find((r) => r.id === cancel.existingId)
      if (row) row.isCancelled = true
    }
    return {
      created: plan.toCreate.length,
      updated: plan.toUpdate.length,
      cancelled: plan.toCancel.length,
    }
  }
}

// Fakes ignore the tx; pass `never` so TS doesn't fight us.
const runInTransaction: RunInTransaction = (cb) => cb({} as never)

function makeOrchestrator() {
  const fighterStore = new FakeFighterStore()
  const eventStore = new FakeEventStore()
  const fightStore = new FakeFightStore()
  const orchestrator = new IngestOrchestrator(
    runInTransaction,
    fighterStore,
    eventStore,
    fightStore,
  )
  return { orchestrator, fighterStore, eventStore, fightStore }
}

function fighter(id: string): ScrapedFighter {
  return {
    id,
    name: id,
    sourceUrl: `https://example.com/f/${id}`,
  } as ScrapedFighter
}

function event(id: string): ScrapedEvent {
  return {
    id,
    name: id,
    date: '2026-06-01T00:00:00.000Z',
    sourceUrl: `https://example.com/e/${id}`,
    completed: false,
    cancelled: false,
  } as ScrapedEvent
}

function fight(id: string, eventId: string, f1: string, f2: string): ScrapedFight {
  return {
    id,
    eventId,
    fighter1Id: f1,
    fighter2Id: f2,
    sourceUrl: `https://example.com/fight/${id}`,
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
  } as ScrapedFight
}

function payload(parts: {
  fighters?: ScrapedFighter[]
  events?: ScrapedEvent[]
  fights?: ScrapedFight[]
  scrapedEventUrls?: string[]
}): ScrapedData {
  return {
    fighters: parts.fighters ?? [],
    events: parts.events ?? [],
    fights: parts.fights ?? [],
    scrapedEventUrls: parts.scrapedEventUrls ?? [],
  }
}

describe('IngestOrchestrator', () => {
  it('is idempotent: re-applying the same payload produces no second-run changes', async () => {
    const { orchestrator } = makeOrchestrator()
    const data = payload({
      fighters: [fighter('alice'), fighter('bob')],
      events: [event('e1')],
      fights: [fight('f1', 'e1', 'alice', 'bob')],
      scrapedEventUrls: ['https://example.com/e/e1'],
    })

    const first = await orchestrator.apply(data)
    expect(first.fighters).toEqual({ added: 2, updated: 0, skipped: 0 })
    expect(first.events).toEqual({ added: 1, updated: 0, skipped: 0 })
    expect(first.fights).toEqual({ created: 1, updated: 0, cancelled: 0 })

    const second = await orchestrator.apply(data)
    expect(second.fighters).toEqual({ added: 0, updated: 0, skipped: 2 })
    expect(second.events).toEqual({ added: 0, updated: 0, skipped: 1 })
    expect(second.fights).toEqual({ created: 0, updated: 0, cancelled: 0 })
    expect(second.skipped).toEqual([])
  })

  it('cancels fights that disappear from a reconciled event', async () => {
    const { orchestrator, fightStore } = makeOrchestrator()
    const fighters = [fighter('a'), fighter('b'), fighter('c'), fighter('d'), fighter('e'), fighter('f')]
    const events = [event('e1')]
    const eventUrls = ['https://example.com/e/e1']

    await orchestrator.apply(
      payload({
        fighters,
        events,
        fights: [
          fight('fA', 'e1', 'a', 'b'),
          fight('fB', 'e1', 'c', 'd'),
          fight('fC', 'e1', 'e', 'f'),
        ],
        scrapedEventUrls: eventUrls,
      }),
    )
    expect(fightStore.rows.filter((r) => !r.isCancelled)).toHaveLength(3)

    const result = await orchestrator.apply(
      payload({
        fighters,
        events,
        fights: [
          fight('fA', 'e1', 'a', 'b'),
          fight('fB', 'e1', 'c', 'd'),
        ],
        scrapedEventUrls: eventUrls,
      }),
    )

    expect(result.fights.cancelled).toBe(1)
    expect(fightStore.rows.filter((r) => r.isCancelled)).toHaveLength(1)
    expect(fightStore.rows.filter((r) => !r.isCancelled)).toHaveLength(2)
  })

  it('resolves fighter references across events in the same payload', async () => {
    const { orchestrator, fightStore } = makeOrchestrator()
    // Fighter `alice` is listed once but referenced by fights on two events.
    const data = payload({
      fighters: [fighter('alice'), fighter('bob'), fighter('carol')],
      events: [event('e1'), event('e2')],
      fights: [
        fight('f1', 'e1', 'alice', 'bob'),
        fight('f2', 'e2', 'alice', 'carol'),
      ],
      scrapedEventUrls: [
        'https://example.com/e/e1',
        'https://example.com/e/e2',
      ],
    })

    const result = await orchestrator.apply(data)

    expect(result.fights.created).toBe(2)
    expect(result.skipped).toEqual([])
    expect(fightStore.rows).toHaveLength(2)
    // Both fights point at the same `alice` row id.
    const aliceIds = new Set([
      fightStore.rows[0].fighter1Id,
      fightStore.rows[1].fighter1Id,
    ])
    expect(aliceIds.size).toBe(1)
  })

  it('exposes skipped fights and their reasons in the result', async () => {
    const { orchestrator, fightStore } = makeOrchestrator()
    // `f1` references fighter `ghost` who is not in the fighters[] array.
    const data = payload({
      fighters: [fighter('alice')],
      events: [event('e1')],
      fights: [
        fight('f1', 'e1', 'alice', 'ghost'),
        fight('f2', 'missing-event', 'alice', 'alice2'),
      ],
      scrapedEventUrls: ['https://example.com/e/e1'],
    })

    const result = await orchestrator.apply(data)

    expect(result.fights.created).toBe(0)
    expect(result.skipped).toHaveLength(2)
    expect(result.skipped).toContainEqual({
      scrapedFightId: 'f1',
      reason: 'missing-fighter',
    })
    expect(result.skipped).toContainEqual({
      scrapedFightId: 'f2',
      reason: 'missing-event',
    })
    expect(fightStore.rows).toHaveLength(0)
  })
})
