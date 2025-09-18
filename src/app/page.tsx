'use client'

import { useState } from 'react'
import { FightCard } from '@/components/fight/FightCard'
import { EventSelector } from '@/components/ui/EventSelector'
import { Header } from '@/components/ui/Header'
import { UFCEvent } from '@/types'

// Mock data for development
const mockEvents: UFCEvent[] = [
  {
    id: 'ufc-300',
    name: 'UFC 300: Historic Night',
    date: new Date('2024-04-13'),
    location: 'Las Vegas, Nevada',
    venue: 'T-Mobile Arena',
    fightCard: [],
    mainCard: [],
    prelimCard: [],
    earlyPrelimCard: []
  },
  {
    id: 'ufc-301',
    name: 'UFC 301: Championship Showdown',
    date: new Date('2024-05-04'),
    location: 'Rio de Janeiro, Brazil',
    venue: 'Farmasi Arena',
    fightCard: [],
    mainCard: [],
    prelimCard: [],
    earlyPrelimCard: []
  }
]

export default function Home() {
  const [selectedEvent, setSelectedEvent] = useState<UFCEvent | null>(mockEvents[0])
  const [funThreshold, setFunThreshold] = useState(70) // Show fights with 70+ fun score

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-red-900 to-black">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Event Selection */}
        <div className="mb-8">
          <EventSelector
            events={mockEvents}
            selectedEvent={selectedEvent}
            onEventSelect={setSelectedEvent}
          />
        </div>

        {/* Fun Filter */}
        <div className="mb-8 bg-white/10 backdrop-blur-sm rounded-lg p-6">
          <h3 className="text-white text-lg font-semibold mb-4">
            🔥 Fun Fight Filter
          </h3>
          <div className="flex items-center space-x-4">
            <label className="text-white">
              Minimum Fun Score:
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={funThreshold}
              onChange={(e) => setFunThreshold(parseInt(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-white font-bold text-xl">
              {funThreshold}
            </span>
          </div>
        </div>

        {/* Fight Card */}
        {selectedEvent ? (
          <FightCard
            event={selectedEvent}
            funThreshold={funThreshold}
          />
        ) : (
          <div className="text-center text-white/70 py-16">
            <h2 className="text-2xl font-bold mb-4">
              No Events Available
            </h2>
            <p>
              Check back soon for upcoming UFC events and fight predictions!
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
