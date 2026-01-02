/**
 * Consistency Validator - Phase 4
 *
 * Validates that LLM outputs are internally consistent and logically sound.
 * Uses a two-tier approach:
 * 1. Rule-based checks (fast, free, catches obvious errors)
 * 2. LLM critique (only triggered when rules fail or confidence is low)
 *
 * This catches hallucinations before they're saved to the database.
 */

import type { FightSimulationOutput } from './prompts/unifiedPredictionPrompt'
import type { CalculatedScores } from './scoreCalculator'

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
  requiresLLMCritique: boolean
  severity: 'none' | 'warning' | 'error'
}

/**
 * Individual validation issue
 */
export interface ValidationIssue {
  code: string
  message: string
  severity: 'warning' | 'error'
  suggestion?: string
}

/**
 * Consistency rules configuration
 *
 * NOTE: We no longer validate against predicted outcome (winner/method)
 * since we only predict finish probability and fun score, not fight outcomes.
 */
const VALIDATION_RULES = {
  // Pace vs brawl potential
  lowPaceWithBrawl: {
    threshold: 2,  // pace <= 2
    message: 'Low pace but brawlPotential is true - contradiction',
    severity: 'error' as const,
  },

  // Style clash vs pace
  cancelingStyleHighPace: {
    threshold: 4,  // pace >= 4
    message: 'Canceling styles but high pace - unusual combination',
    severity: 'warning' as const,
  },

  // Technicality vs brawl
  highTechBrawl: {
    threshold: 5,  // technicality = 5
    message: 'Maximum technicality but brawlPotential is true - unusual combination',
    severity: 'warning' as const,
  },

  // Confidence thresholds
  veryLowConfidence: {
    threshold: 0.4,
    message: 'Very low confidence - analysis may be unreliable',
    severity: 'warning' as const,
  },

  // Attribute bounds
  invalidAttribute: {
    message: 'Attribute value out of valid range (1-5)',
    severity: 'error' as const,
  },

  // Key factors
  tooFewKeyFactors: {
    threshold: 2,
    message: 'Too few key factors - should have at least 2',
    severity: 'warning' as const,
  },

  // Narrative length
  shortNarrative: {
    threshold: 100,  // characters
    message: 'Narrative too short - should paint a vivid picture',
    severity: 'warning' as const,
  },
}

/**
 * Validate fight simulation output
 *
 * Runs all rule-based consistency checks and returns validation result.
 *
 * @param simulation - LLM output to validate
 * @param calculatedScores - Scores calculated from attributes
 * @returns Validation result with issues
 */
