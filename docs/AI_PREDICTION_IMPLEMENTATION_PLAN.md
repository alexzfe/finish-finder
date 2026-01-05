# AI Prediction System - Implementation Plan

**Version:** 1.0
**Date:** 2025-11-02
**Status:** PLANNING

## Overview

This document outlines the complete implementation plan for rebuilding the AI prediction system from scratch using advanced prompt engineering techniques. The new system will use a **two-prompt architecture** with structured JSON output and real fighter statistics scraped from UFCStats.com.

### Goals

1. **Accurate Finish Predictions**: 65%+ accuracy using detailed fighter stats and chain-of-thought reasoning
2. **Entertainment Scoring**: Correlate with Fight of the Night awards using weighted factor analysis
3. **Cost Efficiency**: <$0.05 per prediction through batching and temperature optimization
4. **Continuous Improvement**: Track accuracy and use meta-prompts for monthly optimization

### Architecture: Two-Prompt Approach

**Prompt A: Finish Probability**
- Predicts likelihood of fight ending via KO/TKO/Submission (0-100%)
- 4-step analysis: defensive metrics → finish rates → weight class adjustment → betting odds
- Chain-of-thought reasoning with explicit steps
- Temperature: 0.3 for consistency

**Prompt B: Fun Score**
- Rates fight entertainment potential (0-100)
- Weighted factors: 40% primary (pace + finish rate), 30% secondary, 20% style matchup, 10% context
- Includes negative penalties for boring patterns
- Temperature: 0.3 for consistency

## Phase 1: Data Foundation (Week 1)

### 1.1 Database Schema Updates

**New Fighter Statistics Fields** (all from UFCStats.com):

```prisma
model Fighter {
  // ... existing fields ...

  // Physical Attributes
  height                          String?   // e.g. "5' 11\""
  weightLbs                       Int?
  reachInches                     Int?
  stance                          String?   // Orthodox, Southpaw, Switch
  dob                             String?   // Date of birth

  // Striking Statistics (per minute)
  significantStrikesLandedPerMinute  Float   @default(0)  // SLpM
  strikingAccuracyPercentage         Float   @default(0)  // Str. Acc. (0-1)
  significantStrikesAbsorbedPerMinute Float  @default(0)  // SApM
  strikingDefensePercentage          Float   @default(0)  // Sig. Str. Defence (0-1)

  // Grappling Statistics
  takedownAverage                 Float   @default(0)  // TD Avg. (per 15 min)
  takedownAccuracyPercentage      Float   @default(0)  // TD Acc. (0-1)
  takedownDefensePercentage       Float   @default(0)  // TD Def. (0-1)
  submissionAverage               Float   @default(0)  // Sub. Avg. (per 15 min)

  // Fight Averages & Win Methods
  averageFightTimeSeconds         Int     @default(0)  // MM:SS converted to seconds
  winsByKo                        Int     @default(0)  // Wins by KO/TKO
  winsBySubmission                Int     @default(0)  // Wins by Submission
  winsByDecision                  Int     @default(0)  // Wins by Decision

  // Calculated Statistics (derived from above)
  finishRate                      Float   @default(0)  // (KO + Sub) / Total Wins
  koPercentage                    Float   @default(0)  // KO / Total Wins
  submissionPercentage            Float   @default(0)  // Sub / Total Wins
}
```

**New Prediction Tracking Models**:

```prisma
model PredictionVersion {
  id                   String   @id @default(cuid())
  version              String   @unique  // e.g. "v1.0", "v1.1"
  finishPromptHash     String            // SHA256 of finish prompt template
  funScorePromptHash   String            // SHA256 of fun score prompt template
  description          String            // What changed in this version
  active               Boolean  @default(false)
  createdAt            DateTime @default(now())

  // Accuracy metrics (updated after events)
  finishAccuracy       Float?   // % of finish predictions correct
  brierScore           Float?   // Calibration score for probabilities
  funScoreCorrelation  Float?   // Correlation with FOTN awards

  predictions          Prediction[]
}

model Prediction {
  id                      String   @id @default(cuid())
  fightId                 String
  fight                   Fight    @relation(fields: [fightId], references: [id])

  versionId               String
  version                 PredictionVersion @relation(fields: [versionId], references: [id])

  // Finish Probability Prediction
  finishProbability       Float              // 0-100
  finishConfidence        Float              // 0-1
  finishReasoning         Json               // Chain-of-thought steps

  // Fun Score Prediction
  funScore                Float              // 0-100
  funConfidence           Float              // 0-1
  funBreakdown            Json               // Score breakdown by factor

  // Metadata
  modelUsed               String             // "claude-3-5-sonnet", "gpt-4o"
  tokensUsed              Int
  costUsd                 Float
  createdAt               DateTime @default(now())

  // Evaluation (filled after fight completes)
  actualFinish            Boolean?
  actualFinishMethod      String?            // KO, TKO, SUB, DEC
  actualFunScore          Float?             // Manual or calculated
  finishPredictionCorrect Boolean?

  @@unique([fightId, versionId])
  @@map("predictions")
}
```

