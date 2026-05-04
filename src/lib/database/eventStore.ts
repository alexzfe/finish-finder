
import { calculateContentHash } from '@/lib/scraper/contentHash'
import type { ScrapedEvent } from '@/lib/scraper/validation'

import type { DbRef, StoreOpts, UpsertResult } from './fighterStore'
import type { Prisma, PrismaClient } from '@prisma/client'

/**
 * Single seam for the Event table. Same shape as FighterStore: hash-gated
 * upsert that creates with defaults and updates with omit-on-null.
 */
export class EventStore {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertMany(events: ScrapedEvent[], opts: StoreOpts = {}): Promise<UpsertResult> {
    const client = opts.tx ?? this.prisma
    let added = 0
    let updated = 0
    let skipped = 0

    for (const event of events) {
      const contentHash = calculateContentHash(event as unknown as Record<string, unknown>)

      const existing = await client.event.findUnique({
        where: { sourceUrl: event.sourceUrl },
        select: { id: true, contentHash: true },
      })

      if (!existing) {
        await client.event.create({ data: buildCreateData(event, contentHash) })
        added++
      } else if (existing.contentHash !== contentHash) {
        await client.event.update({
          where: { sourceUrl: event.sourceUrl },
          data: buildUpdateData(event, contentHash),
        })
        updated++
      } else {
        skipped++
      }
    }

    return { added, updated, skipped }
  }

  async findBySourceUrls(
    sourceUrls: string[],
    opts: StoreOpts = {},
  ): Promise<Map<string, DbRef>> {
    if (sourceUrls.length === 0) return new Map()
    const client = opts.tx ?? this.prisma
    const rows = await client.event.findMany({
      where: { sourceUrl: { in: sourceUrls } },
      select: { id: true, sourceUrl: true },
    })
    const map = new Map<string, DbRef>()
    for (const r of rows) {
      if (r.sourceUrl) map.set(r.sourceUrl, { id: r.id, sourceUrl: r.sourceUrl })
    }
    return map
  }
}

function buildCreateData(e: ScrapedEvent, contentHash: string) {
  return {
    name: e.name,
    date: new Date(e.date),
    venue: e.venue ?? 'TBA',
    location: e.location ?? 'TBA',
    completed: e.completed ?? false,
    cancelled: e.cancelled ?? false,
    sourceUrl: e.sourceUrl,
    lastScrapedAt: new Date(),
    contentHash,
  }
}

function buildUpdateData(e: ScrapedEvent, contentHash: string): Prisma.EventUpdateInput {
  return {
    name: e.name,
    date: new Date(e.date),
    venue: e.venue ?? undefined,
    location: e.location ?? undefined,
    completed: e.completed ?? undefined,
    cancelled: e.cancelled ?? undefined,
    lastScrapedAt: new Date(),
    contentHash,
  }
}
