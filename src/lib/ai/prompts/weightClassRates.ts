/**
 * Weight Class Base Finish Rates
 *
 * Historical finish rates by weight class based on UFC data analysis.
 * These serve as baseline probabilities for the Finish Probability prompt.
 *
 * Source: Historical UFC statistics (2010-2024)
 * Last Updated: 2025-11-02
 */

export interface WeightClassRates {
  finishRate: number      // Percentage of fights ending in finish (KO/TKO/SUB)
  koRate: number          // Percentage ending in KO/TKO
  submissionRate: number  // Percentage ending in submission
}

/**
 * Weight class base finish rates
 *
 * Generally follows pattern: Heavier divisions = higher finish rates
 * Exception: Flyweight has lower rates due to defensive skill
 */
export const WEIGHT_CLASS_FINISH_RATES: Record<string, WeightClassRates> = {
  // Men's Divisions
  'Heavyweight': {
    finishRate: 0.70,
    koRate: 0.58,
    submissionRate: 0.12,
  },
  'Light Heavyweight': {
    finishRate: 0.65,
    koRate: 0.48,
    submissionRate: 0.17,
  },
  'Middleweight': {
    finishRate: 0.58,
    koRate: 0.42,
    submissionRate: 0.16,
  },
  'Welterweight': {
    finishRate: 0.54,
    koRate: 0.36,
    submissionRate: 0.18,
  },
  'Lightweight': {
    finishRate: 0.51,
    koRate: 0.32,
    submissionRate: 0.19,
  },
  'Featherweight': {
    finishRate: 0.53,
    koRate: 0.35,
    submissionRate: 0.18,
  },
  'Bantamweight': {
    finishRate: 0.56,
    koRate: 0.38,
    submissionRate: 0.18,
  },
  'Flyweight': {
    finishRate: 0.50,
    koRate: 0.32,
    submissionRate: 0.18,
  },

  // Women's Divisions (generally lower finish rates)
  "Women's Featherweight": {
    finishRate: 0.45,
    koRate: 0.28,
    submissionRate: 0.17,
  },
  "Women's Bantamweight": {
    finishRate: 0.48,
    koRate: 0.30,
    submissionRate: 0.18,
  },
  "Women's Flyweight": {
    finishRate: 0.42,
    koRate: 0.24,
    submissionRate: 0.18,
  },
  "Women's Strawweight": {
    finishRate: 0.40,
    koRate: 0.22,
    submissionRate: 0.18,
  },

  // Catch Weight (use middleweight as default)
  'Catch Weight': {
    finishRate: 0.55,
    koRate: 0.38,
    submissionRate: 0.17,
  },
}

/**
 * Get base finish rate for a weight class
 *
 * @param weightClass - UFC weight class name
 * @returns Base rates or default middleweight rates if not found
 */
export function getWeightClassRates(weightClass: string | null | undefined): WeightClassRates {
  if (!weightClass) {
    // Default to middleweight rates
    return WEIGHT_CLASS_FINISH_RATES['Middleweight']
  }

  // Normalize weight class name (trim, title case)
  const normalized = weightClass.trim()

  // Try exact match first
  if (normalized in WEIGHT_CLASS_FINISH_RATES) {
    return WEIGHT_CLASS_FINISH_RATES[normalized]
  }

  // Try case-insensitive match
  const lowerWeightClass = normalized.toLowerCase()
  for (const [key, value] of Object.entries(WEIGHT_CLASS_FINISH_RATES)) {
    if (key.toLowerCase() === lowerWeightClass) {
      return value
    }
  }

  // Default to middleweight (middle of the pack)
  return WEIGHT_CLASS_FINISH_RATES['Middleweight']
}

/**
 * Normalize weight class name for display
 *
 * @param weightClass - Raw weight class string
 * @returns Normalized weight class name
 */
export function normalizeWeightClass(weightClass: string | null | undefined): string {
  if (!weightClass) return 'Unknown'

  const normalized = weightClass.trim()

  // Check if it exists in our mapping
  for (const key of Object.keys(WEIGHT_CLASS_FINISH_RATES)) {
    if (key.toLowerCase() === normalized.toLowerCase()) {
      return key
    }
  }

  return normalized
}
