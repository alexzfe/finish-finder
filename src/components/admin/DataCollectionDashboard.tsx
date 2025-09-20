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

interface PredictionStatus {
  pendingEvents: number
  pendingFights: number
}

interface TokenUsageSummary {
  totals: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    fightsProcessed: number
    runs: number
  }
  daily: Array<{ date: string; tokens: number }>
  latest: Array<{
    id: string
    eventId: string
    eventName: string
    fightsProcessed: number
    totalTokensEstimated: number
    promptTokensEstimated: number
    completionTokensEstimated: number
    source: string
    createdAt: string
  }>
}

export function DataCollectionDashboard() {
  const [status, setStatus] = useState<CollectionStatus | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [predictionStatus, setPredictionStatus] = useState<PredictionStatus>({ pendingEvents: 0, pendingFights: 0 })
  const [predictionLoading, setPredictionLoading] = useState(false)
  const [tokenUsage, setTokenUsage] = useState<TokenUsageSummary | null>(null)

  useEffect(() => {
    checkStatus()
    checkPredictionStatus()
    checkTokenUsage()
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

  const checkPredictionStatus = async () => {
    try {
      const response = await fetch('/api/run-predictions')
      const data = await response.json()
      if (data.success) {
        setPredictionStatus({
          pendingEvents: data.data?.pendingEvents || 0,
          pendingFights: data.data?.pendingFights || 0
        })
      }
    } catch (error) {
      console.error('Error checking prediction status:', error)
    }
  }

  const runPredictions = async () => {
    setPredictionLoading(true)
    addLog('🤖 Generating AI predictions for pending events...')

    try {
      const response = await fetch('/api/run-predictions', { method: 'POST' })
      const data = await response.json()

      if (data.success) {
        addLog(`✅ Updated ${data.data?.fightsUpdated || 0} fights across ${data.data?.eventsProcessed || 0} events`)
        setPredictionStatus({
          pendingEvents: data.data?.pendingEvents || 0,
          pendingFights: data.data?.pendingFights || 0
        })
        await checkStatus()
        await checkTokenUsage()
      } else {
        addLog(`❌ Prediction run failed: ${data.error || data.message}`)
      }
    } catch (error) {
      addLog(`❌ Prediction run error: ${error}`)
    } finally {
      setPredictionLoading(false)
    }
  }

  const clearLogs = () => setLogs([])

  const checkTokenUsage = async () => {
    try {
      const response = await fetch('/api/token-usage')
      const data = await response.json()
      if (data.success) {
        setTokenUsage(data.data)
      }
    } catch (error) {
      console.error('Error checking token usage:', error)
    }
  }

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">🛠️ Data Operations</h2>
        <p className="text-white/60 text-sm">
          Collect fresh events and generate AI entertainment insights for upcoming fight cards.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white/5 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{status?.stats?.fighters || 0}</div>
          <div className="text-white/70 text-sm">Fighters</div>
        </div>
        <div className="bg-white/5 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{status?.stats?.events || 0}</div>
          <div className="text-white/70 text-sm">Events</div>
        </div>
        <div className="bg-white/5 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{status?.stats?.fights || 0}</div>
          <div className="text-white/70 text-sm">Fights</div>
        </div>
        <div className="bg-white/5 rounded-lg p-4 text-center">
          <div
            className={`text-lg font-bold ${
              status?.status === 'ready'
                ? 'text-green-400'
                : status?.status === 'empty'
                  ? 'text-red-400'
                  : 'text-yellow-400'
            }`}
          >
            {status?.status?.toUpperCase() || 'UNKNOWN'}
          </div>
          <div className="text-white/70 text-sm">Status</div>
        </div>
      </div>

      {status?.lastUpdated ? (
        <div className="text-center text-white/40 text-xs">
          Last updated: {new Date(status.lastUpdated).toLocaleString()}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white/5 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">📈 AI Prediction Queue</h3>
            <span className="text-white/60 text-sm">
              {predictionStatus.pendingEvents} events • {predictionStatus.pendingFights} fights
            </span>
          </div>
          <p className="text-white/60 text-sm">
            Run the entertainment analysis prompt for events missing fun scores or AI breakdowns.
          </p>
          <button
            type="button"
            onClick={runPredictions}
            disabled={predictionLoading || predictionStatus.pendingEvents === 0}
            className={`w-full p-4 rounded-lg font-semibold transition-all ${
              predictionLoading
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-red-600 to-orange-600 text-white hover:from-red-700 hover:to-orange-700'
            }`}
          >
            {predictionLoading ? '⏳ Generating predictions...' : '⚙️ Run AI Predictions'}
          </button>
          <p className="text-white/50 text-xs">
            Requires OPENAI_API_KEY. Processes fight cards in safe chunks to avoid overloading the API.
          </p>
        </div>
      </div>

      <div className="bg-white/5 rounded-lg p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">🧮 Token Usage Summary</h3>
            <p className="text-white/60 text-sm">
              Track estimated OpenAI tokens consumed by prediction runs.
            </p>
          </div>
          {tokenUsage ? (
            <div className="grid grid-cols-2 gap-3 text-sm text-white/70">
              <div>
                <div className="text-xs uppercase text-white/40">Prompt Tokens</div>
                <div className="font-semibold text-white">{tokenUsage.totals.promptTokens.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-white/40">Completion Tokens</div>
                <div className="font-semibold text-white">{tokenUsage.totals.completionTokens.toLocaleString()}</div>
              </div>
            </div>
          ) : (
            <div className="text-white/40 text-sm">No usage recorded yet.</div>
          )}
        </div>

        {tokenUsage ? (
          <>
            {tokenUsage.daily.length ? (
              <div>
                <h4 className="text-sm font-semibold text-white mb-2">Last 7 Days</h4>
                <div className="flex flex-wrap gap-3 text-xs text-white/70">
                  {tokenUsage.daily.map(day => (
                    <div key={day.date} className="bg-white/10 rounded px-3 py-2">
                      <div className="font-semibold text-white">{day.tokens.toLocaleString()}</div>
                      <div className="text-white/40">{day.date}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {tokenUsage.latest.length ? (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-white">Recent Runs</h4>
                <div className="space-y-1 text-xs text-white/70">
                  {tokenUsage.latest.map(entry => (
                    <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 bg-white/5 rounded px-3 py-2">
                      <div className="text-white font-medium">
                        {entry.eventName}
                      </div>
                      <div className="flex items-center gap-3">
                        <span>{entry.fightsProcessed} fights</span>
                        <span>{entry.totalTokensEstimated.toLocaleString()} tokens</span>
                        <span className="uppercase text-white/40">{entry.source}</span>
                        <span className="text-white/40">{new Date(entry.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-white/40 text-sm">
            Run AI predictions from this dashboard or via the CLI to populate usage analytics.
          </p>
        )}
      </div>

      {status?.stats?.events ? (
        <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-green-400">✅ Events Available</h3>
            <p className="text-white/70 text-sm">
              {status.stats.events} events • {status.stats.fights} fights stored in the database.
            </p>
          </div>
          <div className="flex gap-3">
            <a
              href="/"
              className="bg-green-600 text-white px-5 py-3 rounded-lg hover:bg-green-700 transition-colors font-semibold"
            >
              🥊 View Events
            </a>
            <button
              type="button"
              onClick={async () => {
                try {
                  const response = await fetch('/api/db-events')
                  const data = await response.json()
                  addLog(`📊 Database events: ${data.data?.totalEvents || 0} events, ${data.data?.totalFighters || 0} fighters`)
                } catch (error) {
                  addLog(`❌ Error checking database: ${error}`)
                }
              }}
              className="bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              📊 Refresh Stats
            </button>
          </div>
        </div>
      ) : null}

      <div className="bg-black/30 rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Activity Logs</h3>
          <button
            type="button"
            onClick={clearLogs}
            className="text-sm text-white/60 hover:text-white"
          >
            Clear
          </button>
        </div>
        <div className="h-64 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-white/40 text-center py-8">
              No activity yet. Trigger a collection or prediction run to see updates.
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

    </div>
  )
}
