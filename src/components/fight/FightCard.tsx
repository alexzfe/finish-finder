'use client'

import { useState } from 'react'
import { UFCEvent, Fight, Fighter } from '@/types'
import { FightPreview } from './FightPreview'
import { FightDetailModal } from './FightDetailModal'

interface FightCardProps {
  event: UFCEvent
  funThreshold: number
}

// Mock fight data for demonstration
const mockFights: Fight[] = [
  {
    id: 'fight-1',
    fighter1: {
      id: 'f1',
      name: 'Jon Jones',
      nickname: 'Bones',
      record: { wins: 27, losses: 1, draws: 0 },
      stats: {
        finishRate: 65,
        koPercentage: 30,
        submissionPercentage: 35,
        averageFightTime: 1200,
        significantStrikesPerMinute: 4.2,
        takedownAccuracy: 45
      },
      popularity: {
        socialFollowers: 5000000,
        recentBuzzScore: 85,
        fanFavorite: true
      },
      funScore: 78,
      weightClass: 'heavyweight',
      fighting_style: ['grappling', 'striking']
    } as Fighter,
    fighter2: {
      id: 'f2',
      name: 'Stipe Miocic',
      nickname: 'The Firefighter',
      record: { wins: 20, losses: 4, draws: 0 },
      stats: {
        finishRate: 70,
        koPercentage: 50,
        submissionPercentage: 20,
        averageFightTime: 900,
        significantStrikesPerMinute: 3.8,
        takedownAccuracy: 35
      },
      popularity: {
        socialFollowers: 2000000,
        recentBuzzScore: 75,
        fanFavorite: true
      },
      funScore: 72,
      weightClass: 'heavyweight',
      fighting_style: ['striking', 'boxing']
    } as Fighter,
    weightClass: 'heavyweight',
    titleFight: true,
    mainEvent: true,
    event,
    predictedFunScore: 92,
    funFactors: [],
    aiDescription: '',
    bookingDate: new Date(),
    completed: false
  },
  {
    id: 'fight-2',
    fighter1: {
      id: 'f3',
      name: 'Israel Adesanya',
      nickname: 'The Last Stylebender',
      record: { wins: 24, losses: 3, draws: 0 },
      stats: {
        finishRate: 55,
        koPercentage: 45,
        submissionPercentage: 10,
        averageFightTime: 1400,
        significantStrikesPerMinute: 5.1,
        takedownAccuracy: 25
      },
      popularity: {
        socialFollowers: 8000000,
        recentBuzzScore: 90,
        fanFavorite: true
      },
      funScore: 85,
      weightClass: 'middleweight',
      fighting_style: ['striking', 'counter-striking']
    } as Fighter,
    fighter2: {
      id: 'f4',
      name: 'Robert Whittaker',
      nickname: 'The Reaper',
      record: { wins: 25, losses: 7, draws: 0 },
      stats: {
        finishRate: 60,
        koPercentage: 40,
        submissionPercentage: 20,
        averageFightTime: 1100,
        significantStrikesPerMinute: 4.8,
        takedownAccuracy: 55
      },
      popularity: {
        socialFollowers: 3000000,
        recentBuzzScore: 80,
        fanFavorite: true
      },
      funScore: 78,
      weightClass: 'middleweight',
      fighting_style: ['striking', 'wrestling']
    } as Fighter,
    weightClass: 'middleweight',
    titleFight: false,
    mainEvent: false,
    event,
    predictedFunScore: 88,
    funFactors: [],
    aiDescription: '',
    bookingDate: new Date(),
    completed: false
  },
  {
    id: 'fight-3',
    fighter1: {
      id: 'f5',
      name: 'Khabib Nurmagomedov',
      nickname: 'The Eagle',
      record: { wins: 29, losses: 0, draws: 0 },
      stats: {
        finishRate: 45,
        koPercentage: 10,
        submissionPercentage: 35,
        averageFightTime: 1600,
        significantStrikesPerMinute: 2.8,
        takedownAccuracy: 85
      },
      popularity: {
        socialFollowers: 15000000,
        recentBuzzScore: 95,
        fanFavorite: true
      },
      funScore: 82,
      weightClass: 'lightweight',
      fighting_style: ['grappling', 'wrestling']
    } as Fighter,
    fighter2: {
      id: 'f6',
      name: 'Tony Ferguson',
      nickname: 'El Cucuy',
      record: { wins: 25, losses: 10, draws: 0 },
      stats: {
        finishRate: 75,
        koPercentage: 35,
        submissionPercentage: 40,
        averageFightTime: 1000,
        significantStrikesPerMinute: 6.2,
        takedownAccuracy: 40
      },
      popularity: {
        socialFollowers: 4000000,
        recentBuzzScore: 70,
        fanFavorite: true
      },
      funScore: 88,
      weightClass: 'lightweight',
      fighting_style: ['striking', 'submissions']
    } as Fighter,
    weightClass: 'lightweight',
    titleFight: false,
    mainEvent: false,
    event,
    predictedFunScore: 65,
    funFactors: [],
    aiDescription: '',
    bookingDate: new Date(),
    completed: false
  }
]

export function FightCard({ event, funThreshold }: FightCardProps) {
  const [selectedFight, setSelectedFight] = useState<Fight | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  // Filter fights by fun threshold (using mock prediction scores)
  const filteredFights = mockFights.filter(fight => fight.predictedFunScore >= funThreshold)
  const highlightedFights = mockFights.filter(fight => fight.predictedFunScore >= 80)

  const handleFightClick = (fight: Fight) => {
    setSelectedFight(fight)
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setSelectedFight(null)
  }

  return (
    <div className="space-y-6">
      <div className="text-center text-white mb-8">
        <h2 className="text-3xl font-bold mb-2">{event.name}</h2>
        <p className="text-xl text-red-400">
          {event.date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </p>
        <p className="text-white/70">
          {event.venue}, {event.location}
        </p>
      </div>

      {/* Fun Fight Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white/10 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-white">{mockFights.length}</div>
          <div className="text-white/70">Total Fights</div>
        </div>
        <div className="bg-white/10 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{highlightedFights.length}</div>
          <div className="text-white/70">Fun Fights (80+)</div>
        </div>
        <div className="bg-white/10 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-orange-400">{filteredFights.length}</div>
          <div className="text-white/70">Above Threshold</div>
        </div>
      </div>

      {/* Fight Cards */}
      {filteredFights.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-white mb-4">
            {funThreshold > 70 ? '🔥 Fun Fights' : '📋 Fight Card'}
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredFights.map((fight) => (
              <FightPreview
                key={fight.id}
                fight={fight}
                onFightClick={handleFightClick}
                highlighted={fight.predictedFunScore >= 80}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">😴</div>
          <h3 className="text-white text-2xl font-bold mb-4">
            No Fights Meet Your Fun Threshold
          </h3>
          <p className="text-white/70 text-lg mb-6">
            Lower the fun score threshold to see more fights, or check back for more exciting matchups!
          </p>
          <div className="text-white/60">
            Current threshold: {funThreshold}/100
          </div>
        </div>
      )}

      {/* Fight Detail Modal */}
      <FightDetailModal
        fight={selectedFight}
        isOpen={modalOpen}
        onClose={handleCloseModal}
      />
    </div>
  )
}