**Migration File**: `prisma/migrations/YYYYMMDDHHMMSS_add_fighter_stats_and_predictions/migration.sql`

**Effort**: 2-3 hours
**Risk**: Low - additive schema changes only
**Verification**: `npx prisma migrate dev --name add_fighter_stats_and_predictions`

### 1.2 Enhanced Fighter Profile Scraper

**File**: `/scraper/ufc_scraper/parsers.py`

**Updates to `parse_fighter_profile()` function**:
- Extract all 17 stat fields from UFCStats.com (provided by Gemini)
- Parse percentages correctly (50% → 0.5)
- Parse time format (MM:SS → seconds)
- Calculate finish rate, KO%, submission% from win methods
- Handle missing data gracefully (set to 0 or None)

**Implementation** (from Gemini):
```python
def parse_fighter_profile(soup: BeautifulSoup, fighter_url: str) -> Dict[str, Any]:
    """
    Parses a fighter's profile page on UFCStats.com to extract a comprehensive
    set of statistics for AI modeling.
    """
    # [Full implementation provided by Gemini in session 8e6aa828-d342-4c5c-8761-0014c4742afa]
    # Includes helper functions:
    # - _clean_text()
    # - _parse_percentage()
    # - _parse_time_to_seconds()
    # - _parse_int() / _parse_float()
```

**Test Fixtures**: Capture real fighter profile HTML for offline testing

**Effort**: 4-5 hours
**Risk**: Medium - HTML parsing can break if UFCStats changes structure
**Verification**:
```bash
cd scraper
pytest tests/test_parsers.py::test_parse_fighter_profile_stats -v
python test_scraper.py  # Smoke test with real data
```

### 1.3 Update Ingestion API Validation

**File**: `/src/lib/scraper/validation.ts`

**Update `ScrapedFighterSchema`** to include all new fields:

```typescript
export const ScrapedFighterSchema = z.object({
  id: z.string(),
  name: z.string(),
  sourceUrl: z.string().url(),

  // Basic record
  record: z.string().nullable(),
  wins: z.number().int().nullable(),
  losses: z.number().int().nullable(),
  draws: z.number().int().nullable(),

  // Physical attributes
  height: z.string().nullable(),
  weightLbs: z.number().int().nullable(),
  reachInches: z.number().int().nullable(),
  stance: z.string().nullable(),
  dob: z.string().nullable(),

  // Striking stats
  significantStrikesLandedPerMinute: z.number().nullable(),
  strikingAccuracyPercentage: z.number().min(0).max(1).nullable(),
  significantStrikesAbsorbedPerMinute: z.number().nullable(),
  strikingDefensePercentage: z.number().min(0).max(1).nullable(),

  // Grappling stats
  takedownAverage: z.number().nullable(),
  takedownAccuracyPercentage: z.number().min(0).max(1).nullable(),
  takedownDefensePercentage: z.number().min(0).max(1).nullable(),
  submissionAverage: z.number().nullable(),

  // Win methods & averages
  averageFightTimeSeconds: z.number().int().nullable(),
  winsByKo: z.number().int().nullable(),
  winsBySubmission: z.number().int().nullable(),
  winsByDecision: z.number().int().nullable(),

  // Calculated stats
  finishRate: z.number().min(0).max(1).nullable(),
  koPercentage: z.number().min(0).max(1).nullable(),
  submissionPercentage: z.number().min(0).max(1).nullable(),
})
```

**Update `/src/app/api/internal/ingest/route.ts`** to save all new fields.

**Effort**: 2 hours
**Risk**: Low
**Verification**: Test with mock scraped data, verify all fields saved to DB

