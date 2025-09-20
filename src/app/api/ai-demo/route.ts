// AI Demo API Route - Test AI framework without requiring OpenAI key
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    console.log('🤖 Running AI demo with mock data...')

    // Mock UFC event data that simulates AI-generated content
    const mockAIResponse = {
      events: [
        {
          id: "ufc-fight-night-ulberg-vs-reyes",
          name: "UFC Fight Night: Ulberg vs. Reyes",
          date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          location: "Perth, Australia",
          venue: "RAC Arena",
          fightCard: [
            {
              id: "fight-1",
              fighter1Name: "Carlos Ulberg",
              fighter2Name: "Dominick Reyes",
              weightClass: "Light Heavyweight",
              cardPosition: "main",
              scheduledRounds: 5,
              status: "scheduled",
              finishProbability: 85,
              excitementLevel: 9,
              prediction: "Both fighters are powerful strikers with knockout ability. Ulberg's recent form and home crowd advantage make this a likely finish. Expect fireworks!"
            },
            {
              id: "fight-2",
              fighter1Name: "Jack Jenkins",
              fighter2Name: "Gavin Tucker",
              weightClass: "Featherweight",
              cardPosition: "main",
              scheduledRounds: 3,
              status: "scheduled",
              finishProbability: 70,
              excitementLevel: 8,
              prediction: "Jenkins is a submission specialist while Tucker brings striking power. Stylistic clash should create exciting exchanges."
            },
            {
              id: "fight-3",
              fighter1Name: "Jimmy Crute",
              fighter2Name: "Alonzo Menifield",
              weightClass: "Light Heavyweight",
              cardPosition: "preliminary",
              scheduledRounds: 3,
              status: "scheduled",
              finishProbability: 75,
              excitementLevel: 7,
              prediction: "Two heavy hitters who rarely go to decision. Both have knockout power and aggressive styles."
            },
            {
              id: "fight-4",
              fighter1Name: "Casey O'Neill",
              fighter2Name: "Luana Santos",
              weightClass: "Women's Flyweight",
              cardPosition: "preliminary",
              scheduledRounds: 3,
              status: "scheduled",
              finishProbability: 45,
              excitementLevel: 6,
              prediction: "Technical battle between two well-rounded fighters. O'Neill's grappling vs Santos' striking."
            },
            {
              id: "fight-5",
              fighter1Name: "Tom Nolan",
              fighter2Name: "Victor Martinez",
              weightClass: "Lightweight",
              cardPosition: "early-preliminary",
              scheduledRounds: 3,
              status: "scheduled",
              finishProbability: 60,
              excitementLevel: 7,
              prediction: "Local favorite Nolan brings crowd energy. Martinez is dangerous early - expect fast-paced action."
            }
          ]
        }
      ],
      fighters: [
        {
          id: "carlos-ulberg",
          name: "Carlos Ulberg",
          nickname: "Black Jag",
          record: "10-1-0",
          weightClass: "Light Heavyweight",
          age: 33,
          height: "6'2\"",
          reach: "82\"",
          wins: 10,
          losses: 1,
          draws: 0,
          nationality: "New Zealand",
          fightingStyle: "Striker"
        },
        {
          id: "dominick-reyes",
          name: "Dominick Reyes",
          nickname: "The Devastator",
          record: "12-4-0",
          weightClass: "Light Heavyweight",
          age: 35,
          height: "6'4\"",
          reach: "77\"",
          wins: 12,
          losses: 4,
          draws: 0,
          nationality: "USA",
          fightingStyle: "Striker"
        },
        {
          id: "jack-jenkins",
          name: "Jack Jenkins",
          nickname: "Tank",
          record: "12-3-0",
          weightClass: "Featherweight",
          age: 29,
          height: "5'8\"",
          reach: "71\"",
          wins: 12,
          losses: 3,
          draws: 0,
          nationality: "Australia",
          fightingStyle: "Grappler"
        },
        {
          id: "gavin-tucker",
          name: "Gavin Tucker",
          nickname: "",
          record: "13-4-0",
          weightClass: "Featherweight",
          age: 30,
          height: "5'11\"",
          reach: "73\"",
          wins: 13,
          losses: 4,
          draws: 0,
          nationality: "Canada",
          fightingStyle: "Well-Rounded"
        },
        {
          id: "jimmy-crute",
          name: "Jimmy Crute",
          nickname: "The Brute",
          record: "12-4-1",
          weightClass: "Light Heavyweight",
          age: 28,
          height: "6'1\"",
          reach: "76\"",
          wins: 12,
          losses: 4,
          draws: 1,
          nationality: "Australia",
          fightingStyle: "Striker"
        }
      ]
    }

    // Separate fights into card positions
    for (const event of mockAIResponse.events) {
      event.mainCard = event.fightCard.filter(f => f.cardPosition === 'main')
      event.prelimCard = event.fightCard.filter(f => f.cardPosition === 'preliminary')
      event.earlyPrelimCard = event.fightCard.filter(f => f.cardPosition === 'early-preliminary')

      // Add AI-generated IDs
      event.fightCard = event.fightCard.map(fight => ({
        ...fight,
        fighter1Id: fight.fighter1Name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        fighter2Id: fight.fighter2Name.toLowerCase().replace(/[^a-z0-9]/g, '-')
      }))
    }

    console.log('✅ Generated mock AI data successfully!')
    console.log(`📊 Event: ${mockAIResponse.events[0].name}`)
    console.log(`🥊 Fights: ${mockAIResponse.events[0].fightCard.length}`)
    console.log(`👥 Fighters: ${mockAIResponse.fighters.length}`)

    // Show predictions summary
    const predictions = mockAIResponse.events[0].fightCard.map(fight =>
      `${fight.fighter1Name} vs ${fight.fighter2Name}: ${fight.excitementLevel}/10 excitement, ${fight.finishProbability}% finish probability`
    )

    console.log('🎯 AI Predictions:')
    predictions.forEach(pred => console.log(`  • ${pred}`))

    return NextResponse.json({
      success: true,
      message: 'AI Demo completed successfully!',
      data: mockAIResponse,
      summary: {
        events: mockAIResponse.events.length,
        fighters: mockAIResponse.fighters.length,
        totalFights: mockAIResponse.events[0].fightCard.length,
        avgExcitement: Math.round(mockAIResponse.events[0].fightCard.reduce((sum, f) => sum + f.excitementLevel, 0) / mockAIResponse.events[0].fightCard.length),
        avgFinishProbability: Math.round(mockAIResponse.events[0].fightCard.reduce((sum, f) => sum + f.finishProbability, 0) / mockAIResponse.events[0].fightCard.length)
      }
    })

  } catch (error) {
    console.error('AI Demo error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'AI Demo failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'AI Demo API is ready. Use POST to run the demo.',
    info: {
      description: 'This endpoint demonstrates the AI-powered UFC prediction framework',
      features: [
        'Real UFC event structure',
        'Fight excitement ratings (1-10)',
        'Finish probability predictions (0-100%)',
        'AI-generated fight analysis',
        'Card position categorization'
      ]
    }
  })
}