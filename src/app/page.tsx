'use client'

import { useState, useEffect } from 'react'
import { EventNavigation } from '@/components/ui/EventNavigation'
import { FightList } from '@/components/fight/FightList'
import { Header } from '@/components/ui/Header'
import { UFCEvent, Fight } from '@/types'

export default function Home() {
  const [events, setEvents] = useState<UFCEvent[]>([])
  const [currentEventIndex, setCurrentEventIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch collected events from the database only
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true)

        // Only use database events - no fallbacks to placeholder data
        const response = await fetch('/api/db-events')
        const data = await response.json()

        if (data.success && data.data.events.length > 0) {
          // Sort events by date (nearest first)
          const sortedEvents = data.data.events
            .map((event: any) => ({
              ...event,
              date: new Date(event.date)
            }))
            .sort((a: UFCEvent, b: UFCEvent) => a.date.getTime() - b.date.getTime())

          setEvents(sortedEvents)

          // Find the nearest upcoming event
          const now = new Date()
          const nearestEventIndex = sortedEvents.findIndex((event: UFCEvent) => event.date >= now)
          setCurrentEventIndex(nearestEventIndex >= 0 ? nearestEventIndex : 0)

          setError(null)
        } else {
          setError('No events available. Please collect real UFC events from the admin panel.')
        }
      } catch (err) {
        console.error('Error fetching events:', err)
        setError('Failed to load events. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchEvents()
  }, [])

  const handleEventChange = (index: number) => {
    setCurrentEventIndex(index)
  }

  const handleFightClick = (fight: Fight) => {
    console.log('Fight clicked:', fight)
    // TODO: Implement fight detail modal or navigation
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-red-900 to-black">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center text-white py-16">
            <div className="text-6xl mb-4">⏳</div>
            <h2 className="text-2xl font-bold mb-4">Loading Events...</h2>
            <p className="text-white/70">Fetching the latest UFC events and fight data</p>
          </div>
        ) : error ? (
          <div className="text-center text-white py-16">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold mb-4 text-red-400">Error Loading Data</h2>
            <p className="text-white/70 mb-6">{error}</p>
            <a
              href="/admin"
              className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors inline-block"
            >
              Go to Admin Panel
            </a>
          </div>
        ) : events.length > 0 ? (
          <>
            {/* Event Navigation with Arrow Controls */}
            <EventNavigation
              events={events}
              currentEventIndex={currentEventIndex}
              onEventChange={handleEventChange}
            />

            {/* Fight List */}
            <div className="max-w-4xl mx-auto">
              <FightList
                event={events[currentEventIndex]}
                onFightClick={handleFightClick}
              />
            </div>
          </>
        ) : (
          <div className="text-center text-white/70 py-16">
            <div className="text-6xl mb-4">🥊</div>
            <h2 className="text-2xl font-bold mb-4">
              No Events Available
            </h2>
            <p className="mb-6">
              Check back soon for upcoming UFC events and fight predictions!
            </p>
            <a
              href="/admin"
              className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors inline-block"
            >
              Go to Admin Panel
            </a>
          </div>
        )}
      </main>
    </div>
  )
}