### 1.4 End-to-End Scraper Test

**Commands**:
```bash
# Test with 1 event
cd scraper
export INGEST_API_URL="https://finish-finder.vercel.app/api/internal/ingest"
export INGEST_API_SECRET="your-secret"
scrapy crawl ufcstats -a limit=1 -s LOG_LEVEL=DEBUG

# Verify database
psql $DATABASE_URL -c "SELECT name, \"significantStrikesLandedPerMinute\", \"finishRate\" FROM fighters LIMIT 5;"
```

**Expected Result**: All fighters have populated stat fields (not NULL/0)

**Effort**: 1-2 hours (including debugging)
**Risk**: Medium - depends on scraper working correctly

## Phase 2: AI Prompt Templates (Week 2)

### 2.1 Finish Probability Prompt

**File**: `/src/lib/ai/prompts/finishProbabilityPrompt.ts`

**Prompt Structure** (from AI model response document):

```typescript
export interface FinishProbabilityInput {
  eventName: string
  fighter1: {
    name: string
    record: string
    significantStrikesAbsorbedPerMinute: number
    strikingDefensePercentage: number
    finishRate: number
    koPercentage: number
    submissionPercentage: number
    last3Finishes: number  // TODO: Calculate from fight history
  }
  fighter2: {
    // Same as fighter1
  }
  weightClass: string
  weightClassBaseFinishRate: number  // Lookup table
  bettingOdds?: {
    fighter1: number  // e.g. -200
    fighter2: number  // e.g. +170
    impliedProbFighter1: number  // e.g. 0.667
  }
}

export interface FinishProbabilityOutput {
  finish_probability: number  // 0-1
  confidence: number          // 0-1
  reasoning: {
    defensive_comparison: string
    finish_rate_comparison: string
    weight_class_adjustment: string
    final_assessment: string
  }
}

export function buildFinishProbabilityPrompt(input: FinishProbabilityInput): string {
  return `You are an expert MMA analyst. Predict if this fight will end in a finish (KO/TKO/Submission).

FIGHTER DATA (JSON):
${JSON.stringify(input, null, 2)}

ANALYSIS STEPS:
1. Compare defensive metrics (strikes absorbed, striking defense %)
   - Lower strikes absorbed = better durability
   - Higher defense % = better at avoiding damage

2. Compare finish rates (historical % of fights ending early)
   - Weight recent form (last 3 fights) more heavily

3. Adjust for weight class baseline
   - Heavyweight: 70% finish rate
   - Lightweight: 51% finish rate
   - [provide lookup table based on historical data]

4. Consider betting odds baseline (if available)
   - If favorite is -200, they win ~67% of time
   - Adjust based on fighter-specific finish rates

OUTPUT (JSON only, no markdown):
{
  "finish_probability": <float 0-1>,
  "confidence": <float 0-1>,
  "reasoning": {
    "defensive_comparison": "Fighter A absorbs X/min vs B's Y/min - advantage A/B",
    "finish_rate_comparison": "Fighter A X% vs B Y% - advantage A/B",
    "weight_class_adjustment": "Weight class base rate X% increases/decreases probability",
    "final_assessment": "High/Medium/Low probability due to [key factors]"
  }
}`
}
```

**Weight Class Base Finish Rates** (to be calculated from historical UFC data):
```typescript
const WEIGHT_CLASS_FINISH_RATES: Record<string, number> = {
  'heavyweight': 0.70,
  'light_heavyweight': 0.65,
  'middleweight': 0.58,
  'welterweight': 0.54,
  'lightweight': 0.51,
  'featherweight': 0.53,
  'bantamweight': 0.56,
  'flyweight': 0.50,
  // Women's divisions (typically lower)
  'womens_featherweight': 0.45,
  'womens_bantamweight': 0.48,
  'womens_flyweight': 0.42,
  'womens_strawweight': 0.40,
}
```

**Effort**: 4-5 hours
**Risk**: Low - template-based, no complex logic

### 2.2 Fun Score Prompt

**File**: `/src/lib/ai/prompts/funScorePrompt.ts`

**Prompt Structure**:

