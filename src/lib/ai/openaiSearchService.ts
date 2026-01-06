/**
 * OpenAI Fighter Search Service
 *
 * Uses OpenAI's Responses API with web_search tool to extract
 * structured fighter entertainment profiles from MMA media sources.
 *
 * Two-step approach:
 * 1. Web search with domain filtering (gpt-5-mini)
 * 2. Structured extraction with JSON schema (gpt-4o)
 *
 * Cost per fighter: ~$0.03
 * - Web search: $0.01 tool fee + $0.0012 tokens
 * - Extraction: ~$0.013 (input + output tokens)
 */

import OpenAI from 'openai'
import {
  createUnknownProfile,
  type FighterEntertainmentProfile as FighterEntertainmentProfileType,
} from './schemas/fighterEntertainmentProfile'

/**
 * MMA domains ranked by qualitative content quality
 *
 * Tier 1: Long-form analysis, technical breakdowns
 * Tier 2: Mainstream narratives, news coverage
 * Tier 3: Mixed quality, forums
 */
const MMA_DOMAINS = [
  // Tier 1 - Best for qualitative analysis
  'mmafighting.com',
  'bloodyelbow.com',
  // Tier 2 - Good mainstream coverage
  'espn.com',
  'mmajunkie.usatoday.com',
  'bleacherreport.com',
  // Tier 3 - Mixed but useful
  'ufc.com',
  'sherdog.com',
]

/**
 * OpenAI-compatible JSON schema for fighter entertainment profile
 * Used with response_format for structured outputs
 */
const FIGHTER_PROFILE_RESPONSE_FORMAT = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'fighter_entertainment_profile',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        fighter_name: { type: 'string' },
        nickname: { type: ['string', 'null'] },
        primary_archetype: {
          type: 'string',
          enum: [
            'brawler', 'pressure_fighter', 'counter_striker', 'point_fighter',
            'volume_striker', 'wrestler', 'submission_artist', 'sprawl_and_brawl',
            'ground_and_pound', 'unknown'
          ],
        },
        secondary_archetype: {
          type: ['string', 'null'],
          enum: [
            'brawler', 'pressure_fighter', 'counter_striker', 'point_fighter',
            'volume_striker', 'wrestler', 'submission_artist', 'sprawl_and_brawl',
            'ground_and_pound', 'unknown', null
          ],
        },
        archetype_reasoning: { type: 'string' },
        archetype_confidence: { type: 'integer', minimum: 0, maximum: 100 },
        mentality: {
          type: 'string',
          enum: ['finisher', 'coasts_with_lead', 'bonus_hunter', 'plays_safe', 'unknown'],
        },
        mentality_reasoning: { type: 'string' },
        mentality_confidence: { type: 'integer', minimum: 0, maximum: 100 },
        reputation_tags: {
          type: 'array',
          items: { type: 'string' },
        },
        notable_wars: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              opponent: { type: 'string' },
              event: { type: 'string' },
              year: { type: 'integer' },
              description: { type: 'string' },
              result: { type: 'string', enum: ['win', 'loss', 'draw', 'nc'] },
            },
            required: ['opponent', 'event', 'year', 'description', 'result'],
            additionalProperties: false,
          },
        },
        bonus_history: {
          type: 'object',
          properties: {
            fotn_count: { type: 'integer' },
            potn_count: { type: 'integer' },
            total_bonuses: { type: 'integer' },
            bonus_rate_estimate: { type: ['number', 'null'] },
          },
          required: ['fotn_count', 'potn_count', 'total_bonuses', 'bonus_rate_estimate'],
          additionalProperties: false,
        },
        known_boring_fights: {
          type: 'array',
          items: { type: 'string' },
        },
        rivalries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              opponent: { type: 'string' },
              is_real_beef: { type: 'boolean' },
              context: { type: 'string' },
            },
            required: ['opponent', 'is_real_beef', 'context'],
            additionalProperties: false,
          },
        },
        entertainment_prediction: {
          type: 'string',
          enum: ['high', 'medium', 'low', 'unknown'],
        },
        extraction_notes: { type: 'string' },
      },
      required: [
        'fighter_name', 'nickname', 'primary_archetype', 'secondary_archetype',
        'archetype_reasoning', 'archetype_confidence', 'mentality', 'mentality_reasoning',
        'mentality_confidence', 'reputation_tags', 'notable_wars', 'bonus_history',
        'known_boring_fights', 'rivalries', 'entertainment_prediction', 'extraction_notes'
      ],
      additionalProperties: false,
    },
  },
}

