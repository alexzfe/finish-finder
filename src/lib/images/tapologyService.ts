import axios from 'axios'
import * as cheerio from 'cheerio'
import fs from 'fs/promises'
import path from 'path'

interface FighterImageResult {
  url: string | null
  source: 'tapology' | 'fallback' | 'placeholder'
  confidence: number // 0-100
  cached: boolean
}

interface ImageCacheEntry {
  url: string
  localPath: string
  timestamp: number
  fighterName: string
}

export class TapologyImageService {
  private cacheDir: string
  private cacheDuration: number = 24 * 60 * 60 * 1000 // 24 hours
  private cache: Map<string, ImageCacheEntry> = new Map()

  constructor(cacheDir: string = './public/images/fighters') {
    this.cacheDir = cacheDir
    this.initializeCache()
  }

  private async initializeCache(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true })

      // Load existing cache metadata if it exists
      const cacheFile = path.join(this.cacheDir, 'cache.json')
      try {
        const cacheData = await fs.readFile(cacheFile, 'utf-8')
        const entries: ImageCacheEntry[] = JSON.parse(cacheData)

        for (const entry of entries) {
          // Check if cache entry is still valid
          if (Date.now() - entry.timestamp < this.cacheDuration) {
            this.cache.set(this.normalizeKey(entry.fighterName), entry)
          }
        }
      } catch {
        // Cache file doesn't exist or is invalid, start fresh
      }
    } catch (error) {
      console.warn('Failed to initialize image cache:', error)
    }
  }

  private normalizeKey(fighterName: string): string {
    return fighterName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  async getFighterImage(fighterName: string): Promise<FighterImageResult> {
    if (!fighterName?.trim()) {
      return this.getPlaceholderResult()
    }

    const normalizedName = this.normalizeKey(fighterName)

    // Check cache first
    const cached = this.cache.get(normalizedName)
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return {
        url: cached.url,
        source: 'tapology',
        confidence: 90,
        cached: true
      }
    }

    try {
      // Search Tapology for fighter
      const searchResults = await this.searchTapologyFighter(fighterName)

      if (searchResults.length > 0) {
        // Try to get image from the best match
        const bestMatch = searchResults[0]
        const imageUrl = await this.extractFighterImage(bestMatch.profileUrl)

        if (imageUrl) {
          // Cache the successful result
          await this.cacheImage(fighterName, imageUrl)

          return {
            url: imageUrl,
            source: 'tapology',
            confidence: bestMatch.confidence,
            cached: false
          }
        }
      }

      // Fallback to placeholder
      return this.getPlaceholderResult()

    } catch (error) {
      console.error(`Error fetching image for ${fighterName}:`, error)
      return this.getPlaceholderResult()
    }
  }

  private async searchTapologyFighter(fighterName: string): Promise<Array<{
    name: string
    profileUrl: string
    confidence: number
  }>> {
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
          const confidence = this.calculateNameMatch(fighterName, name)

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
      return results.sort((a, b) => b.confidence - a.confidence).slice(0, 3)

    } catch (error) {
      console.error('Tapology search failed:', error)
      return []
    }
  }

  private async extractFighterImage(profileUrl: string): Promise<string | null> {
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

        if (src && this.isValidFighterImage(src)) {
          return src.startsWith('http') ? src : `https://www.tapology.com${src}`
        }
      }

      return null

    } catch (error) {
      console.error('Failed to extract fighter image:', error)
      return null
    }
  }

  private isValidFighterImage(src: string): boolean {
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

  private calculateNameMatch(searchName: string, resultName: string): number {
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

  private async cacheImage(fighterName: string, imageUrl: string): Promise<void> {
    try {
      const normalizedName = this.normalizeKey(fighterName)
      const filename = `${normalizedName}.jpg`
      const localPath = path.join(this.cacheDir, filename)

      // Download and save image
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FinishFinderBot/1.0; +https://finish-finder.com)'
        }
      })

      await fs.writeFile(localPath, response.data)

      // Update cache
      const cacheEntry: ImageCacheEntry = {
        url: `/images/fighters/${filename}`,
        localPath,
        timestamp: Date.now(),
        fighterName
      }

      this.cache.set(normalizedName, cacheEntry)
      await this.saveCacheMetadata()

    } catch (error) {
      console.error(`Failed to cache image for ${fighterName}:`, error)
    }
  }

  private async saveCacheMetadata(): Promise<void> {
    try {
      const cacheFile = path.join(this.cacheDir, 'cache.json')
      const entries = Array.from(this.cache.values())
      await fs.writeFile(cacheFile, JSON.stringify(entries, null, 2))
    } catch (error) {
      console.error('Failed to save cache metadata:', error)
    }
  }

  private getPlaceholderResult(): FighterImageResult {
    return {
      url: '/images/fighter-placeholder.jpg',
      source: 'placeholder',
      confidence: 0,
      cached: false
    }
  }

  async validateImage(url: string): Promise<boolean> {
    try {
      const response = await axios.head(url, { timeout: 5000 })
      return response.status === 200 &&
             response.headers['content-type']?.startsWith('image/')
    } catch {
      return false
    }
  }

  async clearCache(): Promise<void> {
    try {
      this.cache.clear()
      await fs.rm(this.cacheDir, { recursive: true, force: true })
      await fs.mkdir(this.cacheDir, { recursive: true })
    } catch (error) {
      console.error('Failed to clear cache:', error)
    }
  }

  getCacheStats(): {
    totalEntries: number
    cacheSize: string
    oldestEntry: Date | null
    newestEntry: Date | null
  } {
    const entries = Array.from(this.cache.values())
    const timestamps = entries.map(e => e.timestamp)

    return {
      totalEntries: entries.length,
      cacheSize: `${Math.round(entries.length * 0.1)}MB`, // Rough estimate
      oldestEntry: timestamps.length ? new Date(Math.min(...timestamps)) : null,
      newestEntry: timestamps.length ? new Date(Math.max(...timestamps)) : null
    }
  }
}