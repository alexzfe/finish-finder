/**
 * Coordinates the scraper ingest workflow: upsert fighters and events, hydrate
 * the references the planner needs, run fight reconciliation, and apply the
 * resulting plan. Returns a structured `IngestResult` so callers (the route
 * handler, future replay tools) can decide how to record the run without
 * needing to know the workflow's internals.
 *
 * The orchestrator owns its own transaction. On failure the transaction rolls
 * back and the original error propagates — partial counts are deliberately
 * not exposed because, post-rollback, those rows don't exist. Callers writing
 * an audit row should record zeros on failure rather than the misleading
 * "how far did we get" counts that the previous inline implementation kept.
 */


import type { EventStore } from '@/lib/database/eventStore'
import type { FighterStore } from '@/lib/database/fighterStore'
import type { FightStore } from '@/lib/database/fightStore'
import { planFightReconciliation } from '@/lib/scraper/fightReconciler'
import type { ScrapedData } from '@/lib/scraper/validation'

import type { Prisma } from '@prisma/client'

export interface IngestResult {
  fighters: { added: number; updated: number; skipped: number }
  events: { added: number; updated: number; skipped: number }
  fights: { created: number; updated: number; cancelled: number }
  skipped: Array<{ scrapedFightId: string; reason: string }>
  reversedOrderHits: number
}

export type RunInTransaction = <T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
) => Promise<T>

type FighterStoreLike = Pick<FighterStore, 'upsertMany' | 'findBySourceUrls'>
type EventStoreLike = Pick<EventStore, 'upsertMany' | 'findBySourceUrls'>
type FightStoreLike = Pick<
  FightStore,
  'findExistingForReconciliation' | 'applyReconciliationPlan'
>

export class IngestOrchestrator {
  constructor(
    private readonly runInTransaction: RunInTransaction,
    private readonly fighterStore: FighterStoreLike,
    private readonly eventStore: EventStoreLike,
    private readonly fightStore: FightStoreLike,
  ) {}

  async apply(data: ScrapedData): Promise<IngestResult> {
    return this.runInTransaction(async (tx) => {
      const fighterCounts = await this.fighterStore.upsertMany(data.fighters, { tx })
      const eventCounts = await this.eventStore.upsertMany(data.events, { tx })

      const fighterBySourceUrl = await this.fighterStore.findBySourceUrls(
        data.fighters.map((f) => f.sourceUrl),
        { tx },
      )
      const eventBySourceUrl = await this.eventStore.findBySourceUrls(
        data.events.map((e) => e.sourceUrl),
        { tx },
      )
      const eventIds = Array.from(eventBySourceUrl.values()).map((e) => e.id)
      const existingFightsByEventId = await this.fightStore.findExistingForReconciliation(
        eventIds,
        { tx },
      )

      const plan = planFightReconciliation({
        scrapedFights: data.fights,
        scrapedFighters: data.fighters,
        scrapedEvents: data.events,
        fighterBySourceUrl,
        eventBySourceUrl,
        existingFightsByEventId,
        scrapedEventUrls: data.scrapedEventUrls ?? [],
      })

      const fightCounts = await this.fightStore.applyReconciliationPlan(plan, { tx })

      return {
        fighters: fighterCounts,
        events: eventCounts,
        fights: fightCounts,
        skipped: plan.skipped.map((s) => ({
          scrapedFightId: s.scrapedFightId,
          reason: s.reason,
        })),
        reversedOrderHits: plan.reversedOrderHits,
      }
    })
  }
}
