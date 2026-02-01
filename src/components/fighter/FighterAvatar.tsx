'use client'

import { useState, memo } from 'react'

import Image from 'next/image'

import { useFighterImage } from '@/lib/hooks/useFighterImage'

interface FighterAvatarProps {
  fighterName: string | undefined
  imageUrl?: string | null  // Direct image URL from database
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'responsive'
  className?: string
  showName?: boolean
  showConfidence?: boolean
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
  xl: 'w-24 h-24',
  // Responsive: md on mobile, lg on tablet, xl on desktop
  responsive: 'w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20'
}

// Pixel sizes for Next.js Image (use largest size for quality)
const pixelSizes = {
  sm: 32,
  md: 48,
  lg: 64,
  xl: 96,
  responsive: 80 // Use largest responsive size
}

const textSizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg',
  responsive: 'text-sm md:text-base lg:text-lg'
}

// Check if URL is from a configured remote pattern
const isOptimizableUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url)
    return (
      urlObj.hostname.endsWith('espncdn.com') ||
      urlObj.hostname === 'upload.wikimedia.org' ||
      url.startsWith('/')
    )
  } catch {
    return url.startsWith('/')
  }
}

const FighterAvatarComponent = ({
  fighterName,
  imageUrl: directImageUrl,
  size = 'md',
  className = '',
  showName = false,
  showConfidence = false
}: FighterAvatarProps) => {
  const [imageError, setImageError] = useState(false)

  // Use direct imageUrl from database if provided, skip API call
  const skipApiCall = !!directImageUrl
  const { url: apiUrl, source, confidence, loading, error } = useFighterImage(
    skipApiCall ? undefined : fighterName
  )

  // Prefer direct URL from database, fall back to API result
  const url = directImageUrl || apiUrl

  const handleImageError = () => {
    setImageError(true)
  }

  const getInitials = (name: string | undefined): string => {
    if (!name) return '??'
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getConfidenceColor = (conf: number): string => {
    if (conf >= 80) return 'text-emerald-400'
    if (conf >= 60) return 'text-amber-400'
    if (conf >= 40) return 'text-orange-400'
    return 'text-red-400'
  }

  // Show image if we have a direct URL from database OR a valid API result
  const shouldShowImage = url && !imageError && (directImageUrl || (source !== 'placeholder' && !error))

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className={`${sizeClasses[size]} relative flex items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10`}>
        {loading && !directImageUrl ? (
          <div className="h-full w-full animate-pulse rounded-full bg-white/10" />
        ) : shouldShowImage && url ? (
          isOptimizableUrl(url) ? (
            <Image
              src={url}
              alt={fighterName || 'Fighter'}
              width={pixelSizes[size]}
              height={pixelSizes[size]}
              className="w-full h-full object-cover"
              onError={handleImageError}
              unoptimized={url.startsWith('/images/')} // Don't optimize local placeholders
            />
          ) : (
            // Fallback for non-configured external URLs
            <img
              src={url}
              alt={fighterName || 'Fighter'}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              onError={handleImageError}
            />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-black/60">
            <span className={`ufc-condensed text-white/70 ${textSizeClasses[size]}`}>
              {getInitials(fighterName)}
            </span>
          </div>
        )}

        {/* Source indicator */}
        {source === 'tapology' && !loading && (
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border border-white"
               title="Image from Tapology" />
        )}
        {source === 'fallback' && !loading && (
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-yellow-500 rounded-full border border-white"
               title="Fallback image" />
        )}
      </div>

      {showName && fighterName && (
        <span className={`mt-1 text-center font-medium text-white ${textSizeClasses[size]}`}>
          {fighterName}
        </span>
      )}

      {showConfidence && confidence > 0 && (
        <span className={`mt-1 text-xs font-medium ${getConfidenceColor(confidence)}`}>
          {confidence}% match
        </span>
      )}
    </div>
  )
}

export const FighterAvatar = memo(FighterAvatarComponent)

const FighterAvatarPairComponent = ({
  fighter1Name,
  fighter2Name,
  size = 'md',
  className = '',
  showVs = true
}: {
  fighter1Name: string | undefined
  fighter2Name: string | undefined
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  showVs?: boolean
}) => {
  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <FighterAvatar fighterName={fighter1Name} size={size} />

      {showVs && (
        <div className="flex items-center">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500 px-2">
            VS
          </span>
        </div>
      )}

      <FighterAvatar fighterName={fighter2Name} size={size} />
    </div>
  )
}

export const FighterAvatarPair = memo(FighterAvatarPairComponent)
