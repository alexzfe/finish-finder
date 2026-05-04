'use client'

import { useEffect, useMemo, memo, useCallback, useState } from 'react'

import { FighterAvatar } from '@/components/fighter/FighterAvatar'
import { CARD_POSITION_ORDER } from '@/config'
import { funScoreColor } from '@/lib/ui/funScoreColor'
import { type CardPosition, type Fight, type UFCEvent } from '@/types'

interface FightListProps {
  event: UFCEvent
  onFightClick?: (fight: Fight) => void
}

interface FightSection {
  title: string
  fights: Fight[]
}

const SECTION_FILTERS: Array<{ title: string; positions: CardPosition[] }> = [
  { title: 'Main Card', positions: ['main-event', 'co-main', 'main-card'] },
  { title: 'Preliminary Card', positions: ['preliminary'] },
  { title: 'Early Preliminary Card', positions: ['early-preliminary'] },
]

const prettifyWeightClass = (raw?: string) => {
  if (!raw) return 'TBD'
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

const FightListComponent = ({ event, onFightClick }: FightListProps) => {
  const [selectedFight, setSelectedFight] = useState<Fight | null>(null)

  const sections: FightSection[] = useMemo(() => {
    const fightCard = event.fightCard ?? []
    return SECTION_FILTERS
      .map(({ title, positions }) => ({
        title,
        // Sort by cardPosition order first (main-event → co-main → main-card),
        // then by fightNumber. Most rows have fightNumber=null in the live DB,
        // so the cardPosition tiebreaker is what places the main event at the
        // top of the section.
        fights: fightCard
          .filter((f) => positions.includes(f.cardPosition))
          .slice()
          .sort((a, b) => {
            const orderA = CARD_POSITION_ORDER[a.cardPosition] ?? 999
            const orderB = CARD_POSITION_ORDER[b.cardPosition] ?? 999
            if (orderA !== orderB) return orderA - orderB
            return (a.fightNumber ?? 0) - (b.fightNumber ?? 0)
          }),
      }))
      .filter((section) => section.fights.length > 0)
  }, [event])

  const allFights = useMemo(() => sections.flatMap((s) => s.fights), [sections])

  useEffect(() => {
    setSelectedFight((prev) => {
      const stillValid = prev && allFights.some((fight) => fight.id === prev.id)
      if (stillValid) return prev
      return allFights[0] ?? null
    })
  }, [allFights])

  const handleFightSelection = useCallback(
    (fight: Fight) => {
      setSelectedFight(fight)
      onFightClick?.(fight)
    },
    [onFightClick]
  )

  const getFinishProbabilityStyle = (probability: number) => {
    const pct = probability * 100
    if (pct >= 70) return { bg: 'bg-[var(--finish-high)]/15', border: 'border-[var(--finish-high)]/40', text: 'text-[var(--finish-high)]' }
    if (pct >= 50) return { bg: 'bg-[var(--finish-mid)]/10', border: 'border-[var(--finish-mid)]/25', text: 'text-[var(--finish-mid)]' }
    return { bg: 'bg-white/5', border: 'border-white/10', text: 'text-[var(--finish-low)]' }
  }

  const formatRecord = (record?: { wins: number; losses: number; draws: number }) => {
    if (!record) return '0-0-0'
    return `${record.wins}-${record.losses}-${record.draws}`
  }

  const positionLabel = (fight: Fight): string => {
    switch (fight.cardPosition) {
      case 'main-event': return 'Main Event'
      case 'co-main': return 'Co-Main Event'
      case 'main-card': return 'Main Card'
      default: return 'Main Card'
    }
  }

  const renderFightRow = useCallback(
    (fight: Fight, sectionTitle: string) => {
      const isActive = selectedFight?.id === fight.id
      const funScore = fight.prediction?.funScore ?? 0
      const finishProbability = fight.prediction?.finishProbability ?? 0
      const headerLabel =
        sectionTitle === 'Main Card' ? positionLabel(fight) : sectionTitle

      return (
        <div
          key={fight.id}
          className={`group relative overflow-hidden rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--ufc-red)]/60 hover:shadow-[0_20px_35px_rgba(0,0,0,0.45)] cursor-pointer ${
            isActive ? 'border-[var(--ufc-red)] shadow-[0_22px_40px_rgba(210,10,10,0.35)]' : 'border-white/10'
          }`}
          onClick={() => handleFightSelection(fight)}
          style={{ fontFamily: 'var(--ufc-font-sans)' }}
        >
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-white/5 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

          <div className="border-b border-white/10 bg-black/60 px-3 py-2.5 sm:px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="ufc-condensed text-xs text-white/70">{headerLabel}</span>
                {fight.mainEvent && (
                  <span className="ufc-condensed text-[0.6rem] md:text-[0.65rem] lg:text-[0.7rem] tracking-[0.3em] rounded-full px-2 py-0.5 bg-[var(--ufc-red)]/20 text-[var(--ufc-red)] border border-[var(--ufc-red)]/40">
                    Main
                  </span>
                )}
                {fight.titleFight && (
                  <span className="ufc-condensed text-[0.6rem] md:text-[0.65rem] lg:text-[0.7rem] tracking-[0.3em] rounded-full px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/40">
                    Title
                  </span>
                )}
              </div>
              <div className="text-right">
                <div className="ufc-condensed text-lg md:text-xl" style={funScoreColor(funScore)}>
                  {funScore}
                </div>
                <div className="text-[0.6rem] md:text-[0.65rem] lg:text-[0.7rem] uppercase tracking-[0.26em] text-white/70">
                  Fun Score
                </div>
              </div>
            </div>
          </div>

          <div className="bg-black/50 p-2.5 sm:p-3.5">
            {/* Mobile: Stacked Layout, Desktop: Side by Side */}
            <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
              {/* Fighter 1 */}
              <div className="flex flex-1 items-center space-x-2 sm:space-x-3 md:space-x-4">
                <FighterAvatar
                  fighterName={fight.fighter1?.name}
                  imageUrl={fight.fighter1?.imageUrl}
                  size="responsive"
                />
                <div className="min-w-0 flex-1">
                  <div className="ufc-condensed truncate text-sm sm:text-base md:text-lg flex items-center gap-1.5 text-white">
                    {fight.fighter1?.name || 'TBD'}
                    {fight.completed && fight.winnerId && fight.winnerId === fight.fighter1?.id && (
                      <span className="text-[var(--ufc-red)]">✓</span>
                    )}
                  </div>
                  <div className="text-[0.65rem] md:text-[0.7rem] lg:text-xs uppercase tracking-[0.22em] text-white/70">
                    {formatRecord(fight.fighter1?.record)}
                  </div>
                </div>
              </div>

              {/* VS Divider */}
              <div className="flex justify-center px-2 sm:px-4">
                <span className="ufc-condensed text-xs tracking-[0.4em] text-white/60">VS</span>
              </div>

              {/* Fighter 2 */}
              <div className="flex flex-1 items-center justify-end space-x-2 sm:space-x-3 md:space-x-4">
                <div className="min-w-0 flex-1 text-right">
                  <div className="ufc-condensed truncate text-sm sm:text-base md:text-lg flex items-center justify-end gap-1.5 text-white">
                    {fight.completed && fight.winnerId && fight.winnerId === fight.fighter2?.id && (
                      <span className="text-[var(--ufc-red)]">✓</span>
                    )}
                    {fight.fighter2?.name || 'TBD'}
                  </div>
                  <div className="text-[0.65rem] md:text-[0.7rem] lg:text-xs uppercase tracking-[0.22em] text-white/70">
                    {formatRecord(fight.fighter2?.record)}
                  </div>
                </div>
                <FighterAvatar
                  fighterName={fight.fighter2?.name}
                  imageUrl={fight.fighter2?.imageUrl}
                  size="responsive"
                />
              </div>
            </div>

            {/* Fight Details */}
            <div className="mt-3 border-t border-white/10 pt-2.5">
              {fight.completed && fight.winnerId ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[0.65rem] md:text-[0.7rem] lg:text-xs uppercase tracking-[0.24em]">
                    <span className="text-white/60">Result</span>
                    <span className="text-[var(--ufc-red)] font-medium">
                      {fight.winnerId === fight.fighter1?.id ? fight.fighter1?.name : fight.fighter2?.name}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[0.65rem] md:text-[0.7rem] lg:text-xs uppercase tracking-[0.24em] text-white/75">
                    <span className="truncate">{prettifyWeightClass(fight.weightClass)}</span>
                    {fight.method && <span className="whitespace-nowrap text-white">via {fight.method}</span>}
                    {fight.round && fight.time && (
                      <span className="whitespace-nowrap">R{fight.round} {fight.time}</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[0.65rem] md:text-[0.7rem] lg:text-xs uppercase tracking-[0.24em] text-white/75 sm:flex-nowrap sm:gap-2">
                  <span className="truncate">{prettifyWeightClass(fight.weightClass)}</span>
                  <span className="whitespace-nowrap">{fight.scheduledRounds || 3} Rounds</span>
                  {finishProbability ? (
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 border ${getFinishProbabilityStyle(finishProbability).bg} ${getFinishProbabilityStyle(finishProbability).border} ${getFinishProbabilityStyle(finishProbability).text}`}>
                      Finish {Math.round(finishProbability * 100)}%
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      )
    },
    [selectedFight?.id, handleFightSelection]
  )

  if (!allFights.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-black/50 py-12 text-center text-white">
        <h3 className="ufc-condensed text-xl text-white">Fight card incoming</h3>
        <p className="mt-1 text-[0.65rem] md:text-[0.7rem] lg:text-xs uppercase tracking-[0.3em] text-white/50">Check back once the UFC locks the bouts</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <div key={section.title} className="rounded-2xl border border-white/5 bg-black/40 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-3 sm:px-5">
            <h2 className="ufc-condensed text-lg text-white md:text-xl">{section.title}</h2>
            <span className="text-[0.6rem] md:text-[0.65rem] lg:text-[0.7rem] uppercase tracking-[0.3em] text-white/40">{section.fights.length} Fights</span>
          </div>

          <div className="p-3 sm:p-5">
            <div className="grid gap-3.5">
              {section.fights.map((fight) => renderFightRow(fight, section.title))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export const FightList = memo(FightListComponent)
