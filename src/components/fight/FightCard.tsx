'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Fight } from '@/types'
import { FighterAvatar } from '@/components/fighter/FighterAvatar'

interface FightCardProps {
  fight: Fight
  onSelect: (fight: Fight) => void
  isPriority?: boolean
}

export const FightCard = React.memo(function FightCard({
  fight,
  onSelect,
  isPriority = false
}: FightCardProps) {
  // Fun Score color coding based on implementation plan thresholds
  const getFunScoreColor = (score: number) => {
    if (score >= 80) return 'bg-red-500'
    if (score >= 60) return 'bg-yellow-500'
    if (score >= 40) return 'bg-orange-500'
    return 'bg-gray-500'
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
    <motion.article
      className="bg-gray-900 rounded-lg shadow-md overflow-hidden cursor-pointer border border-gray-800"
      whileHover={{ scale: 1.03, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(fight)}
    >
      {/* Tier 1: Always Visible */}
      <div className="relative">
        {/* Fun Score Badge - MOST PROMINENT */}
        <div className={`absolute top-2 right-2 ${getFunScoreColor(funScore)} text-white px-3 py-1 rounded-full font-bold text-2xl z-10 shadow-lg`}>
          {funScore}
        </div>

        {/* Title Fight Indicator */}
        {fight.titleFight && (
          <div className="absolute top-2 left-2 bg-yellow-600 text-white px-2 py-1 rounded text-xs font-bold">
            🏆 TITLE
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
              <span className="bg-red-600 text-white px-2 py-0.5 rounded font-bold whitespace-nowrap">
                MAIN EVENT
              </span>
            )}

            {!fight.mainEvent && fight.titleFight && (
              <span className="bg-yellow-700 text-white px-2 py-0.5 rounded font-bold whitespace-nowrap">
                TITLE FIGHT
              </span>
            )}

            {!fight.mainEvent && !fight.titleFight && fight.cardPosition && (
              <span className="capitalize whitespace-nowrap">{fight.cardPosition.replace('-', ' ')}</span>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  )
})
