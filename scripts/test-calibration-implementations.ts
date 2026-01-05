/**
 * Test script for Phase 4.1 calibration implementations
 *
 * Tests:
 * 1. Calibration metrics (Brier, ECE, MCE)
 * 2. Conformal prediction intervals
 * 3. Rolling recalibration status
 * 4. Anchor examples structure
 */

import {
  // Calibration Metrics
  calculateBrierScore,
  calculateECE,
  calculateMCE,
  createCalibrationBins,
  generateDetailedCalibrationReport,
  formatDetailedCalibrationReport,
  calculateBrierSkillScore,
  type PredictionOutcome,

  // Conformal Prediction
  fitConformalPrediction,
  getPredictionInterval,
  clampInterval,
  validateCoverage,
  getMultipleCoverageIntervals,
  formatPredictionInterval,
  type CalibrationPoint,

  // Rolling Recalibration
  isRecalibrationNeeded,
  formatRecalibrationReport,
  getNextRecalibrationDate,
  type RecalibrationConfig,
  type CalibrationMetrics,
} from '../src/lib/ai/calibration'

import {
  HIGH_ENTERTAINMENT_ANCHORS,
  MEDIUM_ENTERTAINMENT_ANCHORS,
  LOW_ENTERTAINMENT_ANCHORS,
  buildFewShotExamplesSection,
  getAnchorsByTier,
} from '../src/lib/ai/prompts/anchorExamples'

// Test utilities
let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (error) {
    console.log(`  ✗ ${name}`)
    console.log(`    Error: ${error instanceof Error ? error.message : error}`)
    failed++
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`)
  }
}

function assertInRange(actual: number, min: number, max: number, message?: string) {
  if (actual < min || actual > max) {
    throw new Error(`${message || 'Range check failed'}: ${actual} not in [${min}, ${max}]`)
  }
}

function assertClose(actual: number, expected: number, tolerance: number = 0.001, message?: string) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message || 'Close check failed'}: ${actual} not close to ${expected} (tolerance: ${tolerance})`)
  }
}

// Generate synthetic test data
function generateSyntheticOutcomes(n: number, calibrated: boolean = true): PredictionOutcome[] {
  const outcomes: PredictionOutcome[] = []

  for (let i = 0; i < n; i++) {
    const predicted = Math.random()
    // If calibrated, actual outcome probability matches predicted
    // If uncalibrated, actual is always 0.5
    const actualProb = calibrated ? predicted : 0.5
    const actual = Math.random() < actualProb

    outcomes.push({ predicted, actual })
  }

  return outcomes
}

function generateCalibrationPoints(n: number, noise: number = 0.1): CalibrationPoint[] {
  const points: CalibrationPoint[] = []

  for (let i = 0; i < n; i++) {
    const predicted = Math.random() * 100 // Fun score 0-100
    const actual = predicted + (Math.random() - 0.5) * noise * 100
    points.push({ predicted, actual: Math.max(0, Math.min(100, actual)) })
  }

  return points
}

// ============================================================================
// TEST SUITES
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════════════')
console.log('CALIBRATION METRICS TESTS')
console.log('═══════════════════════════════════════════════════════════════════\n')

// Test 1: Brier Score
console.log('Brier Score:')

test('Perfect predictions have Brier score of 0', () => {
  const perfectOutcomes: PredictionOutcome[] = [
    { predicted: 1.0, actual: true },
    { predicted: 0.0, actual: false },
    { predicted: 1.0, actual: true },
    { predicted: 0.0, actual: false },
  ]
  const brier = calculateBrierScore(perfectOutcomes)
  assertClose(brier, 0, 0.001)
})

test('Completely wrong predictions have Brier score of 1', () => {
  const wrongOutcomes: PredictionOutcome[] = [
    { predicted: 0.0, actual: true },
    { predicted: 1.0, actual: false },
    { predicted: 0.0, actual: true },
    { predicted: 1.0, actual: false },
  ]
  const brier = calculateBrierScore(wrongOutcomes)
  assertClose(brier, 1, 0.001)
})

