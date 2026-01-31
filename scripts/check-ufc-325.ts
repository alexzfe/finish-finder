#!/usr/bin/env node
import { config } from 'dotenv'
import { existsSync } from 'fs'

const envPath = '.env.local'
if (existsSync(envPath)) {
  config({ path: envPath })
}

import { prisma } from '../src/lib/database/prisma'

async function check() {
  const events = await prisma.event.findMany({
    where: { 
      OR: [
        { name: { contains: '325' } },
        { name: { contains: '326' } }
      ]
    },
    include: { 
      fights: {
        where: { isCancelled: false },
        include: {
          fighter1: true,
          fighter2: true,
          predictions: true
        }
      }
    }
  })
  
  for (const event of events) {
    console.log(`\n${event.name} (${event.date.toISOString().split('T')[0]})`)
    console.log(`Location: ${event.location}`)
    console.log(`Fights: ${event.fights.length}`)
    console.log('-'.repeat(60))
    
    for (const fight of event.fights) {
      const hasPrediction = fight.predictions.length > 0
      console.log(`  ${fight.fighter1.name} vs ${fight.fighter2.name}`)
      console.log(`    Weight: ${fight.weightClass} | Title: ${fight.titleFight} | Predictions: ${hasPrediction ? '✅' : '❌'}`)
    }
  }
  
  await prisma.$disconnect()
}

check()
