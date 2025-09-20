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

  // Fetch collected events from the database when available, otherwise fallback to static JSON
  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH
      ? `/${process.env.NEXT_PUBLIC_BASE_PATH.replace(/^\/+/, '')}`
      : ''
    const staticEventsUrl = `${basePath}/data/events.json`

    const fetchEvents = async () => {
      setLoading(true)

      const normalizeEvents = (rawEvents: any[]): UFCEvent[] =>
        rawEvents
          .map((event: any) => ({
            ...event,
            date: new Date(event.date)
          }))
          .sort((a: UFCEvent, b: UFCEvent) => a.date.getTime() - b.date.getTime())

      try {
        // Try API first so local development keeps dynamic data
        const apiResponse = await fetch('/api/db-events')
        if (apiResponse.ok) {
          const apiData = await apiResponse.json()
          if (apiData?.success && Array.isArray(apiData.data?.events) && apiData.data.events.length > 0) {
            const sortedEvents = normalizeEvents(apiData.data.events)
            setEvents(sortedEvents)

            const now = new Date()
            const nearestEventIndex = sortedEvents.findIndex((event: UFCEvent) => event.date >= now)
            setCurrentEventIndex(nearestEventIndex >= 0 ? nearestEventIndex : 0)
            setError(null)
            setLoading(false)
            return
          }
        }
      } catch (error) {
        console.warn('API event fetch failed, falling back to static data.', error)
      }

      try {
        const staticResponse = await fetch(staticEventsUrl)
        if (!staticResponse.ok) {
          throw new Error(`Static events fetch failed with status ${staticResponse.status}`)
        }
        const staticData = await staticResponse.json()
        if (Array.isArray(staticData?.events) && staticData.events.length > 0) {
          const sortedEvents = normalizeEvents(staticData.events)
          setEvents(sortedEvents)

          const now = new Date()
          const nearestEventIndex = sortedEvents.findIndex((event: UFCEvent) => event.date >= now)
          setCurrentEventIndex(nearestEventIndex >= 0 ? nearestEventIndex : 0)
          setError(null)
          return
        }
        setError('No events available in static data. Please update data/events.json.')
      } catch (fallbackError) {
        console.error('Error fetching static events:', fallbackError)
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
