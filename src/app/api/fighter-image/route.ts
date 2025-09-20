import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import * as cheerio from 'cheerio'

export const dynamic = 'force-dynamic'

interface FighterImageResult {
  url: string | null
  source: 'tapology' | 'fallback' | 'placeholder'
  confidence: number
  cached: boolean
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const fighterName = searchParams.get('name')

  if (!fighterName) {
    return NextResponse.json({
      url: '/images/fighter-placeholder.svg',
      source: 'placeholder',
      confidence: 0,
      cached: false
    })
  }

  try {
    const imageResult = await searchTapologyFighter(fighterName)
    return NextResponse.json(imageResult)
  } catch (error) {
    console.error('Fighter image API error:', error)
    return NextResponse.json({
      url: '/images/fighter-placeholder.svg',
      source: 'placeholder',
      confidence: 0,
      cached: false
    })
  }
}

async function searchTapologyFighter(fighterName: string): Promise<FighterImageResult> {
  try {
    const searchUrl = `https://www.tapology.com/search?term=${encodeURIComponent(fighterName)}&mainSearchFilter=fighters`

    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FinishFinderBot/1.0; +https://finish-finder.com)'
      },
      timeout: 10000
    })

    const $ = cheerio.load(response.data)
    const results: Array<{ name: string; profileUrl: string; confidence: number }> = []

    // Look for fighter search results
    $('.searchResult .fighter, .search-result .fighter, .fightMatrix tr').each((_, element) => {
      const $el = $(element)

      // Try different selectors for fighter links
      const nameLink = $el.find('a[href*="/fightcenter/fighters/"]').first()
      const name = nameLink.text().trim()
      const href = nameLink.attr('href')

      if (name && href) {
        const confidence = calculateNameMatch(fighterName, name)

        if (confidence > 50) { // Only include reasonable matches
          results.push({
            name,
            profileUrl: href.startsWith('http') ? href : `https://www.tapology.com${href}`,
            confidence
          })
        }
      }
    })

    // Sort by confidence, highest first
    const sortedResults = results.sort((a, b) => b.confidence - a.confidence).slice(0, 3)

    if (sortedResults.length > 0) {
      // Try to get image from the best match
      const bestMatch = sortedResults[0]
      const imageUrl = await extractFighterImage(bestMatch.profileUrl)

      if (imageUrl) {
        return {
          url: imageUrl,
          source: 'tapology',
          confidence: bestMatch.confidence,
          cached: false
        }
      }
    }

    // Fallback to placeholder
    return {
      url: '/images/fighter-placeholder.svg',
      source: 'placeholder',
      confidence: 0,
      cached: false
    }

  } catch (error) {
    console.error('Tapology search failed:', error)
    return {
      url: '/images/fighter-placeholder.svg',
      source: 'placeholder',
      confidence: 0,
      cached: false
    }
  }
}

async function extractFighterImage(profileUrl: string): Promise<string | null> {
  try {
    const response = await axios.get(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FinishFinderBot/1.0; +https://finish-finder.com)'
      },
      timeout: 10000
    })

    const $ = cheerio.load(response.data)

    // Try multiple selectors for fighter images
    const imageSelectors = [
      '.fighter-image img',
      '.fighterPhoto img',
      '.fighter-avatar img',
      '.profile-image img',
      'img[alt*="fighter" i]',
      'img[src*="fighter" i]'
    ]

    for (const selector of imageSelectors) {
      const img = $(selector).first()
      const src = img.attr('src')

      if (src && isValidFighterImage(src)) {
        return src.startsWith('http') ? src : `https://www.tapology.com${src}`
      }
    }

    return null

  } catch (error) {
    console.error('Failed to extract fighter image:', error)
    return null
  }
}

function isValidFighterImage(src: string): boolean {
  if (!src) return false

  // Filter out obviously non-fighter images
  const invalidPatterns = [
    /logo/i,
    /banner/i,
    /advertisement/i,
    /sponsor/i,
    /placeholder/i,
    /default/i
  ]

  return !invalidPatterns.some(pattern => pattern.test(src)) &&
         /\.(jpg|jpeg|png|webp)(\?|$)/i.test(src)
}

function calculateNameMatch(searchName: string, resultName: string): number {
  const normalize = (name: string) =>
    name.toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .split(/\s+/)
        .filter(Boolean)

  const searchWords = normalize(searchName)
  const resultWords = normalize(resultName)

  if (searchWords.length === 0 || resultWords.length === 0) return 0

  // Count matching words
  let matches = 0
  for (const searchWord of searchWords) {
    for (const resultWord of resultWords) {
      if (searchWord === resultWord) {
        matches++
        break
      }
      // Partial match for longer names
      if (searchWord.length > 3 && resultWord.includes(searchWord)) {
        matches += 0.7
        break
      }
    }
  }

  // Calculate confidence as percentage
  const maxPossibleMatches = Math.max(searchWords.length, resultWords.length)
  return Math.round((matches / maxPossibleMatches) * 100)
}