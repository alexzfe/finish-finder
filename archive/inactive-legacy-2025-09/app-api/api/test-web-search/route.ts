import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(request: NextRequest) {
  try {
    console.log('🌐 Testing OpenAI with web search function...')

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })

    // Define a function for web search
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "search_web",
          description: "Search the web for current UFC events and schedules",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query for UFC events"
              }
            },
            required: ["query"]
          }
        }
      }
    ]

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a UFC expert. Use the web search function to find current UFC events for September and October 2025."
        },
        {
          role: "user",
          content: "What are the real upcoming UFC events in September and October 2025? Use web search to find current information."
        }
      ],
      tools: tools,
      tool_choice: "auto",
      temperature: 0.1,
      max_tokens: 1000,
    })

    const response = completion.choices[0]?.message
    console.log('📥 OpenAI response with function calling:')
    console.log(JSON.stringify(response, null, 2))

    // Check if OpenAI wants to call the search function
    if (response?.tool_calls) {
      console.log('🔍 OpenAI requested web search:', response.tool_calls[0].function.arguments)

      // Here we would actually perform the web search
      // For now, just return what OpenAI requested
      return NextResponse.json({
        success: true,
        message: 'OpenAI requested web search',
        data: {
          functionCalled: response.tool_calls[0].function.name,
          searchQuery: JSON.parse(response.tool_calls[0].function.arguments).query,
          note: "Web search function would be called here"
        }
      })
    }

    return NextResponse.json({
      success: true,
      message: 'OpenAI response without web search',
      data: {
        response: response?.content,
        note: "No web search function was called"
      }
    })

  } catch (error) {
    console.error('🚨 Web search test error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}