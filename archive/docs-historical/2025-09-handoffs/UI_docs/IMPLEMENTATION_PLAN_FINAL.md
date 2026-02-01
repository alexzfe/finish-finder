# UI Overhaul Implementation Plan - Final Approved Version

**Last Updated:** 2025-11-03
**Status:** Ready for Implementation
**Branch:** dev
**Testing Strategy:** Deploy to Vercel after high-risk changes

---

## Executive Summary

Transform Finish Finder from a vertical scrolling list (3,300px) to a compact grid layout with progressive disclosure, reducing scrolling by 70% while improving fight comparison and discovery.

**Key Decisions:**
- ✅ **Hybrid Layout:** Traditional card order (default) + Fun Score ranking toggle
- ✅ **Full Replacement:** Direct migration on dev branch (no feature flags)
- ✅ **Real Data Only:** Connected to existing Supabase database via `/api/db-events`
- ✅ **Three-Tier Architecture:** Always visible → Expandable stats → Full modal
- ✅ **Testing:** Deploy to Vercel after high-risk changes, manual testing on 3 devices

---

## Current State

### What Exists
- ✅ Next.js 15 App Router
- ✅ Supabase database with 6 events, 64 fights, 204 fighters
- ✅ API endpoint `/api/db-events` (working)
- ✅ AI predictions (Fun Score, Finish Probability) in database
- ✅ Framer Motion installed
- ✅ Headless UI installed
- ✅ Vertical list layout (FightList component)
- ✅ Modal for fight details (FightDetailsModal)

### What Needs Building
- ❌ State management (Zustand)
- ❌ Grid layout component
- ❌ Progressive disclosure (three tiers)
- ❌ Sort/filter controls
- ❌ Responsive design (1/2/3/4 columns)

---

## Three-Tier Information Architecture

### TIER 1: Always Visible (Phase 1.2)
**Compact card face - no interaction required**

**Displays:**
- Fighter names (14-16px bold)
- Fighter avatars (80-100px circular)
- **Fun Score badge** (24-32px, color-coded - MOST PROMINENT)
  - 0-39: Gray
  - 40-59: Orange
  - 60-79: Yellow
  - 80-100: Red/Green
- Weight class badge
- Fight date
- Card position (Main Event, Main Card, Prelims)
- Title fight indicator (belt icon)

**Size:** 280-320px wide × 180-220px tall

**From Database:**
- `predictedFunScore`
- `fighter1.name`, `fighter2.name`
- `weightClass`
- `cardPosition`, `mainEvent`
- `titleFight`

---

### TIER 2: Progressive Disclosure (Phase 2.1)
**Inline expansion using Headless UI Disclosure**

**Trigger:** Click chevron button

**Displays:**
- Fighter records (W-L-D)
- Finish probability (% + progress bar)
- Tale of the tape (height, reach, age)
- Scheduled rounds
- AI confidence
- Key fun factors (bubble badges)

**Animation:** 200-300ms smooth vertical expansion

**From Database:**
- `fighter1.record`, `fighter2.record`
- `finishProbability`
- `fighter1.height`, `fighter1.reach`, etc.
- `scheduledRounds`
- `funFactors[]`

---

### TIER 3: Full Details Modal (Phase 2.2)
**Modal overlay using Headless UI Dialog**

**Trigger:** Click "Full Details" button

**Displays:**
- Complete fighter statistics (26+ fields)
  - Striking: accuracy, strikes/min, defense
  - Grappling: takedowns, submissions
  - Win/loss methods
- AI Finish Probability reasoning (full text)
- AI Fun Score reasoning (full text)
- Fun Factors with detailed explanations
- Risk level breakdown
- Physical measurements
- Tale of the tape (visual comparison)

**Layout:**
- Desktop: 600-800px modal
- Mobile: Full-screen

**From Database:**
- All fighter stats (strikingAccuracy, takedownDefense, etc.)
- `finishReasoning` JSON
- `funReasoning` JSON
- `funFactors[]`
- `riskLevel`

