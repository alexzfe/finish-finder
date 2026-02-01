import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Testing for REAL current UFC events...')

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })

    const prompt = `You are a UFC insider with real-time access to the UFC's official schedule. Today is September 19, 2025.

I need the EXACT, REAL UFC events that are actually scheduled for the remainder of September 2025 and October 2025. Do not make up events.

If you know the real upcoming UFC events, provide them. If you don't have current data beyond your training cutoff, please say "I don't have current UFC schedule data beyond my training cutoff of [date]."

What real UFC events are coming up in the next 30-60 days from September 19, 2025?

Format as JSON if you have real data:
{
  "hasRealData": true/false,
  "cutoffDate": "your training cutoff date",
  "events": [...]
}`

    console.log('📋 Asking OpenAI for REAL current events...')

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an AI assistant. Be honest about your knowledge limitations. You do not have real-time data access. Your training data has a cutoff date."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 800,
    })

    const response = completion.choices[0]?.message?.content
    console.log('📥 OpenAI response about real events:')
    console.log(response)

    return NextResponse.json({
      success: true,
      message: 'Real events query completed',
      data: {
        rawResponse: response,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('🚨 Real events query error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}