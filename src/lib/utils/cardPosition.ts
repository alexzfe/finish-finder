import type { CardPosition } from '@/types'

// The Python scraper writes five distinct cardPosition values
// (scraper/ufc_scraper/parsers.py:336-344) and the DB carries them through
// unchanged. Keeping them distinct in the canonical enum is load-bearing
// because `fightNumber` is null for newly-scraped fights — without these
// values, the within-card ordering (Main Event → Co-Main → rest) collapses.
const CANONICAL_BY_RAW: Record<string, CardPosition> = {
  // Title-case forms emitted by the Python scraper.
  'Main Event': 'main-event',
  'Co-Main Event': 'co-main',
  'Main Card': 'main-card',
  'Prelims': 'preliminary',
  'Early Prelims': 'early-preliminary',

  // Already-canonical kebab forms (defensive — some paths already emit these).
  'main-event': 'main-event',
  'co-main': 'co-main',
  'main-card': 'main-card',
  'preliminary': 'preliminary',
  'early-preliminary': 'early-preliminary',

  // Lower-case spelled-out variants from older scraper revisions.
  'main': 'main-card',
  'prelims': 'preliminary',
  'early prelims': 'early-preliminary',
}

/**
 * Map a raw `cardPosition` string to the canonical wire enum.
 *
 * Falls through to `'preliminary'` for unknown inputs rather than throwing —
 * an unrecognised value should not blank the page; it just lands in the
 * fallback bucket. Callers may log unknown inputs separately.
 */
export function toCanonicalCardPosition(raw: string | null | undefined): CardPosition {
  if (!raw) return 'preliminary'
  const trimmed = raw.trim()
  return (
    CANONICAL_BY_RAW[trimmed] ??
    CANONICAL_BY_RAW[trimmed.toLowerCase()] ??
    'preliminary'
  )
}
