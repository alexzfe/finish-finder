#!/usr/bin/env -S npx ts-node
/**
 * Static export for GitHub Pages.
 *
 * Emits the same wire shape as `/api/db-events` (validated against
 * `UFCEventSchema` before write) so the API → static fallback path in the
 * frontend cannot silently drift.
 */

import { promises as fs } from 'fs'
import path from 'path'

import { Prisma, PrismaClient } from '@prisma/client'

import { CARD_POSITION_ORDER } from '@/config'
import { toCurrentPrediction, type CurrentPrediction } from '@/lib/ai/persistence/predictionStore'
import { toCanonicalCardPosition } from '@/lib/utils/cardPosition'
import { toWeightClass } from '@/lib/utils/weight-class'
import {
  UFCEventSchema,
  type Fight,
  type Fighter,
  type Prediction,
  type UFCEvent,
} from '@/types'

const prisma = new PrismaClient()

const eventInclude = {
  fights: {
    include: {
      fighter1: true,
      fighter2: true,
      predictions: { take: 1 },
    },
  },
} satisfies Prisma.EventInclude

type Row = Prisma.EventGetPayload<{ include: typeof eventInclude }>

function toFighter(row: Row['fights'][number]['fighter1']): Fighter {
  return {
    id: row.id,
    name: row.name,
    nickname: row.nickname,
    record: { wins: row.wins, losses: row.losses, draws: row.draws },
    weightClass: toWeightClass(row.weightClass, 'unknown'),
    imageUrl: row.imageUrl,
  }
}

function toPrediction(current: CurrentPrediction | null): Prediction | null {
  if (!current) return null
  return {
    funScore: current.funScore,
    finishProbability: current.finishProbability,
    confidence: current.finishConfidence,
    keyFactors: current.funFactors,
    modelUsed: current.modelUsed,
    createdAt: current.createdAt ? current.createdAt.toISOString() : null,
  }
}

function toFight(fight: Row['fights'][number]): Fight {
  // Bridge to the legacy-aware shape consumed by toCurrentPrediction. The
  // helper handles the legacy-column shim itself; we just hand it the row.
  const current = toCurrentPrediction({
    predictions: fight.predictions,
    funFactor: fight.funFactor,
    finishProbability: fight.finishProbability,
    keyFactors: fight.keyFactors,
    funFactors: fight.funFactors,
  })

  return {
    id: fight.id,
    fighter1: toFighter(fight.fighter1),
    fighter2: toFighter(fight.fighter2),
    weightClass: toWeightClass(fight.weightClass, 'unknown'),
    titleFight: fight.titleFight,
    mainEvent: fight.mainEvent,
    cardPosition: toCanonicalCardPosition(fight.cardPosition),
    scheduledRounds: fight.scheduledRounds,
    fightNumber: fight.fightNumber,
    bookingDate: fight.bookingDate.toISOString(),
    completed: fight.completed,
    winnerId: fight.winnerId,
    method: fight.method,
    round: fight.round,
    time: fight.time,
    fightPrediction: fight.fightPrediction,
    prediction: toPrediction(current),
  }
}

function toEvent(event: Row): UFCEvent {
  const fightCard = event.fights.map(toFight).sort((a, b) => {
    const orderA = CARD_POSITION_ORDER[a.cardPosition] ?? 999
    const orderB = CARD_POSITION_ORDER[b.cardPosition] ?? 999
    if (orderA !== orderB) return orderA - orderB
    return (a.fightNumber ?? 0) - (b.fightNumber ?? 0)
  })

  return {
    id: event.id,
    name: event.name,
    date: event.date.toISOString(),
    location: event.location,
    venue: event.venue ?? '',
    completed: event.completed,
    fightCard,
  }
}

async function main() {
  try {
    const activeVersion = await prisma.predictionVersion.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    })

    const events = await prisma.event.findMany({
      include: {
        fights: {
          include: {
            fighter1: true,
            fighter2: true,
            predictions: {
              where: activeVersion ? { versionId: activeVersion.id } : undefined,
              take: 1,
            },
          },
        },
      },
      orderBy: { date: 'asc' },
    }) as Row[]

    const serialized = events.map(toEvent)

    // Validate before writing — drift between API and static is caught here,
    // not at the frontend during a fallback.
    for (const event of serialized) {
      UFCEventSchema.parse(event)
    }

    const data = {
      generatedAt: new Date().toISOString(),
      events: serialized,
    }

    const outputDir = path.join(process.cwd(), 'public', 'data')
    await fs.mkdir(outputDir, { recursive: true })

    const outputPath = path.join(outputDir, 'events.json')
    await fs.writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')

    console.log(`✅ Wrote ${data.events.length} events to ${path.relative(process.cwd(), outputPath)}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('❌ Failed to export static events:', error)
  process.exit(1)
})
