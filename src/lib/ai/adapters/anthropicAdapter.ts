import Anthropic from '@anthropic-ai/sdk'

import type { LLMAdapter, LLMCallArgs, LLMCallResult } from './llmAdapter'

const PRICING_PER_MILLION_TOKENS = {
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku-20241022': { input: 1.0, output: 5.0 },
} as const

export type AnthropicModel = keyof typeof PRICING_PER_MILLION_TOKENS

export interface AnthropicAdapterOptions {
  apiKey?: string
  model?: AnthropicModel
  temperature?: number
  maxTokens?: number
}

export class AnthropicAdapter implements LLMAdapter {
  private readonly client: Anthropic
  private readonly model: AnthropicModel
  private readonly temperature: number
  private readonly maxTokens: number

  constructor(opts: AnthropicAdapterOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY required')
    this.client = new Anthropic({ apiKey })
    this.model = opts.model ?? 'claude-3-5-sonnet-20241022'
    this.temperature = opts.temperature ?? 0.4
    this.maxTokens = opts.maxTokens ?? 2000
  }

  async call({ prompt, output }: LLMCallArgs): Promise<LLMCallResult> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      tools: [
        {
          name: output.name,
          description: output.description,
          input_schema: output.schema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: output.name },
      messages: [{ role: 'user', content: prompt }],
    })

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )
    if (!toolUse || toolUse.name !== output.name) {
      throw new Error(`No tool_use block for ${output.name} in Anthropic response`)
    }

    const inputTokens = message.usage.input_tokens
    const outputTokens = message.usage.output_tokens
    const pricing = PRICING_PER_MILLION_TOKENS[this.model]

    return {
      output: toolUse.input,
      tokensUsed: inputTokens + outputTokens,
      costUsd:
        (inputTokens / 1_000_000) * pricing.input +
        (outputTokens / 1_000_000) * pricing.output,
      modelUsed: this.model,
    }
  }
}
