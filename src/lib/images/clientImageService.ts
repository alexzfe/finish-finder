// Client-side image service for browser compatibility

interface FighterImageResult {
  url: string | null
  source: 'tapology' | 'fallback' | 'placeholder'
  confidence: number
  cached: boolean
}

export class ClientImageService {
  private cache: Map<string, { result: FighterImageResult, timestamp: number }> = new Map()
  private cacheDuration: number = 30 * 60 * 1000 // 30 minutes for client cache

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

    // Check client-side cache first
    const cached = this.cache.get(normalizedName)
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return { ...cached.result, cached: true }
    }

    try {
      // Call our API endpoint for image fetching
      const response = await fetch(`/api/fighter-image?name=${encodeURIComponent(fighterName)}`)

      if (!response.ok) {
        throw new Error(`Image API failed: ${response.status}`)
      }

      const result: FighterImageResult = await response.json()

      // Cache the result
      this.cache.set(normalizedName, {
        result: { ...result, cached: false },
        timestamp: Date.now()
      })

      return result

    } catch (error) {
      console.error(`Error fetching image for ${fighterName}:`, error)
      return this.getPlaceholderResult()
    }
  }

  private getPlaceholderResult(): FighterImageResult {
    return {
      url: '/images/fighter-placeholder.svg',
      source: 'placeholder',
      confidence: 0,
      cached: false
    }
  }

  clearCache(): void {
    this.cache.clear()
  }

  getCacheSize(): number {
    return this.cache.size
  }
}