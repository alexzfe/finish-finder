#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client')

async function wipeDatabase() {
  const prisma = new PrismaClient()

  try {
    console.log('🧹 Starting database wipe...')

    // Delete in correct order due to foreign key constraints
    console.log('   Deleting fights...')
    const deletedFights = await prisma.fight.deleteMany({})
    console.log(`   ✅ Deleted ${deletedFights.count} fights`)

    console.log('   Deleting fighters...')
    const deletedFighters = await prisma.fighter.deleteMany({})
    console.log(`   ✅ Deleted ${deletedFighters.count} fighters`)

    console.log('   Deleting prediction usage records...')
    const deletedPredictions = await prisma.predictionUsage.deleteMany({})
    console.log(`   ✅ Deleted ${deletedPredictions.count} prediction records`)

    console.log('   Deleting events...')
    const deletedEvents = await prisma.event.deleteMany({})
    console.log(`   ✅ Deleted ${deletedEvents.count} events`)

    console.log('   Deleting other tables...')
    const deletedFunScore = await prisma.funScoreHistory.deleteMany({})
    console.log(`   ✅ Deleted ${deletedFunScore.count} fun score records`)

    const deletedModels = await prisma.predictionModel.deleteMany({})
    console.log(`   ✅ Deleted ${deletedModels.count} prediction models`)

    const deletedMetrics = await prisma.queryMetric.deleteMany({})
    console.log(`   ✅ Deleted ${deletedMetrics.count} query metrics`)

    console.log('🎯 Database wipe completed successfully!')

  } catch (error) {
    console.error('❌ Database wipe failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

wipeDatabase()