/**
 * Fight reconciliation planner.
 *
 * Given a batch of scraped fights plus the existing fight rows for the events
 * being ingested, produce a plan describing what to create, update, cancel,
 * and skip. The plan is data — no Prisma access, no IO. The caller applies it
 * inside its own transaction.
 *
 * Matching rules (in order):
 *   1. Composite key (eventId, fighter1Id, fighter2Id) with fighter IDs
 *      sorted alphabetically — the canonical normalization.
 *   2. Reversed fighter order — legacy compatibility for fights persisted
 *      before normalization. Counted in `reversedOrderHits` so we can later
 *      prove it's safe to delete.
 *   3. sourceUrl exact match.
 *
 * Cancellation: any existing fight on a reconciled event that wasn't matched
 * by any scraped fight (and isn't already completed/cancelled) is marked.
 */

import type { ScrapedFight, ScrapedFighter, ScrapedEvent } from './validation'
import { calculateContentHash } from './contentHash'

export interface ExistingFight {
  id: string
  fighter1Id: string
  fighter2Id: string
  sourceUrl: string | null
  contentHash: string | null
  completed: boolean
  isCancelled: boolean
}

export interface DbRef {
  id: string
  sourceUrl: string
}

export interface ReconciliationInput {
  scrapedFights: ScrapedFight[]
  scrapedFighters: Pick<ScrapedFighter, 'id' | 'sourceUrl'>[]
  scrapedEvents: Pick<ScrapedEvent, 'id' | 'sourceUrl'>[]
  /** sourceUrl → DB row for fighters that were just upserted */
  fighterBySourceUrl: Map<string, DbRef>
  /** sourceUrl → DB row for events that were just upserted */
  eventBySourceUrl: Map<string, DbRef>
  /** Existing fights for every event in the scraped batch, keyed by DB event id */
  existingFightsByEventId: Map<string, ExistingFight[]>
  /** Subset of event sourceUrls to cancel-reconcile. Empty array disables cancellation. */
  scrapedEventUrls: string[]
}

export interface FightCreateData {
  fighter1Id: string
  fighter2Id: string
  eventId: string
  weightClass: string
  titleFight: boolean
  mainEvent: boolean
  cardPosition: string
  scheduledRounds: number
  completed: boolean
  isCancelled: false
  winnerId: string | null
  method: string | null | undefined
  round: number | null | undefined
  time: string | null | undefined
  sourceUrl: string
  contentHash: string
}

export interface FightUpdateData {
  weightClass: string | undefined
  titleFight: boolean | undefined
  mainEvent: boolean | undefined
  cardPosition: string | undefined
  scheduledRounds: number | undefined
  completed: boolean | undefined
  isCancelled: false
  winnerId: string | null | undefined
  method: string | null | undefined
  round: number | null | undefined
  time: string | null | undefined
  contentHash: string
}

export type SkipReason = 'missing-fighter' | 'missing-event'

export interface FightReconciliationPlan {
  toCreate: Array<{ scrapedFightId: string; data: FightCreateData }>
  toUpdate: Array<{ existingId: string; scrapedFightId: string; data: FightUpdateData }>
  toCancel: Array<{ existingId: string }>
  skipped: Array<{ scrapedFightId: string; reason: SkipReason }>
  reversedOrderHits: number
}

