'use client'

import { useState, useEffect } from 'react'

interface PerformanceData {
  summary: {
    totalQueries: number
    averageDuration: number
    healthScore: number
    monitoringEnabled: boolean
  }
  performance: {
    slowQueries: number
    criticalQueries: number
    slowQueryRate: number
    criticalQueryRate: number
  }
  topSlowQueries: Array<{
    duration: number
    model: string
    action: string
    performance: string
    timestamp: string
  }>
  frequentQueries: Array<{
    query: string
    frequency: number
  }>
  recommendations: string[]
}

interface HealthData {
  status: 'healthy' | 'degraded' | 'down'
  responseTime: string
  checks: Record<string, unknown>
}

export default function PerformanceDashboard() {
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null)
  const [healthData, setHealthData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [])

  const fetchData = async () => {
    try {
      const [perfResponse, healthResponse] = await Promise.all([
        fetch('/api/performance'),
        fetch('/api/health')
      ])

      if (perfResponse.ok) {
        const perfResult = await perfResponse.json()
        setPerformanceData(perfResult.data)
      }

      if (healthResponse.ok) {
        const healthResult = await healthResponse.json()
        setHealthData(healthResult)
      }

      setError(null)
    } catch (err) {
      setError('Failed to fetch monitoring data')
      console.error('Monitoring data fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const resetMetrics = async () => {
    try {
      const response = await fetch('/api/performance', { method: 'DELETE' })
      if (response.ok) {
        await fetchData() // Refresh data
      }
    } catch (err) {
      console.error('Failed to reset metrics:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-2xl mb-2">⏳</div>
          <p className="text-white/60">Loading performance data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-6">
        <h3 className="text-red-400 font-semibold mb-2">⚠️ Monitoring Error</h3>
        <p className="text-red-300">{error}</p>
        <button
          onClick={fetchData}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy': return '✅'
      case 'degraded': return '⚠️'
      case 'down': return '🚨'
      default: return '❓'
    }
  }

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-400'
      case 'degraded': return 'text-yellow-400'
      case 'down': return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-400'
    if (score >= 70) return 'text-yellow-400'
    if (score >= 50) return 'text-orange-400'
    return 'text-red-400'
  }

  return (
    <div className="space-y-6 p-6 bg-[var(--ufc-black)] text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Database Performance Dashboard</h2>
        <button
          onClick={resetMetrics}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm"
        >
          Reset Metrics
        </button>
      </div>

      {/* Health Overview */}
      {healthData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-2">System Status</h3>
            <div className={`text-xl font-semibold ${getHealthColor(healthData.status)}`}>
              {getHealthIcon(healthData.status)} {healthData.status.toUpperCase()}
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-2">Response Time</h3>
            <div className="text-xl font-semibold text-blue-400">
              {healthData.responseTime}
            </div>
          </div>

          {performanceData && (
            <>
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Health Score</h3>
                <div className={`text-xl font-semibold ${getScoreColor(performanceData.summary.healthScore)}`}>
                  {performanceData.summary.healthScore}/100
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Total Queries</h3>
                <div className="text-xl font-semibold text-blue-400">
                  {performanceData.summary.totalQueries.toLocaleString()}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Performance Metrics */}
      {performanceData && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Average Duration</h3>
              <div className="text-2xl font-semibold text-blue-400">
                {performanceData.summary.averageDuration.toFixed(1)}ms
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Slow Queries</h3>
              <div className="text-2xl font-semibold text-yellow-400">
                {performanceData.performance.slowQueries} ({performanceData.performance.slowQueryRate.toFixed(1)}%)
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Critical Queries</h3>
              <div className="text-2xl font-semibold text-red-400">
                {performanceData.performance.criticalQueries} ({performanceData.performance.criticalQueryRate.toFixed(1)}%)
              </div>
            </div>
          </div>

          {/* Slowest Queries */}
          {performanceData.topSlowQueries.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Slowest Queries</h3>
              <div className="space-y-3">
                {performanceData.topSlowQueries.map((query, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-700 rounded">
                    <div>
                      <span className="font-mono text-sm text-blue-300">
                        {query.model}.{query.action}
                      </span>
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(query.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className={`font-semibold ${query.performance === 'critical' ? 'text-red-400' : 'text-yellow-400'}`}>
                      {query.duration}ms
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Frequent Queries */}
          {performanceData.frequentQueries.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Most Frequent Queries</h3>
              <div className="space-y-2">
                {performanceData.frequentQueries.map((query, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-700 rounded text-sm">
                    <span className="font-mono text-blue-300 truncate max-w-md">
                      {query.query.length > 60 ? `${query.query.substring(0, 60)}...` : query.query}
                    </span>
                    <span className="font-semibold text-purple-400">
                      {query.frequency}x
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {performanceData.recommendations.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">📊 Performance Recommendations</h3>
              <ul className="space-y-2">
                {performanceData.recommendations.map((rec, index) => (
                  <li key={index} className="text-sm text-gray-300 bg-gray-700 p-3 rounded">
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="text-xs text-gray-500 text-center">
        Dashboard refreshes every 30 seconds • Last updated: {new Date().toLocaleTimeString()}
      </div>
    </div>
  )
}