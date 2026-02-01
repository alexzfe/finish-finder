import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 DEBUG: Testing raw OpenAI API...')

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })

    const currentDate = new Date().toISOString().split('T')[0]
    console.log('📅 Current date:', currentDate)

    const prompt = `You are a UFC data specialist. Provide the next 3 upcoming UFC events as of ${currentDate} with complete, accurate information.

CRITICAL REQUIREMENTS:
1. Use REAL upcoming UFC events only (no fictional events)
2. Include REAL UFC fighters currently on the roster
3. Today's date is ${currentDate}
4. Focus on events in the next 60 days

Format response as JSON with this EXACT structure:

{
  "events": [
    {
      "id": "ufc-xxx-event-slug",
      "name": "UFC XXX: Fighter vs Fighter",
      "date": "2025-MM-DD",
      "location": "City, State/Country",
      "venue": "Arena Name"
    }
  ]
}

Focus on events within the next 60 days. Prioritize actual scheduled UFC events.`

    console.log('📋 Sending prompt to OpenAI...')
    console.log('Prompt:', prompt.substring(0, 200) + '...')

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a UFC expert with access to current fight schedules and real event information. Always provide accurate, real UFC data."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 1500,
    })

    const rawResponse = completion.choices[0]?.message?.content
    console.log('📥 Raw OpenAI response:')
    console.log(rawResponse)

    if (!rawResponse) {
      throw new Error('No response from OpenAI')
    }

    // Clean and parse the response
    const cleanResponse = rawResponse.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim()
    console.log('🧹 Cleaned response:')
    console.log(cleanResponse)

    let parsedData
    try {
      parsedData = JSON.parse(cleanResponse)
      console.log('✅ Successfully parsed JSON')
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError)
      throw new Error(`Failed to parse JSON: ${parseError}`)
    }

    return NextResponse.json({
      success: true,
      message: 'Raw OpenAI response captured',
      data: {
        currentDate,
        rawResponse: rawResponse.substring(0, 500) + '...',
        cleanedResponse: cleanResponse.substring(0, 500) + '...',
        parsedEvents: parsedData.events?.length || 0,
        firstEvent: parsedData.events?.[0] || null
      }
    })

  } catch (error) {
    console.error('🚨 Debug OpenAI error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : 'No stack trace'
    }, { status: 500 })
  }
}