'use client'

import { useState, useEffect } from 'react'
import { EventNavigation } from '@/components/ui/EventNavigation'
import { FightList } from '@/components/fight/FightList'
import { Header } from '@/components/ui/Header'
import { UFCEvent, Fight } from '@/types'

// Utility function to format weight class names
const formatWeightClass = (weightClass?: string | null): string => {
  if (!weightClass) {
    return 'TBD'
  }
  return weightClass
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

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

      const normalizeEvents = (rawEvents: unknown[]): UFCEvent[] =>
        rawEvents
          .filter((event): event is Record<string, unknown> => typeof event === 'object' && event !== null)
          .map((event) => ({
            ...event,
            date: new Date((event.date as string) || new Date())
          } as UFCEvent))
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
            const resolvedIndex = nearestEventIndex >= 0 ? nearestEventIndex : 0
            setCurrentEventIndex(resolvedIndex)
            const defaultEvent = sortedEvents[resolvedIndex]
            if (defaultEvent?.fightCard?.length) {
              setSelectedFight((prev) => {
                const stillValid = prev && defaultEvent.fightCard.some(fight => fight.id === prev.id)
                return stillValid ? prev : defaultEvent.fightCard[0]
              })
            }
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
          const resolvedIndex = nearestEventIndex >= 0 ? nearestEventIndex : 0
          setCurrentEventIndex(resolvedIndex)
          const defaultEvent = sortedEvents[resolvedIndex]
          if (defaultEvent?.fightCard?.length) {
            setSelectedFight((prev) => {
              const stillValid = prev && defaultEvent.fightCard.some(fight => fight.id === prev.id)
              return stillValid ? prev : defaultEvent.fightCard[0]
            })
          }
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

  const currentEvent = events[currentEventIndex]

  useEffect(() => {
    if (!currentEvent) {
      return
    }
    setSelectedFight(prev => {
      const fights = currentEvent.fightCard ?? []
      const stillValid = prev && fights.some(fight => fight.id === prev.id)
      if (stillValid) {
        return prev
      }
      return fights[0] ?? null
    })
  }, [currentEvent])

  return (
    <div className="min-h-screen bg-[var(--ufc-black-alt)]">
      <Header />

      <main className="mx-auto max-w-7xl px-6 pb-16">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-center text-white">
            <div className="mb-6 text-6xl">⏳</div>
            <h2 className="ufc-condensed text-4xl text-white">Loading Events</h2>
            <p className="mt-4 max-w-xl text-sm uppercase tracking-[0.4em] text-white/60">
              Fetching the latest fight cards direct from Sherdog and prepping entertainment analytics
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 text-center text-white">
            <div className="mb-6 text-6xl">⚠️</div>
            <h2 className="ufc-condensed text-4xl text-[var(--ufc-red)]">Error Loading Data</h2>
            <p className="mt-4 max-w-xl text-sm uppercase tracking-[0.4em] text-white/60">{error}</p>
          </div>
        ) : events.length > 0 ? (
          <div className="space-y-6">
            <section id="events" className="ufc-section mt-6 rounded-2xl px-0 pb-6 pt-4">
              <div className="px-6 md:px-8">
                <h3 className="ufc-condensed text-xl text-white md:text-2xl">Upcoming Events</h3>
              </div>
              <div className="mt-4 rounded-2xl border-t border-white/5 bg-black/35 px-4 py-5 md:px-8">
                <EventNavigation
                  events={events}
                  currentEventIndex={currentEventIndex}
                  onEventChange={handleEventChange}
                />
              </div>
            </section>

            <section id="cards" className="flex flex-col gap-6 md:flex-row md:items-start">
              <div className="ufc-section rounded-2xl px-4 py-5 md:flex-[2] md:px-5">
                <FightList
                  event={currentEvent}
                  onFightClick={handleFightClick}
                />
              </div>

              <aside className="self-start rounded-2xl border border-white/5 bg-black/70 p-5 text-white shadow-2xl md:sticky md:top-20 md:flex-[1] md:max-h-[calc(100vh-160px)] md:overflow-y-auto lg:top-24">
                {selectedFight ? (
                  <div className="space-y-5">
                    <div className="border-l-4 border-[var(--ufc-red)] pl-4">
                      <p className="ufc-condensed text-xs text-white/60">Featured Bout</p>
                      <h3 className="ufc-condensed mt-1 text-2xl text-white">
                        {selectedFight.fighter1?.name || 'TBD'} vs {selectedFight.fighter2?.name || 'TBD'}
                      </h3>
                      <p className="text-xs uppercase tracking-[0.4em] text-white/50">
                        {formatWeightClass(selectedFight.weightClass)} • {selectedFight.scheduledRounds || 3} Rounds
                        {selectedFight.titleFight ? ' • Title Fight' : ''}
                        {selectedFight.mainEvent && !selectedFight.titleFight ? ' • Main Event' : ''}
                      </p>
                    </div>

                    <div className="grid gap-2.5 text-sm uppercase tracking-[0.24em] text-white/80">
                      <div className="rounded-xl bg-white/5 px-4 py-3.5">
                        <span className="block text-[0.7rem] text-white/70">Fun Score</span>
                        <span className="ufc-condensed text-2xl text-[var(--ufc-red)] md:text-3xl">{selectedFight.predictedFunScore || 0}</span>
                      </div>
                      <div className="rounded-xl bg-white/5 px-4 py-3.5">
                        <span className="block text-[0.7rem] text-white/70">Finish Probability</span>
                        <span className="ufc-condensed text-xl text-white md:text-2xl">{selectedFight.finishProbability || 0}%</span>
                      </div>
                      <div className="rounded-xl bg-white/5 px-4 py-3.5">
                        <span className="block text-[0.7rem] text-white/70">Risk Profile</span>
                        <span className="ufc-condensed text-base text-white md:text-lg">{selectedFight.riskLevel || 'Balanced'}</span>
                      </div>
                    </div>

                    {selectedFight.aiDescription && (
                      <p className="text-sm leading-relaxed text-white/80">
                        {selectedFight.aiDescription}
                      </p>
                    )}

                    {Array.isArray(selectedFight.funFactors) && selectedFight.funFactors.length > 0 && (
                      <div>
                        <p className="ufc-condensed text-xs text-white/70">Key Factors</p>
                        <ul className="mt-3 flex flex-wrap gap-2">
                          {selectedFight.funFactors.map((factor, idx) => (
                            <li
                              key={idx}
                              className="rounded-full border border-white/15 bg-white/15 px-3 py-1 text-[0.7rem] uppercase tracking-[0.28em] text-white"
                            >
                              {typeof factor === 'string' ? factor : factor.type}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {selectedFight.fightPrediction && (
                      <div>
                        <p className="ufc-condensed text-xs text-white/70">Analyst Pick</p>
                        <p className="mt-2 text-sm text-white/80">{selectedFight.fightPrediction}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center text-white/70">
                    <div className="mb-4 text-5xl">🥊</div>
                    <h3 className="ufc-condensed text-xl text-white">Select a Fight</h3>
                    <p className="mt-2 text-sm uppercase tracking-[0.35em] text-white/50">
                      Choose a matchup to break down the finish potential
                    </p>
                  </div>
                )}
              </aside>
            </section>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center text-white">
            <div className="mb-6 text-6xl">🥊</div>
            <h2 className="ufc-condensed text-4xl text-white">No Events Available</h2>
            <p className="mt-4 max-w-xl text-sm uppercase tracking-[0.4em] text-white/60">
              Check back soon for upcoming UFC events and fight predictions!
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
