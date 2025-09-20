import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'
import { buildPredictionPrompt } from '@/lib/ai/predictionPrompt'

const prisma = new PrismaClient()

const DEFAULT_CHUNK_SIZE = Number.parseInt(process.env.PREDICTION_CHUNK_SIZE ?? '6', 10)

type PredictionRecord = {
  fightId: string
  funFactor?: number
  finishProbability?: number
  entertainmentReason?: string
  keyFactors?: string[]
  prediction?: string
  riskLevel?: 'high' | 'medium' | 'low'
}

const predictionsNeeded = (fight: {
  funFactor: number | null
  entertainmentReason: string | null
}): boolean => {
  if (!fight) {
    return false
  }

  const hasFunFactor = typeof fight.funFactor === 'number' && fight.funFactor > 0
  const hasDescription = typeof fight.entertainmentReason === 'string' && fight.entertainmentReason.trim().length > 0

  return !(hasFunFactor && hasDescription)
}

const chunkArray = <T>(items: T[], chunkSize: number): T[][] => {
  if (chunkSize <= 0) {
    return [items]
  }

  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }
  return chunks
}

const sanitizeJson = (raw: string): string =>
  raw
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u00a0]/g, ' ')
    .trim()

const extractPredictions = (raw: string): PredictionRecord[] => {
  const sanitized = sanitizeJson(raw)

  let data: unknown
  try {
    data = JSON.parse(sanitized)
  } catch (error) {
    throw new Error(`Failed to parse OpenAI JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  if (Array.isArray(data)) {
    return data as PredictionRecord[]
  }

  const isPredictionRecord = (value: unknown): value is PredictionRecord =>
    !!value && typeof value === 'object' && 'fightId' in (value as Record<string, unknown>)

  if (typeof data === 'object' && data !== null) {
    const { predictions, fights } = data as { predictions?: unknown; fights?: unknown }
    if (Array.isArray(predictions)) {
      return predictions as PredictionRecord[]
    }
    if (Array.isArray(fights)) {
      return fights as PredictionRecord[]
    }
    if (isPredictionRecord(data)) {
      return [data as PredictionRecord]
    }
  }

  throw new Error('OpenAI response did not contain a predictions array')
}

const runPredictionsForEvent = async (
  openai: OpenAI,
  event: Awaited<ReturnType<typeof prisma.event.findUnique>>,
  chunkSize: number
) => {
  if (!event) {
    return { updated: 0, predictions: new Map<string, PredictionRecord>() }
  }

  const fightsNeedingPrediction = event.fights.filter(f => predictionsNeeded(f))

  if (fightsNeedingPrediction.length === 0) {
    return { updated: 0, predictions: new Map<string, PredictionRecord>() }
  }

  const fightsForPrompt = fightsNeedingPrediction.map(fight => ({
    id: fight.id,
    fighter1Name: fight.fighter1?.name || 'Unknown Fighter 1',
    fighter2Name: fight.fighter2?.name || 'Unknown Fighter 2',
    weightClass: fight.weightClass,
    cardPosition: fight.cardPosition || 'preliminary'
  }))

  const batches = chunkArray(fightsForPrompt, chunkSize)
  const allPredictions = new Map<string, PredictionRecord>()
  let totalPromptTokens = 0
  let totalCompletionTokens = 0

  for (const batch of batches) {
    const prompt = buildPredictionPrompt(event.name, batch)
    totalPromptTokens += Math.round(prompt.length / 4)

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_PREDICTION_MODEL || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Return valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.35,
      max_tokens: 4000
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('OpenAI returned an empty response')
    }

    totalCompletionTokens += Math.round(content.length / 4)

    const predictions = extractPredictions(content)
    predictions.forEach(prediction => {
      if (prediction?.fightId) {
        allPredictions.set(prediction.fightId, prediction)
      }
    })
  }

  const updates = []

  for (const [fightId, prediction] of allPredictions.entries()) {
    const keyFactors = Array.isArray(prediction.keyFactors)
      ? prediction.keyFactors
      : typeof prediction.keyFactors === 'string'
        ? [prediction.keyFactors]
        : []

    updates.push(
      prisma.fight.update({
        where: { id: fightId },
        data: {
          funFactor: prediction.funFactor ?? 0,
          finishProbability: prediction.finishProbability ?? 0,
          entertainmentReason: prediction.entertainmentReason || null,
          keyFactors: JSON.stringify(keyFactors),
          fightPrediction: prediction.prediction || null,
          riskLevel: prediction.riskLevel || null,
          predictedFunScore: Math.min(100, Math.max(0, Math.round((prediction.funFactor || 0) * 10))),
          aiDescription: prediction.entertainmentReason || null,
          updatedAt: new Date()
        }
      })
    )
  }

  await Promise.all(updates)

  return {
    updated: updates.length,
    predictions: allPredictions,
    stats: {
      chunks: batches.length,
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens
    }
  }
}

export async function GET() {
  try {
    const events = await prisma.event.findMany({
      where: {
        fights: {
          some: {
            OR: [
              { funFactor: { equals: 0 } },
              { entertainmentReason: null },
              { entertainmentReason: { equals: '' } }
            ]
          }
        }
      },
      select: {
        id: true,
        name: true,
        date: true,
        fights: {
          where: {
            OR: [
              { funFactor: { equals: 0 } },
              { entertainmentReason: null },
              { entertainmentReason: { equals: '' } }
            ]
          },
          select: { id: true }
        }
      },
      orderBy: { date: 'asc' }
    })

    const pendingFights = events.reduce((total, event) => total + event.fights.length, 0)

    return NextResponse.json({
      success: true,
      data: {
        pendingEvents: events.length,
        pendingFights,
        events: events.map(event => ({
          id: event.id,
          name: event.name,
          date: event.date
        }))
      }
    })
  } catch (error) {
    console.error('❌ Prediction status error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to evaluate prediction status'
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

export async function POST(request: NextRequest) {
  const openaiApiKey = process.env.OPENAI_API_KEY
  if (!openaiApiKey) {
    return NextResponse.json({
      success: false,
      error: 'OPENAI_API_KEY is not configured server-side.'
    }, { status: 500 })
  }

  const chunkSize = Number.parseInt(new URL(request.url).searchParams.get('chunkSize') ?? `${DEFAULT_CHUNK_SIZE}`, 10)

  const openai = new OpenAI({ apiKey: openaiApiKey })

  try {
    const events = await prisma.event.findMany({
      where: {
        fights: {
          some: {
            OR: [
              { funFactor: { equals: 0 } },
              { entertainmentReason: null },
              { entertainmentReason: { equals: '' } }
            ]
          }
        }
      },
      include: {
        fights: {
          include: {
            fighter1: true,
            fighter2: true
          },
          orderBy: { fightNumber: 'asc' }
        }
      },
      orderBy: { date: 'asc' }
    })

    if (!events.length) {
      return NextResponse.json({
        success: true,
        data: {
          eventsProcessed: 0,
          fightsUpdated: 0,
          pendingEvents: 0,
          pendingFights: 0
        },
        message: 'No events require AI predictions.'
      })
    }

    let totalFightsUpdated = 0
    let totalPromptTokens = 0
    let totalCompletionTokens = 0
    const processedEvents: Array<{ id: string; name: string; fightsUpdated: number }> = []

    for (const event of events) {
      const { updated, stats } = await runPredictionsForEvent(openai, event, chunkSize || DEFAULT_CHUNK_SIZE)

      totalFightsUpdated += updated
      processedEvents.push({ id: event.id, name: event.name, fightsUpdated: updated })

      totalPromptTokens += stats.promptTokens
      totalCompletionTokens += stats.completionTokens

      if (updated > 0) {
        await prisma.predictionUsage.create({
          data: {
            eventId: event.id,
            eventName: event.name,
            fightsProcessed: updated,
            chunks: stats.chunks,
            promptTokensEstimated: stats.promptTokens,
            completionTokensEstimated: stats.completionTokens,
            totalTokensEstimated: stats.promptTokens + stats.completionTokens,
            source: 'api'
          }
        })
      }
    }

    const remaining = await prisma.event.findMany({
      where: {
        fights: {
          some: {
            OR: [
              { funFactor: { equals: 0 } },
              { entertainmentReason: null },
              { entertainmentReason: { equals: '' } }
            ]
          }
        }
      },
      select: {
        fights: {
          where: {
            OR: [
              { funFactor: { equals: 0 } },
              { entertainmentReason: null },
              { entertainmentReason: { equals: '' } }
            ]
          },
          select: { id: true }
        }
      }
    })

    const pendingFights = remaining.reduce((sum, event) => sum + event.fights.length, 0)

    return NextResponse.json({
      success: true,
      data: {
        eventsProcessed: processedEvents.length,
        fightsUpdated: totalFightsUpdated,
        promptTokensEstimated: totalPromptTokens,
        completionTokensEstimated: totalCompletionTokens,
        totalTokensEstimated: totalPromptTokens + totalCompletionTokens,
        details: processedEvents,
        pendingEvents: remaining.length,
        pendingFights
      }
    })
  } catch (error) {
    console.error('❌ Prediction generation error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to generate fight predictions',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
