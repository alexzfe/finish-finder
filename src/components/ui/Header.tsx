export function Header() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH
    ? `/${process.env.NEXT_PUBLIC_BASE_PATH.replace(/^\/+/, '')}`
    : ''

  return (
    <header style={{ backgroundColor: '#191919' }} className="border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <a href={`${basePath}/`} className="flex items-center space-x-4 hover:opacity-90 transition-opacity cursor-pointer">
            <div className="text-5xl">🥊</div>
            <div>
              <h1
                className="text-3xl font-bold text-white uppercase tracking-widest"
                style={{ fontFamily: 'Arial, "Helvetica Neue", sans-serif' }}
              >
                Finish Finder
              </h1>
              <p
                className="text-sm uppercase tracking-widest font-semibold"
                style={{ color: '#d20a0a', fontFamily: 'Arial, "Helvetica Neue", sans-serif' }}
              >
                AI-Powered UFC Entertainment Analysis
              </p>
            </div>
          </a>

        </div>
      </div>
    </header>
  )
}
