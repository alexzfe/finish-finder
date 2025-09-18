'use client'

import { useState, useEffect } from 'react'
import { Fight, FunFactor } from '@/types'

interface FightDetailModalProps {
  fight: Fight | null
  isOpen: boolean
  onClose: () => void
}

interface DetailedPrediction {
  funScore: number
  factors: FunFactor[]
  aiDescription: string
  fighter1: string
  fighter2: string
}

export function FightDetailModal({ fight, isOpen, onClose }: FightDetailModalProps) {
  const [prediction, setPrediction] = useState<DetailedPrediction | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && fight) {
      loadDetailedPrediction()
    }
  }, [isOpen, fight])

  const loadDetailedPrediction = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/predict')
      const data = await response.json()

      if (data.success) {
        setPrediction(data.data)
      }
    } catch (error) {
      console.error('Error loading detailed prediction:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !fight) return null

  const getFactorIcon = (type: string) => {
    const icons: Record<string, string> = {
      high_finish_rate: '⚡',
      striker_vs_striker: '👊',
      grappler_vs_striker: '🤼',
      fan_favorites: '❤️',
      title_implications: '👑',
      rivalry: '🔥',
      comeback_potential: '↗️',
      similar_skill_level: '⚖️',
      aggressive_styles: '💥',
      social_buzz: '📱'
    }
    return icons[type] || '⭐'
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'from-red-500 to-orange-500'
    if (score >= 80) return 'from-orange-500 to-yellow-500'
    if (score >= 70) return 'from-yellow-500 to-green-500'
    return 'from-gray-500 to-gray-400'
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-gray-900 to-black rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-red-600 to-orange-600 p-6 rounded-t-xl">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-white">Fight Analysis</h2>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-300 text-2xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Fight Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-8 mb-4">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-white">{fight.fighter1.name}</h3>
                {fight.fighter1.nickname && (
                  <p className="text-white/70">"{fight.fighter1.nickname}"</p>
                )}
                <p className="text-white/60">
                  {fight.fighter1.record?.wins}-{fight.fighter1.record?.losses}-{fight.fighter1.record?.draws}
                </p>
              </div>

              <div className="text-4xl font-bold text-white">VS</div>

              <div className="text-center">
                <h3 className="text-2xl font-bold text-white">{fight.fighter2.name}</h3>
                {fight.fighter2.nickname && (
                  <p className="text-white/70">"{fight.fighter2.nickname}"</p>
                )}
                <p className="text-white/60">
                  {fight.fighter2.record?.wins}-{fight.fighter2.record?.losses}-{fight.fighter2.record?.draws}
                </p>
              </div>
            </div>

            <div className="flex justify-center gap-4">
              <span className="px-3 py-1 bg-white/10 rounded-full text-white/80 text-sm">
                {fight.weightClass.toUpperCase()}
              </span>
              {fight.titleFight && (
                <span className="px-3 py-1 bg-yellow-600 rounded-full text-white text-sm font-bold">
                  👑 TITLE FIGHT
                </span>
              )}
              {fight.mainEvent && !fight.titleFight && (
                <span className="px-3 py-1 bg-red-600 rounded-full text-white text-sm font-bold">
                  MAIN EVENT
                </span>
              )}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin h-12 w-12 border-4 border-white/30 border-t-white rounded-full mx-auto mb-4"></div>
              <p className="text-white/70">Analyzing fight data...</p>
            </div>
          ) : prediction ? (
            <>
              {/* Fun Score Display */}
              <div className="text-center mb-8">
                <div className={`inline-block p-6 rounded-2xl bg-gradient-to-r ${getScoreColor(prediction.funScore)}`}>
                  <div className="text-4xl font-bold text-white mb-2">
                    {prediction.funScore.toFixed(1)}
                  </div>
                  <div className="text-white font-semibold">
                    FUN SCORE / 100
                  </div>
                </div>

                <div className="mt-4">
                  <h4 className="text-xl font-bold text-white mb-2">
                    {prediction.funScore >= 90 ? '🔥 MUST-WATCH FIGHT! 🔥' :
                     prediction.funScore >= 80 ? '⭐ HIGHLY ENTERTAINING' :
                     prediction.funScore >= 70 ? '👍 GOOD ENTERTAINMENT VALUE' :
                     prediction.funScore >= 60 ? '👌 DECENT FIGHT' : '😴 POTENTIALLY SLOW'}
                  </h4>
                </div>
              </div>

              {/* AI Description */}
              <div className="mb-8">
                <h4 className="text-xl font-bold text-white mb-4">🤖 AI Analysis</h4>
                <div className="bg-white/10 rounded-lg p-4">
                  <p className="text-white/90 leading-relaxed">
                    {prediction.aiDescription}
                  </p>
                </div>
              </div>

              {/* Fun Factors */}
              <div className="mb-8">
                <h4 className="text-xl font-bold text-white mb-4">📊 Fun Factors</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {prediction.factors.map((factor, index) => (
                    <div key={index} className="bg-white/10 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{getFactorIcon(factor.type)}</span>
                          <span className="text-white font-semibold">
                            {factor.type.replace(/_/g, ' ').toUpperCase()}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-white font-bold">
                            {factor.score.toFixed(1)}
                          </div>
                          <div className="text-white/60 text-xs">
                            Weight: {(factor.weight * 100).toFixed(0)}%
                          </div>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-white/20 rounded-full h-2 mb-2">
                        <div
                          className="bg-gradient-to-r from-red-500 to-orange-500 h-2 rounded-full"
                          style={{ width: `${factor.score}%` }}
                        ></div>
                      </div>

                      <p className="text-white/70 text-sm">
                        {factor.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Prediction Confidence */}
              <div className="text-center">
                <p className="text-white/60 text-sm">
                  Prediction generated using AI analysis of fighter stats, stylistic matchups, and fan engagement metrics.
                  <br />
                  <span className="text-white/40">
                    Last updated: {new Date().toLocaleDateString()}
                  </span>
                </p>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-white/70">Failed to load prediction data</p>
              <button
                onClick={loadDetailedPrediction}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}