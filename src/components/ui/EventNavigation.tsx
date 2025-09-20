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
    <div className="relative border-b border-gray-200 pb-6" style={{ fontFamily: 'Arial, "Helvetica Neue", sans-serif' }}>
      {/* Navigation Arrows */}
      <button
        onClick={goToPrevEvent}
        disabled={currentEventIndex === 0}
        className={`absolute left-0 top-1/2 transform -translate-y-1/2 p-2 rounded-full transition-all duration-200 ${
          currentEventIndex === 0
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'text-white hover:opacity-90'
        }`}
        style={{
          backgroundColor: currentEventIndex === 0 ? undefined : '#d20a0a'
        }}
        aria-label="Previous event"
      >
        <ChevronLeftIcon className="w-5 h-5" />
      </button>

      <button
        onClick={goToNextEvent}
        disabled={currentEventIndex === events.length - 1}
        className={`absolute right-0 top-1/2 transform -translate-y-1/2 p-2 rounded-full transition-all duration-200 ${
          currentEventIndex === events.length - 1
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'text-white hover:opacity-90'
        }`}
        style={{
          backgroundColor: currentEventIndex === events.length - 1 ? undefined : '#d20a0a'
        }}
        aria-label="Next event"
      >
        <ChevronRightIcon className="w-5 h-5" />
      </button>

      {/* Event Information */}
      <div className="text-center px-12">
        {/* Event Title */}
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3 leading-tight uppercase tracking-wide">
          {currentEvent.name}
        </h1>

        {/* Event Date */}
        <p
          className="text-lg md:text-xl font-bold mb-2 uppercase tracking-widest"
          style={{ color: '#d20a0a' }}
        >
          {(() => {
            // Parse date correctly to avoid timezone issues
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

        {/* Location */}
        <p className="text-sm md:text-base text-gray-600 mb-4 uppercase tracking-wide">
          📍 {currentEvent.location}
        </p>

        {/* Event Navigation Indicator */}
        <div className="flex justify-center items-center space-x-2 mb-2">
          {events.map((_, index) => (
            <button
              key={index}
              onClick={() => onEventChange(index)}
              className={`w-3 h-3 rounded-full transition-all duration-200 ${
                index === currentEventIndex
                  ? 'scale-125'
                  : 'bg-gray-300 hover:bg-gray-400'
              }`}
              style={{
                backgroundColor: index === currentEventIndex ? '#d20a0a' : undefined
              }}
              aria-label={`Go to event ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
