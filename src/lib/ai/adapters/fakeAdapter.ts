import type { LLMAdapter, LLMCallArgs, LLMCallResult } from './llmAdapter'

export type FakeResponder = (args: LLMCallArgs) => unknown

export interface FakeAdapterOptions {
  responder?: FakeResponder
  modelName?: string
  tokensUsed?: number
  costUsd?: number
}

/**
 * In-memory adapter for tests. Default responder echoes the schema name; pass
 * `responder` to assert on prompt content or return scripted outputs.
 */
export class FakeAdapter implements LLMAdapter {
  readonly calls: LLMCallArgs[] = []

  constructor(private readonly opts: FakeAdapterOptions = {}) {}

  async call(args: LLMCallArgs): Promise<LLMCallResult> {
    this.calls.push(args)
    const responder = this.opts.responder ?? (() => ({ schemaName: args.output.name }))
    return {
      output: responder(args),
      tokensUsed: this.opts.tokensUsed ?? 0,
      costUsd: this.opts.costUsd ?? 0,
      modelUsed: this.opts.modelName ?? 'fake',
    }
  }
}
