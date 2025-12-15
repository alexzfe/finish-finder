/**
 * Platt Scaling Service - Phase 2.2
 *
 * Calibrates raw finish probabilities to be better aligned with true frequencies.
 *
 * Platt scaling fits a logistic regression to transform raw probabilities:
 *   calibrated_p = 1 / (1 + exp(A * raw_p + B))
 *
 * Where A and B are learned parameters from historical data.
 *
 * Reference: Platt, J. (1999). Probabilistic Outputs for Support Vector Machines
 */

import { prisma } from '../../database/prisma'

/**
 * Platt scaling parameters
 */
export interface PlattParams {
  a: number  // Slope parameter
  b: number  // Intercept parameter
}

/**
 * Training data point
 */
interface TrainingPoint {
  rawProbability: number
  actualOutcome: boolean  // true = finish, false = decision
}

/**
 * Apply Platt scaling to a raw probability using log-odds transformation
 *
 * Formula: calibrated = sigmoid(A * logit(raw) + B)
 * Where logit(p) = log(p / (1-p))
 *
 * This is more stable for probability inputs than the direct formula.
 *
 * @param rawProbability - Raw probability from LLM (0-1)
 * @param params - Platt scaling parameters (a, b)
 * @returns Calibrated probability (0-1)
 */
export function applyPlattScaling(
  rawProbability: number,
  params: PlattParams
): number {
  // Clamp to avoid log(0) or log(infinity)
  const clampedP = Math.max(0.01, Math.min(0.99, rawProbability))

  // Convert to log-odds
  const logOdds = Math.log(clampedP / (1 - clampedP))

  // Apply linear transformation in log-odds space, then sigmoid
  const calibrated = 1 / (1 + Math.exp(-(params.a * logOdds + params.b)))

  // Clamp to valid range
  return Math.max(0.01, Math.min(0.99, calibrated))
}

/**
 * Fit Platt scaling parameters using gradient descent on log-odds
 *
 * Uses gradient descent to find optimal A and B parameters
 * that minimize negative log-likelihood in log-odds space.
 *
 * Formula: calibrated = sigmoid(A * logit(raw) + B)
 *
 * @param trainingData - Array of (raw probability, actual outcome) pairs
 * @returns Fitted Platt parameters
 */
export function fitPlattScaling(trainingData: TrainingPoint[]): PlattParams {
  if (trainingData.length < 10) {
    throw new Error('Need at least 10 training points for Platt scaling')
  }

  // Helper functions
  const clamp = (p: number) => Math.max(0.01, Math.min(0.99, p))
  const logit = (p: number) => Math.log(clamp(p) / (1 - clamp(p)))
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

  // Convert to log-odds space
  const X = trainingData.map((d) => logit(d.rawProbability))
  const Y = trainingData.map((d) => (d.actualOutcome ? 1 : 0))

  // Initialize parameters (start close to identity transform)
  let a = 1.0
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

    // Normalize gradients
    gradA /= X.length
    gradB /= X.length

    // Update parameters
    const newA = a - learningRate * gradA
    const newB = b - learningRate * gradB

    // Check convergence
    if (Math.abs(newA - a) < tolerance && Math.abs(newB - b) < tolerance) {
      break
    }

    a = newA
    b = newB
  }

  return { a, b }
}

/**
 * Calculate calibration metrics
 */
export interface CalibrationMetrics {
  brierScore: number    // Mean squared error (lower is better)
  ece: number          // Expected Calibration Error
  mce: number          // Maximum Calibration Error
  accuracy: number     // Accuracy at 0.5 threshold
}

/**
 * Calculate calibration metrics for a set of predictions
 *
 * @param predictions - Array of (predicted probability, actual outcome) pairs
 * @returns Calibration metrics
 */
