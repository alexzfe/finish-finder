#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Generate fresh OpenAI entertainment predictions for a UFC event and
 * store the results back into Prisma. Usage examples:
 *   node scripts/generate-event-predictions.js --id ufc-123-example
 *   node scripts/generate-event-predictions.js --name 'UFC 300' --chunk-size 6
 *   node scripts/generate-event-predictions.js --id ufc-123-example --dry-run
 */

const { PrismaClient } = require('@prisma/client')
const { OpenAI } = require('openai')

const prisma = new PrismaClient()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const DEFAULT_CHUNK_SIZE = 8

function parseArgs(argv) {
  const options = {
    chunkSize: DEFAULT_CHUNK_SIZE,
    dryRun: false
  }

  for (const arg of argv) {
    if (arg.startsWith('--id=')) {
      options.eventId = arg.slice(5)
    } else if (arg === '--id') {
      // Support "--id value" pattern
      const index = argv.indexOf(arg)
      options.eventId = argv[index + 1]
    } else if (arg.startsWith('--name=')) {
      options.eventName = arg.slice(7)
    } else if (arg === '--name') {
      const index = argv.indexOf(arg)
      options.eventName = argv[index + 1]
    } else if (arg.startsWith('--chunk-size=')) {
      options.chunkSize = Number.parseInt(arg.slice(13), 10)
    } else if (arg === '--chunk-size') {
      const index = argv.indexOf(arg)
      options.chunkSize = Number.parseInt(argv[index + 1], 10)
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    }
  }

  return options
}

function printHelp() {
  console.log(`Generate OpenAI entertainment predictions for a UFC event\n\n` +
    `Required:\n` +
    `  --id <eventId>        Use exact Prisma event id\n` +
    `  --name <text>         Use event name substring (first match)\n\n` +
    `Optional:\n` +
    `  --chunk-size <n>      Number of fights per OpenAI call (default ${DEFAULT_CHUNK_SIZE})\n` +
    `  --dry-run             Print predictions but do not persist\n` +
    `  --help / -h           Show this message\n\n` +
    `Examples:\n` +
    `  node scripts/generate-event-predictions.js --id ufc-fight-night-260-ulberg-vs-reyes\n` +
    `  node scripts/generate-event-predictions.js --name 'UFC Fight Night' --chunk-size 6\n`)
}

function chunk(array, size) {
  const chunks = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

function buildPrompt(eventName, fights) {
  const fightList = fights
    .map(f => `${f.id}: ${f.fighter1Name} vs ${f.fighter2Name} (${f.weightClass}) - ${f.cardPosition}`)
    .join('\n')

  return `You are a senior MMA analyst whose specialty is identifying bouts that will thrill fans. Focus on finish probability first, then chaos factors like violent scrambles, slugfests, and volatile momentum swings. Analyze the following upcoming UFC fights and respond with strict JSON.\n\nEVENT: ${eventName}\n\nFor each fight, provide:\n- fightId\n- funFactor (1-10 scale for entertainment)\n- finishProbability (0-100)\n- entertainmentReason (3-4 sentences summarizing why the fight will or won't deliver action)\n- keyFactors (3-5 short phrases such as 'knockout power' or 'scramble heavy')\n- prediction (succinct outcome pick)\n- riskLevel (high|medium|low)\n\nFIGHTS TO ANALYZE:\n${fightList}`
}

function sanitizeJson(raw) {
  return raw
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u00a0]/g, ' ')
    .trim()
}

function extractPredictions(rawContent) {
  const sanitized = sanitizeJson(rawContent)

  let parsed
  try {
    parsed = JSON.parse(sanitized)
  } catch (error) {
    throw new Error(`Failed to parse OpenAI JSON response: ${error.message}`)
  }

  const isPredictionRecord = (value) => {
    return value && typeof value === 'object' && 'fightId' in value
  }

  if (Array.isArray(parsed)) {
    return parsed
  }

  if (Array.isArray(parsed.predictions)) {
    return parsed.predictions
  }

  if (Array.isArray(parsed.fights)) {
    return parsed.fights
  }

  if (isPredictionRecord(parsed)) {
    return [parsed]
  }

  throw new Error('OpenAI response did not contain a predictions array')
}

