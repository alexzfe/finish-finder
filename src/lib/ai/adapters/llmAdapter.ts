export interface StructuredOutputSchema {
  /** Name surfaced to the LLM (OpenAI structured outputs / Anthropic tool use). */
  name: string
  /** Tool description (Anthropic tool use). Ignored by adapters that don't need it. */
  description: string
  /** JSON Schema object describing the expected output. */
  schema: Record<string, unknown>
}

export interface LLMCallArgs {
  prompt: string
  output: StructuredOutputSchema
}

export interface LLMCallResult {
  /** Parsed JSON the LLM produced. The caller is responsible for validating shape. */
  output: unknown
  tokensUsed: number
  costUsd: number
  modelUsed: string
}

export interface LLMAdapter {
  call(args: LLMCallArgs): Promise<LLMCallResult>
}
