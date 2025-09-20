'use client'

import { useState } from 'react'
import { UFCEvent, Fight } from '@/types'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid'

interface EventNavigationProps {
  events: UFCEvent[]
  currentEventIndex: number
  onEventChange: (index: number) => void
}

export function EventNavigation({ events, currentEventIndex, onEventChange }: EventNavigationProps) {
  const currentEvent = events[currentEventIndex]

  const goToPrevEvent = () => {
    if (currentEventIndex > 0) {
      onEventChange(currentEventIndex - 1)
    }
  }

  const goToNextEvent = () => {
    if (currentEventIndex < events.length - 1) {
      onEventChange(currentEventIndex + 1)
    }
  }

  if (!currentEvent) {
    return null
  }

  // Sort fights from last to first (main event at top, early prelims at bottom)
  const sortedFights = [...(currentEvent.fightCard || [])].reverse()

  return (
    <div className="relative rounded-xl border border-white/5 bg-black/55 px-10 pb-6 pt-6 text-white md:px-12">
      <button
        onClick={goToPrevEvent}
        disabled={currentEventIndex === 0}
        className={`absolute left-5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border transition-all duration-150 ${
          currentEventIndex === 0
            ? 'cursor-not-allowed border-white/10 bg-white/5 text-white/20'
            : 'border-white/20 bg-white/10 text-white hover:border-[var(--ufc-red)]/60 hover:bg-[var(--ufc-red)]/20'
        }`}
        aria-label="Previous event"
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </button>

      <button
        onClick={goToNextEvent}
        disabled={currentEventIndex === events.length - 1}
        className={`absolute right-5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border transition-all duration-150 ${
          currentEventIndex === events.length - 1
            ? 'cursor-not-allowed border-white/10 bg-white/5 text-white/20'
            : 'border-white/20 bg-white/10 text-white hover:border-[var(--ufc-red)]/60 hover:bg-[var(--ufc-red)]/20'
        }`}
        aria-label="Next event"
      >
        <ChevronRightIcon className="h-4 w-4" />
      </button>

      <div className="text-center">
        <h1 className="ufc-condensed text-2xl text-white md:text-3xl">
          {currentEvent.name}
        </h1>

        <p className="ufc-condensed mt-2 text-xs text-[var(--ufc-red)] md:text-sm">
          {(() => {
            const dateStr = typeof currentEvent.date === 'string'
              ? currentEvent.date.split('T')[0]
              : currentEvent.date.toISOString().split('T')[0];
            const [year, month, day] = dateStr.split('-').map(Number);
            const safeDate = new Date(year, month - 1, day);
            return safeDate.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            });
          })()}
        </p>

        <p className="mt-2 text-[0.65rem] uppercase tracking-[0.35em] text-white/45">
          📍 {currentEvent.location}
        </p>

        <div className="mt-4 flex items-center justify-center gap-2">
          {events.map((_, index) => (
            <button
              key={index}
              onClick={() => onEventChange(index)}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                index === currentEventIndex
                  ? 'w-8 bg-[var(--ufc-red)]'
                  : 'w-2.5 bg-white/20 hover:bg-white/40'
              }`}
              aria-label={`Go to event ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