test('50/50 predictions on 50/50 outcomes have Brier ~0.25', () => {
  const randomOutcomes: PredictionOutcome[] = [
    { predicted: 0.5, actual: true },
    { predicted: 0.5, actual: false },
    { predicted: 0.5, actual: true },
    { predicted: 0.5, actual: false },
  ]
  const brier = calculateBrierScore(randomOutcomes)
  assertClose(brier, 0.25, 0.001)
})

test('Empty outcomes return 0', () => {
  assertEqual(calculateBrierScore([]), 0)
})

// Test 2: ECE
console.log('\nExpected Calibration Error (ECE):')

test('Perfectly calibrated predictions have ECE near 0', () => {
  // Create data where predicted = actual frequency in each bin
  const calibratedOutcomes: PredictionOutcome[] = []
  for (let i = 0; i < 100; i++) {
    const predicted = 0.7
    calibratedOutcomes.push({ predicted, actual: i < 70 })
  }
  const ece = calculateECE(calibratedOutcomes, 5)
  assertInRange(ece, 0, 0.05, 'ECE should be near 0 for calibrated predictions')
})

test('Uses 5 bins by default (research recommendation)', () => {
  const outcomes = generateSyntheticOutcomes(100, true)
  const bins = createCalibrationBins(outcomes, 5)
  assertEqual(bins.length, 5, 'Should create 5 bins')
})

test('ECE is in valid range [0, 1]', () => {
  const outcomes = generateSyntheticOutcomes(100)
  const ece = calculateECE(outcomes)
  assertInRange(ece, 0, 1)
})

// Test 3: MCE
console.log('\nMaximum Calibration Error (MCE):')

test('MCE >= ECE always', () => {
  const outcomes = generateSyntheticOutcomes(100)
  const ece = calculateECE(outcomes)
  const mce = calculateMCE(outcomes)
  if (mce < ece - 0.001) {
    throw new Error(`MCE ${mce} should be >= ECE ${ece}`)
  }
})

test('MCE is in valid range [0, 1]', () => {
  const outcomes = generateSyntheticOutcomes(100)
  const mce = calculateMCE(outcomes)
  assertInRange(mce, 0, 1)
})

// Test 4: Brier Skill Score
console.log('\nBrier Skill Score:')

test('BSS > 0 for better-than-random predictions', () => {
  // Create predictions that are better than just predicting base rate
  const goodOutcomes: PredictionOutcome[] = [
    { predicted: 0.9, actual: true },
    { predicted: 0.1, actual: false },
    { predicted: 0.8, actual: true },
    { predicted: 0.2, actual: false },
  ]
  const bss = calculateBrierSkillScore(goodOutcomes)
  if (bss <= 0) {
    throw new Error(`BSS ${bss} should be > 0 for good predictions`)
  }
})

// Test 5: Calibration Report
console.log('\nCalibration Report Generation:')

test('Report includes all required fields', () => {
  const outcomes = generateSyntheticOutcomes(100)
  const report = generateDetailedCalibrationReport(outcomes)

  if (report.brierScore === undefined) throw new Error('Missing brierScore')
  if (report.ece === undefined) throw new Error('Missing ece')
  if (report.mce === undefined) throw new Error('Missing mce')
  if (report.sampleSize === undefined) throw new Error('Missing sampleSize')
  if (report.quality === undefined) throw new Error('Missing quality')
  if (!report.bins || report.bins.length === 0) throw new Error('Missing bins')
})

test('Report quality assessment is valid', () => {
  const outcomes = generateSyntheticOutcomes(100)
  const report = generateDetailedCalibrationReport(outcomes)
  const validQualities = ['excellent', 'good', 'moderate', 'poor']
  if (!validQualities.includes(report.quality)) {
    throw new Error(`Invalid quality: ${report.quality}`)
  }
})

