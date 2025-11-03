'use client'

import { useAppStore } from '@/lib/store'

export function SortControls() {
  const sortBy = useAppStore((state) => state.sortBy)
  const setSortBy = useAppStore((state) => state.setSortBy)

  return (
    <div className="flex gap-4 mb-6 items-center">
      <label htmlFor="sort" className="ufc-condensed font-medium text-white text-sm">
        Sort by:
      </label>
      <select
        id="sort"
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as 'traditional' | 'funScore')}
        className="px-3 py-2 bg-gray-800 text-white border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
      >
        <option value="traditional">Fight Order (Traditional)</option>
        <option value="funScore">Fun Score (Highest First)</option>
      </select>
    </div>
  )
}