---

## Implementation Phases

### Phase 1: Foundation & Quick Wins (Weeks 1-2)

#### 1.1 - Install Zustand (LOW RISK)
```bash
npm install zustand
```

Create `/src/lib/store.ts`:
```typescript
import { create } from 'zustand'
import { UFCEvent, Fight } from '@/types'

interface AppState {
  // Real data from API
  events: UFCEvent[]
  currentEventIndex: number
  fights: Fight[]

  // Filters & Sort
  sortBy: 'traditional' | 'funScore'
  filterWeightClass: string[]

  // UI State
  selectedFight: Fight | null
  loading: boolean
  error: string | null

  // Actions
  setEvents: (events: UFCEvent[]) => void
  setCurrentEvent: (index: number) => void
  setSortBy: (sort: 'traditional' | 'funScore') => void
  toggleWeightClassFilter: (wc: string) => void
  setSelectedFight: (fight: Fight | null) => void

  // Computed
  getFilteredSortedFights: () => Fight[]
}

export const useAppStore = create<AppState>((set, get) => ({
  events: [],
  currentEventIndex: 0,
  fights: [],
  sortBy: 'traditional',
  filterWeightClass: [],
  selectedFight: null,
  loading: false,
  error: null,

  setEvents: (events) => set({ events }),
  setCurrentEvent: (index) => {
    const event = get().events[index]
    set({
      currentEventIndex: index,
      fights: event?.fightCard || []
    })
  },
  setSortBy: (sort) => set({ sortBy: sort }),
  toggleWeightClassFilter: (wc) => set((state) => ({
    filterWeightClass: state.filterWeightClass.includes(wc)
      ? state.filterWeightClass.filter(w => w !== wc)
      : [...state.filterWeightClass, wc]
  })),
  setSelectedFight: (fight) => set({ selectedFight: fight }),

  getFilteredSortedFights: () => {
    const { fights, sortBy, filterWeightClass } = get()

    let filtered = fights

    if (filterWeightClass.length > 0) {
      filtered = filtered.filter(f =>
        filterWeightClass.includes(f.weightClass || '')
      )
    }

    if (sortBy === 'funScore') {
      return [...filtered].sort((a, b) =>
        (b.predictedFunScore || 0) - (a.predictedFunScore || 0)
      )
    }

    return filtered // traditional order (already sorted by fightNumber)
  }
}))
```

**No deploy needed - dependency installation only**

---

#### 1.2 - Build FightCard Component (HIGH RISK)

Create `/src/components/fight/FightCard.tsx`:
```typescript
'use client'

import React from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Fight } from '@/types'
import { FighterAvatar } from '@/components/fighter/FighterAvatar'

interface FightCardProps {
  fight: Fight
  onSelect: (fight: Fight) => void
  isPriority?: boolean
}

export const FightCard = React.memo(function FightCard({
  fight,
  onSelect,
  isPriority = false
}: FightCardProps) {
  const getFunScoreColor = (score: number) => {
    if (score >= 80) return 'bg-red-500'
    if (score >= 60) return 'bg-yellow-500'
    if (score >= 40) return 'bg-orange-500'
    return 'bg-gray-500'
  }

  const funScore = fight.predictedFunScore || 0

  return (
    <motion.article
      className="bg-gray-900 rounded-lg shadow-md overflow-hidden cursor-pointer border border-gray-800"
      whileHover={{ scale: 1.03, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(fight)}
    >
      {/* Tier 1: Always Visible */}
      <div className="relative">
        {/* Fun Score Badge */}
        <div className={`absolute top-2 right-2 ${getFunScoreColor(funScore)} text-white px-3 py-1 rounded-full font-bold text-2xl z-10`}>
          {funScore}
        </div>

        {/* Title Fight Indicator */}
        {fight.titleFight && (
          <div className="absolute top-2 left-2 bg-yellow-600 text-white px-2 py-1 rounded text-xs font-bold">
            🏆 TITLE
          </div>
        )}

        {/* Fighter Info */}
        <div className="p-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white">
          <div className="flex items-center gap-2 mb-2">
            <FighterAvatar
              fighter={fight.fighter1}
              size="sm"
            />
            <h3 className="font-bold text-base flex-1">
              {fight.fighter1?.name || 'TBD'}
            </h3>
          </div>

          <p className="text-sm text-gray-300 text-center my-1">vs</p>

          <div className="flex items-center gap-2">
            <FighterAvatar
              fighter={fight.fighter2}
              size="sm"
            />
            <h3 className="font-bold text-base flex-1">
              {fight.fighter2?.name || 'TBD'}
            </h3>
          </div>

          {/* Metadata */}
          <div className="mt-3 flex justify-between items-center text-xs text-gray-400">
            <span>{fight.weightClass || 'TBD'}</span>
            {fight.mainEvent && (
              <span className="bg-red-600 text-white px-2 py-0.5 rounded font-bold">
                MAIN EVENT
              </span>
            )}
            {!fight.mainEvent && fight.cardPosition && (
              <span className="capitalize">{fight.cardPosition}</span>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  )
})
```

