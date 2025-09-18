'use client'

import { useState, useEffect } from 'react'

interface CollectionStats {
  fighters: number
  events: number
  fights: number
}

interface CollectionStatus {
  stats: CollectionStats
  lastUpdated: string | null
  status: 'ready' | 'empty' | 'loading'
}

export function DataCollectionDashboard() {
  const [status, setStatus] = useState<CollectionStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  useEffect(() => {
    checkStatus()
  }, [])

  const checkStatus = async () => {
    try {
      const response = await fetch('/api/collect-data')
      const data = await response.json()
      setStatus(data.data)
    } catch (error) {
      console.error('Error checking status:', error)
      addLog('❌ Failed to check collection status')
    }
  }

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, `[${timestamp}] ${message}`])
  }

  const collectData = async (action: 'fighters' | 'events' | 'all') => {
    setLoading(true)
    addLog(`🚀 Starting ${action} collection...`)

    try {
      const response = await fetch('/api/collect-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })

      const data = await response.json()

      if (data.success) {
        addLog(`✅ ${data.message}`)
        await checkStatus() // Refresh status
      } else {
        addLog(`❌ Collection failed: ${data.error}`)
      }
    } catch (error) {
      addLog(`❌ Collection error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const clearLogs = () => setLogs([])

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
      <h2 className="text-2xl font-bold text-white mb-6">
        🛠️ Data Collection Dashboard
      </h2>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white/5 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">
            {status?.stats.fighters || 0}
          </div>
          <div className="text-white/70 text-sm">Fighters</div>
        </div>

        <div className="bg-white/5 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-400">
            {status?.stats.events || 0}
          </div>
          <div className="text-white/70 text-sm">Events</div>
        </div>

        <div className="bg-white/5 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">
            {status?.stats.fights || 0}
          </div>
          <div className="text-white/70 text-sm">Fights</div>
        </div>

        <div className="bg-white/5 rounded-lg p-4 text-center">
          <div className={`text-lg font-bold ${
            status?.status === 'ready' ? 'text-green-400' :
            status?.status === 'empty' ? 'text-red-400' : 'text-yellow-400'
          }`}>
            {status?.status?.toUpperCase() || 'UNKNOWN'}
          </div>
          <div className="text-white/70 text-sm">Status</div>
        </div>
      </div>

      {/* Last Updated */}
      {status?.lastUpdated && (
        <div className="text-center text-white/60 text-sm mb-6">
          Last updated: {new Date(status.lastUpdated).toLocaleString()}
        </div>
      )}

      {/* Collection Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <button
          onClick={() => collectData('fighters')}
          disabled={loading}
          className={`p-4 rounded-lg font-semibold transition-all ${
            loading
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105'
          }`}
        >
          {loading ? '⏳ Collecting...' : '🥊 Collect Fighters'}
        </button>

        <button
          onClick={() => collectData('events')}
          disabled={loading}
          className={`p-4 rounded-lg font-semibold transition-all ${
            loading
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700 hover:scale-105'
          }`}
        >
          {loading ? '⏳ Collecting...' : '📅 Collect Events'}
        </button>

        <button
          onClick={() => collectData('all')}
          disabled={loading}
          className={`p-4 rounded-lg font-semibold transition-all ${
            loading
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-red-600 text-white hover:bg-red-700 hover:scale-105'
          }`}
        >
          {loading ? '⏳ Collecting...' : '🚀 Collect All Data'}
        </button>
      </div>

      {/* Activity Logs */}
      <div className="bg-black/30 rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Activity Logs</h3>
          <button
            onClick={clearLogs}
            className="text-sm text-white/60 hover:text-white"
          >
            Clear
          </button>
        </div>

        <div className="h-64 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-white/40 text-center py-8">
              No activity yet. Click a collection button to start.
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, index) => (
                <div key={index} className="text-sm text-white/80 font-mono">
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Data Sources Info */}
      <div className="mt-6 bg-white/5 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-3">Data Sources</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-blue-400 font-semibold">Fighter Stats</div>
            <div className="text-white/70">UFCStats.com</div>
            <div className="text-white/50">Records, stats, physical data</div>
          </div>

          <div>
            <div className="text-green-400 font-semibold">Events & Cards</div>
            <div className="text-white/70">UFC.com</div>
            <div className="text-white/50">Upcoming events, fight cards</div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-6 bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
        <h4 className="text-yellow-400 font-semibold mb-2">⚠️ Collection Notes</h4>
        <ul className="text-white/70 text-sm space-y-1">
          <li>• Fighter collection scrapes 50 fighters for testing (can be increased)</li>
          <li>• Event collection gets next 5 upcoming UFC events</li>
          <li>• Data is saved to local files and database</li>
          <li>• Collection may take several minutes to complete</li>
          <li>• Rate limiting is applied to avoid being blocked</li>
        </ul>
      </div>
    </div>
  )
}