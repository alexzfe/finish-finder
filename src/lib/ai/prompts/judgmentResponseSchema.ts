import type { StructuredOutputSchema } from '../adapters/llmAdapter'

export const JUDGMENT_RESPONSE_SCHEMA: StructuredOutputSchema = {
  name: 'fight_judgment',
  description:
    'Generate fight analysis with deterministic attributes and AI fun-score judgment.',
  schema: {
    type: 'object',
    properties: {
      reasoning: {
        type: 'object',
        properties: {
          vulnerabilityAnalysis: { type: 'string' },
          offenseAnalysis: { type: 'string' },
          styleMatchup: { type: 'string' },
          entertainmentJudgment: { type: 'string' },
        },
        required: [
          'vulnerabilityAnalysis',
          'offenseAnalysis',
          'styleMatchup',
          'entertainmentJudgment',
        ],
        additionalProperties: false,
      },
      finishAnalysis: { type: 'string' },
      funAnalysis: { type: 'string' },
      narrative: { type: 'string' },
      attributes: {
        type: 'object',
        properties: {
          pace: { type: 'integer' },
          finishDanger: { type: 'integer' },
          technicality: { type: 'integer' },
          styleClash: {
            type: 'string',
            enum: ['Complementary', 'Neutral', 'Canceling'],
          },
          brawlPotential: { type: 'boolean' },
          groundBattleLikely: { type: 'boolean' },
        },
        required: [
          'pace',
          'finishDanger',
          'technicality',
          'styleClash',
          'brawlPotential',
          'groundBattleLikely',
        ],
        additionalProperties: false,
      },
      funScore: { type: 'integer' },
      keyFactors: {
        type: 'array',
        items: { type: 'string' },
      },
      confidence: { type: 'number' },
    },
    required: [
      'reasoning',
      'finishAnalysis',
      'funAnalysis',
      'narrative',
      'attributes',
      'funScore',
      'keyFactors',
      'confidence',
    ],
    additionalProperties: false,
  },
}
