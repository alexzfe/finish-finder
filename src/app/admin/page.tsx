'use client'

import { useEffect, useState } from 'react'
import { DataCollectionDashboard } from '@/components/admin/DataCollectionDashboard'
import { Header } from '@/components/ui/Header'

const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD
const STORAGE_KEY = 'ffp-admin-auth'
const ADMIN_ENABLED = process.env.NEXT_PUBLIC_ENABLE_ADMIN === 'true'

export default function AdminPage() {
  const [authorized, setAuthorized] = useState(!ADMIN_PASSWORD)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ADMIN_PASSWORD) {
      return
    }

    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (stored && stored === ADMIN_PASSWORD) {
      setAuthorized(true)
    }
  }, [])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ADMIN_PASSWORD) {
      setAuthorized(true)
      return
    }

    if (password === ADMIN_PASSWORD) {
      setAuthorized(true)
      localStorage.setItem(STORAGE_KEY, ADMIN_PASSWORD)
      setError(null)
      setPassword('')
    } else {
      setError('Incorrect password. Please try again.')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY)
    setAuthorized(false)
    setPassword('')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-red-900 to-black">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            🛠️ Admin Dashboard
          </h1>
          <p className="text-white/70 text-lg">
            Manage data collection, monitor system status, and configure settings
          </p>
        </div>

        {ADMIN_ENABLED ? (
          authorized ? (
            <div className="space-y-4">
              {ADMIN_PASSWORD ? (
                <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-sm text-white/60 hover:text-white underline"
                >
                  Sign out
                </button>
              </div>
            ) : null}
              <DataCollectionDashboard />
            </div>
          ) : (
            <div className="max-w-md mx-auto bg-white/10 backdrop-blur-sm rounded-lg p-6">
              <h2 className="text-2xl font-semibold text-white mb-4 text-center">🔐 Enter Admin Password</h2>
              <p className="text-white/60 text-sm mb-4 text-center">
                This section is restricted. Please enter the admin password to continue.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Admin password"
                  className="w-full rounded bg-black/40 border border-white/20 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                {error ? <p className="text-sm text-red-400">{error}</p> : null}
                <button
                  type="submit"
                  className="w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors font-semibold"
                >
                  Unlock
                </button>
              </form>
            </div>
          )
        ) : (
          <div className="max-w-md mx-auto bg-white/10 backdrop-blur-sm rounded-lg p-6">
            <h2 className="text-2xl font-semibold text-white mb-4 text-center">ℹ️ Admin Tools Unavailable</h2>
            <p className="text-white/60 text-sm text-center">
              The data collection dashboard is disabled in the static GitHub Pages build. Run the project locally with
              server capabilities enabled to access admin features.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
