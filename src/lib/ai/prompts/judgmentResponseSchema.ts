import type { StructuredOutputSchema } from '../adapters/llmAdapter'

export const JUDGMENT_RESPONSE_SCHEMA: StructuredOutputSchema = {
  name: 'fight_judgment',
  description:
    'Generate fight analysis with deterministic attributes and a 1-10 AI fun-score judgment.',
  schema: {
    type: 'object',
    properties: {
      attributes: {
        type: 'object',
        properties: {
          pace: { type: 'integer', minimum: 1, maximum: 5 },
          finishDanger: { type: 'integer', minimum: 1, maximum: 5 },
          technicality: { type: 'integer', minimum: 1, maximum: 5 },
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
      funScore: { type: 'integer', minimum: 1, maximum: 10 },
      keyFactors: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['attributes', 'funScore', 'keyFactors'],
    additionalProperties: false,
  },
}
