/**
 * Train Platt Scaling from DSPy Evaluation Data
 *
 * Loads historical predictions from DSPy eval files and fits
 * Platt scaling parameters to calibrate finish probabilities.
 *
 * Uses log-odds transformation since inputs are already probabilities.
 */

import * as fs from 'fs'
import * as path from 'path'
import { PrismaClient } from '@prisma/client'
import {
  calculateCalibrationMetrics,
  type PlattParams,
} from '../src/lib/ai/calibration/plattScaling'

const prisma = new PrismaClient()

interface DSPyEvalEntry {
  fighter1_context: string
  fighter2_context: string
  weight_class: string
  predicted_finish_prob: number
  predicted_fun_score: number
  actual_finish: number  // 1 = finish, 0 = decision
  actual_method: string
}

async function loadDSPyData(): Promise<DSPyEvalEntry[]> {
  const dataDir = path.join(__dirname, '../data/dspy/monthly')
  const allData: DSPyEvalEntry[] = []

  // Load all monthly eval files
  const files = fs.readdirSync(dataDir)
    .filter(f => f.match(/^2024-\d{2}_eval\.json$/))
    .sort()

  console.log(`Found ${files.length} monthly eval files`)

  for (const file of files) {
    const filePath = path.join(dataDir, file)
    const content = fs.readFileSync(filePath, 'utf-8')
    const data: DSPyEvalEntry[] = JSON.parse(content)
    console.log(`  ${file}: ${data.length} fights`)
    allData.push(...data)
  }

  return allData
}

/**
 * Fit Platt scaling using log-odds transformation
 *
 * For probability inputs, we use: logit(p) = log(p / (1-p))
 * Then fit: calibrated = sigmoid(A * logit(raw) + B)
 *
 * This is more stable than fitting directly on probabilities.
 */
function fitPlattScalingLogOdds(
  data: Array<{ rawProbability: number; actualOutcome: boolean }>
): PlattParams {
  // Clamp probabilities to avoid log(0)
  const clamp = (p: number) => Math.max(0.01, Math.min(0.99, p))
  const logit = (p: number) => Math.log(clamp(p) / (1 - clamp(p)))
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

  // Convert to log-odds space
  const X = data.map(d => logit(d.rawProbability))
  const Y = data.map(d => d.actualOutcome ? 1 : 0)

  // Fit logistic regression via gradient descent
  let a = 1.0  // Start with identity-ish transform
  let b = 0.0

  const learningRate = 0.01
  const maxIterations = 5000
  const tolerance = 1e-8

  for (let iter = 0; iter < maxIterations; iter++) {
    let gradA = 0
    let gradB = 0

    for (let i = 0; i < X.length; i++) {
      const pred = sigmoid(a * X[i] + b)
      const error = pred - Y[i]
      gradA += error * X[i]
      gradB += error
    }

    gradA /= X.length
    gradB /= X.length

    const newA = a - learningRate * gradA
    const newB = b - learningRate * gradB

    if (Math.abs(newA - a) < tolerance && Math.abs(newB - b) < tolerance) {
      console.log(`  Converged at iteration ${iter}`)
      break
    }

    a = newA
    b = newB
  }

  return { a, b }
}

/**
 * Apply Platt scaling with log-odds transformation
 */
