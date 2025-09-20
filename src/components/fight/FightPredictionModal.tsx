'use client'

import { useState, useEffect } from 'react'

interface FightPredictionModalProps {
  fight: any | null
  isOpen: boolean
  onClose: () => void
}

interface EnhancedFightPrediction {
  funFactor: number
  finishProbability: number
  entertainmentReason: string
  keyFactors: string[]
  fightPrediction: string
  riskLevel: 'high' | 'medium' | 'low'
}

export function FightPredictionModal({ fight, isOpen, onClose }: FightPredictionModalProps) {
  const [loading, setLoading] = useState(false)

  if (!isOpen || !fight) return null

  // Use AI-generated prediction data from the fight object
  const prediction: EnhancedFightPrediction = {
    funFactor: fight.funFactor || fight.excitementLevel || 5,
    finishProbability: fight.finishProbability || 50,
    entertainmentReason: fight.entertainmentReason || fight.prediction || "This should be an exciting matchup!",
    keyFactors: fight.keyFactors || [],
    fightPrediction: fight.fightPrediction || "Expect a competitive fight.",
    riskLevel: fight.riskLevel || 'medium'
  }

  const getFactorIcon = (factor: string) => {
    const icons: Record<string, string> = {
      'Knockout Power': '💥',
      'Style Clash': '⚔️',
      'Title Implications': '👑',
      'Submission Threat': '🔒',
      'Recent Form': '📈',
      'Fan Favorites': '❤️',
      'Rivalry': '🔥',
      'Pressure Fighter': '👊',
      'Counter Striker': '🎯',
      'Heavy Hitters': '💪',
      'Grappling': '🤼',
      'Striking': '🥊',
      'Wrestling': '⚡',
      'Experience': '🎓'
    }
    return icons[factor] || '⭐'
  }

  const getFunFactorColor = (score: number) => {
    if (score >= 9) return 'from-red-500 to-pink-500'
    if (score >= 8) return 'from-orange-500 to-red-500'
    if (score >= 7) return 'from-yellow-500 to-orange-500'
    if (score >= 6) return 'from-green-500 to-yellow-500'
    return 'from-gray-500 to-gray-400'
  }

  const getFunFactorLabel = (score: number) => {
    if (score >= 9) return '🔥 MUST-WATCH SPECTACLE!'
    if (score >= 8) return '⭐ HIGHLY ENTERTAINING'
    if (score >= 7) return '👍 SOLID ENTERTAINMENT'
    if (score >= 6) return '👌 DECENT ACTION'
    if (score >= 5) return '😐 MODERATE ENTERTAINMENT'
    return '😴 POTENTIALLY SLOW'
  }

  const getRiskLevelInfo = (level: string) => {
    switch (level) {
      case 'high':
        return { color: 'text-red-400', icon: '🚨', label: 'High Risk - Explosive Potential' }
      case 'medium':
        return { color: 'text-yellow-400', icon: '⚠️', label: 'Medium Risk - Balanced Action' }
      case 'low':
        return { color: 'text-green-400', icon: '✅', label: 'Low Risk - Technical Battle' }
      default:
        return { color: 'text-gray-400', icon: '❓', label: 'Unknown Risk Level' }
    }
  }

  const riskInfo = getRiskLevelInfo(prediction.riskLevel)

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-gray-900 to-black rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-red-600 to-orange-600 p-6 rounded-t-xl">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-white">🤖 AI Entertainment Analysis</h2>
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
                <h3 className="text-2xl font-bold text-white">{fight.fighter1Name}</h3>
                {fight.fighter1?.nickname && (
                  <p className="text-white/70">"{fight.fighter1.nickname}"</p>
                )}
              </div>

              <div className="text-4xl font-bold text-white">VS</div>

              <div className="text-center">
                <h3 className="text-2xl font-bold text-white">{fight.fighter2Name}</h3>
                {fight.fighter2?.nickname && (
                  <p className="text-white/70">"{fight.fighter2.nickname}"</p>
                )}
              </div>
            </div>

            <div className="flex justify-center gap-4">
              <span className="px-3 py-1 bg-white/10 rounded-full text-white/80 text-sm">
                {fight.weightClass?.toUpperCase()}
              </span>
              {fight.titleFight && (
                <span className="px-3 py-1 bg-yellow-600 rounded-full text-white text-sm font-bold">
                  👑 TITLE FIGHT
                </span>
              )}
              <span className="px-3 py-1 bg-blue-600 rounded-full text-white text-sm">
                {fight.scheduledRounds} ROUNDS
              </span>
            </div>
          </div>

          {/* Fun Factor Score */}
          <div className="text-center mb-8">
            <div className={`inline-block p-6 rounded-2xl bg-gradient-to-r ${getFunFactorColor(prediction.funFactor)}`}>
              <div className="text-4xl font-bold text-white mb-2">
                {prediction.funFactor}/10
              </div>
              <div className="text-white font-semibold">
                FUN FACTOR
              </div>
            </div>

            <div className="mt-4">
              <h4 className="text-xl font-bold text-white mb-2">
                {getFunFactorLabel(prediction.funFactor)}
              </h4>
            </div>
          </div>

          {/* Entertainment Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Finish Probability */}
            <div className="bg-white/10 rounded-lg p-6">
              <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                💥 Finish Probability
              </h4>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl font-bold text-white">
                  {prediction.finishProbability}%
                </span>
                <span className="text-white/60 text-sm">
                  {prediction.finishProbability >= 75 ? 'Very High' :
                   prediction.finishProbability >= 50 ? 'High' :
                   prediction.finishProbability >= 25 ? 'Moderate' : 'Low'}
                </span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-red-500 to-orange-500 h-3 rounded-full"
                  style={{ width: `${prediction.finishProbability}%` }}
                ></div>
              </div>
            </div>

            {/* Risk Level */}
            <div className="bg-white/10 rounded-lg p-6">
              <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                {riskInfo.icon} Fight Risk Level
              </h4>
              <div className="text-center">
                <div className={`text-2xl font-bold ${riskInfo.color} mb-2`}>
                  {prediction.riskLevel.toUpperCase()}
                </div>
                <div className="text-white/70 text-sm">
                  {riskInfo.label}
                </div>
              </div>
            </div>
          </div>

          {/* AI Entertainment Analysis */}
          <div className="mb-8">
            <h4 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              🤖 Why This Fight Will Be Entertaining
            </h4>
            <div className="bg-white/10 rounded-lg p-6">
              <p className="text-white/90 leading-relaxed text-lg">
                {prediction.entertainmentReason}
              </p>
            </div>
          </div>

          {/* Key Entertainment Factors */}
          {prediction.keyFactors && prediction.keyFactors.length > 0 && (
            <div className="mb-8">
              <h4 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                📊 Key Entertainment Factors
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {prediction.keyFactors.map((factor, index) => (
                  <div key={index} className="bg-white/10 rounded-lg p-4 text-center">
                    <div className="text-3xl mb-2">{getFactorIcon(factor)}</div>
                    <div className="text-white font-semibold text-sm">
                      {factor}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fight Prediction */}
          <div className="mb-8">
            <h4 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              🎯 Fight Prediction
            </h4>
            <div className="bg-white/10 rounded-lg p-6">
              <p className="text-white/90 leading-relaxed">
                {prediction.fightPrediction}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center border-t border-white/20 pt-6">
            <p className="text-white/60 text-sm">
              Entertainment analysis powered by AI based on fighting styles, recent performances, and historical data.
              <br />
              <span className="text-white/40">
                Predictions are for entertainment purposes and do not guarantee fight outcomes.
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}