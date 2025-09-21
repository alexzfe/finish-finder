/**
 * Utility functions for JSON parsing and validation
 */

/**
 * Safely parses a JSON string that should contain an array
 * @param value - The value to parse (typically from database)
 * @returns Parsed array or empty array if parsing fails
 */
export function parseJsonArray(value: unknown): unknown[] {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn('Failed to parse JSON payload from database, falling back to empty array.', {
      error,
      payloadPreview: value.slice(0, 120)
    })
    return []
  }
}

/**
 * Safely parses a JSON string with fallback to default value
 * @param value - The value to parse
 * @param fallback - Default value if parsing fails
 * @returns Parsed value or fallback
 */
export function parseJsonSafe<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch (error) {
    console.warn('Failed to parse JSON payload, using fallback value.', {
      error,
      payloadPreview: typeof value === 'string' ? value.slice(0, 120) : value,
      fallback
    })
    return fallback
  }
}

/**
 * Validates and safely stringifies a value for JSON storage
 * @param value - The value to stringify
 * @param fieldName - Name of the field for error logging
 * @returns JSON string or empty array string if failed
 */
export function stringifyJsonSafe(value: unknown, fieldName?: string): string {
  if (value === null || value === undefined) {
    return JSON.stringify([])
  }

  try {
    return JSON.stringify(value)
  } catch (error) {
    console.warn(`Failed to stringify ${fieldName || 'value'}, falling back to empty array:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      type: typeof value
    })
    return JSON.stringify([])
  }
}