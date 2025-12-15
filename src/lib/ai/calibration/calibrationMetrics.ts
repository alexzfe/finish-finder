/**
 * Calibration Metrics - Phase 4.1
 *
 * Implements calibration metrics for evaluating prediction quality:
 * - Brier Score: Overall prediction accuracy for probabilistic forecasts
 * - Expected Calibration Error (ECE): Measures calibration quality
 * - Maximum Calibration Error (MCE): Worst-case bin error
 * - Reliability Diagram data: For visualization
 *
 * Research targets:
 * - Brier Score: < 0.20 (good), < 0.15 (excellent)
 * - ECE: < 0.10 (good), < 0.05 (excellent)
 * - MCE: < 0.15 (good)
 */

/**
 * Single prediction outcome for calibration analysis
 */
export interface PredictionOutcome {
  predicted: number   // Predicted probability (0-1)
  actual: boolean     // Actual outcome (true = event occurred)
  confidence?: number // Optional confidence in prediction
  fightId?: string    // Optional reference to fight
  timestamp?: Date    // When prediction was made
}

/**
 * Calibration bin for reliability analysis
 */
export interface CalibrationBin {
  binLower: number
  binUpper: number
  meanPredicted: number
  meanActual: number
  count: number
  predictions: PredictionOutcome[]
}

/**
 * Complete calibration report
 */
export interface CalibrationReport {
  // Core metrics
  brierScore: number
  ece: number
  mce: number

  // Sample info
  sampleSize: number
  positiveRate: number  // Base rate of positive outcomes

  // Bin analysis
  bins: CalibrationBin[]
  nBins: number

  // Quality assessment
  quality: 'excellent' | 'good' | 'moderate' | 'poor'
  recommendations: string[]

  // Metadata
  generatedAt: Date
}

/**
 * Calculate Brier Score
 *
 * Brier = (1/n) * Σ(predicted - actual)²
 *
 * Lower is better:
 * - 0.00 = perfect predictions
 * - 0.25 = random guessing on 50/50
 * - 1.00 = completely wrong
 *
 * @param outcomes - Array of prediction outcomes
 * @returns Brier score (0-1)
 */
export function calculateBrierScore(outcomes: PredictionOutcome[]): number {
  if (outcomes.length === 0) return 0

  const sumSquaredError = outcomes.reduce((sum, o) => {
    const actual = o.actual ? 1 : 0
    return sum + Math.pow(o.predicted - actual, 2)
  }, 0)

  return sumSquaredError / outcomes.length
}

/**
 * Calculate Expected Calibration Error (ECE)
 *
 * ECE = Σ(|accuracy_bin - confidence_bin| * n_bin / N)
 *
 * Measures the average gap between predicted probability and actual frequency
 * Lower is better:
 * - < 0.05 = excellent
 * - < 0.10 = good
 * - < 0.15 = moderate
 * - > 0.15 = poor
 *
 * @param outcomes - Array of prediction outcomes
 * @param nBins - Number of bins (default 5 for small samples)
 * @returns ECE value (0-1)
 */
export function calculateECE(
  outcomes: PredictionOutcome[],
  nBins: number = 5
): number {
  if (outcomes.length === 0) return 0

  const bins = createCalibrationBins(outcomes, nBins)

  let ece = 0
  for (const bin of bins) {
    if (bin.count > 0) {
      const binWeight = bin.count / outcomes.length
      const binError = Math.abs(bin.meanActual - bin.meanPredicted)
      ece += binWeight * binError
    }
  }

  return ece
}

/**
 * Calculate Maximum Calibration Error (MCE)
 *
 * MCE = max(|accuracy_bin - confidence_bin|) across all bins
 *
 * Measures the worst-case calibration error
 *
 * @param outcomes - Array of prediction outcomes
 * @param nBins - Number of bins
 * @returns MCE value (0-1)
 */
export function calculateMCE(
  outcomes: PredictionOutcome[],
  nBins: number = 5
): number {
  if (outcomes.length === 0) return 0

  const bins = createCalibrationBins(outcomes, nBins)

  let mce = 0
  for (const bin of bins) {
    if (bin.count > 0) {
      const binError = Math.abs(bin.meanActual - bin.meanPredicted)
      mce = Math.max(mce, binError)
    }
  }

  return mce
}

/**
 * Create calibration bins for reliability analysis
 *
 * @param outcomes - Array of prediction outcomes
 * @param nBins - Number of bins
 * @returns Array of calibration bins
 */
export function createCalibrationBins(
  outcomes: PredictionOutcome[],
  nBins: number = 5
): CalibrationBin[] {
  const bins: CalibrationBin[] = []

  for (let i = 0; i < nBins; i++) {
    const binLower = i / nBins
    const binUpper = (i + 1) / nBins

    const binPredictions = outcomes.filter(
      o => o.predicted > binLower && o.predicted <= binUpper
    )

    const meanPredicted = binPredictions.length > 0
      ? binPredictions.reduce((sum, o) => sum + o.predicted, 0) / binPredictions.length
      : (binLower + binUpper) / 2

    const meanActual = binPredictions.length > 0
      ? binPredictions.filter(o => o.actual).length / binPredictions.length
      : 0

    bins.push({
      binLower,
      binUpper,
      meanPredicted,
      meanActual,
      count: binPredictions.length,
      predictions: binPredictions,
    })
  }

  return bins
}

/**
 * Generate a complete calibration report
 *
 * @param outcomes - Array of prediction outcomes
 * @param nBins - Number of bins (default 5)
 * @returns Complete calibration report
 */