test('Report can be formatted to string', () => {
  const outcomes = generateSyntheticOutcomes(50)
  const report = generateDetailedCalibrationReport(outcomes)
  const formatted = formatDetailedCalibrationReport(report)

  if (!formatted.includes('CALIBRATION REPORT')) throw new Error('Missing header')
  if (!formatted.includes('Brier Score')) throw new Error('Missing Brier Score')
  if (!formatted.includes('ECE')) throw new Error('Missing ECE')
})

console.log('\n═══════════════════════════════════════════════════════════════════')
console.log('CONFORMAL PREDICTION TESTS')
console.log('═══════════════════════════════════════════════════════════════════\n')

// Test 6: Conformal Prediction Fitting
console.log('Conformal Prediction Fitting:')

test('Requires minimum 10 calibration points', () => {
  const smallData: CalibrationPoint[] = [
    { predicted: 50, actual: 52 },
    { predicted: 60, actual: 58 },
  ]

  try {
    fitConformalPrediction(smallData)
    throw new Error('Should have thrown for insufficient data')
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes('at least 10')) {
      throw e
    }
  }
})

test('Fits conformal parameters with sufficient data', () => {
  const data = generateCalibrationPoints(50, 0.1)
  const params = fitConformalPrediction(data, 0.90)

  if (params.coverageLevel !== 0.90) throw new Error('Wrong coverage level')
  if (params.calibrationSize !== 50) throw new Error('Wrong calibration size')
  if (params.threshold <= 0) throw new Error('Threshold should be positive')
  if (params.conformityScores.length !== 50) throw new Error('Wrong number of scores')
})

// Test 7: Prediction Intervals
console.log('\nPrediction Intervals:')

test('Generates symmetric intervals around point estimate', () => {
  const data = generateCalibrationPoints(50, 0.1)
  const params = fitConformalPrediction(data, 0.90)

  const interval = getPredictionInterval(50, params)

  assertClose(interval.predicted, 50, 0.001)
  assertClose(interval.predicted - interval.lower, interval.upper - interval.predicted, 0.001)
})

test('Interval width equals 2 * threshold', () => {
  const data = generateCalibrationPoints(50, 0.1)
  const params = fitConformalPrediction(data, 0.90)

  const interval = getPredictionInterval(50, params)
  assertClose(interval.width, params.threshold * 2, 0.001)
})

test('Higher coverage = wider intervals', () => {
  const data = generateCalibrationPoints(100, 0.1)

  const params80 = fitConformalPrediction(data, 0.80)
  const params95 = fitConformalPrediction(data, 0.95)

  const interval80 = getPredictionInterval(50, params80)
  const interval95 = getPredictionInterval(50, params95)

  if (interval95.width <= interval80.width) {
    throw new Error('95% interval should be wider than 80%')
  }
})

// Test 8: Interval Clamping
console.log('\nInterval Clamping:')

test('Clamps intervals to valid range', () => {
  const data = generateCalibrationPoints(50, 0.5) // High noise for wide intervals
  const params = fitConformalPrediction(data, 0.95)

  const rawInterval = getPredictionInterval(5, params) // Near lower bound
  const clamped = clampInterval(rawInterval, 0, 100)

  assertInRange(clamped.lower, 0, 100)
  assertInRange(clamped.upper, 0, 100)
})

test('Clamps probability intervals to [0, 1]', () => {
  const data: CalibrationPoint[] = []
  for (let i = 0; i < 50; i++) {
    data.push({ predicted: Math.random(), actual: Math.random() })
  }
  const params = fitConformalPrediction(data, 0.90)

  const rawInterval = getPredictionInterval(0.95, params)
  const clamped = clampInterval(rawInterval, 0, 1)

  assertInRange(clamped.lower, 0, 1)
  assertInRange(clamped.upper, 0, 1)
})

// Test 9: Coverage Validation
console.log('\nCoverage Validation:')

test('Validates coverage on test set', () => {
  const trainData = generateCalibrationPoints(80, 0.1)
  const testData = generateCalibrationPoints(20, 0.1)

  const params = fitConformalPrediction(trainData, 0.90)
  const coverage = validateCoverage(testData, params)

  assertInRange(coverage, 0, 1)
})