/**
 * System prompt for structured extraction
 *
 * Guides the model to classify archetypes, mentality, and reputation.
 */
const EXTRACTION_SYSTEM_PROMPT = `You are a UFC analyst extracting ENTERTAINMENT signals from search results.
Your goal is to identify qualitative characteristics that predict how EXCITING a fighter's performances are.

ARCHETYPE CLASSIFICATION:
- brawler: "slugger", "banger", trades punches, fights described as "wars", relies on toughness
- pressure_fighter: "relentless", "always moving forward", high output, smothering style
- counter_striker: "patient", "waits for opponent", times counters, reactive style
- point_fighter: "technical", wins decisions, jabs and leg kicks, avoids damage exchanges
- volume_striker: "high output", "overwhelms", quantity over power
- wrestler: Primary weapon is takedowns, control-focused, lay and pray risk
- submission_artist: Actively hunts finishes on the ground, exciting scrambles
- sprawl_and_brawl: Wrestler background who stuffs takedowns, keeps it standing
- ground_and_pound: Wrestle-strike hybrid, attacks from top position
- unknown: Not enough information to classify

MENTALITY SIGNALS:
- finisher: "Looking for the knockout", doesn't coast, pursues stoppage even when ahead
- coasts_with_lead: "Plays safe", "cruises to decisions" when winning
- bonus_hunter: Mentions wanting bonuses, takes risks for excitement, "chases the finish"
- plays_safe: Conservative, "decision machine", prioritizes winning over action
- unknown: Not enough information to classify

REPUTATION TAGS to extract (use exact phrases when found):
"always comes forward", "never boring", "iron chin", "pillow fists", "glass chin",
"cardio machine", "fades late", "front runner", "wilts under pressure",
"dog", "warrior", "safe fighter", "decision machine", "exciting", "must-watch",
"lay and pray", "blanket", "point fighter", "knockout artist", "submission wizard"

CONFIDENCE SCORING:
90-100: Multiple sources agree, clear evidence, well-known reputation
70-89: Good evidence from reliable sources, minor ambiguity
50-69: Limited sources or some conflicting information
30-49: Sparse data, mostly inference
0-29: Highly uncertain, barely any information

HANDLING CONFLICTS:
- If sources disagree, weight recent evidence (last 2 years) more heavily
- For hybrid fighters, assign DOMINANT style as primary, secondary for the other
- Note conflicts in extraction_notes field
- Lower confidence scores when data is limited or contradictory
- "unknown" is valid and preferred over guessing with low confidence

BONUS HISTORY:
- FOTN = Fight of the Night
- POTN = Performance of the Night (includes KO/Sub of the Night from older events)
- If exact counts unknown, estimate based on mentions (e.g., "multiple bonuses" = 2-3)

NOTABLE WARS:
- Only include fights described as exciting, back-and-forth, or "war"
- Max 5 entries, prioritize most famous/recent
- Include year and brief description of why it was notable

KNOWN BORING FIGHTS:
- Only include if specifically mentioned as boring, uneventful, or disappointing
- Format: "vs. Opponent Name (brief note)"

Extract all available information. Be thorough but honest about data quality.`

/**
 * Configuration for the search service
 */
interface SearchServiceConfig {
  /** OpenAI API key (defaults to OPENAI_API_KEY env var) */
  apiKey?: string
  /** Search context size: low, medium, high (default: high) */
  searchContextSize?: 'low' | 'medium' | 'high'
  /** Model for web search step (default: gpt-5-mini for domain filtering support) */
  searchModel?: string
  /** Model for extraction step (default: gpt-4o-2024-08-06) */
  extractionModel?: string
  /** Max retries on failure (default: 3) */
  maxRetries?: number
  /** Initial retry delay in ms (default: 1000) */
  retryDelayMs?: number
}

/**
 * Result from fighter profile extraction
 */
