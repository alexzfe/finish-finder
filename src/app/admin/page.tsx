'use client'

import { useState } from 'react'
import PerformanceDashboard from '@/components/admin/PerformanceDashboard'
import DatabaseManagement from '@/components/admin/DatabaseManagement'

/**
 * Admin Dashboard Page
 *
 * Simple admin interface for monitoring database performance
 * In production, this would be protected by authentication
 */
export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')

  // Simple password check (in production, use proper authentication)
  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault()
    // Simple demo password - in production, use proper auth
    if (password === 'admin123' || process.env.NODE_ENV === 'development') {
      setIsAuthenticated(true)
    } else {
      alert('Invalid password')
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[var(--ufc-black)] flex items-center justify-center">
        <div className="bg-gray-800 p-8 rounded-lg max-w-md w-full mx-4">
          <h1 className="text-2xl font-bold text-white mb-6 text-center">
            🔒 Admin Access
          </h1>
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-400 mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter admin password"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
            >
              Access Dashboard
            </button>
          </form>
          {process.env.NODE_ENV === 'development' && (
            <p className="text-xs text-gray-500 mt-4 text-center">
              Development mode: Use password &quot;admin123&quot; or any password
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--ufc-black)]">
      <header className="bg-gray-900 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-white">
                🛠️ Finish Finder Admin
              </h1>
            </div>
            <button
              onClick={() => setIsAuthenticated(false)}
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <PerformanceDashboard />
        <DatabaseManagement />
      </main>
    </div>
  )
}