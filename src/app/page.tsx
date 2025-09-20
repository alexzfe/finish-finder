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
  const [selectedFight, setSelectedFight] = useState<Fight | null>(null)

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
    setSelectedFight(fight)
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#191919' }}>
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center text-white py-20">
            <div className="text-6xl mb-6">⏳</div>
            <h2 className="text-3xl font-bold mb-4 uppercase tracking-widest" style={{ fontFamily: 'Arial, "Helvetica Neue", sans-serif' }}>
              Loading Events
            </h2>
            <p className="text-gray-300 text-lg">Fetching the latest UFC events and fight data</p>
          </div>
        ) : error ? (
          <div className="text-center text-white py-20">
            <div className="text-6xl mb-6">⚠️</div>
            <h2 className="text-3xl font-bold mb-4 uppercase tracking-widest" style={{ color: '#d20a0a', fontFamily: 'Arial, "Helvetica Neue", sans-serif' }}>
              Error Loading Data
            </h2>
            <p className="text-gray-300 text-lg mb-8">{error}</p>
          </div>
        ) : events.length > 0 ? (
          <div className="space-y-8">
            {/* Event Navigation */}
            <div className="bg-white rounded-lg p-6 shadow-lg">
              <EventNavigation
                events={events}
                currentEventIndex={currentEventIndex}
                onEventChange={handleEventChange}
              />
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Fight List - Takes up 2 columns */}
              <div className="lg:col-span-2">
                <FightList
                  event={events[currentEventIndex]}
                  onFightClick={handleFightClick}
                />
              </div>

              {/* Sidebar - Takes up 1 column */}
              <div className="space-y-6">
                <div className="sticky top-6">
                {selectedFight ? (
                  <div className="bg-white rounded-lg shadow-lg p-6" style={{ fontFamily: 'Arial, "Helvetica Neue", sans-serif' }}>
                    <div className="mb-4">
                      <p className="text-xs uppercase tracking-wide text-gray-500">BOUT</p>
                      <h3 className="text-lg font-bold text-gray-900 uppercase tracking-wide">
                        {selectedFight.fighter1?.name || 'TBD'} VS {selectedFight.fighter2?.name || 'TBD'}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1 uppercase tracking-wide">
                        {selectedFight.weightClass} • {selectedFight.scheduledRounds || 3} ROUNDS {selectedFight.titleFight ? '• TITLE FIGHT' : ''}{selectedFight.mainEvent && !selectedFight.titleFight ? ' • MAIN EVENT' : ''}
                      </p>
                    </div>

                    <div className="grid gap-3 text-sm mb-4">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                        <span className="block text-xs uppercase tracking-wide text-gray-500">FUN SCORE</span>
                        <span className="text-lg font-bold" style={{
                          color: selectedFight.predictedFunScore >= 85 ? '#d20a0a' :
                                 selectedFight.predictedFunScore >= 75 ? '#ea580c' :
                                 selectedFight.predictedFunScore >= 65 ? '#d97706' : '#374151'
                        }}>
                          {selectedFight.predictedFunScore || 0}
                        </span>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                        <span className="block text-xs uppercase tracking-wide text-gray-500">FINISH CHANCE</span>
                        <span className="text-base font-bold text-gray-900">{selectedFight.finishProbability || 0}%</span>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                        <span className="block text-xs uppercase tracking-wide text-gray-500">RISK LEVEL</span>
                        <span className="text-base font-bold text-gray-900 uppercase">{selectedFight.riskLevel || 'BALANCED'}</span>
                      </div>
                    </div>

                    {selectedFight.aiDescription && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-700 leading-relaxed">
                          {selectedFight.aiDescription}
                        </p>
                      </div>
                    )}

                    {Array.isArray(selectedFight.funFactors) && selectedFight.funFactors.length > 0 && (
                      <div className="mb-4">
                        <span className="text-xs uppercase tracking-wide text-gray-500">KEY FACTORS</span>
                        <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                          {selectedFight.funFactors.map((factor, idx) => (
                            <li key={idx} className="rounded-lg border border-gray-200 bg-gray-100 px-3 py-1 text-gray-700 uppercase tracking-wide">
                              {typeof factor === 'string' ? factor : factor.type}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {selectedFight.fightPrediction && (
                      <div>
                        <span className="text-xs uppercase tracking-wide text-gray-500">ANALYST PICK</span>
                        <p className="mt-1 text-sm text-gray-700">{selectedFight.fightPrediction}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-lg p-6 shadow-lg text-center" style={{ fontFamily: 'Arial, "Helvetica Neue", sans-serif' }}>
                    <div className="text-4xl mb-4">🥊</div>
                    <h3 className="text-lg font-bold uppercase tracking-wide mb-2 text-gray-900">
                      Fight Details
                    </h3>
                    <p className="text-sm text-gray-600 uppercase tracking-wide">
                      Select a matchup to see the in-depth breakdown
                    </p>
                  </div>
                )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center text-white py-20">
            <div className="text-6xl mb-6">🥊</div>
            <h2 className="text-3xl font-bold mb-4 uppercase tracking-widest" style={{ fontFamily: 'Arial, "Helvetica Neue", sans-serif' }}>
              No Events Available
            </h2>
            <p className="text-gray-300 text-lg mb-8">
              Check back soon for upcoming UFC events and fight predictions!
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
