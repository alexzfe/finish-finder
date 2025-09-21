import type { WeightClass } from '@/types/unified'

/**
 * Valid UFC weight classes
 */
export const WEIGHT_CLASSES: WeightClass[] = [
  'strawweight',
  'flyweight',
  'bantamweight',
  'featherweight',
  'lightweight',
  'welterweight',
  'middleweight',
  'light_heavyweight',
  'heavyweight',
  'womens_strawweight',
  'womens_flyweight',
  'womens_bantamweight',
  'womens_featherweight',
  'catchweight',
  'unknown'
] as const

/**
 * Type guard to check if a value is a valid WeightClass
 * @param value - The value to check
 * @returns True if value is a valid WeightClass
 */
export function isValidWeightClass(value: unknown): value is WeightClass {
  return typeof value === 'string' && (WEIGHT_CLASSES as readonly string[]).includes(value)
}

/**
 * Safely converts a string to a WeightClass with fallback
 * @param value - The value to convert
 * @param fallback - Default weight class if conversion fails
 * @returns Valid WeightClass or fallback
 */
export function toWeightClass(value: unknown, fallback: WeightClass = 'lightweight'): WeightClass {
  if (isValidWeightClass(value)) {
    return value
  }

  // Try to normalize common variations
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim().replace(/\s+/g, '_')

    // Handle common variations
    const variations: Record<string, WeightClass> = {
      'light_heavy': 'light_heavyweight',
      'light_weight': 'light_heavyweight', // 'Light Weight' becomes 'light_weight' after normalization
      'lightheavy': 'light_heavyweight',
      'lhw': 'light_heavyweight',
      'hw': 'heavyweight',
      'middle_weight': 'middleweight', // Handle 'middle weight'
      'wstrawweight': 'womens_strawweight',
      'wflyweight': 'womens_flyweight',
      'wbantamweight': 'womens_bantamweight',
      'wfeatherweight': 'womens_featherweight',
      'women_strawweight': 'womens_strawweight',
      'women_flyweight': 'womens_flyweight',
      'women_bantamweight': 'womens_bantamweight',
      'women_featherweight': 'womens_featherweight'
    }

    if (variations[normalized]) {
      return variations[normalized]
    }

    // Direct match after normalization
    if (isValidWeightClass(normalized)) {
      return normalized
    }
  }

  console.warn('Invalid weight class, using fallback:', {
    value,
    fallback,
    type: typeof value
  })

  return fallback
}

/**
 * Gets the display name for a weight class
 * @param weightClass - The weight class
 * @returns Formatted display name
 */
export function getWeightClassDisplayName(weightClass: WeightClass): string {
  const displayNames: Record<WeightClass, string> = {
    strawweight: 'Strawweight',
    flyweight: 'Flyweight',
    bantamweight: 'Bantamweight',
    featherweight: 'Featherweight',
    lightweight: 'Lightweight',
    welterweight: 'Welterweight',
    middleweight: 'Middleweight',
    light_heavyweight: 'Light Heavyweight',
    heavyweight: 'Heavyweight',
    womens_strawweight: "Women's Strawweight",
    womens_flyweight: "Women's Flyweight",
    womens_bantamweight: "Women's Bantamweight",
    womens_featherweight: "Women's Featherweight",
    catchweight: 'Catchweight',
    unknown: 'Unknown Weight Class'
  }

  return displayNames[weightClass] || weightClass
}