test('90% coverage achieves approximately 90% on held-out data', () => {
  // Use lower noise for more reliable test
  const trainData = generateCalibrationPoints(200, 0.05)
  const testData = generateCalibrationPoints(100, 0.05)

  const params = fitConformalPrediction(trainData, 0.90)
  const coverage = validateCoverage(testData, params)

  // Allow some slack due to finite sample size
  assertInRange(coverage, 0.75, 1.0, 'Coverage should be approximately 90%')
})

// Test 10: Multiple Coverage Intervals
console.log('\nMultiple Coverage Intervals:')

test('Generates intervals at multiple coverage levels', () => {
  const data = generateCalibrationPoints(100, 0.1)
  const intervals = getMultipleCoverageIntervals(50, data, [0.50, 0.80, 0.95])

  assertEqual(intervals.length, 3, 'Should generate 3 intervals')

  // Check intervals are ordered by width
  if (intervals[0].width >= intervals[1].width) {
    throw new Error('50% interval should be narrower than 80%')
  }
  if (intervals[1].width >= intervals[2].width) {
    throw new Error('80% interval should be narrower than 95%')
  }
})

// Test 11: Interval Formatting
console.log('\nInterval Formatting:')

test('Formats percentage intervals correctly', () => {
  const interval = {
    predicted: 0.65,
    lower: 0.55,
    upper: 0.75,
    coverage: 0.90,
    width: 0.20,
  }

  const formatted = formatPredictionInterval(interval, true)
  if (!formatted.includes('65%')) throw new Error('Missing predicted value')
  if (!formatted.includes('90% CI')) throw new Error('Missing confidence interval')
})

test('Formats absolute intervals correctly', () => {
  const interval = {
    predicted: 75,
    lower: 65,
    upper: 85,
    coverage: 0.90,
    width: 20,
  }

  const formatted = formatPredictionInterval(interval, false)
  if (!formatted.includes('75')) throw new Error('Missing predicted value')
  if (!formatted.includes('[65-85]')) throw new Error('Missing interval range')
})

console.log('\n═══════════════════════════════════════════════════════════════════')
console.log('ROLLING RECALIBRATION TESTS')
console.log('═══════════════════════════════════════════════════════════════════\n')

// Test 12: Recalibration Need Detection
console.log('Recalibration Need Detection:')

test('Triggers recalibration when ECE exceeds threshold', () => {
  const badMetrics: CalibrationMetrics = {
    brierScore: 0.15,
    ece: 0.20, // Above 0.15 threshold
    mce: 0.10,
    accuracy: 0.70,
  }

  const result = isRecalibrationNeeded(badMetrics)
  if (!result.needed) throw new Error('Should need recalibration')
  if (!result.reasons.some(r => r.includes('ECE'))) {
    throw new Error('Should mention ECE in reasons')
  }
})

test('Triggers recalibration when Brier exceeds threshold', () => {
  const badMetrics: CalibrationMetrics = {
    brierScore: 0.30, // Above 0.25 threshold
    ece: 0.05,
    mce: 0.10,
    accuracy: 0.60,
  }

  const result = isRecalibrationNeeded(badMetrics)
  if (!result.needed) throw new Error('Should need recalibration')
  if (!result.reasons.some(r => r.includes('Brier'))) {
    throw new Error('Should mention Brier in reasons')
  }
})

test('Does not trigger when metrics are good', () => {
  const goodMetrics: CalibrationMetrics = {
    brierScore: 0.15,
    ece: 0.05,
    mce: 0.08,
    accuracy: 0.75,
  }

  const result = isRecalibrationNeeded(goodMetrics)
  if (result.needed) throw new Error('Should not need recalibration')
})

