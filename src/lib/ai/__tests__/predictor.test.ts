import { describe, expect, it } from 'vitest'

import { FakeAdapter } from '../adapters/fakeAdapter'
import { Predictor } from '../predictor'

import type { FightSnapshot } from '../snapshot'
import type { JudgmentPredictionOutput } from '../prompts/hybridJudgmentPrompt'

const baseOutput: JudgmentPredictionOutput = {
  reasoning: {
    vulnerabilityAnalysis: 'v',
    offenseAnalysis: 'o',
    styleMatchup: 's',
    entertainmentJudgment: 'e',
  },
  finishAnalysis: 'fa',
  funAnalysis: 'fua',
  narrative: 'n',
  attributes: {
    pace: 3,
    finishDanger: 3,
    technicality: 3,
    styleClash: 'Neutral',
    brawlPotential: false,
    groundBattleLikely: false,
  },
  funScore: 60,
  keyFactors: ['power', 'pace'],
  confidence: 0.8,
}

const baseSnapshot: FightSnapshot = {
  fighter1: {
    name: 'Alpha',
    record: '10-2-0',
    significantStrikesAbsorbedPerMinute: 3,
    strikingDefensePercentage: 0.5,
    takedownDefensePercentage: 0.7,
    lossFinishRate: 0.5,
    koLossPercentage: 0.5,
    submissionLossPercentage: 0,
    finishRate: 0.6,
    koPercentage: 0.4,
    submissionPercentage: 0.2,
    significantStrikesLandedPerMinute: 4.5,
    submissionAverage: 0.5,
    takedownAverage: 1.0,
    averageFightTimeSeconds: 600,
    winsByDecision: 4,
    totalWins: 10,
    primaryStyle: 'striker',
  },
  fighter2: {
    name: 'Bravo',
    record: '8-3-0',
    significantStrikesAbsorbedPerMinute: 4,
    strikingDefensePercentage: 0.45,
    takedownDefensePercentage: 0.5,
    lossFinishRate: 0.6,
    koLossPercentage: 0.6,
    submissionLossPercentage: 0,
    finishRate: 0.5,
    koPercentage: 0.3,
    submissionPercentage: 0.2,
    significantStrikesLandedPerMinute: 3.5,
    submissionAverage: 0.7,
    takedownAverage: 0.8,
    averageFightTimeSeconds: 720,
    winsByDecision: 3,
    totalWins: 8,
    primaryStyle: 'balanced',
  },
  context: {
    eventName: 'UFC 999',
    weightClass: 'Lightweight',
    titleFight: false,
    mainEvent: false,
  },
}

describe('Predictor', () => {
  it('runs the full pipeline with a FakeAdapter and returns a Prediction', async () => {
    const adapter = new FakeAdapter({
      responder: () => baseOutput,
      modelName: 'fake-model-1',
      tokensUsed: 1234,
      costUsd: 0.0042,
    })
    const predictor = new Predictor(adapter)
    const prediction = await predictor.predict(baseSnapshot)

    expect(prediction.modelUsed).toBe('fake-model-1')
    expect(prediction.tokensUsed).toBe(1234)
    expect(prediction.costUsd).toBe(0.0042)
    expect(prediction.funScore).toBe(60)
    expect(prediction.output).toBe(baseOutput)
  })

  it('computes finishProbability deterministically from the LLM attributes + weight class', async () => {
    const adapter = new FakeAdapter({
      responder: () => ({
        ...baseOutput,
        attributes: { ...baseOutput.attributes, finishDanger: 5, styleClash: 'Complementary' },
      }),
    })
    const predictor = new Predictor(adapter)
    const prediction = await predictor.predict({
      ...baseSnapshot,
      context: { ...baseSnapshot.context, weightClass: 'Heavyweight' },
    })

    // Heavyweight baseline 0.70, danger=5 → multiplier 1.2, complementary → 1.15
    // 0.70 * 1.2 * 1.15 = 0.966 → clamped to 0.85
    expect(prediction.finishProbability).toBe(0.85)
  })

  it('forwards prompt + JUDGMENT_RESPONSE_SCHEMA to the adapter on each call', async () => {
    const adapter = new FakeAdapter({ responder: () => baseOutput })
    const predictor = new Predictor(adapter)
    await predictor.predict(baseSnapshot)

    expect(adapter.calls).toHaveLength(1)
    expect(adapter.calls[0].prompt).toContain('Alpha')
    expect(adapter.calls[0].prompt).toContain('Bravo')
    expect(adapter.calls[0].output.name).toBe('fight_judgment')
  })

  it('clamps the funScore into [0, 100] when the LLM returns out-of-range values', async () => {
    const high = new FakeAdapter({ responder: () => ({ ...baseOutput, funScore: 150 }) })
    const low = new FakeAdapter({ responder: () => ({ ...baseOutput, funScore: -20 }) })

    expect((await new Predictor(high).predict(baseSnapshot)).funScore).toBe(100)
    expect((await new Predictor(low).predict(baseSnapshot)).funScore).toBe(0)
  })

  it('applies the inconsistency penalty when high pace+finishDanger pair with a lowFun score', async () => {
    const inconsistent = new FakeAdapter({
      responder: () => ({
        ...baseOutput,
        attributes: { ...baseOutput.attributes, pace: 5, finishDanger: 5 },
        funScore: 30,
        confidence: 0.9,
      }),
    })
    const consistent = new FakeAdapter({
      responder: () => ({
        ...baseOutput,
        attributes: { ...baseOutput.attributes, pace: 5, finishDanger: 5 },
        funScore: 80,
        confidence: 0.9,
      }),
    })

    const inconsistentPrediction = await new Predictor(inconsistent).predict(baseSnapshot)
    const consistentPrediction = await new Predictor(consistent).predict(baseSnapshot)

    expect(inconsistentPrediction.finishConfidence).toBeCloseTo(0.81, 5)
    expect(consistentPrediction.finishConfidence).toBeCloseTo(0.9, 5)
  })

  it('clamps confidence into [0.3, 1.0]', async () => {
    const tinyConfidence = new FakeAdapter({
      responder: () => ({ ...baseOutput, confidence: 0.05 }),
    })
    const overConfidence = new FakeAdapter({
      responder: () => ({ ...baseOutput, confidence: 2.0 }),
    })

    expect((await new Predictor(tinyConfidence).predict(baseSnapshot)).finishConfidence).toBe(0.3)
    expect((await new Predictor(overConfidence).predict(baseSnapshot)).finishConfidence).toBe(1.0)
  })
})
