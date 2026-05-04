
import type { ExistingFight, FightReconciliationPlan } from '@/lib/scraper/fightReconciler'

import type { StoreOpts } from './fighterStore'
import type { Prisma, PrismaClient } from '@prisma/client'

export interface ApplyResult {
  created: number
  updated: number
  cancelled: number
}

/**
 * Single seam for the Fight table. Owns plan application (the mechanical
 * half of fight reconciliation — the planner stays pure in fightReconciler.ts)
 * and the read query that hydrates the planner's existing-fights input.
 *
 * `lastScrapedAt: now` stamping lives here because it's a write-time concern.
 * Logging of `plan.skipped` / `plan.reversedOrderHits` is the orchestrator's
 * job and stays at the call site.
 */
export class FightStore {
  constructor(private readonly prisma: PrismaClient) {}

  async applyReconciliationPlan(
    plan: FightReconciliationPlan,
    opts: StoreOpts = {},
  ): Promise<ApplyResult> {
    const client = opts.tx ?? this.prisma
    const now = new Date()

    let created = 0
    let updated = 0
    let cancelled = 0

    for (const create of plan.toCreate) {
      await client.fight.create({ data: { ...create.data, lastScrapedAt: now } })
      created++
    }

    for (const update of plan.toUpdate) {
      await client.fight.update({
        where: { id: update.existingId },
        data: { ...update.data, lastScrapedAt: now },
      })
      updated++
    }

    for (const cancel of plan.toCancel) {
      await client.fight.update({
        where: { id: cancel.existingId },
        data: { isCancelled: true, lastScrapedAt: now },
      })
      cancelled++
    }

    return { created, updated, cancelled }
  }

  async findExistingForReconciliation(
    eventIds: string[],
    opts: StoreOpts = {},
  ): Promise<Map<string, ExistingFight[]>> {
    if (eventIds.length === 0) return new Map()
    const client = opts.tx ?? this.prisma
    const rows = await client.fight.findMany({
      where: { eventId: { in: eventIds } },
      select: {
        id: true,
        eventId: true,
        fighter1Id: true,
        fighter2Id: true,
        sourceUrl: true,
        contentHash: true,
        completed: true,
        isCancelled: true,
      },
    })
    const map = new Map<string, ExistingFight[]>()
    for (const r of rows) {
      const list = map.get(r.eventId) ?? []
      list.push({
        id: r.id,
        fighter1Id: r.fighter1Id,
        fighter2Id: r.fighter2Id,
        sourceUrl: r.sourceUrl,
        contentHash: r.contentHash,
        completed: r.completed,
        isCancelled: r.isCancelled,
      })
      map.set(r.eventId, list)
    }
    return map
  }
}

// Re-export for callers that want a single import.
export type { Prisma }
