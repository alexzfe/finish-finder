'use client'

import { useState, useEffect } from 'react'
import { EventNavigation } from '@/components/ui/EventNavigation'
import { FightList } from '@/components/fight/FightList'
import { FightDetailsModal } from '@/components/fight/FightDetailsModal'
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
  const [isModalOpen, setIsModalOpen] = useState(false)

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
        console.log('🔍 Fetching events from API...')
        const apiResponse = await fetch('/api/db-events')
        if (apiResponse.ok) {
          const apiData = await apiResponse.json()
          console.log('📊 API Response:', apiData)

          // More lenient condition - just check if we have events
          if (apiData && apiData.data && apiData.data.events && apiData.data.events.length > 0) {
            console.log('✅ Found events, processing...')
            const sortedEvents = normalizeEvents(apiData.data.events)
            setEvents(sortedEvents)

            // Set current event index
            const now = new Date()
            const nearestEventIndex = sortedEvents.findIndex((event: UFCEvent) => event.date >= now)
            const resolvedIndex = nearestEventIndex >= 0 ? nearestEventIndex : 0
            setCurrentEventIndex(resolvedIndex)

            // Set selected fight
            const defaultEvent = sortedEvents[resolvedIndex]
            if (defaultEvent?.fightCard?.length) {
              setSelectedFight(defaultEvent.fightCard[0])
            }

            setError(null)
            setLoading(false)
            console.log('✅ Successfully loaded events from main database')
            return
          } else {
            console.log('❌ No events found in API response')
          }
        } else {
          console.log('❌ API response not OK:', apiResponse.status)
        }
      } catch (error) {
        console.warn('❌ API event fetch failed, falling back to static data.', error)
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
    // Open modal on mobile, use sidebar on tablet landscape and desktop (768px+)
    // Guard against SSR - window is not available on server
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsModalOpen(true)
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
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

      <main id="main-content" className="mx-auto max-w-sm px-4 pb-16 sm:max-w-md sm:px-6 md:max-w-4xl lg:max-w-6xl xl:max-w-7xl" tabIndex={-1}>
        {loading ? (
          <div className="space-y-6">
            {/* Event Navigation Skeleton */}
            <section className="ufc-section mt-6 rounded-2xl px-0 pb-6 pt-4">
              <div className="px-6 md:px-8">
                <div className="h-6 w-40 animate-pulse rounded bg-white/10" />
              </div>
              <div className="mt-4 rounded-2xl border-t border-white/5 bg-black/35 px-4 py-5 md:px-8">
                <div className="relative rounded-xl border border-white/5 bg-black/55 px-6 pb-6 pt-6 sm:px-10 md:px-12">
                  {/* Nav buttons skeleton */}
                  <div className="absolute left-5 top-1/2 h-11 w-11 -translate-y-1/2 animate-pulse rounded-full bg-white/10" />
                  <div className="absolute right-5 top-1/2 h-11 w-11 -translate-y-1/2 animate-pulse rounded-full bg-white/10" />
                  {/* Event info skeleton */}
                  <div className="flex flex-col items-center text-center">
                    <div className="h-8 w-64 animate-pulse rounded bg-white/10" />
                    <div className="mt-3 h-4 w-48 animate-pulse rounded bg-white/10" />
                    <div className="mt-2 h-3 w-36 animate-pulse rounded bg-white/10" />
                    <div className="mt-4 flex gap-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-3 w-3 animate-pulse rounded-full bg-white/10" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Fight List Skeleton */}
            <section className="flex flex-col gap-6 md:flex-row md:items-start">
              <div className="ufc-section rounded-2xl px-4 py-5 md:flex-[2] md:px-5">
                <div className="rounded-2xl border border-white/5 bg-black/40">
                  <div className="flex items-center justify-between border-b border-white/5 px-3 py-3 sm:px-5">
                    <div className="h-5 w-32 animate-pulse rounded bg-white/10" />
                    <div className="h-3 w-16 animate-pulse rounded bg-white/10" />
                  </div>
                  <div className="p-3 sm:p-5 space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="rounded-xl border border-white/10 overflow-hidden">
                        <div className="border-b border-white/10 bg-black/60 px-4 py-3">
                          <div className="flex justify-between">
                            <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
                            <div className="h-5 w-10 animate-pulse rounded bg-white/10" />
                          </div>
                        </div>
                        <div className="bg-black/50 p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 md:w-16 md:h-16 animate-pulse rounded-full bg-white/10" />
                              <div className="space-y-2">
                                <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
                                <div className="h-2 w-16 animate-pulse rounded bg-white/10" />
                              </div>
                            </div>
                            <div className="h-3 w-6 animate-pulse rounded bg-white/10" />
                            <div className="flex items-center gap-3">
                              <div className="space-y-2 text-right">
                                <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
                                <div className="h-2 w-16 animate-pulse rounded bg-white/10 ml-auto" />
                              </div>
                              <div className="w-12 h-12 md:w-16 md:h-16 animate-pulse rounded-full bg-white/10" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sidebar Skeleton (desktop only) */}
              <aside className="hidden md:block rounded-2xl border border-white/5 bg-black/70 p-5 md:flex-[1]">
                <div className="space-y-4">
                  <div className="border-l-4 border-white/20 pl-4">
                    <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
                    <div className="mt-2 h-6 w-48 animate-pulse rounded bg-white/10" />
                    <div className="mt-2 h-3 w-32 animate-pulse rounded bg-white/10" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-16 w-full animate-pulse rounded-xl bg-white/5" />
                    <div className="h-16 w-full animate-pulse rounded-xl bg-white/5" />
                  </div>
                </div>
              </aside>
            </section>
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

              <aside className="hidden md:block md:self-start rounded-2xl border border-white/5 bg-black/70 p-4 sm:p-5 text-white shadow-2xl md:sticky md:top-20 md:flex-[1] md:max-h-[calc(100vh-160px)] md:overflow-y-auto lg:top-24">
                {selectedFight ? (
                  <div className="space-y-5">
                    <div className="border-l-4 border-[var(--ufc-red)] pl-4">
                      <p className="ufc-condensed text-xs text-white/60">Featured Bout</p>
                      <h3 className="ufc-condensed mt-1 text-lg text-white sm:text-xl lg:text-2xl">
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
                        <span className="ufc-condensed text-xl text-white md:text-2xl">{Math.round((selectedFight.finishProbability || 0) * 100)}%</span>
                      </div>
                      <div className="rounded-xl bg-white/5 px-4 py-3.5">
                        <span className="block text-[0.7rem] text-white/70">Risk Profile</span>
                        <span className="ufc-condensed text-base text-white md:text-lg">{selectedFight.riskLevel || 'Balanced'}</span>
                      </div>
                    </div>

                    {(selectedFight.aiDescription || selectedFight.funReasoning) && (
                      <div className="space-y-3">
                        {/* Finish Probability Analysis */}
                        {selectedFight.aiDescription && (
                          <div>
                            <p className="ufc-condensed text-xs text-white/70 mb-2">Finish Probability Analysis</p>
                            <p className="text-sm leading-relaxed text-white/80">
                              {selectedFight.aiDescription}
                            </p>
                          </div>
                        )}

                        {/* Fun Score Analysis */}
                        {selectedFight.funReasoning && (
                          <div>
                            <p className="ufc-condensed text-xs text-white/70 mb-2">Fun Score Analysis</p>
                            <p className="text-sm leading-relaxed text-white/80 mb-3">
                              {selectedFight.funReasoning}
                            </p>
                            {/* Key Factors as Bubbles */}
                            {Array.isArray(selectedFight.funFactors) && selectedFight.funFactors.length > 0 && (
                              <div>
                                <p className="ufc-condensed text-[0.65rem] uppercase tracking-[0.3em] text-white/50 mb-2">Key Factors</p>
                                <div className="flex flex-wrap gap-2">
                                  {selectedFight.funFactors.map((factor, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-block rounded-full bg-[var(--ufc-red)]/20 px-3 py-1 text-xs font-medium text-white/90 border border-[var(--ufc-red)]/30"
                                    >
                                      {typeof factor === 'string' ? factor : factor.type}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
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

      {/* Fight Details Modal for Mobile/Tablet */}
      <FightDetailsModal
        fight={selectedFight}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  )
}
