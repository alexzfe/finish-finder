/**
 * Database validation utilities to ensure data integrity before writes
 */

export function validateJsonField(value: unknown, fieldName: string): string {
  if (value === null || value === undefined) {
    return JSON.stringify([])
  }

  if (typeof value === 'string') {
    try {
      // Validate that it's proper JSON
      JSON.parse(value)
      // Return the original string if valid
      return value
    } catch (error) {
      console.warn(`Invalid JSON in field ${fieldName}, falling back to empty array:`, {
        value: typeof value === 'string' ? value.slice(0, 100) : value,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return JSON.stringify([])
    }
  }

  if (Array.isArray(value) || typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch (error) {
      console.warn(`Failed to stringify ${fieldName}, falling back to empty array:`, {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      return JSON.stringify([])
    }
  }

  console.warn(`Unexpected type for JSON field ${fieldName}, falling back to empty array:`, {
    type: typeof value,
    value
  })
  return JSON.stringify([])
}

export function validateFightData(fight: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fightData = fight as any // Type assertion for validation function

  // Required fields
  if (!fightData.id || typeof fightData.id !== 'string') {
    errors.push('Fight ID is required and must be a string')
  }

  if (!fightData.fighter1Id || typeof fightData.fighter1Id !== 'string') {
    errors.push('Fighter1 ID is required and must be a string')
  }

  if (!fightData.fighter2Id || typeof fightData.fighter2Id !== 'string') {
    errors.push('Fighter2 ID is required and must be a string')
  }

  if (!fightData.eventId || typeof fightData.eventId !== 'string') {
    errors.push('Event ID is required and must be a string')
  }

  if (!fightData.weightClass || typeof fightData.weightClass !== 'string') {
    errors.push('Weight class is required and must be a string')
  }

  // Validate numeric fields
  if (fightData.fightNumber !== null && fightData.fightNumber !== undefined) {
    if (typeof fightData.fightNumber !== 'number' || fightData.fightNumber < 1) {
      errors.push('Fight number must be a positive number')
    }
  }

  if (fightData.scheduledRounds !== null && fightData.scheduledRounds !== undefined) {
    if (typeof fightData.scheduledRounds !== 'number' || fightData.scheduledRounds < 1) {
      errors.push('Scheduled rounds must be a positive number')
    }
  }

  // Validate boolean fields
  if (fightData.titleFight !== null && fightData.titleFight !== undefined) {
    if (typeof fightData.titleFight !== 'boolean') {
      errors.push('Title fight must be a boolean')
    }
  }

  return { valid: errors.length === 0, errors }
}

export function validateFighterData(fighter: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Handle null/undefined input
  if (!fighter || typeof fighter !== 'object') {
    errors.push('Fighter data is required and must be an object')
    return { valid: false, errors }
  }

  // Type assertion for validation function
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fighterData = fighter as any

  // Required fields
  if (!fighterData.id || typeof fighterData.id !== 'string') {
    errors.push('Fighter ID is required and must be a string')
  }

  if (!fighterData.name || typeof fighterData.name !== 'string') {
    errors.push('Fighter name is required and must be a string')
  }

  // Validate numeric fields
  if (fighterData.wins !== null && fighterData.wins !== undefined) {
    if (typeof fighterData.wins !== 'number' || fighterData.wins < 0) {
      errors.push('Wins must be a non-negative number')
    }
  }

  if (fighterData.losses !== null && fighterData.losses !== undefined) {
    if (typeof fighterData.losses !== 'number' || fighterData.losses < 0) {
      errors.push('Losses must be a non-negative number')
    }
  }

  if (fighterData.draws !== null && fighterData.draws !== undefined) {
    if (typeof fighterData.draws !== 'number' || fighterData.draws < 0) {
      errors.push('Draws must be a non-negative number')
    }
  }

  return { valid: errors.length === 0, errors }
}