export interface ExtractionResult {
  profile: FighterEntertainmentProfileType
  searchTokens: number
  extractionTokens: number
  totalCostUsd: number
  sources: string[]
  searchSuccessful: boolean
}

/**
 * OpenAI Fighter Search Service
 *
 * Extracts structured entertainment profiles from web search results.
 */
export class OpenAIFighterSearchService {
  private client: OpenAI
  private config: Required<SearchServiceConfig>

  // Model pricing (per 1M tokens)
  private static readonly PRICING = {
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-5-mini': { input: 0.30, output: 1.2 }, // Estimated pricing
    'gpt-4o-2024-08-06': { input: 2.5, output: 10 },
    'gpt-4o': { input: 2.5, output: 10 },
  }

  // Web search tool call fee
  private static readonly WEB_SEARCH_FEE = 0.01 // $0.01 per call

  constructor(config: SearchServiceConfig = {}) {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY

    if (!apiKey) {
      throw new Error(
        'OpenAI API key required. Set OPENAI_API_KEY environment variable.'
      )
    }

    this.client = new OpenAI({ apiKey })

    this.config = {
      apiKey,
      searchContextSize: config.searchContextSize || 'high',
      searchModel: config.searchModel || 'gpt-5-mini', // gpt-5-mini supports domain filtering
      extractionModel: config.extractionModel || 'gpt-4o-2024-08-06',
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
    }
  }

