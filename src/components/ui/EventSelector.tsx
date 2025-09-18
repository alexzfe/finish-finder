import { UFCEvent } from '@/types'

interface EventSelectorProps {
  events: UFCEvent[]
  selectedEvent: UFCEvent | null
  onEventSelect: (event: UFCEvent) => void
}

export function EventSelector({ events, selectedEvent, onEventSelect }: EventSelectorProps) {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
      <h2 className="text-white text-xl font-semibold mb-4">
        📅 Upcoming UFC Events
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {events.map((event) => (
          <button
            key={event.id}
            onClick={() => onEventSelect(event)}
            className={`p-4 rounded-lg text-left transition-all duration-200 ${
              selectedEvent?.id === event.id
                ? 'bg-red-600 text-white shadow-lg transform scale-105'
                : 'bg-white/5 text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <h3 className="font-semibold text-lg mb-2">{event.name}</h3>
            <p className="text-sm opacity-80">
              {event.date.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
            <p className="text-sm opacity-70">
              📍 {event.location}
            </p>
            <p className="text-xs opacity-60 mt-1">
              {event.venue}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}