import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(request: NextRequest) {
  try {
    console.log('🌐 Getting real UFC events with web search...')

    // Step 1: Search for current UFC events
    const searchResponse = await fetch('http://localhost:3000/api/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'UFC schedule September October 2025 upcoming events fights'
      })
    })

    if (!searchResponse.ok) {
      throw new Error('Web search failed')
    }

    const searchData = await searchResponse.json()
    console.log('🔍 Web search results:', searchData)

    // Step 2: Use OpenAI to analyze the search results and format them
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })

    const analysisPrompt = `Based on the following web search results about UFC events, extract and format the real upcoming UFC events for September-October 2025:

WEB SEARCH RESULTS:
${JSON.stringify(searchData, null, 2)}

Please analyze these search results and extract any real UFC events mentioned. Format the response as JSON:

{
  "events": [
    {
      "id": "event-slug",
      "name": "Event Name",
      "date": "2025-MM-DD",
      "location": "City, Country",
      "venue": "Venue Name",
      "source": "where this info came from"
    }
  ],
  "dataQuality": "real|estimated|unknown",
  "searchSummary": "summary of what was found"
}`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a data analyst. Extract real UFC event information from web search results. Be honest about data quality and sources."
        },
        {
          role: "user",
          content: analysisPrompt
        }
      ],
      temperature: 0.1,
      max_tokens: 1500,
    })

    const aiResponse = completion.choices[0]?.message?.content
    console.log('🤖 AI analysis of search results:')
    console.log(aiResponse)

    return NextResponse.json({
      success: true,
      message: 'UFC events with web search completed',
      data: {
        searchResults: searchData,
        aiAnalysis: aiResponse,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('🚨 UFC web search error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}