```typescript
export interface FunScoreInput {
  eventName: string
  fighter1: {
    name: string
    significantStrikesLandedPerMinute: number  // Pace indicator
    finishRate: number
    winsByDecision: number
    averageFightTimeSeconds: number
    submissionAverage: number
    // Style classification (derived)
    primaryStyle: 'striker' | 'wrestler' | 'grappler' | 'balanced'
  }
  fighter2: {
    // Same as fighter1
  }
  weightClass: string
  titleFight: boolean
  mainEvent: boolean
  rankings?: {
    fighter1: number | null
    fighter2: number | null
  }
}

export interface FunScoreOutput {
  fun_score: number  // 0-100
  confidence: number  // 0-1
  breakdown: {
    pace_score: number           // 0-40
    finish_rate_score: number    // 0-40
    secondary_score: number      // 0-30
    style_matchup_score: number  // 0-20
    context_bonus: number        // 0-10
    penalties: number            // negative
    reasoning: string
  }
}

export function buildFunScorePrompt(input: FunScoreInput): string {
  return `You are an entertainment analyst for MMA. Rate this fight's excitement potential (0-100).

ENTERTAINMENT FACTORS (weighted):

PRIMARY (40% total weight):
- Pace: Average sig strikes attempted per minute
  * 8.0+ strikes/min = Elite (40/40 points)
  * 6.0-8.0 = Good (25/40)
  * <5.0 = Boring (10/40)

- Historical finish rate: Average of both fighters
  * 70%+ = Elite (40/40 points)
  * 50-70% = Good (25/40)
  * <30% = Low (10/40)

SECONDARY (30% total weight):
- Strike differential (fight-ending potential)
- Knockdown rates
- Submission attempt frequency

STYLE MATCHUP (20% total weight):
- Striker vs Striker = High excitement (20/20)
- Active grappler vs Striker = Good (15/20)
- Wrestler vs Wrestler = Lower (8/20)

CONTEXT BONUS (10% total weight):
- Title fight: +5
- Rivalry/bad blood: +3
- Rankings implications: +2

NEGATIVE PENALTIES (subtract from total):
- Low avg pace (<5 strikes/min): -15
- High control time without activity: -10
- History of boring decisions: -10

FIGHTER DATA:
${JSON.stringify(input, null, 2)}

OUTPUT (JSON only, no markdown):
{
  "fun_score": <0-100>,
  "confidence": <0-1>,
  "breakdown": {
    "pace_score": <number>,
    "finish_rate_score": <number>,
    "secondary_score": <number>,
    "style_matchup_score": <number>,
    "context_bonus": <number>,
    "penalties": <number>,
    "reasoning": "<brief explanation>"
  }
}`
}
```

**Fighter Style Classification** (helper function):
```typescript
function classifyFighterStyle(fighter: {
  significantStrikesLandedPerMinute: number
  takedownAverage: number
  submissionAverage: number
}): 'striker' | 'wrestler' | 'grappler' | 'balanced' {
  // High striking, low takedowns = striker
  // High takedowns, low subs = wrestler
  // High subs = grappler
  // Everything moderate = balanced
  // [Implementation details]
}
```

**Effort**: 5-6 hours
**Risk**: Low

## Phase 3: Prediction Service (Week 2-3)

### 3.1 New Prediction Service

**File**: `/src/lib/ai/newPredictionService.ts`

**Core Methods**:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { z } from 'zod'
import { buildFinishProbabilityPrompt, FinishProbabilityOutput } from './prompts/finishProbabilityPrompt'
import { buildFunScorePrompt, FunScoreOutput } from './prompts/funScorePrompt'

export class PredictionService {
  private client: Anthropic | OpenAI
  private modelName: string
  private temperature = 0.3  // Low temp for consistency

  constructor(provider: 'anthropic' | 'openai' = 'anthropic') {
    if (provider === 'anthropic') {
      this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      this.modelName = 'claude-3-5-sonnet-20241022'
    } else {
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      this.modelName = 'gpt-4o'
    }
  }

  /**
   * Predict finish probability for a single fight
   */
  async predictFinishProbability(
    fighter1: FighterStats,
    fighter2: FighterStats,
    context: FightContext
  ): Promise<FinishProbabilityOutput> {
    const prompt = buildFinishProbabilityPrompt({
      eventName: context.eventName,
      fighter1,
      fighter2,
      weightClass: context.weightClass,
      weightClassBaseFinishRate: WEIGHT_CLASS_FINISH_RATES[context.weightClass] || 0.55,
      bettingOdds: context.bettingOdds
    })

    const response = await this.callLLM(prompt)
    const parsed = this.parseJSON<FinishProbabilityOutput>(response)

    return parsed
  }