test('Custom thresholds are respected', () => {
  const metrics: CalibrationMetrics = {
    brierScore: 0.12,
    ece: 0.08,
    mce: 0.10,
    accuracy: 0.75,
  }

  const strictConfig: RecalibrationConfig = {
    windowMonths: 6,
    minSamples: 50,
    eceThreshold: 0.05, // Stricter than default 0.15
    brierThreshold: 0.10, // Stricter than default 0.25
    conformalCoverage: 0.90,
    validityDays: 45,
  }

  const result = isRecalibrationNeeded(metrics, strictConfig)
  if (!result.needed) throw new Error('Should need recalibration with strict thresholds')
})

// Test 13: Next Recalibration Date
console.log('\nNext Recalibration Date:')

test('Returns now if never recalibrated', () => {
  const nextDate = getNextRecalibrationDate(null)
  const now = new Date()

  // Should be within a second of now
  if (Math.abs(nextDate.getTime() - now.getTime()) > 1000) {
    throw new Error('Should return current time for null lastRecalibration')
  }
})

test('Returns date before validity expires', () => {
  const lastRecalibration = new Date()
  const nextDate = getNextRecalibrationDate(lastRecalibration, { validityDays: 45 })

  // Should be 38 days from now (45 - 7 = 38)
  const expectedMs = lastRecalibration.getTime() + (45 - 7) * 24 * 60 * 60 * 1000
  assertClose(nextDate.getTime(), expectedMs, 1000)
})

// Test 14: Recalibration Report Formatting
console.log('\nRecalibration Report Formatting:')

test('Formats successful recalibration report', () => {
  const result = {
    success: true,
    windowStart: new Date('2024-01-01'),
    windowEnd: new Date('2024-06-30'),
    sampleSize: 100,
    metricsBefore: { brierScore: 0.25, ece: 0.18, mce: 0.22, accuracy: 0.65 },
    metricsAfter: { brierScore: 0.18, ece: 0.08, mce: 0.12, accuracy: 0.72 },
    plattParams: { a: -1.5, b: 0.5 },
    conformalParams: {
      conformityScores: [0.1, 0.15, 0.2],
      coverageLevel: 0.90,
      threshold: 0.2,
      calibrationSize: 100,
    },
    driftDetected: true,
    driftReason: 'ECE exceeded threshold',
    recommendations: ['Brier improved', 'ECE improved'],
  }

  const formatted = formatRecalibrationReport(result)

  if (!formatted.includes('SUCCESS')) throw new Error('Missing success status')
  if (!formatted.includes('METRICS BEFORE')) throw new Error('Missing before metrics')
  if (!formatted.includes('METRICS AFTER')) throw new Error('Missing after metrics')
  if (!formatted.includes('PLATT PARAMETERS')) throw new Error('Missing Platt params')
  if (!formatted.includes('CONFORMAL PARAMETERS')) throw new Error('Missing conformal params')
})

test('Formats failed recalibration report', () => {
  const result = {
    success: false,
    error: 'Insufficient data',
    windowStart: new Date('2024-01-01'),
    windowEnd: new Date('2024-06-30'),
    sampleSize: 5,
    metricsBefore: { brierScore: 0, ece: 0, mce: 0, accuracy: 0 },
    driftDetected: false,
    recommendations: ['Wait for more data'],
  }

  const formatted = formatRecalibrationReport(result)

  if (!formatted.includes('FAILED')) throw new Error('Missing failed status')
  if (!formatted.includes('Insufficient data')) throw new Error('Missing error message')
})

console.log('\n═══════════════════════════════════════════════════════════════════')
console.log('ANCHOR EXAMPLES TESTS')
console.log('═══════════════════════════════════════════════════════════════════\n')

// Test 15: Anchor Examples Structure
console.log('Anchor Examples Structure:')

test('All anchor categories are populated', () => {
  if (HIGH_ENTERTAINMENT_ANCHORS.length === 0) {
    throw new Error('HIGH_ENTERTAINMENT_ANCHORS is empty')
  }
  if (MEDIUM_ENTERTAINMENT_ANCHORS.length === 0) {
    throw new Error('MEDIUM_ENTERTAINMENT_ANCHORS is empty')
  }
  if (LOW_ENTERTAINMENT_ANCHORS.length === 0) {
    throw new Error('LOW_ENTERTAINMENT_ANCHORS is empty')
  }
})