**🔴 DEPLOY & TEST after this:**
- [ ] Cards render with real fighter names
- [ ] Fun Score badges show correct numbers
- [ ] Title fight indicators appear
- [ ] Main Event badges display
- [ ] No console errors

---

#### 1.3 - Implement Responsive Grid (HIGH RISK)

Create `/src/components/fight/FightCardGrid.tsx`:
```typescript
'use client'

import { useAppStore } from '@/lib/store'
import { FightCard } from './FightCard'
import { useCallback } from 'react'

export function FightCardGrid() {
  const fights = useAppStore((state) => state.getFilteredSortedFights())
  const setSelectedFight = useAppStore((state) => state.setSelectedFight)

  const handleSelect = useCallback((fight: Fight) => {
    setSelectedFight(fight)
  }, [setSelectedFight])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
      {fights.map((fight, index) => (
        <FightCard
          key={fight.id}
          fight={fight}
          onSelect={handleSelect}
          isPriority={index < 6}
        />
      ))}
    </div>
  )
}
```

**🔴 DEPLOY & TEST after this:**
- [ ] Mobile (375px): 1 column
- [ ] Tablet (768px): 2 columns
- [ ] Desktop (1024px): 3 columns
- [ ] Large (1440px+): 4 columns
- [ ] No horizontal scroll
- [ ] Cards evenly spaced

---

#### 1.4 - Add Hover Animations (LOW RISK)
Already included in FightCard component above.

---

#### 1.5 - Add Sort Toggle (LOW RISK)

Create `/src/components/ui/SortControls.tsx`:
```typescript
'use client'

import { useAppStore } from '@/lib/store'

export function SortControls() {
  const sortBy = useAppStore((state) => state.sortBy)
  const setSortBy = useAppStore((state) => state.setSortBy)

  return (
    <div className="flex gap-4 mb-6 items-center">
      <label htmlFor="sort" className="font-medium text-white">Sort by:</label>
      <select
        id="sort"
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as 'traditional' | 'funScore')}
        className="px-3 py-2 bg-gray-800 text-white border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
      >
        <option value="traditional">Fight Order (Traditional)</option>
        <option value="funScore">Fun Score (Highest First)</option>
      </select>
    </div>
  )
}
```

---

#### 1.6 - Replace FightList in page.tsx (HIGH RISK)

