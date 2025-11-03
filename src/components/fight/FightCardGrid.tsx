'use client'

import { useAppStore } from '@/lib/store'
import { FightCard } from './FightCard'
import { useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Fight } from '@/types'

export function FightCardGrid() {
  const fights = useAppStore((state) => state.getFilteredSortedFights())
  const setSelectedFight = useAppStore((state) => state.setSelectedFight)

  const handleSelect = useCallback((fight: Fight) => {
    setSelectedFight(fight)
  }, [setSelectedFight])

  if (fights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-black/50 py-12 text-center text-white">
        <div className="mb-3 text-5xl">🥊</div>
        <h3 className="ufc-condensed text-xl text-white">No fights match your filters</h3>
        <p className="mt-1 text-[0.65rem] uppercase tracking-[0.3em] text-white/50">
          Try adjusting your weight class filters
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
      <AnimatePresence>
        {fights.map((fight, index) => (
          <FightCard
            key={fight.id}
            fight={fight}
            onSelect={handleSelect}
            isPriority={index < 6}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
