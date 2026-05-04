import type { CardPosition } from '@/types'

const CANONICAL_BY_RAW: Record<string, CardPosition> = {
  // Title-case forms emitted by the Wikipedia/Tapology scrapers.
  'Main Event': 'main',
  'Co-Main Event': 'co-main',
  'Main Card': 'main',
  'Prelims': 'preliminary',
  'Early Prelims': 'early-preliminary',

  // Already-canonical kebab forms (defensive — some paths already emit these).
  'main': 'main',
  'co-main': 'co-main',
  'preliminary': 'preliminary',
  'early-preliminary': 'early-preliminary',
}

/**
 * Map a raw `cardPosition` string to the canonical wire enum.
 *
 * Falls through to `'preliminary'` for unknown inputs rather than throwing —
 * an unrecognised value should not blank the page; it just lands in the
 * fallback bucket and (caller's responsibility) can be reported to Sentry.
 */
export function toCanonicalCardPosition(raw: string | null | undefined): CardPosition {
  if (!raw) return 'preliminary'
  return CANONICAL_BY_RAW[raw] ?? CANONICAL_BY_RAW[raw.trim()] ?? 'preliminary'
}