async function fetchEvent(options) {
  if (!options.eventId && !options.eventName) {
    throw new Error('Provide either --id <eventId> or --name <eventName substring>.')
  }

  if (options.eventId) {
    return prisma.event.findUnique({
      where: { id: options.eventId },
      include: {
        fights: {
          include: { fighter1: true, fighter2: true },
          orderBy: { fightNumber: 'asc' }
        }
      }
    })
  }

  const events = await prisma.event.findMany({
    where: { name: { contains: options.eventName, mode: 'insensitive' } },
    orderBy: { date: 'asc' },
    include: {
      fights: {
        include: { fighter1: true, fighter2: true },
        orderBy: { fightNumber: 'asc' }
      }
    }
  })

  return events[0]
}

async function generatePredictions(event, options) {
  if (!event?.fights?.length) {
    throw new Error('Event has no fights to analyze.')
  }

  console.log(`📅 Event: ${event.name} (${event.fights.length} fights)`) 

  const fights = event.fights.map(fight => ({
    id: fight.id,
    fighter1Name: fight.fighter1?.name || 'Unknown Fighter 1',
    fighter2Name: fight.fighter2?.name || 'Unknown Fighter 2',
    weightClass: fight.weightClass,
    cardPosition: fight.cardPosition
  }))

  const batches = chunk(fights, options.chunkSize)
  const allPredictions = new Map()
  let totalPromptTokens = 0
  let totalCompletionTokens = 0

  for (const [index, batch] of batches.entries()) {
    console.log(`🔍 Requesting predictions for fights ${index * options.chunkSize + 1}-${index * options.chunkSize + batch.length}`)

    const prompt = buildPrompt(event.name, batch)
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
      throw new Error('OpenAI returned an empty response.')
    }

    totalCompletionTokens += Math.round(content.length / 4)

    const predictions = extractPredictions(content)

    predictions.forEach(prediction => {
      if (prediction?.fightId) {
        allPredictions.set(prediction.fightId, prediction)
      }
    })
  }

  console.log(`✅ Retrieved predictions for ${allPredictions.size} fights.`)
  return {
    predictions: allPredictions,
    stats: {
      chunks: batches.length,
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens
    }
  }
}

async function persistPredictions(predictionMap, options) {
  const updates = []

  for (const [fightId, prediction] of predictionMap.entries()) {
    const data = {
      funFactor: prediction.funFactor ?? 0,
      finishProbability: prediction.finishProbability ?? 0,
      entertainmentReason: prediction.entertainmentReason || null,
      keyFactors: JSON.stringify(prediction.keyFactors || []),
      fightPrediction: prediction.prediction || null,
      riskLevel: prediction.riskLevel || null,
      predictedFunScore: Math.min(100, Math.max(0, Math.round((prediction.funFactor || 0) * 10))),
      aiDescription: prediction.entertainmentReason || null,
      updatedAt: new Date()
    }

    if (options.dryRun) {
      console.log(`[dry-run] ${fightId}`)
      console.log(data)
    } else {
      updates.push(
        prisma.fight.update({
          where: { id: fightId },
          data
        })
      )
    }
  }

  if (!options.dryRun) {
    await Promise.all(updates)
    console.log(`💾 Updated ${updates.length} fights.`)
    return updates.length
  }

  return predictionMap.size
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    printHelp()
    return
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured.')
  }

  if (!options.eventId && !options.eventName) {
    printHelp()
    throw new Error('Missing --id or --name argument.')
  }

  if (!Number.isFinite(options.chunkSize) || options.chunkSize <= 0) {
    throw new Error('Chunk size must be a positive integer.')
  }

  const event = await fetchEvent(options)

  if (!event) {
    const criteria = options.eventId ? `id=${options.eventId}` : `name contains "${options.eventName}"`
    throw new Error(`No event found for ${criteria}`)
  }

  const { predictions: predictionMap, stats } = await generatePredictions(event, options)
  const updatedCount = await persistPredictions(predictionMap, options)

  if (!options.dryRun && updatedCount > 0) {
    await prisma.predictionUsage.create({
      data: {
        eventId: event.id,
        eventName: event.name,
        fightsProcessed: updatedCount,
        chunks: stats.chunks,
        promptTokensEstimated: stats.promptTokens,
        completionTokensEstimated: stats.completionTokens,
        totalTokensEstimated: stats.promptTokens + stats.completionTokens,
        source: 'cli'
      }
    })
  }

  const sample = Array.from(predictionMap.values()).slice(0, 3).map(prediction => ({
    fightId: prediction.fightId,
    funFactor: prediction.funFactor,
    finishProbability: prediction.finishProbability,
    riskLevel: prediction.riskLevel,
    keyFactors: prediction.keyFactors
  }))

  console.log('📊 Sample predictions:', JSON.stringify(sample, null, 2))
}

main()
  .catch(error => {
    console.error('❌ Prediction script error:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
