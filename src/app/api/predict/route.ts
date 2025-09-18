// API route for fight predictions
import { NextRequest, NextResponse } from 'next/server'
import { FunFightPredictor } from '@/lib/ai/funPredictor'
import { Fighter, Fight } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const { fighter1, fighter2, fight } = await request.json()

    if (!fighter1 || !fighter2) {
      return NextResponse.json(
        { success: false, error: 'Both fighters are required' },
        { status: 400 }
      )
    }

    const predictor = new FunFightPredictor()
    const prediction = await predictor.predictFightFun(
      fighter1 as Fighter,
      fighter2 as Fighter,
      fight as Fight
    )

    return NextResponse.json({
      success: true,
      data: {
        funScore: prediction.score,
        factors: prediction.factors,
        aiDescription: prediction.description,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('Error predicting fight fun:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to predict fight entertainment value',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// GET endpoint for testing prediction with mock data
export async function GET(request: NextRequest) {
  try {
    // Mock fighters for testing
    const mockFighter1: Fighter = {
      id: 'test-1',
      name: 'Jon Jones',
      nickname: 'Bones',
      record: { wins: 27, losses: 1, draws: 0 },
      stats: {
        finishRate: 65,
        koPercentage: 30,
        submissionPercentage: 35,
        averageFightTime: 1200,
        significantStrikesPerMinute: 4.2,
        takedownAccuracy: 45
      },
      popularity: {
        socialFollowers: 5000000,
        recentBuzzScore: 85,
        fanFavorite: true
      },
      funScore: 78,
      weightClass: 'heavyweight',
      fighting_style: ['grappling', 'striking']
    }

    const mockFighter2: Fighter = {
      id: 'test-2',
      name: 'Stipe Miocic',
      nickname: 'The Firefighter',
      record: { wins: 20, losses: 4, draws: 0 },
      stats: {
        finishRate: 70,
        koPercentage: 50,
        submissionPercentage: 20,
        averageFightTime: 900,
        significantStrikesPerMinute: 3.8,
        takedownAccuracy: 35
      },
      popularity: {
        socialFollowers: 2000000,
        recentBuzzScore: 75,
        fanFavorite: true
      },
      funScore: 72,
      weightClass: 'heavyweight',
      fighting_style: ['striking', 'boxing']
    }

    const mockFight: Fight = {
      id: 'test-fight',
      fighter1: mockFighter1,
      fighter2: mockFighter2,
      weightClass: 'heavyweight',
      titleFight: true,
      mainEvent: true,
      event: {
        id: 'test-event',
        name: 'UFC 309: Test Event',
        date: new Date(),
        location: 'Las Vegas, Nevada',
        venue: 'T-Mobile Arena',
        fightCard: [],
        mainCard: [],
        prelimCard: [],
        earlyPrelimCard: []
      },
      predictedFunScore: 0,
      funFactors: [],
      aiDescription: '',
      bookingDate: new Date(),
      completed: false
    }

    const predictor = new FunFightPredictor()
    const prediction = await predictor.predictFightFun(mockFighter1, mockFighter2, mockFight)

    return NextResponse.json({
      success: true,
      data: {
        fighter1: mockFighter1.name,
        fighter2: mockFighter2.name,
        funScore: prediction.score,
        factors: prediction.factors,
        aiDescription: prediction.description,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('Error in test prediction:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate test prediction',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}