test('getAnchorsByTier returns correct categories', () => {
  const high = getAnchorsByTier('high')
  const medium = getAnchorsByTier('medium')
  const low = getAnchorsByTier('low')

  if (high.length === 0) {
    throw new Error('Missing high entertainment anchors')
  }
  if (medium.length === 0) {
    throw new Error('Missing medium entertainment anchors')
  }
  if (low.length === 0) {
    throw new Error('Missing low entertainment anchors')
  }
})

test('Each anchor has required fields', () => {
  const allAnchors = [
    ...HIGH_ENTERTAINMENT_ANCHORS,
    ...MEDIUM_ENTERTAINMENT_ANCHORS,
    ...LOW_ENTERTAINMENT_ANCHORS,
  ]

  for (const anchor of allAnchors) {
    if (!anchor.fight) throw new Error(`Anchor missing fight: ${JSON.stringify(anchor)}`)
    if (!anchor.event) throw new Error(`Anchor missing event: ${JSON.stringify(anchor)}`)
    if (!anchor.description) throw new Error(`Anchor missing description: ${JSON.stringify(anchor)}`)
    if (!anchor.attributes) throw new Error(`Anchor missing attributes: ${JSON.stringify(anchor)}`)

    const attrs = anchor.attributes
    if (attrs.pace === undefined) throw new Error(`Anchor missing pace: ${anchor.fight}`)
    if (attrs.finishDanger === undefined) throw new Error(`Anchor missing finishDanger: ${anchor.fight}`)
    if (attrs.styleClash === undefined) throw new Error(`Anchor missing styleClash: ${anchor.fight}`)
  }
})

test('Anchor ratings are in valid range [1-5]', () => {
  const allAnchors = [
    ...HIGH_ENTERTAINMENT_ANCHORS,
    ...MEDIUM_ENTERTAINMENT_ANCHORS,
    ...LOW_ENTERTAINMENT_ANCHORS,
  ]

  for (const anchor of allAnchors) {
    const { pace, finishDanger, technicality } = anchor.attributes

    assertInRange(pace, 1, 5, `Invalid pace for ${anchor.fight}`)
    assertInRange(finishDanger, 1, 5, `Invalid finishDanger for ${anchor.fight}`)
    if (technicality !== undefined) {
      assertInRange(technicality, 1, 5, `Invalid technicality for ${anchor.fight}`)
    }
  }
})

// Test 16: Anchor Formatting
console.log('\nAnchor Formatting:')

test('buildFewShotExamplesSection generates valid string', () => {
  const formatted = buildFewShotExamplesSection(true)

  if (!formatted || formatted.length === 0) {
    throw new Error('Formatted anchors is empty')
  }
  if (!formatted.includes('HIGH ENTERTAINMENT')) {
    throw new Error('Missing high entertainment section')
  }
  if (!formatted.includes('MEDIUM ENTERTAINMENT')) {
    throw new Error('Missing medium entertainment section')
  }
  if (!formatted.includes('LOW ENTERTAINMENT')) {
    throw new Error('Missing low entertainment section')
  }
})

test('Formatted anchors include real fight names', () => {
  const formatted = buildFewShotExamplesSection(true)

  // Check for some known anchor fights
  const expectedFights = [
    'Strickland',
    'Adesanya',
    'Muhammad',
    'Edwards',
    'Shields',
    'Maia',
  ]

  for (const name of expectedFights) {
    if (!formatted.includes(name)) {
      throw new Error(`Missing expected fight name: ${name}`)
    }
  }
})

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════════════')
console.log('TEST SUMMARY')
console.log('═══════════════════════════════════════════════════════════════════')
console.log(`\n  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log(`  Total:  ${passed + failed}`)

if (failed > 0) {
  console.log('\n❌ Some tests failed!')
  process.exit(1)
} else {
  console.log('\n✅ All tests passed!')
  process.exit(0)
}
