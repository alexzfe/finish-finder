export function Header() {
  return (
    <header className="bg-black/50 backdrop-blur-sm border-b border-red-500/20">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="text-4xl">🥊</div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                Fun Fight Predictor
              </h1>
              <p className="text-red-400 text-sm">
                AI-Powered UFC Entertainment Analysis
              </p>
            </div>
          </div>

          <nav className="hidden md:flex space-x-6">
            <a href="#events" className="text-white hover:text-red-400 transition-colors">
              Events
            </a>
            <a href="#predictions" className="text-white hover:text-red-400 transition-colors">
              Predictions
            </a>
            <a href="#stats" className="text-white hover:text-red-400 transition-colors">
              Fighter Stats
            </a>
          </nav>
        </div>
      </div>
    </header>
  )
}