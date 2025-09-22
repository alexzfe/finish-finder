"use client"

export function Header() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH
    ? `/${process.env.NEXT_PUBLIC_BASE_PATH.replace(/^\/+/, '')}`
    : ''

  return (
    <header className="sticky top-0 z-50 border-b border-black/30 bg-gradient-to-b from-black/95 via-black/90 to-black/80 backdrop-blur">
      <div className="mx-auto flex max-w-sm items-center justify-between px-4 py-4 text-white sm:max-w-md sm:px-6 md:max-w-4xl lg:max-w-6xl xl:max-w-7xl">
        <a
          href={`${basePath}/`}
          className="flex items-center gap-4 transition-transform duration-150 hover:-translate-y-0.5"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-white/10 to-white/5 text-2xl">
            🥊
          </div>
          <div>
            <p className="ufc-condensed text-sm text-white/70">Official Fight Outlook</p>
            <h1 className="ufc-condensed text-3xl text-white">Finish Finder</h1>
          </div>
        </a>

        <div className="hidden items-center gap-8 md:flex" />
      </div>
    </header>
  )
}
