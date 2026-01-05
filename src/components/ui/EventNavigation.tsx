'use client'

import { useRef, useEffect, useCallback } from 'react'
import { UFCEvent } from '@/types'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid'

interface EventNavigationProps {
  events: UFCEvent[]
  currentEventIndex: number
  onEventChange: (index: number) => void
}

export function EventNavigation({ events, currentEventIndex, onEventChange }: EventNavigationProps) {
  const currentEvent = events[currentEventIndex]
  const containerRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef<number>(0)
  const touchEndX = useRef<number>(0)

  const goToPrevEvent = useCallback(() => {
    if (currentEventIndex > 0) {
      onEventChange(currentEventIndex - 1)
    }
  }, [currentEventIndex, onEventChange])

  const goToNextEvent = useCallback(() => {
    if (currentEventIndex < events.length - 1) {
      onEventChange(currentEventIndex + 1)
    }
  }, [currentEventIndex, events.length, onEventChange])

  // Swipe gesture handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX
  }

  const handleTouchEnd = () => {
    const swipeThreshold = 50 // minimum distance for a swipe
    const diff = touchStartX.current - touchEndX.current

    if (Math.abs(diff) > swipeThreshold) {
      if (diff > 0) {
        // Swiped left -> next event
        goToNextEvent()
      } else {
        // Swiped right -> previous event
        goToPrevEvent()
      }
    }
    // Reset values
    touchStartX.current = 0
    touchEndX.current = 0
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if this component or its children are focused
      if (!containerRef.current?.contains(document.activeElement) &&
          document.activeElement !== document.body) {
        return
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goToPrevEvent()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goToNextEvent()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToPrevEvent, goToNextEvent])

  if (!currentEvent) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className={`relative rounded-xl border px-6 pb-6 pt-6 text-white sm:px-10 md:px-12 transition-all select-none ${
        currentEvent.completed
          ? 'border-white/10 bg-black/40 opacity-75'
          : 'border-white/5 bg-black/55'
      }`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      role="region"
      aria-label="Event navigation"
      tabIndex={0}
    >
      <button
        onClick={goToPrevEvent}
        disabled={currentEventIndex === 0}
        className={`absolute left-5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border transition-all duration-150 ${
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
        className={`absolute right-5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border transition-all duration-150 ${
          currentEventIndex === events.length - 1
            ? 'cursor-not-allowed border-white/10 bg-white/5 text-white/20'
            : 'border-white/20 bg-white/10 text-white hover:border-[var(--ufc-red)]/60 hover:bg-[var(--ufc-red)]/20'
        }`}
        aria-label="Next event"
      >
        <ChevronRightIcon className="h-4 w-4" />
      </button>

      <div className="text-center">
        <div className="flex items-center justify-center gap-3">
          <h1 className="ufc-condensed text-2xl text-white md:text-3xl">
            {currentEvent.name}
          </h1>
          {currentEvent.completed && (
            <span
              className="ufc-condensed rounded-full bg-white/10 px-3 py-1 text-[0.7rem] md:text-xs uppercase tracking-[0.2em] text-white/70 border border-white/20"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              Completed
            </span>
          )}
        </div>

        <p className="ufc-condensed mt-2 text-xs text-[var(--ufc-red)] md:text-sm">
          {(() => {
            const dateStr = typeof currentEvent.date === 'string'
              ? (currentEvent.date as string).split('T')[0]
              : (currentEvent.date as Date).toISOString().split('T')[0];
            const [year, month, day] = (dateStr as string).split('-').map(Number);
            const safeDate = new Date(year, month - 1, day);
            return safeDate.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            });
          })()}
        </p>

        <p className="mt-2 text-[0.7rem] md:text-xs uppercase tracking-[0.35em] text-white/45">
          {currentEvent.location}
        </p>

        <div className="mt-4 flex items-center justify-center gap-0.5" role="tablist" aria-label="Event list">
          {events.map((event, index) => (
            <button
              key={index}
              onClick={() => onEventChange(index)}
              className="relative flex h-11 w-11 items-center justify-center"
              aria-label={`Go to ${event.name}${event.completed ? ' (completed)' : ''}`}
              aria-selected={index === currentEventIndex}
              role="tab"
            >
              {/* Visual dot indicator */}
              <span
                className={`block rounded-full transition-all duration-200 ${
                  index === currentEventIndex
                    ? 'h-3 w-8 bg-[var(--ufc-red)]'
                    : event.completed
                    ? 'h-3 w-3 bg-white/10 hover:bg-white/20'
                    : 'h-3 w-3 bg-white/20 hover:bg-white/40'
                }`}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