export function calculateCalibrationMetrics(
  predictions: Array<{ predicted: number; actual: boolean }>
): CalibrationMetrics {
  const n = predictions.length
  if (n === 0) {
    return { brierScore: 0, ece: 0, mce: 0, accuracy: 0 }
  }

  // Brier score: mean squared error
  let brierSum = 0
  let correctCount = 0

  for (const p of predictions) {
    const actual = p.actual ? 1 : 0
    brierSum += Math.pow(p.predicted - actual, 2)

    // Accuracy at 0.5 threshold
    if ((p.predicted >= 0.5) === p.actual) {
      correctCount++
    }
  }

  const brierScore = brierSum / n
  const accuracy = correctCount / n

  // Expected Calibration Error (ECE) - bin into 5 bins
  // Research recommends 5 bins for small sample sizes (<500)
  const numBins = 5
  const bins: Array<{ sum: number; count: number; actualSum: number }> = []
  for (let i = 0; i < numBins; i++) {
    bins.push({ sum: 0, count: 0, actualSum: 0 })
  }

  for (const p of predictions) {
    const binIdx = Math.min(Math.floor(p.predicted * numBins), numBins - 1)
    bins[binIdx].sum += p.predicted
    bins[binIdx].count += 1
    bins[binIdx].actualSum += p.actual ? 1 : 0
  }

  let eceSum = 0
  let mce = 0

  for (const bin of bins) {
    if (bin.count > 0) {
      const avgPredicted = bin.sum / bin.count
      const avgActual = bin.actualSum / bin.count
      const diff = Math.abs(avgPredicted - avgActual)

      eceSum += (bin.count / n) * diff
      mce = Math.max(mce, diff)
    }
  }

  return {
    brierScore,
    ece: eceSum,
    mce,
    accuracy,
  }
}

/**
 * Load active Platt scaling parameters from database
 */
export async function loadActivePlattParams(): Promise<PlattParams | null> {
  const params = await prisma.calibrationParams.findFirst({
    where: {
      predictionType: 'finish',
      active: true,
      validFrom: { lte: new Date() },
      validTo: { gte: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!params || params.paramA === null || params.paramB === null) {
    return null
  }

  return { a: params.paramA, b: params.paramB }
}

/**
 * Save Platt scaling parameters to database
 */
export async function savePlattParams(
  params: PlattParams,
  metrics: CalibrationMetrics,
  trainingSize: number,
  validFrom: Date,
  validTo: Date
): Promise<void> {
  // Deactivate previous params
  await prisma.calibrationParams.updateMany({
    where: {
      predictionType: 'finish',
      active: true,
    },
    data: { active: false },
  })

  // Create new params
  await prisma.calibrationParams.create({
    data: {
      predictionType: 'finish',
      paramA: params.a,
      paramB: params.b,
      trainedOn: trainingSize,
      brierScoreAfter: metrics.brierScore,
      eceScore: metrics.ece,
      mceScore: metrics.mce,
      active: true,
      validFrom,
      validTo,
    },
  })
}

/**
 * Train Platt scaling from historical predictions
 *
 * Loads completed predictions from the database and fits parameters.
 */
export async function trainPlattScalingFromHistory(
  windowMonths: number = 12
): Promise<{
  params: PlattParams
  metricsBefore: CalibrationMetrics
  metricsAfter: CalibrationMetrics
  trainingSize: number
}> {
  // Get predictions with known outcomes
  const windowStart = new Date()
  windowStart.setMonth(windowStart.getMonth() - windowMonths)

  const predictions = await prisma.prediction.findMany({
    where: {
      actualFinish: { not: null },
      createdAt: { gte: windowStart },
    },
    select: {
      finishProbability: true,
      actualFinish: true,
    },
  })

  if (predictions.length < 10) {
    throw new Error(`Not enough data: need 10+, have ${predictions.length}`)
  }

  // Convert to training format
  const trainingData: TrainingPoint[] = predictions.map((p) => ({
    rawProbability: p.finishProbability,
    actualOutcome: p.actualFinish!,
  }))

  // Calculate metrics before calibration
  const metricsBefore = calculateCalibrationMetrics(
    trainingData.map((d) => ({
      predicted: d.rawProbability,
      actual: d.actualOutcome,
    }))
  )

  // Fit Platt scaling
  const params = fitPlattScaling(trainingData)

  // Calculate metrics after calibration
  const metricsAfter = calculateCalibrationMetrics(
    trainingData.map((d) => ({
      predicted: applyPlattScaling(d.rawProbability, params),
      actual: d.actualOutcome,
    }))
  )

  return {
    params,
    metricsBefore,
    metricsAfter,
    trainingSize: trainingData.length,
  }
}
