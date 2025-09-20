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
    <div className="relative bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6">
      {/* Navigation Arrows */}
      <button
        onClick={goToPrevEvent}
        disabled={currentEventIndex === 0}
        className={`absolute left-4 top-1/2 transform -translate-y-1/2 p-3 rounded-full transition-all duration-200 ${
          currentEventIndex === 0
            ? 'bg-gray-600/30 text-gray-400 cursor-not-allowed'
            : 'bg-red-600/80 text-white hover:bg-red-600 hover:scale-110 shadow-lg'
        }`}
        aria-label="Previous event"
      >
        <ChevronLeftIcon className="w-6 h-6" />
      </button>

      <button
        onClick={goToNextEvent}
        disabled={currentEventIndex === events.length - 1}
        className={`absolute right-4 top-1/2 transform -translate-y-1/2 p-3 rounded-full transition-all duration-200 ${
          currentEventIndex === events.length - 1
            ? 'bg-gray-600/30 text-gray-400 cursor-not-allowed'
            : 'bg-red-600/80 text-white hover:bg-red-600 hover:scale-110 shadow-lg'
        }`}
        aria-label="Next event"
      >
        <ChevronRightIcon className="w-6 h-6" />
      </button>

      {/* Event Information */}
      <div className="text-center px-10">
        {/* Event Title */}
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-3 leading-tight">
          {currentEvent.name}
        </h1>

        {/* Event Date */}
        <p className="text-lg md:text-xl text-red-400 font-semibold mb-1">
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
        <p className="text-sm md:text-base text-white/70 mb-4">
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
                  ? 'bg-red-500 scale-125'
                  : 'bg-white/30 hover:bg-white/50'
              }`}
              aria-label={`Go to event ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