export function planFightReconciliation(input: ReconciliationInput): FightReconciliationPlan {
  const plan: FightReconciliationPlan = {
    toCreate: [],
    toUpdate: [],
    toCancel: [],
    skipped: [],
    reversedOrderHits: 0,
  }

  const fighterIdToSourceUrl = new Map(input.scrapedFighters.map((f) => [f.id, f.sourceUrl]))
  const eventIdToSourceUrl = new Map(input.scrapedEvents.map((e) => [e.id, e.sourceUrl]))

  const matchedExistingIds = new Set<string>()

  for (const fight of input.scrapedFights) {
    const fighter1SourceUrl = fighterIdToSourceUrl.get(fight.fighter1Id)
    const fighter2SourceUrl = fighterIdToSourceUrl.get(fight.fighter2Id)
    const eventSourceUrl = eventIdToSourceUrl.get(fight.eventId)

    const fighter1 = fighter1SourceUrl ? input.fighterBySourceUrl.get(fighter1SourceUrl) : undefined
    const fighter2 = fighter2SourceUrl ? input.fighterBySourceUrl.get(fighter2SourceUrl) : undefined
    const event = eventSourceUrl ? input.eventBySourceUrl.get(eventSourceUrl) : undefined

    if (!event) {
      plan.skipped.push({ scrapedFightId: fight.id, reason: 'missing-event' })
      continue
    }
    if (!fighter1 || !fighter2) {
      plan.skipped.push({ scrapedFightId: fight.id, reason: 'missing-fighter' })
      continue
    }

    const [normalizedFighter1Id, normalizedFighter2Id] = [fighter1.id, fighter2.id].sort()

    const existingFights = input.existingFightsByEventId.get(event.id) ?? []

    // 1. Normalized composite key
    let existing = existingFights.find(
      (f) => f.fighter1Id === normalizedFighter1Id && f.fighter2Id === normalizedFighter2Id,
    )

    // 2. Reversed-order legacy fallback
    if (!existing) {
      existing = existingFights.find(
        (f) => f.fighter1Id === normalizedFighter2Id && f.fighter2Id === normalizedFighter1Id,
      )
      if (existing) plan.reversedOrderHits++
    }

    // 3. sourceUrl fallback
    if (!existing && fight.sourceUrl) {
      existing = existingFights.find((f) => f.sourceUrl === fight.sourceUrl)
    }

    const normalizedWinnerId = resolveWinnerId(fight, fighter1, fighter2)
    const contentHash = calculateContentHash(fight)

    if (!existing) {
      plan.toCreate.push({
        scrapedFightId: fight.id,
        data: {
          fighter1Id: normalizedFighter1Id,
          fighter2Id: normalizedFighter2Id,
          eventId: event.id,
          weightClass: fight.weightClass ?? 'Unknown',
          titleFight: fight.titleFight ?? false,
          mainEvent: fight.mainEvent ?? false,
          cardPosition: fight.cardPosition ?? 'preliminary',
          scheduledRounds: fight.scheduledRounds ?? 3,
          completed: fight.completed ?? false,
          isCancelled: false,
          winnerId: normalizedWinnerId,
          method: fight.method,
          round: fight.round,
          time: fight.time,
          sourceUrl: fight.sourceUrl,
          contentHash,
        },
      })
      continue
    }

    matchedExistingIds.add(existing.id)

    if (existing.contentHash !== contentHash) {
      plan.toUpdate.push({
        existingId: existing.id,
        scrapedFightId: fight.id,
        data: {
          weightClass: fight.weightClass,
          titleFight: fight.titleFight,
          mainEvent: fight.mainEvent,
          cardPosition: fight.cardPosition,
          scheduledRounds: fight.scheduledRounds,
          completed: fight.completed,
          isCancelled: false,
          winnerId: normalizedWinnerId,
          method: fight.method,
          round: fight.round,
          time: fight.time,
          contentHash,
        },
      })
    }
  }

  // Cancellation: only across the explicitly-reconciled events.
  for (const eventUrl of input.scrapedEventUrls) {
    const event = input.eventBySourceUrl.get(eventUrl)
    if (!event) continue

    const existingFights = input.existingFightsByEventId.get(event.id) ?? []
    for (const fight of existingFights) {
      if (fight.completed || fight.isCancelled) continue
      if (matchedExistingIds.has(fight.id)) continue
      plan.toCancel.push({ existingId: fight.id })
    }
  }

  return plan
}

function resolveWinnerId(
  fight: ScrapedFight,
  fighter1: DbRef,
  fighter2: DbRef,
): string | null {
  if (!fight.winnerId) return null
  if (fight.winnerId === fight.fighter1Id) return fighter1.id
  if (fight.winnerId === fight.fighter2Id) return fighter2.id
  return null
}