  /**
   * Extract entertainment profile for a fighter
   *
   * Two-step process:
   * 1. Web search with domain filtering
   * 2. Structured extraction with Zod schema
   *
   * @param fighterName - Fighter's full name
   * @returns Extraction result with profile and metadata
   */
  async extractFighterProfile(
    fighterName: string
  ): Promise<ExtractionResult> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.doExtraction(fighterName)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1)
          console.warn(
            `  ⚠ Extraction attempt ${attempt} failed for ${fighterName}: ${lastError.message}`
          )
          console.warn(`  ⏱ Retrying in ${delay}ms...`)
          await this.sleep(delay)
        }
      }
    }

    // All retries exhausted - return unknown profile
    console.error(
      `  ✗ All extraction attempts failed for ${fighterName}: ${lastError?.message}`
    )

    return {
      profile: createUnknownProfile(fighterName),
      searchTokens: 0,
      extractionTokens: 0,
      totalCostUsd: 0,
      sources: [],
      searchSuccessful: false,
    }
  }

  /**
   * Perform the actual extraction (called by extractFighterProfile with retry logic)
   */
  private async doExtraction(fighterName: string): Promise<ExtractionResult> {
    // Step 1: Web search for qualitative content
    const searchResult = await this.webSearch(fighterName)

    if (!searchResult.text || searchResult.text.length < 100) {
      console.warn(`  ⚠ Insufficient search results for ${fighterName}`)
      return {
        profile: {
          ...createUnknownProfile(fighterName),
          extraction_notes: 'Web search returned insufficient results.',
        },
        searchTokens: searchResult.tokensUsed,
        extractionTokens: 0,
        totalCostUsd: searchResult.costUsd,
        sources: searchResult.sources,
        searchSuccessful: false,
      }
    }

    // Step 2: Structured extraction
    const extractionResult = await this.structuredExtraction(
      fighterName,
      searchResult.text
    )

    const totalCost = searchResult.costUsd + extractionResult.costUsd

    return {
      profile: extractionResult.profile,
      searchTokens: searchResult.tokensUsed,
      extractionTokens: extractionResult.tokensUsed,
      totalCostUsd: totalCost,
      sources: searchResult.sources,
      searchSuccessful: true,
    }
  }

  /**
   * Step 1: Web search with domain filtering
   *
   * Uses OpenAI Responses API with web_search tool.
   */
  private async webSearch(fighterName: string): Promise<{
    text: string
    sources: string[]
    tokensUsed: number
    costUsd: number
  }> {
    const searchQuery = `Search for UFC fighter "${fighterName}" fighting style analysis, entertainment value, exciting fights, boring fights, FOTN POTN bonuses, rivalries, and how commentators and media describe their fighting approach and tendencies.`

    // Use responses.create with web_search tool
    const response = await this.client.responses.create({
      model: this.config.searchModel,
      tools: [
        {
          type: 'web_search',
          search_context_size: this.config.searchContextSize,
          filters: {
            allowed_domains: MMA_DOMAINS,
          },
        },
      ],
      input: searchQuery,
    })

    // Extract sources and text from response
    const sources: string[] = []
    let outputText = response.output_text || ''

    // Extract sources from output items
    for (const item of response.output) {
      // Handle web_search_call items
      if (item.type === 'web_search_call') {
        // Access the action property which contains search results
        const webSearchItem = item as { type: 'web_search_call'; action?: { sources?: Array<{ url: string }> } }
        if (webSearchItem.action?.sources) {
          sources.push(...webSearchItem.action.sources.map(s => s.url))
        }
      }

      // Handle message items with annotations
      if (item.type === 'message') {
        const messageItem = item as { type: 'message'; content: Array<{ type: string; text?: string; annotations?: Array<{ type: string; url?: string }> }> }
        for (const content of messageItem.content) {
          if (content.type === 'output_text' && content.text) {
            outputText = content.text
          }
          if (content.annotations) {
            sources.push(
              ...content.annotations
                .filter(a => a.type === 'url_citation' && a.url)
                .map(a => a.url!)
            )
          }
        }
      }
    }

    // Calculate cost
    const tokensUsed = response.usage?.total_tokens || 8000 // Default to 8K block for web search
    const pricing =
      OpenAIFighterSearchService.PRICING[
        this.config.searchModel as keyof typeof OpenAIFighterSearchService.PRICING
      ] || OpenAIFighterSearchService.PRICING['gpt-4o-mini']

    const tokenCost = (tokensUsed / 1_000_000) * (pricing.input + pricing.output)
    const costUsd = OpenAIFighterSearchService.WEB_SEARCH_FEE + tokenCost

    return {
      text: outputText,
      sources: [...new Set(sources)], // Deduplicate
      tokensUsed,
      costUsd,
    }
  }

  /**
   * Step 2: Structured extraction with Zod schema
   *
   * Uses chat completions with response_format for guaranteed JSON.
   */
  private async structuredExtraction(
    fighterName: string,
    searchResults: string
  ): Promise<{
    profile: FighterEntertainmentProfileType
    tokensUsed: number
    costUsd: number
  }> {
    const response = await this.client.chat.completions.create({
      model: this.config.extractionModel,
      temperature: 0.2,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Extract the entertainment profile for UFC fighter "${fighterName}" from these search results:\n\n${searchResults}`,
        },
      ],
      response_format: FIGHTER_PROFILE_RESPONSE_FORMAT,
    })

    const text = response.choices[0]?.message?.content
    if (!text) {
      throw new Error('Empty response from OpenAI')
    }

    // Parse JSON response
    const profile = JSON.parse(text) as FighterEntertainmentProfileType

    // Validate required fields
    if (!profile.fighter_name || !profile.primary_archetype) {
      throw new Error('Invalid profile structure in response')
    }

    // Calculate cost
    const inputTokens = response.usage?.prompt_tokens || 0
    const outputTokens = response.usage?.completion_tokens || 0
    const tokensUsed = inputTokens + outputTokens

    const pricing =
      OpenAIFighterSearchService.PRICING[
        this.config.extractionModel as keyof typeof OpenAIFighterSearchService.PRICING
      ] || OpenAIFighterSearchService.PRICING['gpt-4o']

    const costUsd =
      (inputTokens / 1_000_000) * pricing.input +
      (outputTokens / 1_000_000) * pricing.output

    return {
      profile,
      tokensUsed,
      costUsd,
    }
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!this.config.apiKey
  }

  /**
   * Get current configuration (for debugging)
   */
  getConfig(): Omit<Required<SearchServiceConfig>, 'apiKey'> {
    const { apiKey: _, ...rest } = this.config
    return rest
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

/**
 * Create a configured OpenAI search service
 *
 * @param config - Optional configuration overrides
 * @returns Configured service instance
 */
export function createOpenAISearchService(
  config?: SearchServiceConfig
): OpenAIFighterSearchService {
  return new OpenAIFighterSearchService(config)
}
