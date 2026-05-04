
import { calculateContentHash } from '@/lib/scraper/contentHash'
import type { ScrapedFighter } from '@/lib/scraper/validation'

import type { Prisma, PrismaClient } from '@prisma/client'

export interface DbRef {
  id: string
  sourceUrl: string
}

export interface UpsertResult {
  added: number
  updated: number
  skipped: number
}

export interface StoreOpts {
  tx?: Prisma.TransactionClient
}

/**
 * Single seam for the Fighter table. Hides the asymmetric coalesce rule:
 * a fresh fighter with missing stats gets zero defaults, but an update with
 * missing stats preserves the existing value (so a partial scrape never
 * clobbers real data).
 */
export class FighterStore {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertMany(fighters: ScrapedFighter[], opts: StoreOpts = {}): Promise<UpsertResult> {
    const client = opts.tx ?? this.prisma
    let added = 0
    let updated = 0
    let skipped = 0

    for (const fighter of fighters) {
      const contentHash = calculateContentHash(fighter as unknown as Record<string, unknown>)

      const existing = await client.fighter.findUnique({
        where: { sourceUrl: fighter.sourceUrl },
        select: { id: true, contentHash: true },
      })

      if (!existing) {
        await client.fighter.create({ data: buildCreateData(fighter, contentHash) })
        added++
      } else if (existing.contentHash !== contentHash) {
        await client.fighter.update({
          where: { sourceUrl: fighter.sourceUrl },
          data: buildUpdateData(fighter, contentHash),
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
    const rows = await client.fighter.findMany({
      where: { sourceUrl: { in: sourceUrls } },
      select: { id: true, sourceUrl: true },
    })
    const map = new Map<string, DbRef>()
    for (const r of rows) {
      // findMany filter guarantees non-null sourceUrl; Prisma widens to `string | null`
      if (r.sourceUrl) map.set(r.sourceUrl, { id: r.id, sourceUrl: r.sourceUrl })
    }
    return map
  }
}

function buildCreateData(f: ScrapedFighter, contentHash: string) {
  return {
    name: f.name,
    record: f.record,
    wins: f.wins ?? 0,
    losses: f.losses ?? 0,
    draws: f.draws ?? 0,
    weightClass: f.weightClass ?? 'Unknown',
    imageUrl: f.imageUrl,
    sourceUrl: f.sourceUrl,
    lastScrapedAt: new Date(),
    contentHash,

    height: f.height,
    weightLbs: f.weightLbs,
    reach: f.reach,
    reachInches: f.reachInches,
    stance: f.stance,
    dob: f.dob,

    significantStrikesLandedPerMinute: f.significantStrikesLandedPerMinute ?? 0,
    strikingAccuracyPercentage: f.strikingAccuracyPercentage ?? 0,
    significantStrikesAbsorbedPerMinute: f.significantStrikesAbsorbedPerMinute ?? 0,
    strikingDefensePercentage: f.strikingDefensePercentage ?? 0,

    takedownAverage: f.takedownAverage ?? 0,
    takedownAccuracyPercentage: f.takedownAccuracyPercentage ?? 0,
    takedownDefensePercentage: f.takedownDefensePercentage ?? 0,
    submissionAverage: f.submissionAverage ?? 0,

    averageFightTimeSeconds: f.averageFightTimeSeconds ?? 0,
    winsByKO: f.winsByKO ?? 0,
    winsBySubmission: f.winsBySubmission ?? 0,
    winsByDecision: f.winsByDecision ?? 0,

    lossesByKO: f.lossesByKO ?? 0,
    lossesBySubmission: f.lossesBySubmission ?? 0,
    lossesByDecision: f.lossesByDecision ?? 0,

    finishRate: f.finishRate ?? 0,
    koPercentage: f.koPercentage ?? 0,
    submissionPercentage: f.submissionPercentage ?? 0,

    lossFinishRate: f.lossFinishRate ?? 0,
    koLossPercentage: f.koLossPercentage ?? 0,
    submissionLossPercentage: f.submissionLossPercentage ?? 0,
  }
}

/**
 * On update we omit any field whose scraped value is null/undefined. Prisma
 * leaves omitted columns untouched, which encodes the "partial scrape never
 * clobbers existing data" rule without needing to read the prior row first.
 *
 * Notable exception: `weightClass` is never updated. Original ingest set it
 * only on create; preserved here to avoid surprising re-classifications.
 */
function buildUpdateData(f: ScrapedFighter, contentHash: string) {
  return {
    name: f.name,
    record: f.record ?? undefined,
    wins: f.wins ?? undefined,
    losses: f.losses ?? undefined,
    draws: f.draws ?? undefined,
    imageUrl: f.imageUrl ?? undefined,
    lastScrapedAt: new Date(),
    contentHash,

    height: f.height ?? undefined,
    weightLbs: f.weightLbs ?? undefined,
    reach: f.reach ?? undefined,
    reachInches: f.reachInches ?? undefined,
    stance: f.stance ?? undefined,
    dob: f.dob ?? undefined,

    significantStrikesLandedPerMinute: f.significantStrikesLandedPerMinute ?? undefined,
    strikingAccuracyPercentage: f.strikingAccuracyPercentage ?? undefined,
    significantStrikesAbsorbedPerMinute: f.significantStrikesAbsorbedPerMinute ?? undefined,
    strikingDefensePercentage: f.strikingDefensePercentage ?? undefined,

    takedownAverage: f.takedownAverage ?? undefined,
    takedownAccuracyPercentage: f.takedownAccuracyPercentage ?? undefined,
    takedownDefensePercentage: f.takedownDefensePercentage ?? undefined,
    submissionAverage: f.submissionAverage ?? undefined,

    averageFightTimeSeconds: f.averageFightTimeSeconds ?? undefined,
    winsByKO: f.winsByKO ?? undefined,
    winsBySubmission: f.winsBySubmission ?? undefined,
    winsByDecision: f.winsByDecision ?? undefined,

    lossesByKO: f.lossesByKO ?? undefined,
    lossesBySubmission: f.lossesBySubmission ?? undefined,
    lossesByDecision: f.lossesByDecision ?? undefined,

    finishRate: f.finishRate ?? undefined,
    koPercentage: f.koPercentage ?? undefined,
    submissionPercentage: f.submissionPercentage ?? undefined,

    lossFinishRate: f.lossFinishRate ?? undefined,
    koLossPercentage: f.koLossPercentage ?? undefined,
    submissionLossPercentage: f.submissionLossPercentage ?? undefined,
  }
}
