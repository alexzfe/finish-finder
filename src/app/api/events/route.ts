// API route for UFC events
import { NextRequest, NextResponse } from 'next/server'
import { UFCScraper } from '@/lib/scraping/ufcScraper'

export async function GET(request: NextRequest) {
  try {
    const scraper = new UFCScraper()
    const events = await scraper.scrapeUpcomingEvents()

    return NextResponse.json({
      success: true,
      data: events,
      count: events.length
    })
  } catch (error) {
    console.error('Error fetching events:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch UFC events',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// POST endpoint to manually trigger data collection
export async function POST(request: NextRequest) {
  try {
    const { eventUrl } = await request.json()

    if (!eventUrl) {
      return NextResponse.json(
        { success: false, error: 'Event URL is required' },
        { status: 400 }
      )
    }

    const scraper = new UFCScraper()
    const fightCard = await scraper.scrapeFightCard(eventUrl)

    return NextResponse.json({
      success: true,
      data: fightCard,
      count: fightCard.length
    })
  } catch (error) {
    console.error('Error scraping fight card:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to scrape fight card',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}