  /**
   * Predict fun score for a single fight
   */
  async predictFunScore(
    fighter1: FighterStats,
    fighter2: FighterStats,
    context: FightContext
  ): Promise<FunScoreOutput> {
    const prompt = buildFunScorePrompt({
      eventName: context.eventName,
      fighter1: {
        ...fighter1,
        primaryStyle: classifyFighterStyle(fighter1)
      },
      fighter2: {
        ...fighter2,
        primaryStyle: classifyFighterStyle(fighter2)
      },
      weightClass: context.weightClass,
      titleFight: context.titleFight,
      mainEvent: context.mainEvent,
      rankings: context.rankings
    })

    const response = await this.callLLM(prompt)
    const parsed = this.parseJSON<FunScoreOutput>(response)

    return parsed
  }

  /**
   * Batch predict for multiple fights (more cost-efficient)
   * Process 6 fights per API call
   */
  async batchPredict(fights: Fight[]): Promise<Prediction[]> {
    const predictions: Prediction[] = []
    const batchSize = 6

    for (let i = 0; i < fights.length; i += batchSize) {
      const batch = fights.slice(i, i + batchSize)

      // Process batch in parallel (2 API calls: finish + fun)
      const [finishResults, funResults] = await Promise.all([
        this.batchPredictFinish(batch),
        this.batchPredictFun(batch)
      ])

      // Merge results
      for (let j = 0; j < batch.length; j++) {
        predictions.push({
          fightId: batch[j].id,
          finishProbability: finishResults[j].finish_probability,
          finishConfidence: finishResults[j].confidence,
          finishReasoning: finishResults[j].reasoning,
          funScore: funResults[j].fun_score,
          funConfidence: funResults[j].confidence,
          funBreakdown: funResults[j].breakdown
        })
      }

      // Rate limiting delay
      if (i + batchSize < fights.length) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    return predictions
  }

  private async callLLM(prompt: string): Promise<string> {
    if (this.client instanceof Anthropic) {
      const message = await this.client.messages.create({
        model: this.modelName,
        max_tokens: 1000,
        temperature: this.temperature,
        messages: [{ role: 'user', content: prompt }]
      })
      return message.content[0].type === 'text' ? message.content[0].text : ''
    } else {
      const completion = await this.client.chat.completions.create({
        model: this.modelName,
        max_tokens: 1000,
        temperature: this.temperature,
        messages: [{ role: 'user', content: prompt }]
      })
      return completion.choices[0]?.message?.content || ''
    }
  }

  private parseJSON<T>(response: string): T {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')

    return JSON.parse(jsonMatch[0]) as T
  }
}
```

**Error Handling**:
- Retry logic for API failures (3 attempts with exponential backoff)
- Validation of JSON output with Zod schemas
- Logging of token usage and costs

**Effort**: 8-10 hours
**Risk**: Medium - API integration, error handling
**Verification**: Unit tests with mocked API responses

### 3.2 Prediction Runner Script

**File**: `/scripts/new-ai-predictions-runner.ts`

**Flow**:
1. Find fights without predictions (or force regenerate)
2. Load fighter stats from database
3. Call `PredictionService.batchPredict()` (6 fights per batch)
4. Save predictions to database with version tracking
5. Log token usage and costs

**Implementation**:
```typescript
import { PrismaClient } from '@prisma/client'
import { PredictionService } from '../src/lib/ai/newPredictionService'

class NewAIPredictionsRunner {
  private prisma: PrismaClient
  private service: PredictionService
  private currentVersion: PredictionVersion

  async run() {
    // 1. Get or create current prediction version
    this.currentVersion = await this.getOrCreateCurrentVersion()

    // 2. Find fights needing predictions
    const fights = await this.findFightsNeedingPredictions()

    if (fights.length === 0) {
      console.log('No fights need predictions')
      return
    }

    console.log(`Found ${fights.length} fights needing predictions`)

    // 3. Load fighter stats for each fight
    const fightsWithStats = await this.loadFighterStats(fights)

    // 4. Generate predictions in batches
    const predictions = await this.service.batchPredict(fightsWithStats)

    // 5. Save to database
    await this.savePredictions(predictions, this.currentVersion.id)

    console.log(`✅ Generated ${predictions.length} predictions`)
  }

