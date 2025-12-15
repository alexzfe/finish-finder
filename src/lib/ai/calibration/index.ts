/**
 * Calibration Module - Phase 2 + Phase 4.1
 *
 * Provides calibration infrastructure for AI predictions:
 * - Platt scaling for finish probability
 * - Calibration metrics tracking (Brier, ECE, MCE)
 * - Weak supervision labeling functions
 * - Conformal prediction intervals (Phase 4.1)
 */

// Platt Scaling (Phase 2.2)
export {
  applyPlattScaling,
  fitPlattScaling,
  calculateCalibrationMetrics,
  loadActivePlattParams,
  savePlattParams,
  trainPlattScalingFromHistory,
  type PlattParams,
  type CalibrationMetrics,
} from './plattScaling'

// Enhanced Calibration Metrics (Phase 4.1)
export {
  calculateBrierScore,
  calculateECE,
  calculateMCE,
  createCalibrationBins,
  generateCalibrationReport as generateDetailedCalibrationReport,
  formatCalibrationReport as formatDetailedCalibrationReport,
  calculateBrierSkillScore,
  type PredictionOutcome,
  type CalibrationBin,
  type CalibrationReport as DetailedCalibrationReport,
} from './calibrationMetrics'

// Conformal Prediction (Phase 4.1)
export {
  fitConformalPrediction,
  getPredictionInterval,
  clampInterval,
  validateCoverage,
  getMultipleCoverageIntervals,
  loadConformalParams,
  saveConformalParams,
  trainConformalFromHistory,
  formatPredictionInterval,
  type ConformalParams,
  type PredictionInterval,
  type CalibrationPoint,
} from './conformalPrediction'

// Rolling Window Recalibration (Phase 4.1)
export {
  recalibrateFinishProbability,
  checkCalibrationStatus,
  isRecalibrationNeeded,
  formatRecalibrationReport,
  getNextRecalibrationDate,
  type RecalibrationConfig,
  type RecalibrationResult,
} from './rollingRecalibration'

// Metrics Tracker (Phase 2.3)
export {
  evaluatePredictions,
  updateVersionMetrics,
  getVersionHistory,
  generateCalibrationReport,
  type FunScoreMetrics,
  type PredictionEvaluation,
} from './metricsTracker'

// Labeling Functions (Phase 2.4)
export {
  quickFinishLabel,
  bonusWinnerLabel,
  highActionLabel,
  knockdownDramaLabel,
  decisionGrindLabel,
  submissionBattleLabel,
  LABELING_FUNCTIONS,
  aggregateLabels,
  generateWeakLabel,
  calculateTotalFightTime,
  batchGenerateWeakLabels,
  type EntertainmentLabel,
  type LabelingResult,
  type FightStats,
} from './labelingFunctions'
