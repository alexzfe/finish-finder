const { PrismaClient } = require('@prisma/client')

async function main() {
  const prisma = new PrismaClient()

  try {
    console.log('🗑️ Wiping database...')

    // Delete all data in correct order due to foreign key constraints
    try {
      await prisma.predictionUsage.deleteMany({})
      console.log('✅ Deleted all prediction usage records')
    } catch (e) {
      console.log('⚠️ Prediction usage table may not exist')
    }

    try {
      await prisma.funScoreHistory.deleteMany({})
      console.log('✅ Deleted all fun score history')
    } catch (e) {
      console.log('⚠️ Fun score history table may not exist')
    }

    await prisma.fight.deleteMany({})
    console.log('✅ Deleted all fights')

    await prisma.fighter.deleteMany({})
    console.log('✅ Deleted all fighters')

    await prisma.event.deleteMany({})
    console.log('✅ Deleted all events')

    console.log('🎉 Database wiped successfully!')

  } catch (error) {
    console.error('❌ Error wiping database:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

main()