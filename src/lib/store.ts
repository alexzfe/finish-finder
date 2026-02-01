import { create } from 'zustand'

import { type UFCEvent, type Fight } from '@/types'

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
  clearWeightClassFilters: () => void
  setSelectedFight: (fight: Fight | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void

  // Computed
  getFilteredSortedFights: () => Fight[]
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  events: [],
  currentEventIndex: 0,
  fights: [],
  sortBy: 'traditional',
  filterWeightClass: [],
  selectedFight: null,
  loading: false,
  error: null,

  // Actions
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

  clearWeightClassFilters: () => set({ filterWeightClass: [] }),

  setSelectedFight: (fight) => set({ selectedFight: fight }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  // Computed selector for filtered and sorted fights
  getFilteredSortedFights: () => {
    const { fights, sortBy, filterWeightClass } = get()

    // Defensive: ensure fights is always an array
    if (!fights || !Array.isArray(fights)) {
      return []
    }

    let filtered = fights

    // Apply weight class filter
    if (filterWeightClass.length > 0) {
      filtered = filtered.filter(f =>
        f && filterWeightClass.includes(f.weightClass || '')
      )
    }

    // Apply sorting
    if (sortBy === 'funScore') {
      // Sort by Fun Score (highest first)
      // Create new array to avoid mutating original
      return [...filtered].sort((a, b) => {
        const scoreA = (a && typeof a.predictedFunScore === 'number') ? a.predictedFunScore : 0
        const scoreB = (b && typeof b.predictedFunScore === 'number') ? b.predictedFunScore : 0
        return scoreB - scoreA
      })
    }

    // Traditional order (already sorted by fightNumber from API)
    return filtered
  }
}))