export function validateConsistency(
  simulation: FightSimulationOutput,
  calculatedScores: CalculatedScores
): ValidationResult {
  const issues: ValidationIssue[] = []
  const { attributes, confidence } = simulation

  // Rule 1: Low pace with brawl potential
  if (
    attributes.pace <= VALIDATION_RULES.lowPaceWithBrawl.threshold &&
    attributes.brawlPotential
  ) {
    issues.push({
      code: 'LOW_PACE_BRAWL',
      message: VALIDATION_RULES.lowPaceWithBrawl.message,
      severity: VALIDATION_RULES.lowPaceWithBrawl.severity,
      suggestion: 'Set brawlPotential to false for low-pace fights',
    })
  }

  // Rule 2: Canceling styles with high pace
  if (
    attributes.styleClash === 'Canceling' &&
    attributes.pace >= VALIDATION_RULES.cancelingStyleHighPace.threshold
  ) {
    issues.push({
      code: 'CANCELING_HIGH_PACE',
      message: VALIDATION_RULES.cancelingStyleHighPace.message,
      severity: VALIDATION_RULES.cancelingStyleHighPace.severity,
      suggestion: 'Canceling styles typically result in lower pace',
    })
  }

  // Rule 3: High technicality with brawl potential
  if (
    attributes.technicality >= VALIDATION_RULES.highTechBrawl.threshold &&
    attributes.brawlPotential
  ) {
    issues.push({
      code: 'HIGH_TECH_BRAWL',
      message: VALIDATION_RULES.highTechBrawl.message,
      severity: VALIDATION_RULES.highTechBrawl.severity,
      suggestion: 'High technicality fights are typically not brawls',
    })
  }

  // Rule 4: Very low confidence
  if (confidence <= VALIDATION_RULES.veryLowConfidence.threshold) {
    issues.push({
      code: 'LOW_CONFIDENCE',
      message: VALIDATION_RULES.veryLowConfidence.message,
      severity: VALIDATION_RULES.veryLowConfidence.severity,
    })
  }

  // Rule 5: Invalid attribute values
  const attributeValues = [
    { name: 'pace', value: attributes.pace },
    { name: 'finishDanger', value: attributes.finishDanger },
    { name: 'technicality', value: attributes.technicality },
  ]

  for (const attr of attributeValues) {
    if (attr.value < 1 || attr.value > 5 || !Number.isInteger(attr.value)) {
      issues.push({
        code: 'INVALID_ATTRIBUTE',
        message: `${attr.name} must be integer 1-5, got ${attr.value}`,
        severity: VALIDATION_RULES.invalidAttribute.severity,
      })
    }
  }

  // Rule 6: Style clash validation
  const validStyleClash = ['Complementary', 'Neutral', 'Canceling']
  if (!validStyleClash.includes(attributes.styleClash)) {
    issues.push({
      code: 'INVALID_STYLE_CLASH',
      message: `styleClash must be one of ${validStyleClash.join(', ')}`,
      severity: 'error',
    })
  }

  // Rule 7: Key factors count
  if (simulation.keyFactors.length < VALIDATION_RULES.tooFewKeyFactors.threshold) {
    issues.push({
      code: 'FEW_KEY_FACTORS',
      message: VALIDATION_RULES.tooFewKeyFactors.message,
      severity: VALIDATION_RULES.tooFewKeyFactors.severity,
    })
  }

  // Rule 8: Narrative length
  if (simulation.narrative.length < VALIDATION_RULES.shortNarrative.threshold) {
    issues.push({
      code: 'SHORT_NARRATIVE',
      message: VALIDATION_RULES.shortNarrative.message,
      severity: VALIDATION_RULES.shortNarrative.severity,
    })
  }

  // Rule 9: Confidence range
  if (confidence < 0 || confidence > 1) {
    issues.push({
      code: 'INVALID_CONFIDENCE',
      message: 'Confidence must be between 0 and 1',
      severity: 'error',
    })
  }

  // Determine overall severity
  const hasErrors = issues.some((i) => i.severity === 'error')
  const hasWarnings = issues.some((i) => i.severity === 'warning')
  const severity: ValidationResult['severity'] = hasErrors
    ? 'error'
    : hasWarnings
      ? 'warning'
      : 'none'

  // Determine if LLM critique is needed
  // Trigger if: any errors, multiple warnings, or low confidence
  const requiresLLMCritique =
    hasErrors ||
    issues.filter((i) => i.severity === 'warning').length >= 2 ||
    confidence < 0.5

  return {
    valid: !hasErrors,
    issues,
    requiresLLMCritique,
    severity,
  }
}

/**
 * Format validation result for logging
 */
export function formatValidationResult(result: ValidationResult): string {
  if (result.issues.length === 0) {
    return '✓ Validation passed - no issues found'
  }

  const lines: string[] = [
    `Validation ${result.valid ? 'passed with warnings' : 'FAILED'}:`,
  ]

  for (const issue of result.issues) {
    const prefix = issue.severity === 'error' ? '✗' : '⚠'
    lines.push(`  ${prefix} [${issue.code}] ${issue.message}`)
    if (issue.suggestion) {
      lines.push(`    → ${issue.suggestion}`)
    }
  }

  if (result.requiresLLMCritique) {
    lines.push('  ℹ LLM critique recommended')
  }

  return lines.join('\n')
}

