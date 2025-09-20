#!/usr/bin/env node

// Test scraper without AI predictions - data collection only
require('ts-node/register')

const { HybridUFCService } = require('../src/lib/ai/hybridUFCService.ts')
const { PrismaClient } = require('@prisma/client')

class DataOnlyScraper {
  constructor() {
    this.prisma = new PrismaClient()
    // Create service without AI capabilities (no OpenAI needed)
    this.ufcService = new HybridUFCService(false) // false = disable AI predictions
  }

  async testDataCollection() {
    console.log('🔍 Testing UFC data scraping (no AI predictions)...')

    try {
      // This method only scrapes data, doesn't call OpenAI
      const scrapedData = await this.ufcService.getUpcomingUFCEvents(5)

      console.log(`✅ Scraped ${scrapedData.events.length} events`)
      console.log(`✅ Found ${scrapedData.fighters.length} fighters`)

      // Show event details
      scrapedData.events.forEach((event, index) => {
        console.log(`\n📅 Event ${index + 1}: ${event.name}`)
        console.log(`   📍 ${event.location} - ${event.venue}`)
        console.log(`   📊 ${event.fightCard.length} fights`)

        // Show first few fights
        event.fightCard.slice(0, 3).forEach((fight, fightIndex) => {
          console.log(`   🥊 ${fight.fighter1Name} vs ${fight.fighter2Name} (${fight.weightClass})`)
        })

        if (event.fightCard.length > 3) {
          console.log(`   ... and ${event.fightCard.length - 3} more fights`)
        }
      })

      return scrapedData

    } catch (error) {
      console.error('❌ Scraping failed:', error.message)
      return null
    }
  }

  async saveToDatabase(scrapedData) {
    if (!scrapedData) return

    console.log('\n💾 Saving to database...')

    try {
      // Save fighters first
      for (const fighter of scrapedData.fighters) {
        // Map interface to database schema
        const fighterData = {
          id: fighter.id,
          name: fighter.name,
          nickname: fighter.nickname,
          wins: fighter.wins,
          losses: fighter.losses,
          draws: fighter.draws,
          weightClass: fighter.weightClass,
          record: fighter.record,
          height: fighter.height,
          reach: fighter.reach,
          age: fighter.age,
          nationality: fighter.nationality,
          fightingStyles: JSON.stringify([fighter.fightingStyle]) // Convert to JSON array for DB
        }

        await this.prisma.fighter.upsert({
          where: { id: fighter.id },
          update: fighterData,
          create: fighterData
        })
      }

      // Save events and fights
      for (const event of scrapedData.events) {
        const savedEvent = await this.prisma.event.upsert({
          where: { id: event.id },
          update: {
            name: event.name,
            date: new Date(event.date),
            location: event.location,
            venue: event.venue
          },
          create: {
            id: event.id,
            name: event.name,
            date: new Date(event.date),
            location: event.location,
            venue: event.venue
          }
        })

        // Save fights
        for (const fight of event.fightCard) {
          await this.prisma.fight.upsert({
            where: { id: fight.id },
            update: {
              fighter1Id: fight.fighter1Id,
              fighter2Id: fight.fighter2Id,
              eventId: savedEvent.id,
              weightClass: fight.weightClass,
              titleFight: fight.titleFight || false,
              mainEvent: fight.mainEvent || false,
              cardPosition: fight.cardPosition,
              scheduledRounds: fight.scheduledRounds,
              fightNumber: fight.fightNumber
            },
            create: {
              id: fight.id,
              fighter1Id: fight.fighter1Id,
              fighter2Id: fight.fighter2Id,
              eventId: savedEvent.id,
              weightClass: fight.weightClass,
              titleFight: fight.titleFight || false,
              mainEvent: fight.mainEvent || false,
              cardPosition: fight.cardPosition,
              scheduledRounds: fight.scheduledRounds,
              fightNumber: fight.fightNumber
            }
          })
        }
      }

      console.log('✅ Data saved to database successfully!')

    } catch (error) {
      console.error('❌ Database save failed:', error.message)
    }
  }

  async disconnect() {
    await this.prisma.$disconnect()
  }
}

async function main() {
  const scraper = new DataOnlyScraper()

  try {
    const data = await scraper.testDataCollection()
    if (data) {
      await scraper.saveToDatabase(data)
    }
  } finally {
    await scraper.disconnect()
  }
}

main().catch(console.error)