function applyPlattScalingLogOdds(rawProbability: number, params: PlattParams): number {
  const clamp = (p: number) => Math.max(0.01, Math.min(0.99, p))
  const logit = (p: number) => Math.log(clamp(p) / (1 - clamp(p)))
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

  const logOdds = logit(rawProbability)
  const calibrated = sigmoid(params.a * logOdds + params.b)

  return Math.max(0.01, Math.min(0.99, calibrated))
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('PLATT SCALING TRAINING FROM DSPY DATA')
  console.log('═══════════════════════════════════════════════════════════════════\n')

  // Load DSPy evaluation data
  console.log('Loading DSPy evaluation data...\n')
  const dspyData = await loadDSPyData()
  console.log(`\nTotal fights loaded: ${dspyData.length}\n`)

  // Convert to training format
  const trainingData = dspyData.map(d => ({
    rawProbability: d.predicted_finish_prob,
    actualOutcome: d.actual_finish === 1,
  }))

  // Calculate base rate
  const finishCount = trainingData.filter(d => d.actualOutcome).length
  const baseRate = finishCount / trainingData.length
  console.log(`Base finish rate: ${(baseRate * 100).toFixed(1)}% (${finishCount}/${trainingData.length})\n`)

  // Analyze prediction distribution
  console.log('PREDICTION DISTRIBUTION:')
  const bins = [0, 0, 0, 0, 0]  // 0-20, 20-40, 40-60, 60-80, 80-100
  const binFinishes = [0, 0, 0, 0, 0]
  for (const d of trainingData) {
    const binIdx = Math.min(Math.floor(d.rawProbability * 5), 4)
    bins[binIdx]++
    if (d.actualOutcome) binFinishes[binIdx]++
  }
  console.log('  Bin      | Count | Actual Finish Rate')
  console.log('  ---------|-------|-------------------')
  for (let i = 0; i < 5; i++) {
    const rate = bins[i] > 0 ? (binFinishes[i] / bins[i] * 100).toFixed(1) : '0.0'
    console.log(`  ${i*20}-${(i+1)*20}%    | ${String(bins[i]).padStart(5)} | ${rate}%`)
  }

  // Calculate metrics BEFORE calibration
  console.log('\nCalculating metrics before calibration...')
  const metricsBefore = calculateCalibrationMetrics(
    trainingData.map(d => ({
      predicted: d.rawProbability,
      actual: d.actualOutcome,
    }))
  )

  console.log('\nMETRICS BEFORE CALIBRATION:')
  console.log(`  Brier Score: ${metricsBefore.brierScore.toFixed(4)} (lower is better, target < 0.25)`)
  console.log(`  ECE (Expected Calibration Error): ${metricsBefore.ece.toFixed(4)}`)
  console.log(`  MCE (Maximum Calibration Error): ${metricsBefore.mce.toFixed(4)}`)
  console.log(`  Accuracy (at 0.5 threshold): ${(metricsBefore.accuracy * 100).toFixed(1)}%`)

  // Fit Platt scaling with log-odds transformation
  console.log('\nFitting Platt scaling (log-odds transformation)...')
  const params = fitPlattScalingLogOdds(trainingData)

  console.log(`\nPLATT PARAMETERS (log-odds space):`)
  console.log(`  A (slope): ${params.a.toFixed(6)}`)
  console.log(`  B (intercept): ${params.b.toFixed(6)}`)
  console.log(`  Formula: calibrated = sigmoid(${params.a.toFixed(4)} * logit(raw) + ${params.b.toFixed(4)})`)

  // Calculate metrics AFTER calibration
  console.log('\nCalculating metrics after calibration...')
  const metricsAfter = calculateCalibrationMetrics(
    trainingData.map(d => ({
      predicted: applyPlattScalingLogOdds(d.rawProbability, params),
      actual: d.actualOutcome,
    }))
  )

  console.log('\nMETRICS AFTER CALIBRATION:')
  console.log(`  Brier Score: ${metricsAfter.brierScore.toFixed(4)} (was ${metricsBefore.brierScore.toFixed(4)})`)
  console.log(`  ECE: ${metricsAfter.ece.toFixed(4)} (was ${metricsBefore.ece.toFixed(4)})`)
  console.log(`  MCE: ${metricsAfter.mce.toFixed(4)} (was ${metricsBefore.mce.toFixed(4)})`)
  console.log(`  Accuracy: ${(metricsAfter.accuracy * 100).toFixed(1)}% (was ${(metricsBefore.accuracy * 100).toFixed(1)}%)`)

  // Show improvement
  const brierImprovement = ((metricsBefore.brierScore - metricsAfter.brierScore) / metricsBefore.brierScore) * 100
  const eceImprovement = ((metricsBefore.ece - metricsAfter.ece) / metricsBefore.ece) * 100

  console.log('\nIMPROVEMENT:')
  console.log(`  Brier Score: ${brierImprovement > 0 ? '+' : ''}${brierImprovement.toFixed(1)}%`)
  console.log(`  ECE: ${eceImprovement > 0 ? '+' : ''}${eceImprovement.toFixed(1)}%`)

  // Show example transformations
  console.log('\nEXAMPLE TRANSFORMATIONS:')
  const testProbs = [0.25, 0.35, 0.50, 0.65, 0.75, 0.85]
  for (const p of testProbs) {
    const calibrated = applyPlattScalingLogOdds(p, params)
    console.log(`  ${(p * 100).toFixed(0)}% raw → ${(calibrated * 100).toFixed(1)}% calibrated`)
  }

  // Save to database
  console.log('\nSaving to database...')

  // Deactivate previous params
  await prisma.calibrationParams.updateMany({
    where: {
      predictionType: 'finish',
      active: true,
    },
    data: { active: false },
  })

  const validFrom = new Date()
  const validTo = new Date()
  validTo.setFullYear(validTo.getFullYear() + 1)  // Valid for 1 year

  // Save new params (using log-odds format)
  await prisma.calibrationParams.create({
    data: {
      predictionType: 'finish',
      paramA: params.a,
      paramB: params.b,
      trainedOn: trainingData.length,
      brierScoreAfter: metricsAfter.brierScore,
      eceScore: metricsAfter.ece,
      mceScore: metricsAfter.mce,
      active: true,
      validFrom,
      validTo,
    },
  })

  console.log('✓ Platt scaling parameters saved to calibration_params table')

  // Verify save
  const saved = await prisma.calibrationParams.findFirst({
    where: {
      predictionType: 'finish',
      active: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  if (saved) {
    console.log(`\nVERIFICATION:`)
    console.log(`  ID: ${saved.id}`)
    console.log(`  Type: ${saved.predictionType}`)
    console.log(`  A: ${saved.paramA}`)
    console.log(`  B: ${saved.paramB}`)
    console.log(`  Trained on: ${saved.trainedOn} fights`)
    console.log(`  Valid from: ${saved.validFrom.toISOString().split('T')[0]}`)
    console.log(`  Valid to: ${saved.validTo.toISOString().split('T')[0]}`)
  }

  console.log('\n═══════════════════════════════════════════════════════════════════')
  console.log('PLATT SCALING TRAINING COMPLETE')
  console.log('═══════════════════════════════════════════════════════════════════')

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
