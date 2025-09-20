'use client'

import { useState, useEffect, useMemo } from 'react'
import { UFCEvent, Fight } from '@/types'

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

export function FightList({ event, onFightClick }: FightListProps) {
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
      ),
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
    if (score >= 85) return 'text-red-400'
    if (score >= 75) return 'text-orange-300'
    if (score >= 65) return 'text-yellow-300'
    return 'text-white'
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

  const handleFightSelection = (fight: Fight) => {
    setSelectedFight(fight)
    onFightClick?.(fight)
  }

  const renderFightRow = (fight: Fight) => {
    const isActive = selectedFight?.id === fight.id
    const funScore = fight.predictedFunScore || 0

    return (
      <button
        key={fight.id}
        type="button"
        onClick={() => handleFightSelection(fight)}
        className={`w-full text-left rounded-lg border border-white/10 bg-white/5 px-3 py-2 transition-colors duration-150 hover:bg-white/10 ${
          isActive ? 'ring-2 ring-red-500/60 bg-white/15' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className={`text-sm md:text-base font-semibold ${getFunScoreTextClass(funScore)}`}>
            {fight.fighter1?.name || 'TBD'}
            <span className="text-white/40 text-xs md:text-sm"> ({formatRecord(fight.fighter1?.record)})</span>
            <span className="mx-2 text-white/50">vs</span>
            {fight.fighter2?.name || 'TBD'}
            <span className="text-white/40 text-xs md:text-sm"> ({formatRecord(fight.fighter2?.record)})</span>
          </div>
          <div className="text-right text-xs md:text-sm text-white/60 flex flex-col items-end gap-1">
            <span className={`${getFunScoreTextClass(funScore)} font-semibold`}>{funScore} FUN</span>
            {fight.finishProbability ? <span>Finish {fight.finishProbability}%</span> : null}
          </div>
        </div>
        <div className="mt-1 text-xs text-white/50">
          {fight.position ? `${fight.position} • ` : ''}{fight.weightClass} • {fight.scheduledRounds || 3} Rounds{fight.titleFight ? ' • Title Fight' : ''}
        </div>
      </button>
    )
  }

  if (loading) {
    return (
      <div className="text-center text-white py-8">
        <div className="text-4xl mb-4">🎯</div>
        <p className="text-lg">Loading fight card...</p>
      </div>
    )
  }

  if (!sections.allFights.length) {
    return (
      <div className="text-center text-white/70 py-12">
        <div className="text-6xl mb-4">🥊</div>
        <h3 className="text-xl font-semibold mb-2">No fights available</h3>
        <p>Fight card details will be updated soon.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,336px)]">
        <div className="space-y-4">
          {sectionsToRender.map(section => (
            <div key={section.title} className="space-y-3">
              <div className="sticky top-0 z-10">
                <div className="inline-flex items-center rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white/70 backdrop-blur">
                  {section.title}
                </div>
              </div>
              <div className="space-y-2">
                {section.fights.map(renderFightRow)}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-5">
          {selectedFight ? (
            <>
              <div>
                <p className="text-xs uppercase tracking-wide text-white/40">Bout</p>
                <h3 className="text-lg font-semibold text-white">
                  {selectedFight.fighter1?.name || 'TBD'} vs {selectedFight.fighter2?.name || 'TBD'}
                </h3>
                <p className="text-sm text-white/60 mt-1">
                  {selectedFight.weightClass} • {selectedFight.scheduledRounds || 3} Rounds {selectedFight.titleFight ? '• Title Fight' : ''}{selectedFight.mainEvent && !selectedFight.titleFight ? ' • Main Event' : ''}
                </p>
              </div>

              <div className="grid gap-3 text-sm text-white/70 md:grid-cols-3">
                <div className="rounded-lg bg-black/20 px-4 py-3">
                  <span className="block text-xs uppercase tracking-wide text-white/40">Fun Score</span>
                  <span className={`${getFunScoreTextClass(selectedFight.predictedFunScore || 0)} text-lg font-semibold`}>
                    {selectedFight.predictedFunScore || 0}
                  </span>
                </div>
                <div className="rounded-lg bg-black/20 px-4 py-3">
                  <span className="block text-xs uppercase tracking-wide text-white/40">Finish Chance</span>
                  <span className="text-base font-semibold text-white/80">{selectedFight.finishProbability || 0}%</span>
                </div>
                <div className="rounded-lg bg-black/20 px-4 py-3">
                  <span className="block text-xs uppercase tracking-wide text-white/40">Risk Level</span>
                  <span className="text-base font-semibold text-white/80 capitalize">{selectedFight.riskLevel || 'Balanced'}</span>
                </div>
              </div>

              {selectedFight.aiDescription ? (
                <p className="text-sm text-white/80 leading-relaxed">
                  {selectedFight.aiDescription}
                </p>
              ) : null}

              {Array.isArray(selectedFight.funFactors) && selectedFight.funFactors.length > 0 ? (
                <div>
                  <span className="text-xs uppercase tracking-wide text-white/40">Key Factors</span>
                  <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                    {selectedFight.funFactors.map((factor, idx) => (
                      <li key={idx} className="rounded-full bg-white/10 px-3 py-1 text-white/80">
                        {typeof factor === 'string' ? factor : factor.type}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {selectedFight.fightPrediction ? (
                <div>
                  <span className="text-xs uppercase tracking-wide text-white/40">Analyst Pick</span>
                  <p className="mt-1 text-sm text-white/70">{selectedFight.fightPrediction}</p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-white/60">Select a matchup to see the in-depth breakdown.</p>
          )}
        </div>
      </div>
    </div>
  )
}
