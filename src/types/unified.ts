// Unified type system for Finish Finder
// Consolidates all type definitions across services

// ===== CORE ENTITIES =====

export interface UnifiedFighter {
  id: string
  name: string
  nickname?: string
  record: FighterRecord
  stats: FighterStats
  popularity: PopularityMetrics
  weightClass: WeightClass
  fightingStyles: string[]
  imageUrl?: string
  lastFightDate?: Date
  createdAt: Date
  updatedAt: Date
}

export interface FighterRecord {
  wins: number
  losses: number
  draws: number
  winsByKO?: number
  winsBySubmission?: number
  winsByDecision?: number
  currentStreak?: string
}

export interface FighterStats {
  finishRate: number
  koPercentage: number
  submissionPercentage: number
  averageFightTime: number // in seconds
  significantStrikesPerMinute: number
  takedownAccuracy: number
}

export interface PopularityMetrics {
  socialFollowers: number
  recentBuzzScore: number // 0-100
  fanFavorite: boolean
  funScore: number
}

export interface UnifiedFight {
  id: string
  fighter1: UnifiedFighter
  fighter2: UnifiedFighter
  event: UnifiedEvent
  details: FightDetails
  predictions: AIPredictions
  results?: FightResults
  metadata: FightMetadata
}

export interface FightDetails {
  weightClass: WeightClass
  titleFight: boolean
  mainEvent: boolean
  cardPosition: CardPosition
  scheduledRounds: number
  fightNumber?: number
}

export interface AIPredictions {
  funFactor: number // 1-10 scale
  predictedFunScore: number // 0-100 calculated
  finishProbability: number // 0-100 percentage
  entertainmentReason?: string
  keyFactors: string[]
  fightPrediction?: string
  riskLevel?: RiskLevel
  funFactors: (FunFactor | string)[]
  aiDescription?: string
  confidence?: number // AI confidence in predictions
  modelVersion?: string
}

export interface FightResults {
  completed: boolean
  winnerId?: string
  method?: FinishMethod
  round?: number
  time?: string
  actualFunScore?: number
}

export interface FightMetadata {
  bookingDate: Date
  createdAt: Date
  updatedAt: Date
  source: string
  lastPredictionUpdate?: Date
}

export interface UnifiedEvent {
  id: string
  name: string
  date: Date
  location: string
  venue: string
  status: EventStatus
  fightCard: UnifiedFight[]
  organization: FightCard
  metadata: EventMetadata
}

export interface FightCard {
  mainCard: UnifiedFight[]
  prelimCard: UnifiedFight[]
  earlyPrelimCard: UnifiedFight[]
}

export interface EventMetadata {
  completed: boolean
  createdAt: Date
  updatedAt: Date
  source: string
  lastScrapedAt?: Date
  changeCount: number
}

// ===== SERVICE TYPES =====

export interface ScrapingResult {
  events: UnifiedEvent[]
  fighters: UnifiedFighter[]
  metadata: ScrapingMetadata
}

export interface ScrapingMetadata {
  source: string
  timestamp: Date
  eventsProcessed: number
  fightersProcessed: number
  executionTime: number
  errors: string[]
}

export interface ImageServiceResult {
  url: string | null
  source: ImageSource
  confidence: number
  cached: boolean
  loading?: boolean
  error?: string | null
}

export interface AIServiceRequest {
  eventId: string
  eventName: string
  fights: FightForPrediction[]
}

export interface FightForPrediction {
  id: string
  fighter1Id: string
  fighter2Id: string
  fighter1Name: string
  fighter2Name: string
  weightClass: string
  cardPosition: string
  titleFight: boolean
  mainEvent: boolean
  scheduledRounds: number
}

export interface AIServiceResponse {
  fightId: string
  funFactor: number
  finishProbability: number
  entertainmentReason?: string
  keyFactors?: string[]
  prediction?: string
  riskLevel?: RiskLevel
  confidence?: number
}

// ===== UI COMPONENT TYPES =====

export interface FightListProps {
  event: UnifiedEvent
  onFightClick?: (fight: UnifiedFight) => void
  loading?: boolean
  error?: string | null
}

export interface FighterAvatarProps {
  fighterName: string | undefined
  size?: AvatarSize
  className?: string
  showName?: boolean
  showConfidence?: boolean
}

export interface EventNavigationProps {
  events: UnifiedEvent[]
  currentEventIndex: number
  onEventChange: (index: number) => void
}

// ===== AUTOMATION TYPES =====

export interface EventChange {
  type: ChangeType
  eventId: string
  eventName: string
  changes: Record<string, ChangeDetail>
  timestamp: Date
}

export interface ChangeDetail {
  old: any
  new: any
}

