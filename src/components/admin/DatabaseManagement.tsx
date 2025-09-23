'use client'

import { useState } from 'react'

interface WipeResult {
  success: boolean
  message: string
  before: Record<string, number>
  after: Record<string, number>
  deleted: Record<string, number>
  timestamp: string
}

export default function DatabaseManagement() {
  const [isWiping, setIsWiping] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [wipeResult, setWipeResult] = useState<WipeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleWipeDatabase = async () => {
    setIsWiping(true)
    setError(null)
    setWipeResult(null)

    try {
      // Use hardcoded password for testing - in production this should be properly secured
      const adminPassword = 'admin123'

      console.log('🗑️ Starting database wipe request...')
      const response = await fetch('/api/admin/wipe-database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          confirm: 'WIPE_ALL_DATA',
          password: adminPassword
        })
      })

      const data = await response.json()
      console.log('📝 Response received:', { status: response.status, data })

      if (!response.ok) {
        // Handle specific production safety error
        if (response.status === 403 && data.environment === 'production') {
          throw new Error(`${data.error}\n\nTo enable database wipe in production, set the ALLOW_PRODUCTION_WIPE environment variable to 'true' in your Vercel dashboard.`)
        }
        throw new Error(data.error || 'Failed to wipe database')
      }

      setWipeResult(data)
      setShowConfirmDialog(false)

    } catch (err) {
      console.error('❌ Database wipe error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setIsWiping(false)
    }
  }

  const ConfirmDialog = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-red-500">
        <div className="flex items-center mb-4">
          <div className="text-red-500 text-2xl mr-3">⚠️</div>
          <h3 className="text-lg font-semibold text-white">Confirm Database Wipe</h3>
        </div>

        <div className="text-gray-300 mb-6">
          <p className="mb-2">
            <strong className="text-red-400">DANGER:</strong> This will permanently delete ALL data from the database:
          </p>
          <ul className="list-disc pl-6 text-sm space-y-1">
            <li>All events and fights</li>
            <li>All fighters and their records</li>
            <li>All AI predictions and usage data</li>
            <li>All performance metrics</li>
          </ul>
          <p className="mt-3 text-red-400 font-medium">
            This action cannot be undone!
          </p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={() => setShowConfirmDialog(false)}
            className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleWipeDatabase}
            disabled={isWiping}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors disabled:opacity-50"
          >
            {isWiping ? 'Wiping...' : 'Yes, Wipe Database'}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
      <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
        🗑️ Database Management
      </h2>

      <div className="space-y-4">
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
          <h3 className="text-lg font-medium text-red-400 mb-2">
            Danger Zone
          </h3>
          <p className="text-gray-300 text-sm mb-3">
            Testing utilities that perform destructive operations. Use with extreme caution.
          </p>

          <button
            onClick={() => setShowConfirmDialog(true)}
            disabled={isWiping}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors disabled:opacity-50 flex items-center"
          >
            {isWiping ? (
              <>
                <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                Wiping Database...
              </>
            ) : (
              <>
                🗑️ Wipe Database
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-500 rounded-lg p-4">
            <h4 className="text-red-400 font-medium mb-2">Error</h4>
            <p className="text-gray-300 text-sm">{error}</p>
          </div>
        )}

        {wipeResult && (
          <div className="bg-green-900/30 border border-green-500 rounded-lg p-4">
            <h4 className="text-green-400 font-medium mb-3">Wipe Completed Successfully</h4>
            <div className="text-sm text-gray-300 space-y-2">
              <p><strong>Timestamp:</strong> {new Date(wipeResult.timestamp).toLocaleString()}</p>

              <div>
                <strong>Records Deleted:</strong>
                <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
                  <div>Events: {wipeResult.deleted.events}</div>
                  <div>Fights: {wipeResult.deleted.fights}</div>
                  <div>Fighters: {wipeResult.deleted.fighters}</div>
                  <div>Predictions: {wipeResult.deleted.predictionUsage}</div>
                  <div>Metrics: {wipeResult.deleted.queryMetrics}</div>
                  <div>History: {wipeResult.deleted.funScoreHistory}</div>
                </div>
              </div>

              <div>
                <strong>Database Status:</strong>
                <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
                  <div>Events: {wipeResult.after.events}</div>
                  <div>Fights: {wipeResult.after.fights}</div>
                  <div>Fighters: {wipeResult.after.fighters}</div>
                  <div>Predictions: {wipeResult.after.predictionUsage}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showConfirmDialog && <ConfirmDialog />}
    </div>
  )
}