Update `/src/app/page.tsx`:
```typescript
'use client'

import { useState, useEffect } from 'react'
import { EventNavigation } from '@/components/ui/EventNavigation'
import { FightCardGrid } from '@/components/fight/FightCardGrid'
import { SortControls } from '@/components/ui/SortControls'
import { FightDetailsModal } from '@/components/fight/FightDetailsModal'
import { Header } from '@/components/ui/Header'
import { useAppStore } from '@/lib/store'

export default function Home() {
  const setEvents = useAppStore((state) => state.setEvents)
  const setCurrentEvent = useAppStore((state) => state.setCurrentEvent)
  const currentEventIndex = useAppStore((state) => state.currentEventIndex)
  const events = useAppStore((state) => state.events)
  const selectedFight = useAppStore((state) => state.selectedFight)
  const setSelectedFight = useAppStore((state) => state.setSelectedFight)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true)
      try {
        const response = await fetch('/api/db-events')
        if (response.ok) {
          const data = await response.json()
          if (data?.data?.events?.length > 0) {
            setEvents(data.data.events)

            // Set nearest upcoming event
            const now = new Date()
            const nearestIndex = data.data.events.findIndex(
              (e: any) => new Date(e.date) >= now
            )
            setCurrentEvent(nearestIndex >= 0 ? nearestIndex : 0)

            setError(null)
          }
        }
      } catch (err) {
        setError('Failed to load events')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchEvents()
  }, [setEvents, setCurrentEvent])

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p>Loading fights...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <EventNavigation
          events={events}
          currentIndex={currentEventIndex}
          onEventChange={setCurrentEvent}
        />

        <SortControls />

        <FightCardGrid />
      </main>

      <FightDetailsModal
        fight={selectedFight}
        isOpen={selectedFight !== null}
        onClose={() => setSelectedFight(null)}
      />
    </div>
  )
}
```

**🔴 DEPLOY & TEST after this:**
- [ ] All events display
- [ ] Can switch between events
- [ ] All fights render in grid
- [ ] Sort toggle works
- [ ] Modal opens when clicking card
- [ ] No regression from current functionality

---

### Phase 2: Progressive Disclosure (Weeks 3-4)

#### 2.1 - Add Headless UI Disclosure (HIGH RISK)

Update `FightCard.tsx` to add Tier 2:
```typescript
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'

// Add inside FightCard component, after Tier 1 content:
<Disclosure>
  {({ open }) => (
    <>
      <DisclosureButton className="w-full px-4 py-2 text-left text-sm font-medium text-gray-300 hover:bg-gray-800 flex justify-between items-center border-t border-gray-800">
        <span>Quick Stats</span>
        <ChevronDownIcon className={`w-5 transition ${open ? 'rotate-180' : ''}`} />
      </DisclosureButton>

      <DisclosurePanel
        transition
        className="px-4 py-3 text-sm text-gray-300 space-y-2 origin-top transition duration-200 ease-out data-closed:opacity-0 data-closed:-translate-y-2 border-t border-gray-800"
      >
        <div className="flex justify-between">
          <span>Record:</span>
          <span className="font-bold">
            {fight.fighter1?.record || 'N/A'} vs {fight.fighter2?.record || 'N/A'}
          </span>
        </div>

        <div className="flex justify-between">
          <span>Finish Probability:</span>
          <span className="font-bold">{Math.round((fight.finishProbability || 0) * 100)}%</span>
        </div>

        <div className="w-full bg-gray-700 rounded-full h-2">
          <div
            className="bg-red-500 h-2 rounded-full"
            style={{ width: `${(fight.finishProbability || 0) * 100}%` }}
          />
        </div>

        {fight.scheduledRounds && (
          <div className="flex justify-between">
            <span>Scheduled:</span>
            <span className="font-bold">{fight.scheduledRounds} Rounds</span>
          </div>
        )}

        {fight.funFactors && fight.funFactors.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {fight.funFactors.slice(0, 3).map((factor, i) => (
              <span key={i} className="bg-gray-700 px-2 py-1 rounded text-xs">
                {factor}
              </span>
            ))}
          </div>
        )}
      </DisclosurePanel>
    </>
  )}
</Disclosure>
```

**🔴 DEPLOY & TEST after this:**
- [ ] Chevron button appears
- [ ] Click expands card smoothly
- [ ] Stats display correctly
- [ ] Finish probability bar shows
- [ ] Click again collapses
- [ ] Animation smooth (200-300ms)

---

#### 2.2 - Enhance FightDetailsModal (HIGH RISK)

