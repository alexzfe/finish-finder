/**
 * Bootstrap Embeddings Script
 *
 * Generates embeddings for all fighters in the database.
 * Run this after applying the pgvector migration.
 *
 * Usage:
 *   DATABASE_URL="..." npx ts-node scripts/bootstrap-embeddings.ts
 *
 * Options:
 *   --force    Update all embeddings (even existing ones)
 *   --limit N  Only process N fighters (for testing)
 */

import OpenAI from 'openai'
import { updateFighterEmbeddings } from '../src/lib/ai/embeddings'
import { prisma } from '../src/lib/database/prisma'

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('FIGHTER EMBEDDINGS BOOTSTRAP')
  console.log('═══════════════════════════════════════════════════════════════════\n')

  // Parse command line args
  const args = process.argv.slice(2)
  const forceUpdate = args.includes('--force')
  const limitIndex = args.indexOf('--limit')
  const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) : undefined

  // Check for OpenAI API key
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY environment variable not set')
    console.error('Please set it in .env.local or pass it directly')
    process.exit(1)
  }

  // Initialize OpenAI client
  const openai = new OpenAI({ apiKey })

  // Check database connection
  console.log('Checking database connection...')
  try {
    const count = await prisma.fighter.count()
    console.log(`✓ Connected to database. Found ${count} fighters.\n`)
  } catch (error) {
    console.error('Error connecting to database:', error)
    process.exit(1)
  }

  // Check if pgvector extension is enabled
  console.log('Checking pgvector extension...')
  try {
    await prisma.$queryRaw`SELECT 1 FROM pg_extension WHERE extname = 'vector'`
    console.log('✓ pgvector extension is enabled\n')
  } catch (error) {
    console.error('Error: pgvector extension not found')
    console.error('Please run the migration first:')
    console.error('  npx prisma migrate deploy')
    process.exit(1)
  }

  // Get fighters to process
  let fighterIds: string[] | undefined
  if (limit) {
    const fighters = await prisma.fighter.findMany({
      take: limit,
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    })
    fighterIds = fighters.map(f => f.id)
    console.log(`Processing ${fighterIds.length} fighters (limited)\n`)
  }

  // Check current embedding status
  const [totalFighters, withEmbeddings] = await Promise.all([
    prisma.fighter.count(),
    prisma.fighter.count({ where: { embeddingUpdatedAt: { not: null } } }),
  ])

  console.log('Current status:')
  console.log(`  Total fighters: ${totalFighters}`)
  console.log(`  With embeddings: ${withEmbeddings}`)
  console.log(`  Without embeddings: ${totalFighters - withEmbeddings}`)
  console.log(`  Force update: ${forceUpdate}\n`)

  // Estimate cost
  const fightersToProcess = forceUpdate ? totalFighters : totalFighters - withEmbeddings
  const estimatedTokens = fightersToProcess * 300 // ~300 tokens per profile
  const estimatedCost = (estimatedTokens / 1000000) * 0.02 // $0.02 per 1M tokens
  console.log(`Estimated cost: $${estimatedCost.toFixed(4)} (${fightersToProcess} fighters × ~300 tokens)\n`)

  if (fightersToProcess === 0) {
    console.log('All fighters already have embeddings. Use --force to update all.')
    process.exit(0)
  }

  // Start embedding generation
  console.log('Starting embedding generation...\n')
  const startTime = Date.now()

  try {
    const result = await updateFighterEmbeddings({
      openai,
      fighterIds,
      forceUpdate,
      batchSize: 50, // Process 50 at a time to stay within rate limits
    })

    const duration = (Date.now() - startTime) / 1000

    console.log('\n═══════════════════════════════════════════════════════════════════')
    console.log('RESULTS')
    console.log('═══════════════════════════════════════════════════════════════════')
    console.log(`  Processed: ${result.processed}`)
    console.log(`  Updated: ${result.updated}`)
    console.log(`  Skipped: ${result.skipped}`)
    console.log(`  Errors: ${result.errors}`)
    console.log(`  Duration: ${duration.toFixed(1)}s`)
    console.log(`  Rate: ${(result.processed / duration).toFixed(1)} fighters/sec`)

    if (result.errors > 0) {
      console.log('\n⚠️  Some embeddings failed to generate. Check logs above.')
    } else {
      console.log('\n✓ All embeddings generated successfully!')
    }

  } catch (error) {
    console.error('Fatal error during embedding generation:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
