import crypto from 'crypto'

// A small pool of realistic desktop User-Agent strings (2024–2025 era)
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:127.0) Gecko/20100101 Firefox/127.0'
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function getRotatedHeaders(referer?: string): Record<string, string> {
  const ua = pick(userAgents)

  const headers: Record<string, string> = {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  }

  if (referer) headers['Referer'] = referer

  return headers
}

export async function humanDelay(minMs = 800, maxMs = 2400): Promise<void> {
  const jitter = Math.random() * (maxMs - minMs) + minMs
  await new Promise(r => setTimeout(r, jitter))
}

export async function backoffDelay(attempt: number, baseMs = 1000, maxMs = 10000): Promise<void> {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt))
  // Add jitter of +/- 20%
  const jitter = exp * (0.8 + Math.random() * 0.4)
  await new Promise(r => setTimeout(r, jitter))
}

export function sessionId(): string {
  return crypto.randomBytes(8).toString('hex')
}

