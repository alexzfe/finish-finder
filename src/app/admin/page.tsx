'use client'

import { DataCollectionDashboard } from '@/components/admin/DataCollectionDashboard'
import { Header } from '@/components/ui/Header'

export default function AdminPage() {
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

        <DataCollectionDashboard />

        {/* Future admin sections can go here */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
            <h3 className="text-xl font-bold text-white mb-4">🎯 Prediction Model</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-white/70">Model Version:</span>
                <span className="text-white">v1.0.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Accuracy:</span>
                <span className="text-green-400">85.3%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Predictions Made:</span>
                <span className="text-white">1,247</span>
              </div>
            </div>
            <button className="w-full mt-4 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700">
              Retrain Model
            </button>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
            <h3 className="text-xl font-bold text-white mb-4">📊 Analytics</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-white/70">Page Views:</span>
                <span className="text-white">15,632</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">API Calls:</span>
                <span className="text-white">8,439</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Active Users:</span>
                <span className="text-blue-400">342</span>
              </div>
            </div>
            <button className="w-full mt-4 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">
              View Details
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}