Update `/src/components/fight/FightDetailsModal.tsx` to show Tier 3 data:
- Add all 26+ fighter statistics
- Display full `finishReasoning` text
- Display full `funReasoning` text
- Show detailed fun factors
- Add tale of the tape visual

**🔴 DEPLOY & TEST after this:**
- [ ] Modal opens with complete data
- [ ] AI reasoning text displays
- [ ] All fighter stats visible
- [ ] Fun Score breakdown shows
- [ ] Modal closes correctly
- [ ] Focus returns to card

---

#### 2.3 - React.memo Optimization (LOW RISK)

Already implemented in FightCard component.

---

### Phase 3: Features & Sorting (Weeks 5-6)

#### 3.1 - Add Weight Class Filters (LOW RISK)

Create `/src/components/ui/FilterControls.tsx`:
```typescript
'use client'

import { useAppStore } from '@/lib/store'

export function FilterControls() {
  const fights = useAppStore((state) => state.fights)
  const filterWeightClass = useAppStore((state) => state.filterWeightClass)
  const toggleWeightClassFilter = useAppStore((state) => state.toggleWeightClassFilter)

  // Get unique weight classes from current event
  const weightClasses = [...new Set(
    fights.map(f => f.weightClass).filter(Boolean)
  )]

  return (
    <div className="mb-6">
      <p className="text-sm text-gray-400 mb-2">Filter by weight class:</p>
      <div className="flex flex-wrap gap-2">
        {weightClasses.map(wc => (
          <button
            key={wc}
            onClick={() => toggleWeightClassFilter(wc)}
            className={`px-3 py-1 rounded-full text-sm transition ${
              filterWeightClass.includes(wc)
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {wc}
          </button>
        ))}
        {filterWeightClass.length > 0 && (
          <button
            onClick={() => filterWeightClass.forEach(toggleWeightClassFilter)}
            className="px-3 py-1 rounded-full text-sm bg-gray-700 text-gray-300 hover:bg-gray-600"
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  )
}
```

---

#### 3.2 - Collapsible Prelims Accordion (HIGH RISK)

Update `FightCardGrid.tsx` to group fights by card position:
```typescript
const mainCardFights = fights.filter(f => f.cardPosition === 'main')
const prelimFights = fights.filter(f => f.cardPosition === 'preliminary')
const earlyPrelimFights = fights.filter(f => f.cardPosition === 'early-preliminary')

return (
  <div>
    {/* Main Card */}
    {mainCardFights.length > 0 && (
      <>
        <h2 className="text-2xl font-bold mb-4">Main Card</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
          {mainCardFights.map((fight, index) => (
            <FightCard key={fight.id} fight={fight} onSelect={handleSelect} isPriority={index < 4} />
          ))}
        </div>
      </>
    )}

    {/* Collapsible Prelims */}
    {prelimFights.length > 0 && (
      <Disclosure defaultOpen={false}>
        {({ open }) => (
          <>
            <DisclosureButton className="w-full text-left mb-4">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                Preliminaries ({prelimFights.length})
                <ChevronDownIcon className={`w-6 transition ${open ? 'rotate-180' : ''}`} />
              </h2>
            </DisclosureButton>
            <DisclosurePanel>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
                {prelimFights.map((fight) => (
                  <FightCard key={fight.id} fight={fight} onSelect={handleSelect} />
                ))}
              </div>
            </DisclosurePanel>
          </>
        )}
      </Disclosure>
    )}
  </div>
)
```

**🔴 DEPLOY & TEST after this:**
- [ ] Main Card section displays
- [ ] Preliminaries section collapses by default
- [ ] Click to expand shows prelim fights
- [ ] Chevron icon rotates
- [ ] Collapse works correctly

---

#### 3.3 - Mobile Responsiveness Polish (HIGH RISK)

- Ensure touch targets ≥44px
- Test on actual iPhone and Android
- Adjust spacing for small screens
- Ensure modals are full-screen on mobile

**🔴 DEPLOY & TEST after this:**
- [ ] Test on iPhone
- [ ] Test on Android
- [ ] Touch targets adequate
- [ ] No zoom issues
- [ ] Filters accessible

---

### Phase 4: Accessibility & Polish (Weeks 7-8)

#### 4.1 - Semantic HTML Audit

- Use `<ul>` and `<li>` for fight grid
- Use `<article>` for each card
- Proper heading hierarchy (h1 → h2 → h3)
- Use `<time>` for dates
- Ensure all buttons are `<button>` elements

#### 4.2 - Keyboard Navigation

- Tab through all cards
- Enter/Space activates buttons
- Escape closes modal
- Visible focus indicators (3px outline)

#### 4.3 - Color Contrast

- Validate 4.5:1 for text
- Validate 3:1 for UI components
- Test Fun Score badge colors

**🔴 DEPLOY & TEST after Phase 4:**
- [ ] Tab navigation works
- [ ] Enter opens disclosure
- [ ] Escape closes modal
- [ ] Focus visible
- [ ] Run Lighthouse audit (score >90)
- [ ] Color contrast passes

---

## Data Flow

```
Supabase Database
      ↓
