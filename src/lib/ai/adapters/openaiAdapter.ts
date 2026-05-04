import OpenAI from 'openai'

import type { LLMAdapter, LLMCallArgs, LLMCallResult } from './llmAdapter'

const PRICING_PER_MILLION_TOKENS = {
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-5.5': { input: 5.0, output: 30.0 },
  'gpt-5.5-pro': { input: 30.0, output: 180.0 },
} as const

export type OpenAIModel = keyof typeof PRICING_PER_MILLION_TOKENS

/** Models that reject custom `temperature` and require the API default (1). */
const MODELS_REQUIRING_DEFAULT_TEMPERATURE: ReadonlySet<OpenAIModel> = new Set([
  'gpt-5.5',
  'gpt-5.5-pro',
])

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'

export interface OpenAIAdapterOptions {
  apiKey?: string
  model?: OpenAIModel
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  /** Only honoured by reasoning-class models (gpt-5.5/-pro). Omit for others. */
  reasoningEffort?: ReasoningEffort
}

export class OpenAIAdapter implements LLMAdapter {
  private readonly client: OpenAI
  private readonly model: OpenAIModel
  private readonly temperature: number
  private readonly maxTokens: number
  private readonly reasoningEffort?: ReasoningEffort

  constructor(opts: OpenAIAdapterOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY required')
    this.client = new OpenAI({ apiKey, timeout: opts.timeoutMs ?? 60_000 })
    this.model = opts.model ?? 'gpt-4o'
    this.temperature = opts.temperature ?? 0.4
    this.maxTokens = opts.maxTokens ?? 2000
    this.reasoningEffort = opts.reasoningEffort
  }

  async call({ prompt, output }: LLMCallArgs): Promise<LLMCallResult> {
    const supportsCustomTemperature = !MODELS_REQUIRING_DEFAULT_TEMPERATURE.has(this.model)
    const completion = await this.client.chat.completions.create({
      model: this.model,
      max_completion_tokens: this.maxTokens,
      ...(supportsCustomTemperature ? { temperature: this.temperature } : {}),
      ...(this.reasoningEffort ? { reasoning_effort: this.reasoningEffort } : {}),
      messages: [{ role: 'user', content: prompt }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: output.name,
          strict: true,
          schema: output.schema,
        },
      },
    })

    const text = completion.choices[0]?.message?.content
    if (!text) throw new Error('Empty response from OpenAI')

    const parsed: unknown = JSON.parse(text)
    const inputTokens = completion.usage?.prompt_tokens ?? 0
    const outputTokens = completion.usage?.completion_tokens ?? 0
    const pricing = PRICING_PER_MILLION_TOKENS[this.model]

    return {
      output: parsed,
      tokensUsed: inputTokens + outputTokens,
      costUsd:
        (inputTokens / 1_000_000) * pricing.input +
        (outputTokens / 1_000_000) * pricing.output,
      modelUsed: this.model,
    }
  }
}
