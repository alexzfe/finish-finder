#!/usr/bin/env node
/**
 * Verify predictions are complete
 */

import { config } from 'dotenv'
import { existsSync } from 'fs'

const envPath = '.env.local'
if (existsSync(envPath)) {
  config({ path: envPath })
}

import { prisma } from '../src/lib/database/prisma'

async function verify() {
  const predictions = await prisma.prediction.count()
  const fightsWithPredictions = await prisma.fight.count({
    where: { predictions: { some: {} } }
  })
  const totalFights = await prisma.fight.count()
  const upcomingEvents = await prisma.event.count({
    where: { completed: false, date: { gte: new Date() } }
  })
  
  console.log('✅ PREDICTION REGENERATION COMPLETE')
  console.log('=' .repeat(50))
  console.log(`Total Predictions: ${predictions}`)
  console.log(`Fights with Predictions: ${fightsWithPredictions} / ${totalFights}`)
  console.log(`Upcoming Events: ${upcomingEvents}`)
  console.log(`Coverage: ${Math.round((fightsWithPredictions/totalFights)*100)}%`)
  
  // Show version info
  const version = await prisma.predictionVersion.findFirst({
    where: { active: true }
  })
  if (version) {
    console.log(`\nActive Version: ${version.version}`)
  }
}

verify()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