GET /api/db-events (existing endpoint)
      ↓
page.tsx useEffect (fetch on mount)
      ↓
Zustand Store (setEvents)
      ↓
FightCardGrid (getFilteredSortedFights)
      ↓
FightCard components (Tier 1 + 2)
      ↓
FightDetailsModal (Tier 3)
```

---

## Testing Strategy

### High Risk Changes → Deploy & Test Immediately
- Phase 1.2: FightCard component
- Phase 1.3: Responsive grid
- Phase 1.6: Replace FightList
- Phase 2.1: Disclosure
- Phase 2.2: Modal
- Phase 3.2: Accordion
- Phase 3.3: Mobile polish

### Low Risk Changes → Batch Test
- Phase 1.1: Zustand install
- Phase 1.4: Hover animations
- Phase 1.5: Sort toggle
- Phase 2.3: React.memo
- Phase 3.1: Filters
- Phase 4: Accessibility

### Testing Checklist Template
```
Visual:
[ ] Layout correct
[ ] Data displays
[ ] No visual bugs

Functional:
[ ] Interactions work
[ ] No console errors
[ ] Performance smooth

Responsive:
[ ] Mobile (iPhone/Android)
[ ] Tablet (iPad)
[ ] Desktop
```

---

## Rollback Strategy

If deployment breaks:
```bash
git revert HEAD
git push
```
Vercel auto-deploys reverted state.

---

## Success Criteria

### Phase 1 Complete
- ✅ Grid displays 12-14 fights without scrolling
- ✅ Sort toggle switches between Traditional/Fun Score
- ✅ All real data from Supabase displays correctly
- ✅ Responsive across mobile/tablet/desktop

### Phase 2 Complete
- ✅ Cards expand to show quick stats
- ✅ Modal opens with full AI analysis
- ✅ All 3 tiers functional
- ✅ Smooth animations (60fps)

### Phase 3 Complete
- ✅ Filters work correctly
- ✅ Prelims collapsible
- ✅ Mobile experience polished

### Phase 4 Complete
- ✅ WCAG 2.1 AA compliant
- ✅ Keyboard navigation works
- ✅ Lighthouse accessibility score >90

---

## Timeline Estimate

- **Phase 1:** 8-12 hours (Weeks 1-2)
- **Phase 2:** 10-14 hours (Weeks 3-4)
- **Phase 3:** 8-12 hours (Weeks 5-6)
- **Phase 4:** 6-10 hours (Weeks 7-8)

**Total:** 32-48 hours over 6-8 weeks at hobbyist pace (5-8 hours/week)

---

## Notes

- All code changes on `dev` branch
- Deploy to Vercel after each high-risk change
- Manual testing on 3 devices (desktop, iPhone, Android)
- No mock data - always use real Supabase data
- Keep `/api/db-events` endpoint unchanged
- TypeScript strict mode compliance required
- No ESLint errors before deployment
