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
      const parsed = JSON.parse(value)
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

  // Required fields
  if (!fight.id || typeof fight.id !== 'string') {
    errors.push('Fight ID is required and must be a string')
  }

  if (!fight.fighter1Id || typeof fight.fighter1Id !== 'string') {
    errors.push('Fighter1 ID is required and must be a string')
  }

  if (!fight.fighter2Id || typeof fight.fighter2Id !== 'string') {
    errors.push('Fighter2 ID is required and must be a string')
  }

  if (!fight.eventId || typeof fight.eventId !== 'string') {
    errors.push('Event ID is required and must be a string')
  }

  if (!fight.weightClass || typeof fight.weightClass !== 'string') {
    errors.push('Weight class is required and must be a string')
  }

  // Validate numeric fields
  if (fight.fightNumber !== null && fight.fightNumber !== undefined) {
    if (typeof fight.fightNumber !== 'number' || fight.fightNumber < 1) {
      errors.push('Fight number must be a positive number')
    }
  }

  if (fight.scheduledRounds !== null && fight.scheduledRounds !== undefined) {
    if (typeof fight.scheduledRounds !== 'number' || fight.scheduledRounds < 1) {
      errors.push('Scheduled rounds must be a positive number')
    }
  }

  // Validate boolean fields
  if (fight.titleFight !== null && fight.titleFight !== undefined) {
    if (typeof fight.titleFight !== 'boolean') {
      errors.push('Title fight must be a boolean')
    }
  }

  return { valid: errors.length === 0, errors }
}

export function validateFighterData(fighter: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Required fields
  if (!fighter.id || typeof fighter.id !== 'string') {
    errors.push('Fighter ID is required and must be a string')
  }

  if (!fighter.name || typeof fighter.name !== 'string') {
    errors.push('Fighter name is required and must be a string')
  }

  // Validate numeric fields
  if (fighter.wins !== null && fighter.wins !== undefined) {
    if (typeof fighter.wins !== 'number' || fighter.wins < 0) {
      errors.push('Wins must be a non-negative number')
    }
  }

  if (fighter.losses !== null && fighter.losses !== undefined) {
    if (typeof fighter.losses !== 'number' || fighter.losses < 0) {
      errors.push('Losses must be a non-negative number')
    }
  }

  if (fighter.draws !== null && fighter.draws !== undefined) {
    if (typeof fighter.draws !== 'number' || fighter.draws < 0) {
      errors.push('Draws must be a non-negative number')
    }
  }

  return { valid: errors.length === 0, errors }
}