'use client'

import { useState, useEffect, useMemo, memo, useCallback } from 'react'
import { UFCEvent, Fight } from '@/types'
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
    if (score >= 85) return 'text-red-500'
    if (score >= 75) return 'text-orange-400'
    if (score >= 65) return 'text-yellow-400'
    return 'text-white'
  }

  const getFunScoreStyle = (score: number) => {
    if (score >= 85) return { color: '#d20a0a' } // UFC red
    if (score >= 75) return { color: '#ea580c' } // Darker orange for white background
    if (score >= 65) return { color: '#d97706' } // Darker yellow/amber for white background
    return { color: '#374151' } // Dark gray for white background
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
        className={`border rounded-lg overflow-hidden transition-all duration-200 hover:shadow-lg cursor-pointer ${
          isActive ? 'ring-2 ring-red-500 shadow-lg' : 'border-gray-200 hover:border-gray-300'
        }`}
        onClick={() => handleFightSelection(fight)}
        style={{
          borderColor: isActive ? '#d20a0a' : undefined,
          fontFamily: 'Arial, "Helvetica Neue", sans-serif'
        }}
      >
        {/* Fight Header */}
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xs uppercase tracking-widest font-bold text-gray-600">
                {fight.position || 'FIGHT'}
              </span>
              {fight.titleFight && (
                <span
                  className="text-xs uppercase tracking-widest font-bold px-2 py-1 rounded"
                  style={{ backgroundColor: '#d20a0a', color: 'white' }}
                >
                  TITLE
                </span>
              )}
            </div>
            <div className="text-right">
              <div
                className="text-lg font-bold uppercase tracking-wide"
                style={getFunScoreStyle(funScore)}
              >
                {funScore}
              </div>
              <div className="text-xs uppercase tracking-widest font-semibold text-gray-500">
                FUN SCORE
              </div>
            </div>
          </div>
        </div>

        {/* Main Fight Content */}
        <div className="p-3">
          {/* Fighters Side by Side */}
          <div className="flex items-center justify-between">
            {/* Fighter 1 */}
            <div className="flex items-center space-x-3 flex-1">
              <FighterAvatar
                fighterName={fight.fighter1?.name}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <div
                  className="font-bold uppercase tracking-wide text-gray-900 truncate"
                  style={getFunScoreStyle(funScore)}
                >
                  {fight.fighter1?.name || 'TBD'}
                </div>
                <div className="text-xs text-gray-500">
                  {formatRecord(fight.fighter1?.record)}
                </div>
              </div>
            </div>

            {/* VS Divider */}
            <div className="px-4">
              <span
                className="text-xs font-bold uppercase tracking-widest px-2 py-1 rounded"
                style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }}
              >
                VS
              </span>
            </div>

            {/* Fighter 2 */}
            <div className="flex items-center space-x-3 flex-1 justify-end">
              <div className="min-w-0 flex-1 text-right">
                <div
                  className="font-bold uppercase tracking-wide text-gray-900 truncate"
                  style={getFunScoreStyle(funScore)}
                >
                  {fight.fighter2?.name || 'TBD'}
                </div>
                <div className="text-xs text-gray-500">
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
          <div className="mt-3 pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between text-xs uppercase tracking-widest text-gray-500">
              <span>{fight.weightClass}</span>
              <span>{fight.scheduledRounds || 3} ROUNDS</span>
              {fight.finishProbability ? (
                <span className="font-semibold">FINISH {fight.finishProbability}%</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    )
  }, [selectedFight?.id, handleFightSelection])

  if (loading) {
    return (
      <div className="text-center text-gray-800 py-8">
        <div className="text-4xl mb-4">🎯</div>
        <p className="text-lg uppercase tracking-wide">Loading fight card...</p>
      </div>
    )
  }

  if (!sections.allFights.length) {
    return (
      <div className="text-center text-gray-800 py-12">
        <div className="text-6xl mb-4">🥊</div>
        <h3 className="text-xl font-semibold mb-2 uppercase tracking-wide">No fights available</h3>
        <p className="text-gray-600">Fight card details will be updated soon.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {sectionsToRender.map(section => (
        <div key={section.title} className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Section Header */}
          <div
            className="px-6 py-4 border-b border-gray-200"
            style={{ backgroundColor: '#f8f9fa' }}
          >
            <h2
              className="text-xl font-bold uppercase tracking-widest text-gray-900"
              style={{ fontFamily: 'Arial, "Helvetica Neue", sans-serif' }}
            >
              {section.title}
            </h2>
          </div>

          {/* Fight Cards Grid */}
          <div className="p-6">
            <div className="grid gap-3">
              {section.fights.map(renderFightRow)}
            </div>
          </div>
        </div>
      ))}

    </div>
  )
}

export const FightList = memo(FightListComponent)
