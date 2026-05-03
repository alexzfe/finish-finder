import { type NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 3600

export async function GET(_request: NextRequest) {
  return NextResponse.json({
    url: '/images/fighter-placeholder.svg',
    source: 'placeholder',
    confidence: 0,
    cached: false,
  })
}
