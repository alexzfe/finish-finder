"use client"

export function Header() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH
    ? `/${process.env.NEXT_PUBLIC_BASE_PATH.replace(/^\/+/, '')}`
    : ''

  return (
    <header className="sticky top-0 z-50 border-b border-black/30 bg-gradient-to-b from-black/95 via-black/90 to-black/80 backdrop-blur">
      <div className="mx-auto max-w-sm px-4 py-2.5 text-white sm:max-w-md sm:px-6 md:max-w-4xl lg:max-w-6xl xl:max-w-7xl">
        <a
          href={`${basePath}/`}
          className="inline-block transition-transform duration-150 hover:-translate-y-0.5"
        >
          <h1 className="ufc-condensed text-xl text-white border-b-2 border-[var(--ufc-red)] pb-1">Finish Finder</h1>
        </a>
      </div>
    </header>
  )
}
