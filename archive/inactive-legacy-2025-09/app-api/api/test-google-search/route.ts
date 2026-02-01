// Test OpenAI Web Search capability for the hybrid data collector
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function GET(_request: NextRequest) {
  try {
    console.log('🧪 Testing OpenAI web search capability...')

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        success: false,
        configured: false,
        message: 'OPENAI_API_KEY is not configured. Set it in your .env file to enable web search.',
        instructions: [
          '1. Create an OpenAI API key at https://platform.openai.com/.' ,
          '2. Add OPENAI_API_KEY to your .env file.',
          '3. (Optional) Set OPENAI_WEB_SEARCH_MODEL to override the default gpt-4.1-mini.',
          '4. Restart the dev server after updating environment variables.'
        ],
        environment: {
          openAiApiKey: 'Not set',
          openAiWebSearchModel: process.env.OPENAI_WEB_SEARCH_MODEL || 'gpt-4.1-mini (default)'
        }
      })
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })

    const model = process.env.OPENAI_WEB_SEARCH_MODEL || 'gpt-4.1-mini'

    try {
      const response = await openai.responses.create({
        model,
        input: [
          {
            role: 'system',
            content: 'You are a tester verifying web search access. Return compact JSON with keys status, sampleEvent, and searchNotes.'
          },
          {
            role: 'user',
            content: 'Use web search to find one upcoming official UFC event and respond with JSON: {"status":"ok","sampleEvent":"Event name and date","searchNotes":"Short comment with source"}. If nothing is found, use {"status":"no-data"}.'
          }
        ],
        tools: [{ type: 'web_search' }],
        temperature: 0,
        max_output_tokens: 400
      })

      const rawOutput = (response as { output_text?: string }).output_text?.trim()
      if (!rawOutput) {
        throw new Error('No output received from OpenAI response')
      }

      const parsed = safeParse(rawOutput)

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Failed to parse JSON from OpenAI response')
      }

      return NextResponse.json({
        success: true,
        configured: true,
        message: 'OpenAI web search is available',
        sample: parsed,
        model
      })

    } catch (error) {
      console.error('❌ OpenAI web search test failed:', error)
      return NextResponse.json({
        success: false,
        configured: true,
        message: 'OpenAI web search call failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }

  } catch (error) {
    console.error('❌ Error testing OpenAI web search:', error)
    return NextResponse.json({
      success: false,
      error: 'Test endpoint error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

function safeParse(raw: string): unknown {
  const cleaned = raw.replace(/```json\s?/g, '').replace(/```/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch (error) {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch (innerError) {
        console.error('❌ Failed to parse fallback JSON from OpenAI test response', innerError)
      }
    }
    console.error('❌ Failed to parse JSON from OpenAI test response', error)
    return null
  }
}
