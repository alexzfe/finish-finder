import { describe, it, expect } from 'vitest'

// NOTE: This test hits Wikipedia live. It is intended as a fast smoke/perf check
// for local/dev runs. It uses fast mode and disables enrichment.

describe('Scraper perf smoke (Wikipedia-only, fast mode)', () => {
  it('fetches 1 event with ordered fights under 10s', async () => {
    const start = Date.now()

    process.env.SCRAPER_FAST = 'true'
    process.env.TAPOLOGY_ENRICH_RECORDS = 'false'
    process.env.SHERDOG_ENABLED = 'false'

    const mod = await import('../hybridUFCService.ts')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mod as any).HybridUFCService.prototype.enrichFighterRecordsFromTapology = async () => null

    const svc = new mod.HybridUFCService(false)
    const { events } = await svc.getUpcomingUFCEvents(1)

    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(10000)

    // If network resolved, validate structure/order
    if (events.length > 0) {
      const ev = events[0]
      expect(ev.fightCard.length).toBeGreaterThan(0)
      const nums = ev.fightCard.map((f: any) => f.fightNumber)
      expect(nums[0]).toBe(1)
      for (let i = 1; i < nums.length; i++) {
        expect(nums[i]).toBe(i + 1)
      }
    }
  }, 20000)
})