export function generateCalibrationReport(
  outcomes: PredictionOutcome[],
  nBins: number = 5
): CalibrationReport {
  const brierScore = calculateBrierScore(outcomes)
  const ece = calculateECE(outcomes, nBins)
  const mce = calculateMCE(outcomes, nBins)
  const bins = createCalibrationBins(outcomes, nBins)
  const positiveRate = outcomes.filter(o => o.actual).length / outcomes.length

  // Determine quality
  let quality: CalibrationReport['quality']
  if (brierScore < 0.15 && ece < 0.05) {
    quality = 'excellent'
  } else if (brierScore < 0.20 && ece < 0.10) {
    quality = 'good'
  } else if (brierScore < 0.25 && ece < 0.15) {
    quality = 'moderate'
  } else {
    quality = 'poor'
  }

  // Generate recommendations
  const recommendations: string[] = []

  if (brierScore > 0.20) {
    recommendations.push(`Brier score ${brierScore.toFixed(3)} exceeds target 0.20 - predictions are inaccurate`)
  }
  if (ece > 0.10) {
    recommendations.push(`ECE ${ece.toFixed(3)} exceeds target 0.10 - predictions need calibration`)
  }
  if (mce > 0.15) {
    recommendations.push(`MCE ${mce.toFixed(3)} exceeds target 0.15 - some probability ranges are miscalibrated`)
  }

  // Find problematic bins
  for (const bin of bins) {
    if (bin.count >= 5) {
      const binError = Math.abs(bin.meanActual - bin.meanPredicted)
      if (binError > 0.15) {
        recommendations.push(
          `Bin ${(bin.binLower * 100).toFixed(0)}-${(bin.binUpper * 100).toFixed(0)}%: ` +
          `predicted ${(bin.meanPredicted * 100).toFixed(0)}% but actual ${(bin.meanActual * 100).toFixed(0)}%`
        )
      }
    }
  }

  if (outcomes.length < 50) {
    recommendations.push(`Sample size ${outcomes.length} is small - results may be unstable`)
  }

  if (recommendations.length === 0) {
    recommendations.push('Calibration looks good! Continue monitoring.')
  }

  return {
    brierScore,
    ece,
    mce,
    sampleSize: outcomes.length,
    positiveRate,
    bins,
    nBins,
    quality,
    recommendations,
    generatedAt: new Date(),
  }
}

/**
 * Format calibration report as text for display
 */
export function formatCalibrationReport(report: CalibrationReport): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════════',
    'CALIBRATION REPORT',
    '═══════════════════════════════════════════════════════════════════',
    '',
    `Sample Size: ${report.sampleSize}`,
    `Base Rate (positive outcomes): ${(report.positiveRate * 100).toFixed(1)}%`,
    '',
    'METRICS:',
    `  Brier Score: ${report.brierScore.toFixed(4)} ${report.brierScore < 0.20 ? '✓' : '✗'} (target < 0.20)`,
    `  ECE (${report.nBins} bins): ${report.ece.toFixed(4)} ${report.ece < 0.10 ? '✓' : '✗'} (target < 0.10)`,
    `  MCE: ${report.mce.toFixed(4)} ${report.mce < 0.15 ? '✓' : '✗'} (target < 0.15)`,
    '',
    `QUALITY: ${report.quality.toUpperCase()}`,
    '',
    'RELIABILITY DIAGRAM (Predicted → Actual):',
  ]

  for (const bin of report.bins) {
    const predicted = (bin.meanPredicted * 100).toFixed(0).padStart(3)
    const actual = (bin.meanActual * 100).toFixed(0).padStart(3)
    const count = String(bin.count).padStart(4)
    const bar = '█'.repeat(Math.round(bin.meanActual * 20))
    const gap = bin.count > 0 ? Math.abs(bin.meanActual - bin.meanPredicted) : 0
    const gapIndicator = gap > 0.15 ? ' ⚠️' : ''

    lines.push(
      `  ${(bin.binLower * 100).toFixed(0).padStart(2)}-${(bin.binUpper * 100).toFixed(0).padStart(3)}%: ` +
      `${predicted}% → ${actual}% (n=${count}) ${bar}${gapIndicator}`
    )
  }

  if (report.recommendations.length > 0) {
    lines.push('')
    lines.push('RECOMMENDATIONS:')
    for (const rec of report.recommendations) {
      lines.push(`  • ${rec}`)
    }
  }

  lines.push('')
  lines.push(`Generated: ${report.generatedAt.toISOString()}`)

  return lines.join('\n')
}

/**
 * Calculate skill score (Brier Skill Score)
 *
 * BSS = 1 - (Brier / Brier_reference)
 *
 * Compares to a reference forecast (usually climatology/base rate).
 * BSS > 0 means better than reference, BSS < 0 means worse.
 *
 * @param outcomes - Prediction outcomes
 * @returns Brier Skill Score
 */
export function calculateBrierSkillScore(outcomes: PredictionOutcome[]): number {
  if (outcomes.length === 0) return 0

  const brier = calculateBrierScore(outcomes)
  const baseRate = outcomes.filter(o => o.actual).length / outcomes.length

  // Reference Brier: predicting base rate for everything
  const brierReference = baseRate * (1 - baseRate) + (1 - baseRate) * Math.pow(baseRate, 2)
  // Simplified: brierReference = baseRate * (1 - baseRate)

  if (brierReference === 0) return 0

  return 1 - (brier / brierReference)
}