/**
 * Build LLM critique prompt
 *
 * Used when validation triggers LLM critique.
 * Should be sent to a cheap model (Haiku/GPT-4o-mini) for efficiency.
 *
 * @param simulation - Original simulation output
 * @param issues - Validation issues found
 * @returns Prompt for LLM critique
 */
export function buildCritiquePrompt(
  simulation: FightSimulationOutput,
  issues: ValidationIssue[]
): string {
  const issuesList = issues
    .map((i) => `- ${i.code}: ${i.message}`)
    .join('\n')

  return `You are a quality control analyst reviewing an MMA fight prediction for internal consistency.

The following prediction has potential issues that need review:

PREDICTION:
${JSON.stringify(simulation, null, 2)}

FLAGGED ISSUES:
${issuesList}

Analyze the prediction and determine:
1. Are the flagged issues actual problems or acceptable edge cases?
2. What specific corrections would improve consistency?

OUTPUT (JSON only):
{
  "critiqueSummary": "<1-2 sentence assessment>",
  "confirmedIssues": ["<issue codes that are real problems>"],
  "dismissedIssues": ["<issue codes that are acceptable>"],
  "suggestedCorrections": {
    "<attribute name>": <corrected value>
  },
  "needsRegeneration": <true|false>
}

Be conservative - only flag real logical contradictions, not stylistic differences.`
}

/**
 * Critique result from LLM
 */
export interface CritiqueResult {
  critiqueSummary: string
  confirmedIssues: string[]
  dismissedIssues: string[]
  suggestedCorrections: Record<string, unknown>
  needsRegeneration: boolean
}

/**
 * Parse LLM critique response
 */
export function parseCritiqueResponse(response: string): CritiqueResult | null {
  try {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])

    // Validate structure
    if (
      typeof parsed.critiqueSummary !== 'string' ||
      !Array.isArray(parsed.confirmedIssues) ||
      !Array.isArray(parsed.dismissedIssues) ||
      typeof parsed.needsRegeneration !== 'boolean'
    ) {
      return null
    }

    return parsed as CritiqueResult
  } catch {
    return null
  }
}

/**
 * Apply corrections from critique to simulation
 *
 * @param simulation - Original simulation
 * @param corrections - Corrections from critique
 * @returns Corrected simulation (or original if no valid corrections)
 */
export function applyCorrections(
  simulation: FightSimulationOutput,
  corrections: Record<string, unknown>
): FightSimulationOutput {
  const corrected = { ...simulation }

  // Apply attribute corrections
  if (corrections.pace !== undefined && isValidAttribute(corrections.pace)) {
    corrected.attributes = { ...corrected.attributes, pace: corrections.pace as 1 | 2 | 3 | 4 | 5 }
  }
  if (corrections.finishDanger !== undefined && isValidAttribute(corrections.finishDanger)) {
    corrected.attributes = { ...corrected.attributes, finishDanger: corrections.finishDanger as 1 | 2 | 3 | 4 | 5 }
  }
  if (corrections.technicality !== undefined && isValidAttribute(corrections.technicality)) {
    corrected.attributes = { ...corrected.attributes, technicality: corrections.technicality as 1 | 2 | 3 | 4 | 5 }
  }
  if (corrections.styleClash !== undefined && isValidStyleClash(corrections.styleClash)) {
    corrected.attributes = { ...corrected.attributes, styleClash: corrections.styleClash }
  }
  if (corrections.brawlPotential !== undefined && typeof corrections.brawlPotential === 'boolean') {
    corrected.attributes = { ...corrected.attributes, brawlPotential: corrections.brawlPotential }
  }

  // Apply confidence correction
  if (corrections.confidence !== undefined && typeof corrections.confidence === 'number') {
    corrected.confidence = Math.min(1, Math.max(0, corrections.confidence))
  }

  return corrected
}

/**
 * Helpers for validation
 */
function isValidAttribute(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
}

function isValidStyleClash(value: unknown): value is 'Complementary' | 'Neutral' | 'Canceling' {
  return value === 'Complementary' || value === 'Neutral' || value === 'Canceling'
}
