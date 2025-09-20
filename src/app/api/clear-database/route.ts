// Clear Database API - Remove all collected events
import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    console.log('🗑️ Clearing all database events and fighters...')

    // Delete in correct order due to foreign key constraints
    await prisma.fight.deleteMany()
    console.log('✅ Deleted all fights')

    await prisma.fighter.deleteMany()
    console.log('✅ Deleted all fighters')

    await prisma.event.deleteMany()
    console.log('✅ Deleted all events')

    return NextResponse.json({
      success: true,
      message: 'Database cleared successfully',
      data: {
        events: 0,
        fighters: 0,
        fights: 0
      }
    })

  } catch (error) {
    console.error('❌ Error clearing database:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to clear database',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}