  private async getOrCreateCurrentVersion(): Promise<PredictionVersion> {
    // Calculate hashes of current prompt templates
    const finishHash = hashString(fs.readFileSync('./src/lib/ai/prompts/finishProbabilityPrompt.ts', 'utf8'))
    const funHash = hashString(fs.readFileSync('./src/lib/ai/prompts/funScorePrompt.ts', 'utf8'))

    // Check if version already exists
    let version = await this.prisma.predictionVersion.findFirst({
      where: {
        finishPromptHash: finishHash,
        funScorePromptHash: funHash
      }
    })

    if (!version) {
      // Create new version
      version = await this.prisma.predictionVersion.create({
        data: {
          version: `v${Date.now()}`,
          finishPromptHash: finishHash,
          funScorePromptHash: funHash,
          description: 'New prompt version',
          active: true
        }
      })

      // Deactivate old versions
      await this.prisma.predictionVersion.updateMany({
        where: { id: { not: version.id } },
        data: { active: false }
      })
    }

    return version
  }
}
```

**Effort**: 6-8 hours
**Risk**: Low - similar to existing runner
**Verification**: Test with dev database

## Phase 4: Evaluation System (Week 3-4)

### 4.1 Evaluation Metrics

**File**: `/scripts/evaluate-predictions.ts`

**Metrics to Track**:
1. **Finish Accuracy**: % of correct finish/no-finish predictions
2. **Brier Score**: Calibration of probability estimates (lower is better)
3. **Fun Score Correlation**: Correlation with actual FOTN awards
4. **Cost per Prediction**: Track API costs

**Implementation**:
```typescript
class PredictionEvaluator {
  async evaluateVersion(versionId: string) {
    // Get all predictions for this version with actual outcomes
    const predictions = await this.prisma.prediction.findMany({
      where: {
        versionId,
        actualFinish: { not: null }  // Only completed fights
      }
    })

    // Calculate finish accuracy
    const finishAccuracy = this.calculateFinishAccuracy(predictions)

    // Calculate Brier score
    const brierScore = this.calculateBrierScore(predictions)

    // Calculate fun score correlation (if FOTN data available)
    const funCorrelation = this.calculateFunCorrelation(predictions)

    // Update version with metrics
    await this.prisma.predictionVersion.update({
      where: { id: versionId },
      data: {
        finishAccuracy,
        brierScore,
        funScoreCorrelation: funCorrelation
      }
    })

    console.log(`Version ${versionId} Metrics:`)
    console.log(`  Finish Accuracy: ${(finishAccuracy * 100).toFixed(1)}%`)
    console.log(`  Brier Score: ${brierScore.toFixed(3)}`)
    console.log(`  Fun Correlation: ${funCorrelation?.toFixed(3) || 'N/A'}`)
  }

  private calculateFinishAccuracy(predictions: Prediction[]): number {
    const threshold = 0.5  // >50% probability = predict finish
    let correct = 0

    for (const pred of predictions) {
      const predictedFinish = pred.finishProbability > threshold
      const actualFinish = pred.actualFinish === true
      if (predictedFinish === actualFinish) correct++
    }

    return correct / predictions.length
  }

  private calculateBrierScore(predictions: Prediction[]): number {
    // Brier score = average of (predicted_prob - actual_outcome)^2
    // actual_outcome is 1 for finish, 0 for decision
    let sum = 0
    for (const pred of predictions) {
      const actual = pred.actualFinish ? 1 : 0
      const predicted = pred.finishProbability
      sum += Math.pow(predicted - actual, 2)
    }
    return sum / predictions.length
  }
}
```

**Run Schedule**: After each UFC event (manual or automated)

**Effort**: 5-6 hours
**Risk**: Low

### 4.2 Manual Outcome Recording

**Script**: `/scripts/record-outcomes.ts`

After each event, record actual outcomes:
```bash
node scripts/record-outcomes.ts \
  --fight-id cmhgpydt3000tl204zneqjwsv \
  --finish true \
  --method "KO" \
  --round 2 \
  --time "3:47"
```

Updates `Prediction` table with `actualFinish`, `actualFinishMethod`.

## Phase 5: Deployment & Testing (Week 4)

### 5.1 Update GitHub Actions Workflow

**File**: `.github/workflows/ai-predictions.yml`

```yaml
name: AI Predictions (New System)

on:
  schedule:
    - cron: '30 1 * * *'  # 1:30 AM UTC daily
  workflow_dispatch:
    inputs:
      force_regenerate:
        description: 'Force regenerate all predictions'
        required: false
        default: 'false'

jobs:
  generate-predictions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Generate AI predictions
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          FORCE_REGENERATE: ${{ github.event.inputs.force_regenerate || 'false' }}
        run: |
          npx ts-node scripts/new-ai-predictions-runner.ts

