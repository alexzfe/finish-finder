import { describe, it, expect } from 'vitest'
import { HybridUFCService } from '../hybridUFCService'

describe('HybridUFCService fight ordering and numbering', () => {
  it('orders fights by card position and assigns fightNumber', () => {
    const svc = new HybridUFCService(false)
    const orderAndNumberFights = (svc as any).orderAndNumberFights.bind(svc) as (f: any[]) => any[]

    const fights = [
      { id: 'f3', fighter1Id: 'a', fighter2Id: 'b', fighter1Name: 'A', fighter2Name: 'B', weightClass: 'lw', cardPosition: 'early-preliminary', scheduledRounds: 3, status: 'scheduled', titleFight: false },
      { id: 'f1', fighter1Id: 'c', fighter2Id: 'd', fighter1Name: 'C', fighter2Name: 'D', weightClass: 'mw', cardPosition: 'main', scheduledRounds: 5, status: 'scheduled', titleFight: true },
      { id: 'f2', fighter1Id: 'e', fighter2Id: 'f', fighter1Name: 'E', fighter2Name: 'F', weightClass: 'ww', cardPosition: 'preliminary', scheduledRounds: 3, status: 'scheduled', titleFight: false }
    ]

    const out = orderAndNumberFights(fights)

    expect(out.map(f => f.cardPosition)).toEqual(['main', 'preliminary', 'early-preliminary'])
    expect(out.map(f => f.fightNumber)).toEqual([1, 2, 3])
    expect(out[0].id).toBe('f1')
    expect(out[1].id).toBe('f2')
    expect(out[2].id).toBe('f3')
  })
})

