#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client')

async function testDatabaseConnection() {
  const prisma = new PrismaClient()

  try {
    console.log('Testing database connection...')

    // Test basic connectivity
    await prisma.$connect()
    console.log('✅ Database connected successfully')

    // Check existing data
    const eventCount = await prisma.event.count()
    const fighterCount = await prisma.fighter.count()
    const fightCount = await prisma.fight.count()

    console.log(`📊 Current database state:`)
    console.log(`   Events: ${eventCount}`)
    console.log(`   Fighters: ${fighterCount}`)
    console.log(`   Fights: ${fightCount}`)

    // Create a test event if none exist
    if (eventCount === 0) {
      console.log('Creating test data...')

      const testEvent = await prisma.event.create({
        data: {
          name: 'UFC Test Event',
          date: new Date(),
          location: 'Test Location',
          venue: 'Test Venue'
        }
      })

      console.log(`✅ Created test event: ${testEvent.name}`)
    }

    console.log('✅ Database test completed successfully')

  } catch (error) {
    console.error('❌ Database test failed:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  testDatabaseConnection()
}