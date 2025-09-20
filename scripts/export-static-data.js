#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const { PrismaClient } = require('@prisma/client')
const fs = require('fs/promises')
const path = require('path')

const prisma = new PrismaClient()

const normalizeWeightClass = (value) => {
  if (!value) {
    return 'unknown'
  }

  return value
    .toLowerCase()
    .replace(/women's\s+/g, 'womens_')
    .replace(/[^a-z_]/g, '_')
    .replace(/_{2,}/g, '_')
}

const parseJsonArray = (value, fallback = []) => {
  if (!value) {
    return fallback
  }
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed
    }
  } catch (error) {
    // ignore and fall back
  }
  return fallback.length ? fallback : [value]
}

const serializeEvents = (events) =>
  events.map((event) => {
    const sortedFights = [...event.fights].sort((a, b) => (a.fightNumber || 0) - (b.fightNumber || 0))

    const fightCard = sortedFights.map((fight) => {
      const predictedFunScore = Math.min(100, Math.round((fight.funFactor || 0) * 10))

      return {
        id: fight.id,
        fighter1: {
          id: fight.fighter1.id,
          name: fight.fighter1.name,
          nickname: fight.fighter1.nickname || undefined,
          record: {
            wins: fight.fighter1.wins || 0,
            losses: fight.fighter1.losses || 0,
            draws: fight.fighter1.draws || 0
          },
          stats: {
            finishRate: fight.fighter1.finishRate || 0,
            koPercentage: fight.fighter1.koPercentage || 0,
            submissionPercentage: fight.fighter1.submissionPercentage || 0,
            averageFightTime: fight.fighter1.averageFightTime || 0,
            significantStrikesPerMinute: fight.fighter1.significantStrikesPerMinute || 0,
            takedownAccuracy: fight.fighter1.takedownAccuracy || 0
          },
          popularity: {
            socialFollowers: fight.fighter1.socialFollowers || 0,
            recentBuzzScore: fight.fighter1.recentBuzzScore || 0,
            fanFavorite: fight.fighter1.fanFavorite || false
          },
          funScore: fight.fighter1.funScore || 0,
          weightClass: normalizeWeightClass(fight.fighter1.weightClass || fight.weightClass),
          fighting_style: parseJsonArray(fight.fighter1.fightingStyles, ['mixed'])
        },
        fighter2: {
          id: fight.fighter2.id,
          name: fight.fighter2.name,
          nickname: fight.fighter2.nickname || undefined,
          record: {
            wins: fight.fighter2.wins || 0,
            losses: fight.fighter2.losses || 0,
            draws: fight.fighter2.draws || 0
          },
          stats: {
            finishRate: fight.fighter2.finishRate || 0,
            koPercentage: fight.fighter2.koPercentage || 0,
            submissionPercentage: fight.fighter2.submissionPercentage || 0,
            averageFightTime: fight.fighter2.averageFightTime || 0,
            significantStrikesPerMinute: fight.fighter2.significantStrikesPerMinute || 0,
            takedownAccuracy: fight.fighter2.takedownAccuracy || 0
          },
          popularity: {
            socialFollowers: fight.fighter2.socialFollowers || 0,
            recentBuzzScore: fight.fighter2.recentBuzzScore || 0,
            fanFavorite: fight.fighter2.fanFavorite || false
          },
          funScore: fight.fighter2.funScore || 0,
          weightClass: normalizeWeightClass(fight.fighter2.weightClass || fight.weightClass),
          fighting_style: parseJsonArray(fight.fighter2.fightingStyles, ['mixed'])
        },
        weightClass: normalizeWeightClass(fight.weightClass),
        titleFight: fight.titleFight || false,
        mainEvent: fight.mainEvent || false,
        cardPosition: fight.cardPosition,
        scheduledRounds: fight.scheduledRounds || 3,
        fightNumber: fight.fightNumber || 0,
        status: 'scheduled',
        event: {
          id: event.id,
          name: event.name,
          date: event.date,
          location: event.location,
          venue: event.venue || ''
        },
        predictedFunScore,
        funFactor: fight.funFactor || 0,
        finishProbability: fight.finishProbability || 0,
        funFactors: parseJsonArray(fight.keyFactors),
        aiDescription: fight.entertainmentReason || '',
        riskLevel: fight.riskLevel || null,
        prediction: fight.fightPrediction || '',
        bookingDate: fight.bookingDate,
        completed: fight.completed
      }
    })

    const mainCard = fightCard.filter((fight) => fight.cardPosition === 'main')
    const prelimCard = fightCard.filter((fight) => fight.cardPosition === 'preliminary')
    const earlyPrelimCard = fightCard.filter((fight) => fight.cardPosition === 'early-preliminary')

    return {
      id: event.id,
      name: event.name,
      date: event.date.toISOString(),
      location: event.location,
      venue: event.venue || '',
      fightCard,
      mainCard,
      prelimCard,
      earlyPrelimCard
    }
  })

async function main() {
  try {
    const events = await prisma.event.findMany({
      include: {
        fights: {
          include: {
            fighter1: true,
            fighter2: true
          }
        }
      },
      orderBy: { date: 'asc' }
    })

    const data = {
      generatedAt: new Date().toISOString(),
      events: serializeEvents(events)
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
