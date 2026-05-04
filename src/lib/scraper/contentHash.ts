import * as crypto from 'crypto'

export function calculateContentHash(data: Record<string, unknown>): string {
  const content = JSON.stringify(data, Object.keys(data).sort())
  return crypto.createHash('sha256').update(content).digest('hex')
}