      - name: Upload logs
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: prediction-logs
          path: logs/ai-predictions.log
          retention-days: 7
```

### 5.2 Gradual Rollout

**Week 4**: Run new system in parallel with old system
- Both systems generate predictions
- Compare outputs manually
- Track costs for both systems

**Week 5**: Switch production to new system
- Update workflow to use new runner
- Archive old system (`src/lib/ai/hybridUFCService.ts` → `archive/`)
- Monitor for 2 weeks

**Week 6+**: Continuous improvement
- Run evaluation after each event
- Use meta-prompts monthly to refine prompts
- A/B test prompt variations

## Success Metrics

### Week 4 (Initial Launch)
- ✅ All fighters have detailed stats (>90% coverage)
- ✅ Predictions generated for upcoming events
- ✅ Cost per prediction <$0.05
- ✅ No API errors or failures

### Month 1 (After 4 events)
- 🎯 Finish accuracy >55% (baseline)
- 🎯 Brier score <0.30 (reasonably calibrated)
- 🎯 Average cost per prediction <$0.04

### Month 3 (After 12 events)
- 🎯 Finish accuracy >60% (improved via prompt refinement)
- 🎯 Brier score <0.25 (well-calibrated)
- 🎯 Fun score correlation >0.4 with FOTN awards

### Month 6 (Mature System)
- 🎯 Finish accuracy >65% (target from AI model response)
- 🎯 Brier score <0.25
- 🎯 Fun score correlation >0.5
- 🎯 Monthly prompt optimization process established

## Cost Estimates

**Per Fight Prediction**:
- 2 API calls (finish + fun)
- ~1000 tokens per call (input + output)
- Claude 3.5 Sonnet: $0.003/1K input + $0.015/1K output
- Estimated: **$0.02-0.04 per fight**

**Per UFC Event** (13 fights average):
- 13 fights × $0.03 = **$0.39 per event**

**Monthly Cost** (4 events):
- 4 events × $0.39 = **$1.56/month**

**With Re-predictions** (re-run 3 times for tuning):
- $1.56 × 3 = **$4.68/month**

**Maximum Monthly Budget**: $20

## Dependencies

**Environment Variables**:
```bash
# Database
DATABASE_URL=postgresql://...
DIRECT_DATABASE_URL=postgresql://...

# AI Provider (choose one)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Configuration
AI_PROVIDER=anthropic  # or openai
PREDICTION_BATCH_SIZE=6
```

**npm Packages**:
```json
{
  "@anthropic-ai/sdk": "^0.32.0",
  "openai": "^4.80.0",
  "zod": "^3.24.0"
}
```

## Rollback Plan

If new system fails:

1. **Immediate**: Revert `.github/workflows/ai-predictions.yml` to use old runner
2. **Database**: Keep both systems' predictions in separate tables/fields
3. **Code**: Old service archived but available in `archive/`

## Timeline Summary

| Week | Phase | Deliverables |
|------|-------|-------------|
| 1 | Data Foundation | Database schema, enhanced scraper, E2E test |
| 2 | AI Prompts | Finish probability + fun score prompt templates |
| 2-3 | Prediction Service | New service + runner script |
| 3-4 | Evaluation | Metrics system, outcome recording |
| 4 | Deployment | Parallel run, testing, documentation |
| 5+ | Production | Live system, continuous improvement |

**Total Effort**: 40-50 hours over 4-5 weeks

## Next Steps

1. ✅ Get approval on this plan
2. 🔄 Start Phase 1.1: Database schema migration
3. 🔄 Enhance scraper with Gemini's code
4. 🔄 Test end-to-end with real UFCStats.com data
5. Continue through phases sequentially

---

**Last Updated**: 2025-11-02
**Author**: Claude Code
**Status**: Ready for implementation
