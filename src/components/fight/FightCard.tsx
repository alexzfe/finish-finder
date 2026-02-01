'use client'

import React, { useState } from 'react'

import { Reorder } from 'framer-motion'

import { FighterAvatar } from '@/components/fighter/FighterAvatar'
import { type Fight } from '@/types'

interface FightCardProps {
  fight: Fight
  onSelect: (fight: Fight) => void
  isPriority?: boolean
}

export const FightCard = React.memo(
  React.forwardRef<HTMLElement, FightCardProps>(function FightCard({
    fight,
    onSelect,
    isPriority = false
  }, ref) {
  // Manual state control for hover/tap to avoid React 19 compatibility issues
  const [isHovered, setIsHovered] = useState(false)
  const [isTapped, setIsTapped] = useState(false)
  // Fun Score color using heat scale (matches FightList.tsx)
  const getFunScoreColor = (score: number) => {
    if (score >= 85) return 'bg-[var(--score-fire)]'
    if (score >= 75) return 'bg-[var(--score-hot)]'
    if (score >= 65) return 'bg-[var(--score-warm)]'
    return 'bg-[var(--score-cold)]'
  }

  const formatWeightClass = (wc?: string | null): string => {
    if (!wc) return 'TBD'
    return wc
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const funScore = fight.predictedFunScore || 0

  return (
    <Reorder.Item
      value={fight}
      id={fight.id}
      as="article"
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: 1,
        y: 0,
        // Manual scale control based on state (avoids whileHover/whileTap React 19 bug)
        scale: isTapped ? 0.98 : isHovered ? 1.03 : 1,
      }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ type: 'spring', stiffness: 350, damping: 35 }}
      // Use Framer Motion's stable event handlers instead of whileHover/whileTap
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onTapStart={() => setIsTapped(true)}
      onTap={() => {
        setIsTapped(false)
        onSelect(fight)
      }}
      className="bg-gray-900 rounded-lg shadow-md overflow-hidden cursor-pointer border border-gray-800"
    >
      {/* Tier 1: Always Visible */}
      <div className="relative">
        {/* Fun Score Badge - MOST PROMINENT */}
        <div className={`absolute top-2 right-2 ${getFunScoreColor(funScore)} text-white px-3 py-1 rounded-full font-bold text-2xl z-10 shadow-lg`}>
          {funScore}
        </div>

        {/* Title Fight Indicator */}
        {fight.titleFight && (
          <div className="absolute top-2 left-2 bg-amber-500/20 text-amber-400 border border-amber-500/40 px-2 py-1 rounded-full text-xs font-bold ufc-condensed tracking-wider">
            TITLE
          </div>
        )}

        {/* Fighter Info */}
        <div className="p-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white">
          {/* Fighter 1 */}
          <div className="flex items-center gap-2 mb-2">
            <FighterAvatar
              fighterName={fight.fighter1?.name}
              size="sm"
            />
            <h3 className="font-bold text-base flex-1 truncate">
              {fight.fighter1?.name || 'TBD'}
            </h3>
          </div>

          {/* VS Separator */}
          <p className="text-sm text-gray-300 text-center my-1 ufc-condensed tracking-widest">vs</p>

          {/* Fighter 2 */}
          <div className="flex items-center gap-2">
            <FighterAvatar
              fighterName={fight.fighter2?.name}
              size="sm"
            />
            <h3 className="font-bold text-base flex-1 truncate">
              {fight.fighter2?.name || 'TBD'}
            </h3>
          </div>

          {/* Metadata */}
          <div className="mt-3 flex justify-between items-center text-xs text-gray-400 gap-2">
            <span className="truncate">{formatWeightClass(fight.weightClass)}</span>

            {fight.mainEvent && (
              <span className="bg-[var(--ufc-red)]/20 text-[var(--ufc-red)] border border-[var(--ufc-red)]/40 px-2 py-0.5 rounded-full font-bold whitespace-nowrap ufc-condensed tracking-wider text-[0.65rem]">
                MAIN EVENT
              </span>
            )}

            {!fight.mainEvent && fight.titleFight && (
              <span className="bg-amber-500/20 text-amber-400 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold whitespace-nowrap ufc-condensed tracking-wider text-[0.65rem]">
                TITLE FIGHT
              </span>
            )}

            {!fight.mainEvent && !fight.titleFight && fight.cardPosition && (
              <span className="capitalize whitespace-nowrap">{fight.cardPosition.replace('-', ' ')}</span>
            )}
          </div>
        </div>
      </div>
    </Reorder.Item>
  )
  })
)

FightCard.displayName = 'FightCard'
