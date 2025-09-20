'use client'

import { useState, memo } from 'react'
import { useFighterImage } from '@/lib/hooks/useFighterImage'

interface FighterAvatarProps {
  fighterName: string | undefined
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  showName?: boolean
  showConfidence?: boolean
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
  xl: 'w-24 h-24'
}

const textSizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg'
}

const FighterAvatarComponent = ({
  fighterName,
  size = 'md',
  className = '',
  showName = false,
  showConfidence = false
}: FighterAvatarProps) => {
  const [imageError, setImageError] = useState(false)
  const { url, source, confidence, loading, error } = useFighterImage(fighterName)

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

  const shouldShowImage = url && !imageError && !error && source !== 'placeholder'

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className={`${sizeClasses[size]} relative flex items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10`}>
        {loading ? (
          <div className="h-full w-full animate-pulse rounded-full bg-white/10" />
        ) : shouldShowImage ? (
          <img
            src={url}
            alt={fighterName || 'Fighter'}
            className="w-full h-full object-cover"
            onError={handleImageError}
          />
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
