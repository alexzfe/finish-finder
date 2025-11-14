'use client'

import { useState, useEffect, useMemo, memo, useCallback } from 'react'
import { UFCEvent, Fight, WeightClass } from '@/types'
import { FighterAvatar } from '@/components/fighter/FighterAvatar'

interface FightListProps {
  event: UFCEvent
  onFightClick?: (fight: Fight) => void
}

interface NormalizedSections {
  mainCard: Fight[]
  prelimCard: Fight[]
  earlyPrelimCard: Fight[]
  allFights: Fight[]
}

type CardBucket = 'main' | 'preliminary' | 'early-preliminary'

type Section = {
  title: string
  fights: Fight[]
}

const FightListComponent = ({ event, onFightClick }: FightListProps) => {
  const [loading, setLoading] = useState(true)
  const [sections, setSections] = useState<NormalizedSections>({
    mainCard: [],
    prelimCard: [],
    earlyPrelimCard: [],
    allFights: []
  })
  const [selectedFight, setSelectedFight] = useState<Fight | null>(null)

  const prettifyWeightClass = (raw?: string) => {
    if (!raw) return 'TBD'
    return raw
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase())
  }

  const normalizeFight = (fight: Fight, cardPosition: CardBucket, index: number): Fight => {
    const funFactorScore = (fight.funFactor ?? 0) * 10
    const predictedFunScore = fight.predictedFunScore ?? Math.min(100, Math.round(funFactorScore))
    const funFactors = Array.isArray(fight.funFactors) ? fight.funFactors : []

    return {
      ...fight,
      cardPosition: fight.cardPosition || cardPosition,
      fightNumber: fight.fightNumber ?? index + 1,
      predictedFunScore,
      funFactors,
      aiDescription: fight.aiDescription || fight.entertainmentReason || '',
      finishProbability: fight.finishProbability ?? 0,
      riskLevel: fight.riskLevel ?? null,
      weightClass: prettifyWeightClass(
        fight.weightClass || fight.fighter1?.weightClass || fight.fighter2?.weightClass
      ) as WeightClass,
      mainEvent: fight.mainEvent ?? (cardPosition === 'main' && index === 0)
    }
  }

  useEffect(() => {
    if (!event.fightCard || event.fightCard.length === 0) {
      setSections({ mainCard: [], prelimCard: [], earlyPrelimCard: [], allFights: [] })
      setSelectedFight(null)
      setLoading(false)
      return
    }

    setLoading(true)

    const normalizeSection = (fights: Fight[] | undefined, bucket: CardBucket) =>
      (fights ?? [])
        .map((fight, index) => normalizeFight(fight, bucket, index))
        .sort((a, b) => (a.fightNumber || 0) - (b.fightNumber || 0))

    const mainCard = normalizeSection(
      event.mainCard && event.mainCard.length ? event.mainCard : event.fightCard.filter(f => f.cardPosition === 'main'),
      'main'
    )
    const prelimCard = normalizeSection(
      event.prelimCard && event.prelimCard.length ? event.prelimCard : event.fightCard.filter(f => f.cardPosition === 'preliminary'),
      'preliminary'
    )
    const earlyPrelimCard = normalizeSection(
      event.earlyPrelimCard && event.earlyPrelimCard.length ? event.earlyPrelimCard : event.fightCard.filter(f => f.cardPosition === 'early-preliminary'),
      'early-preliminary'
    )

    const allFights = [...mainCard, ...prelimCard, ...earlyPrelimCard]

    setSections({ mainCard, prelimCard, earlyPrelimCard, allFights })
    setSelectedFight(allFights[0] ?? null)
    setLoading(false)
  }, [event])

  const getFunScoreTextClass = (score: number) => {
    if (score >= 85) return 'text-red-500'
    if (score >= 75) return 'text-orange-400'
    if (score >= 65) return 'text-yellow-400'
    return 'text-white'
  }

  const getFunScoreStyle = (score: number) => {
    if (score >= 85) return { color: '#d20a0a' }
    if (score >= 75) return { color: '#f97316' }
    if (score >= 65) return { color: '#fbbf24' }
    return { color: '#f1f5f9' }
  }

  const sectionsToRender: Section[] = useMemo(() => [
    { title: '👑 Main Card', fights: sections.mainCard.map((fight, index) => ({
      ...fight,
      position: index === 0 ? 'Main Event' : index === 1 ? 'Co-Main Event' : 'Main Card'
    })) },
    { title: '⚡ Preliminary Card', fights: sections.prelimCard.map(fight => ({ ...fight, position: 'Preliminary Card' })) },
    { title: '🌟 Early Preliminary Card', fights: sections.earlyPrelimCard.map(fight => ({ ...fight, position: 'Early Preliminary Card' })) }
  ].filter(section => section.fights.length > 0), [sections])

  const formatRecord = (record?: { wins: number; losses: number; draws: number }) => {
    if (!record) return '0-0-0'
    return `${record.wins}-${record.losses}-${record.draws}`
  }

  const handleFightSelection = useCallback((fight: Fight) => {
    setSelectedFight(fight)
    onFightClick?.(fight)
  }, [onFightClick])

  const renderFightRow = useCallback((fight: Fight) => {
    const isActive = selectedFight?.id === fight.id
    const funScore = fight.predictedFunScore || 0

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
              <span className="ufc-condensed text-xs text-white/70">
                {fight.cardPosition || 'Fight' }
              </span>
              {fight.titleFight && (
                <span className="ufc-condensed text-[0.6rem] tracking-[0.3em] text-white" style={{ backgroundColor: 'rgba(210,10,10,0.15)', padding: '0.15rem 0.55rem', borderRadius: '999px', border: '1px solid rgba(210,10,10,0.35)' }}>
                  Title
                </span>
              )}
            </div>
            <div className="text-right">
              <div className="ufc-condensed text-lg md:text-xl" style={getFunScoreStyle(funScore)}>
                {funScore}
              </div>
              <div className="text-[0.6rem] uppercase tracking-[0.26em] text-white/70">
                Fun Score
              </div>
            </div>
          </div>
        </div>

        <div className="bg-black/50 p-2.5 sm:p-3.5">
          {/* Mobile: Stacked Layout, Desktop: Side by Side */}
          <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            {/* Fighter 1 */}
            <div className="flex flex-1 items-center space-x-2 sm:space-x-3">
              <FighterAvatar
                fighterName={fight.fighter1?.name}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <div className={`ufc-condensed truncate text-sm sm:text-base md:text-lg flex items-center gap-1.5 ${
                  fight.completed && fight.winnerId && fight.winnerId === fight.fighter1?.id
                    ? 'text-[var(--ufc-red)] font-bold'
                    : 'text-white'
                }`} style={!fight.completed || !fight.winnerId || fight.winnerId !== fight.fighter1?.id ? getFunScoreStyle(funScore) : undefined}>
                  {fight.fighter1?.name || 'TBD'}
                  {fight.completed && fight.winnerId && fight.winnerId === fight.fighter1?.id && (
                    <span className="text-[var(--ufc-red)]">✓</span>
                  )}
                </div>
                <div className="text-[0.65rem] uppercase tracking-[0.22em] text-white/70">
                  {formatRecord(fight.fighter1?.record)}
                </div>
              </div>
            </div>

            {/* VS Divider */}
            <div className="flex justify-center px-2 sm:px-4">
              <span className="ufc-condensed text-xs tracking-[0.4em] text-white/60">VS</span>
            </div>

            {/* Fighter 2 */}
            <div className="flex flex-1 items-center justify-end space-x-2 sm:space-x-3">
              <div className="min-w-0 flex-1 text-right">
                <div className={`ufc-condensed truncate text-sm sm:text-base md:text-lg flex items-center justify-end gap-1.5 ${
                  fight.completed && fight.winnerId && fight.winnerId === fight.fighter2?.id
                    ? 'text-[var(--ufc-red)] font-bold'
                    : 'text-white'
                }`} style={!fight.completed || !fight.winnerId || fight.winnerId !== fight.fighter2?.id ? getFunScoreStyle(funScore) : undefined}>
                  {fight.completed && fight.winnerId && fight.winnerId === fight.fighter2?.id && (
                    <span className="text-[var(--ufc-red)]">✓</span>
                  )}
                  {fight.fighter2?.name || 'TBD'}
                </div>
                <div className="text-[0.65rem] uppercase tracking-[0.22em] text-white/70">
                  {formatRecord(fight.fighter2?.record)}
                </div>
              </div>
              <FighterAvatar
                fighterName={fight.fighter2?.name}
                size="md"
              />
            </div>
          </div>

          {/* Fight Details */}
          <div className="mt-3 border-t border-white/10 pt-2.5">
            {fight.completed && fight.winnerId ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.24em]">
                  <span className="text-white/60">Result</span>
                  <span className="text-[var(--ufc-red)] font-medium">
                    {fight.winnerId === fight.fighter1?.id ? fight.fighter1?.name : fight.fighter2?.name}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1 text-[0.65rem] uppercase tracking-[0.24em] text-white/75">
                  <span className="truncate">{fight.weightClass}</span>
                  {fight.method && <span className="whitespace-nowrap text-white">via {fight.method}</span>}
                  {fight.round && fight.time && (
                    <span className="whitespace-nowrap">R{fight.round} {fight.time}</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-1 text-[0.65rem] uppercase tracking-[0.24em] text-white/75 sm:flex-nowrap sm:gap-0">
                <span className="truncate">{fight.weightClass}</span>
                <span className="whitespace-nowrap">{fight.scheduledRounds || 3} Rounds</span>
                {fight.finishProbability ? (
                  <span className="whitespace-nowrap text-white">Finish {Math.round(fight.finishProbability * 100)}%</span>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }, [selectedFight?.id, handleFightSelection])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-black/50 py-10 text-center text-white">
        <div className="mb-3 text-4xl">🎯</div>
        <p className="ufc-condensed text-base text-white">Loading Fight Card...</p>
        <p className="mt-1 text-[0.65rem] uppercase tracking-[0.3em] text-white/50">Syncing bouts and metrics</p>
      </div>
    )
  }

  if (!sections.allFights.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-black/50 py-12 text-center text-white">
        <div className="mb-3 text-5xl">🥊</div>
        <h3 className="ufc-condensed text-xl text-white">Fight card incoming</h3>
        <p className="mt-1 text-[0.65rem] uppercase tracking-[0.3em] text-white/50">Check back once the UFC locks the bouts</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {sectionsToRender.map(section => (
        <div key={section.title} className="rounded-2xl border border-white/5 bg-black/40 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-3 sm:px-5">
            <h2 className="ufc-condensed text-lg text-white md:text-xl">{section.title}</h2>
            <span className="text-[0.6rem] uppercase tracking-[0.3em] text-white/40">{section.fights.length} Fights</span>
          </div>

          <div className="p-3 sm:p-5">
            <div className="grid gap-3.5">
              {section.fights.map(renderFightRow)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export const FightList = memo(FightListComponent)