export interface AutomationConfig {
  scrapingInterval: number // minutes
  predictionUpdateThreshold: number // hours
  maxRetries: number
  timeoutMs: number
}

export interface HealthCheck {
  service: string
  healthy: boolean
  message?: string
  lastCheck: Date
  responseTime?: number
}

export interface SystemHealth {
  overall: HealthStatus
  checks: Record<string, HealthCheck>
  uptime: number
  version: string
}

// ===== MONITORING TYPES =====

export interface LogEntry {
  timestamp: string
  level: LogLevel
  service: string
  message: string
  meta?: Record<string, any>
  traceId?: string
}

export interface PerformanceMetric {
  operation: string
  duration: number
  timestamp: Date
  success: boolean
  metadata?: Record<string, any>
}

export interface ErrorReport {
  id: string
  error: Error
  context: Record<string, any>
  timestamp: Date
  service: string
  severity: ErrorSeverity
  resolved: boolean
}

// ===== ENUMS & CONSTANTS =====

export type WeightClass =
  | 'strawweight'
  | 'flyweight'
  | 'bantamweight'
  | 'featherweight'
  | 'lightweight'
  | 'welterweight'
  | 'middleweight'
  | 'light_heavyweight'
  | 'heavyweight'
  | 'womens_strawweight'
  | 'womens_flyweight'
  | 'womens_bantamweight'
  | 'womens_featherweight'
  | 'catchweight'
  | 'unknown'

export type CardPosition = 'main' | 'preliminary' | 'early-preliminary'

export type RiskLevel = 'high' | 'medium' | 'low'

export type FinishMethod = 'KO' | 'TKO' | 'SUB' | 'DEC' | 'NC' | 'DQ'

export type EventStatus = 'scheduled' | 'completed' | 'cancelled' | 'postponed'

export type ImageSource = 'tapology' | 'sherdog' | 'ufc' | 'fallback' | 'placeholder'

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

export type ChangeType = 'added' | 'modified' | 'cancelled' | 'rescheduled'

export type HealthStatus = 'healthy' | 'degraded' | 'down'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical'

// ===== LEGACY COMPATIBILITY =====

// Re-export original types for backward compatibility
export interface FunFactor {
  type: FunFactorType
  score: number
  description: string
  weight: number
}

export type FunFactorType =
  | 'high_finish_rate'
  | 'striker_vs_striker'
  | 'grappler_vs_striker'
  | 'fan_favorites'
  | 'title_implications'
  | 'rivalry'
  | 'comeback_potential'
  | 'similar_skill_level'
  | 'aggressive_styles'
  | 'social_buzz'

// Type aliases for backward compatibility
export type Fighter = UnifiedFighter
export type Fight = UnifiedFight
export type UFCEvent = UnifiedEvent

// ===== UTILITY TYPES =====

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  timestamp: string
  meta?: Record<string, any>
}

export interface PaginatedResponse<T> {
  items: T[]
  totalCount: number
  page: number
  pageSize: number
  hasNext: boolean
  hasPrevious: boolean
}

export interface DatabaseConfig {
  provider: 'sqlite' | 'postgresql' | 'mysql'
  url: string
  maxConnections?: number
  timeout?: number
}

export interface CacheConfig {
  provider: 'memory' | 'redis' | 'file'
  ttl: number // seconds
  maxSize?: number
}

// ===== TYPE GUARDS =====

export function isUnifiedFighter(obj: any): obj is UnifiedFighter {
  return obj && typeof obj.id === 'string' && typeof obj.name === 'string'
}

export function isUnifiedFight(obj: any): obj is UnifiedFight {
  return obj && typeof obj.id === 'string' && isUnifiedFighter(obj.fighter1) && isUnifiedFighter(obj.fighter2)
}

export function isUnifiedEvent(obj: any): obj is UnifiedEvent {
  return obj && typeof obj.id === 'string' && typeof obj.name === 'string' && Array.isArray(obj.fightCard)
}

// ===== DEFAULT VALUES =====

export const DEFAULT_FIGHTER_STATS: FighterStats = {
  finishRate: 0,
  koPercentage: 0,
  submissionPercentage: 0,
  averageFightTime: 0,
  significantStrikesPerMinute: 0,
  takedownAccuracy: 0
}

export const DEFAULT_PREDICTIONS: AIPredictions = {
  funFactor: 0,
  predictedFunScore: 0,
  finishProbability: 0,
  keyFactors: [],
  funFactors: []
}

export const DEFAULT_AUTOMATION_CONFIG: AutomationConfig = {
  scrapingInterval: 240, // 4 hours
  predictionUpdateThreshold: 24, // 24 hours
  maxRetries: 3,
  timeoutMs: 120000 // 2 minutes
}