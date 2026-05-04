/**
 * Continuous color interpolation along the 1-10 funScore axis.
 *
 * Five anchor stops; linear RGB interpolation between adjacent stops
 * gives every integer score 1-10 a distinct colour.
 */

const ANCHORS: ReadonlyArray<readonly [score: number, hex: string]> = [
  [1, '#94a3b8'], // slate-400 — cold
  [3, '#38bdf8'], // sky-400   — cool
  [5, '#fbbf24'], // amber-400 — warm
  [7, '#f97316'], // orange-500 — hot
  [10, '#ef4444'], // red-500  — fire
]

const FIRE_GLOW = '0 0 16px rgba(239, 68, 68, 0.6), 0 0 8px rgba(239, 68, 68, 0.4)'
const FIRE_GLOW_THRESHOLD = 9

export interface FunScoreStyle {
  color: string
  textShadow?: string
}

export function funScoreColor(score: number): FunScoreStyle {
  const clamped = Math.min(10, Math.max(1, score))

  let hex = ANCHORS[ANCHORS.length - 1][1]
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [a, aHex] = ANCHORS[i]
    const [b, bHex] = ANCHORS[i + 1]
    if (clamped <= b) {
      const t = (clamped - a) / (b - a)
      hex = mixHex(aHex, bHex, t)
      break
    }
  }

  return clamped >= FIRE_GLOW_THRESHOLD ? { color: hex, textShadow: FIRE_GLOW } : { color: hex }
}

function mixHex(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16)
  const ag = parseInt(a.slice(3, 5), 16)
  const ab = parseInt(a.slice(5, 7), 16)
  const br = parseInt(b.slice(1, 3), 16)
  const bg = parseInt(b.slice(3, 5), 16)
  const bb = parseInt(b.slice(5, 7), 16)
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bl = Math.round(ab + (bb - ab) * t)
  return `#${toHex2(r)}${toHex2(g)}${toHex2(bl)}`
}

function toHex2(value: number): string {
  return value.toString(16).padStart(2, '0')
}
