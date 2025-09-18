'use client'

import { useState, useEffect } from 'react'
import { Fight, FunFactor } from '@/types'

interface FightPreviewProps {
  fight: Fight
  onFightClick: (fight: Fight) => void
  highlighted?: boolean
}

interface PredictionData {
  funScore: number
  factors: FunFactor[]
  aiDescription: string
}

export function FightPreview({ fight, onFightClick, highlighted = false }: FightPreviewProps) {
  const [prediction, setPrediction] = useState<PredictionData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Load prediction on mount
    loadPrediction()
  }, [])

  const loadPrediction = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/predict')
      const data = await response.json()

      if (data.success) {
        setPrediction({
          funScore: data.data.funScore,
          factors: data.data.factors,
          aiDescription: data.data.aiDescription
        })
      }
    } catch (error) {
      console.error('Error loading prediction:', error)
    } finally {
      setLoading(false)
    }
  }

  const getFunScoreColor = (score: number) => {
    if (score >= 80) return 'text-red-500'
    if (score >= 70) return 'text-orange-500'
    if (score >= 60) return 'text-yellow-500'
    return 'text-gray-500'
  }

  const getFunScoreLabel = (score: number) => {
    if (score >= 90) return 'MUST WATCH 🔥'
    if (score >= 80) return 'HIGHLY ENTERTAINING'
    if (score >= 70) return 'GOOD ENTERTAINMENT'
    if (score >= 60) return 'DECENT FIGHT'
    return 'POTENTIALLY SLOW'
  }

  return (
    <div
      onClick={() => onFightClick(fight)}
      className={`
        relative p-6 rounded-lg cursor-pointer transition-all duration-300 transform hover:scale-105
        ${highlighted
          ? 'bg-gradient-to-r from-red-600/20 to-orange-600/20 border-2 border-red-500 shadow-lg shadow-red-500/20'
          : 'bg-white/10 hover:bg-white/15 border border-white/20'
        }
      `}
    >
      {/* Fun Score Badge */}
      {prediction && (
        <div className="absolute top-2 right-2">
          <div className={`px-3 py-1 rounded-full text-sm font-bold ${
            prediction.funScore >= 80 ? 'bg-red-600' :
            prediction.funScore >= 70 ? 'bg-orange-600' :
            prediction.funScore >= 60 ? 'bg-yellow-600' : 'bg-gray-600'
          } text-white`}>
            {prediction.funScore.toFixed(0)}
          </div>
        </div>
      )}

      {/* Highlighted Badge */}
      {highlighted && (
        <div className="absolute top-2 left-2">
          <div className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded-full animate-pulse">
            FUN FIGHT
          </div>
        </div>
      )}

      {/* Fighters */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-center flex-1">
          <h3 className="text-white font-bold text-lg">{fight.fighter1.name}</h3>
          {fight.fighter1.nickname && (
            <p className="text-white/70 text-sm">"{fight.fighter1.nickname}"</p>
          )}
          <p className="text-white/60 text-sm">
            {fight.fighter1.record?.wins}-{fight.fighter1.record?.losses}-{fight.fighter1.record?.draws}
          </p>
        </div>

        <div className="mx-6 text-center">
          <div className="text-3xl font-bold text-white">VS</div>
          {fight.titleFight && (
            <div className="text-yellow-400 text-xs font-bold mt-1">TITLE</div>
          )}
          {fight.mainEvent && !fight.titleFight && (
            <div className="text-red-400 text-xs font-bold mt-1">MAIN EVENT</div>
          )}
        </div>

        <div className="text-center flex-1">
          <h3 className="text-white font-bold text-lg">{fight.fighter2.name}</h3>
          {fight.fighter2.nickname && (
            <p className="text-white/70 text-sm">"{fight.fighter2.nickname}"</p>
          )}
          <p className="text-white/60 text-sm">
            {fight.fighter2.record?.wins}-{fight.fighter2.record?.losses}-{fight.fighter2.record?.draws}
          </p>
        </div>
      </div>

      {/* Weight Class */}
      <div className="text-center mb-3">
        <span className="text-white/80 text-sm font-semibold">
          {fight.weightClass.toUpperCase()}
        </span>
      </div>

      {/* Prediction Summary */}
      {loading ? (
        <div className="text-center text-white/60">
          <div className="animate-spin h-6 w-6 border-2 border-white/30 border-t-white rounded-full mx-auto"></div>
          <p className="mt-2 text-sm">Loading prediction...</p>
        </div>
      ) : prediction ? (
        <div className="text-center">
          <div className={`font-bold text-lg ${getFunScoreColor(prediction.funScore)}`}>
            {getFunScoreLabel(prediction.funScore)}
          </div>
          <p className="text-white/70 text-sm mt-1">
            Fun Score: {prediction.funScore.toFixed(1)}/100
          </p>

          {/* Top Fun Factors */}
          <div className="flex justify-center gap-2 mt-2 flex-wrap">
            {prediction.factors.slice(0, 3).map((factor, index) => (
              <span
                key={index}
                className="text-xs px-2 py-1 bg-white/10 rounded-full text-white/80"
              >
                {factor.type.replace(/_/g, ' ').toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center text-white/60 text-sm">
          Click to load prediction
        </div>
      )}
    </div>
  )
}