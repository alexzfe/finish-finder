import { useState, useEffect } from 'react'
import { ClientImageService } from '@/lib/images/clientImageService'

interface FighterImageResult {
  url: string | null
  source: 'tapology' | 'fallback' | 'placeholder'
  confidence: number
  cached: boolean
  loading: boolean
  error: string | null
}

const imageService = new ClientImageService()

export function useFighterImage(fighterName: string | undefined): FighterImageResult {
  const [result, setResult] = useState<FighterImageResult>({
    url: null,
    source: 'placeholder',
    confidence: 0,
    cached: false,
    loading: true,
    error: null
  })

  useEffect(() => {
    if (!fighterName) {
      setResult({
        url: '/images/fighter-placeholder.jpg',
        source: 'placeholder',
        confidence: 0,
        cached: false,
        loading: false,
        error: null
      })
      return
    }

    let isCancelled = false

    const fetchImage = async () => {
      try {
        setResult(prev => ({ ...prev, loading: true, error: null }))

        const imageResult = await imageService.getFighterImage(fighterName)

        if (!isCancelled) {
          setResult({
            url: imageResult.url,
            source: imageResult.source,
            confidence: imageResult.confidence,
            cached: imageResult.cached,
            loading: false,
            error: null
          })
        }
      } catch (error) {
        if (!isCancelled) {
          setResult({
            url: '/images/fighter-placeholder.jpg',
            source: 'placeholder',
            confidence: 0,
            cached: false,
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to load image'
          })
        }
      }
    }

    fetchImage()

    return () => {
      isCancelled = true
    }
  }, [fighterName])

  return result
}

export function useFighterImages(fighterNames: (string | undefined)[]): Record<string, FighterImageResult> {
  const [results, setResults] = useState<Record<string, FighterImageResult>>({})

  useEffect(() => {
    const validNames = fighterNames.filter(Boolean) as string[]
    if (validNames.length === 0) return

    let isCancelled = false

    const fetchImages = async () => {
      const newResults: Record<string, FighterImageResult> = {}

      // Initialize loading states
      for (const name of validNames) {
        newResults[name] = {
          url: null,
          source: 'placeholder',
          confidence: 0,
          cached: false,
          loading: true,
          error: null
        }
      }

      if (!isCancelled) {
        setResults(newResults)
      }

      // Fetch images concurrently
      const promises = validNames.map(async (name) => {
        try {
          const imageResult = await imageService.getFighterImage(name)
          return { name, result: imageResult }
        } catch (error) {
          return {
            name,
            result: {
              url: '/images/fighter-placeholder.jpg',
              source: 'placeholder' as const,
              confidence: 0,
              cached: false,
              error: error instanceof Error ? error.message : 'Failed to load image'
            }
          }
        }
      })

      const imageResults = await Promise.all(promises)

      if (!isCancelled) {
        const finalResults: Record<string, FighterImageResult> = {}

        for (const { name, result } of imageResults) {
          finalResults[name] = {
            url: result.url,
            source: result.source,
            confidence: result.confidence,
            cached: result.cached,
            loading: false,
            error: result.error || null
          }
        }

        setResults(finalResults)
      }
    }

    fetchImages()

    return () => {
      isCancelled = true
    }
  }, [fighterNames.join(',')]) // Dependency on serialized names

  return results
}