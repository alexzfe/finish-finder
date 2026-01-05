# Finish-Finder Codebase Exploration Summary

**Date:** 2025-11-15
**Project:** Finish-Finder (UFC Fight Prediction Platform)
**Scope:** AI Prediction System Architecture & Implementation

---

## 1. Project Overview

**Finish-Finder** is a Next.js-based UFC fight prediction platform that uses AI to predict:
- **Finish Probability**: Likelihood a fight ends via KO/TKO/Submission (0-100%)
- **Fun Score**: Entertainment potential of a fight (0-100 scale)

The system is built on:
- **Backend**: Next.js API routes, Prisma ORM, PostgreSQL
- **Frontend**: React with TypeScript
- **AI**: Anthropic Claude & OpenAI GPT (dual provider support)
- **Data Sources**: UFCStats.com scraper (Python/Scrapy)

---

## 2. Project Structure Overview

```
finish-finder/
├── src/
│   ├── app/                    # Next.js app directory
│   │   ├── api/               # API routes
│   │   │   ├── db-events/     # Event data endpoints
│   │   │   ├── internal/      # Internal scraper ingestion
│   │   │   ├── health/        # Health check
│   │   │   └── performance/   # Performance metrics
│   │   ├── admin/             # Admin dashboard
│   │   └── page.tsx           # Home page
│   ├── components/            # React components
│   │   ├── fight/            # Fight display components
│   │   ├── fighter/          # Fighter profile components
│   │   └── ui/               # UI components
│   ├── lib/                   # Core business logic
│   │   ├── ai/               # AI prediction system (KEY)
│   │   ├── database/         # Database utilities & Prisma
│   │   ├── scraper/          # Scraper integration
│   │   ├── scrapers/         # Multiple scraper services
│   │   └── utils/            # Utility functions
│   └── types/                # TypeScript type definitions
├── prisma/                    # Database schema & migrations
│   ├── schema.prisma          # Current schema
│   └── migrations/            # Migration history
├── scraper/                   # Python Scrapy spider
│   ├── ufc_scraper/
│   │   ├── spiders/          # Scrapy spiders
│   │   ├── parsers.py        # HTML parsing logic
│   │   └── pipelines.py      # Data processing
│   └── tests/                # Integration tests
├── scripts/                   # Utility scripts
│   ├── new-ai-predictions-runner.ts    # Phase 3 runner (CURRENT)
│   ├── generate-ai-predictions.js      # Legacy runner
│   ├── ai-predictions-runner.js        # Alternative runner
│   └── [other utilities]
├── .github/workflows/         # CI/CD pipelines
│   ├── ai-predictions.yml     # Scheduled prediction job
│   └── scraper.yml           # Scraper job
├── docs/                      # Documentation
│   ├── ai-context/           # AI-specific context
│   ├── AI_PREDICTION_IMPLEMENTATION_PLAN.md
│   └── [other docs]
└── package.json              # Dependencies

```

---

## 3. AI Prediction System Architecture (KEY SECTION)

### 3.1 High-Level Flow

```
UFC Event Scheduled
    ↓
Scraper collects fighter stats from UFCStats.com
    ↓
Data ingested via /api/internal/ingest
    ↓
AI Predictions Runner finds unpredicted fights
    ↓
Two parallel AI prompts for each fight:
  ├─ Finish Probability Prediction
  └─ Fun Score Prediction
    ↓
Results saved to Prediction table with version tracking
    ↓
Displayed on UI with confidence/breakdown details
```

### 3.2 Core AI Service

**File**: `/src/lib/ai/newPredictionService.ts`

**Class**: `NewPredictionService`

**Key Methods**:
- `predictFight(finishInput, funInput)`: Generates complete prediction for one fight
- `predictFinishProbability(input)`: Predicts finish likelihood (0-1)
- `predictFunScore(input)`: Predicts entertainment score (0-100)
- `extractKeyFactors(reasoning, type)`: Extracts 1-2 word key factors

**Architecture Details**:
- Supports both **Anthropic Claude** and **OpenAI GPT** providers
- Uses **temperature 0.3** for consistent, deterministic outputs
- Implements **retry logic** with exponential backoff (3 attempts max)
- **Two-step key factor extraction**:
  - Step 1: Generate main prediction (4-6 API calls per fight)
  - Step 2: Extract key factors from reasoning (~200-300 tokens per extraction)
- **Cost Tracking**: Calculates token usage and USD cost per prediction
- **Model Pricing**:
  - Claude 3.5 Sonnet: $3/1M input, $15/1M output
  - GPT-4o: $2.50/1M input, $10/1M output
  - **Typical cost per fight**: $0.02-0.04

**Token Usage per Fight**:
- Finish Probability: ~1000 tokens
- Fun Score: ~1000 tokens
- Key Factor Extractions (×2): ~400 tokens
- **Total**: ~2400 tokens per fight

---

## 4. Finish Probability Prediction

### 4.1 Prompt Template

**File**: `/src/lib/ai/prompts/finishProbabilityPrompt.ts`

**Input Data**:
```typescript
interface FinishProbabilityInput {
  fighter1: FighterFinishStats
  fighter2: FighterFinishStats
  context: FinishProbabilityContext
}

interface FighterFinishStats {
  name: string
  record: string
  
  // Defensive metrics (CRITICAL for predictions)
  significantStrikesAbsorbedPerMinute: number  // SApM
  strikingDefensePercentage: number            // % (0-1)
  takedownDefensePercentage: number            // % (0-1)
  
  // Loss finish vulnerability (MOST IMPORTANT)
  lossFinishRate: number                       // % of losses by finish
  koLossPercentage: number                     // % of losses by KO
  submissionLossPercentage: number             // % of losses by SUB
  
  // Offensive finish metrics
  finishRate: number                           // % of wins by finish
  koPercentage: number                         // % of wins by KO
  submissionPercentage: number                 // % of wins by SUB
  significantStrikesLandedPerMinute: number    // SLpM
  submissionAverage: number                    // Per 15 min
  
  // Optional
  last3Finishes?: number                       // Recent form
  recentContext?: string                       // Web search context
}
```

**Output Structure**:
```typescript
interface FinishProbabilityOutput {
  finishProbability: number  // 0-1 (0-100%)
  confidence: number         // 0-1 (prediction confidence)
  reasoning: {
    defensiveComparison: string       // Step 1
    finishRateComparison: string      // Step 2
    weightClassAdjustment: string     // Step 3
    finalAssessment: string           // Step 4
  }
  keyFactors: string[]       // ["Weak Chin", "High Volume"] (1-2 words each)
}
```

**Analysis Framework** (4-Step Chain-of-Thought):

1. **Assess Defensive Vulnerability** (MOST CRITICAL)
   - Check loss finish rates (primary vulnerability indicator)
   - 60%+ = HIGH vulnerability
   - 30-59% = MODERATE vulnerability
   - <30% = LOW vulnerability
   - Match offensive strengths vs defensive weaknesses

2. **Compare Offensive Finish Rates**
   - Which fighter finishes more (KO vs SUB)
   - Does finish method align with opponent's vulnerability?
   - KO power vs high KO loss rate = strong finish probability

3. **Adjust for Weight Class Baseline**
   - Heavyweight: 70% finish rate
   - Light Heavyweight: 65%
   - Middleweight: 58%
   - Welterweight: 54%
   - Lightweight: 51%
   - etc.

4. **Final Assessment**
   - Synthesize all factors
   - Consider style matchup
   - Account for betting odds (if available)
   - Single vulnerable fighter + strong finisher = significantly higher probability

**Key Design Principles**:
- Temperature: 0.3 (low for consistency)
- Weights defensive metrics heavily
- Recognizes that most fights end in decisions (probabilities >0.7 should be rare)
- Conversational but data-driven analysis style

---

## 5. Fun Score Prediction

### 5.1 Prompt Template

**File**: `/src/lib/ai/prompts/funScorePrompt.ts`

**Input Data**:
```typescript
interface FunScoreInput {
  fighter1: FighterFunStats
  fighter2: FighterFunStats
  context: FunScoreContext
}

interface FighterFunStats {
  name: string
  record: string
  
  // Pace indicators (PRIMARY FACTOR - 20%)
  significantStrikesLandedPerMinute: number  // Higher = more action
  significantStrikesAbsorbedPerMinute: number
  
  // Finish ability (PRIMARY FACTOR - 20%)
  finishRate: number                         // % of wins by finish
  koPercentage: number                       // % of wins by KO
  submissionPercentage: number               // % of wins by SUB
  
  // Fight averages (SECONDARY FACTOR)
  averageFightTimeSeconds: number            // Lower = quick finishes
  winsByDecision: number                     // Lower = more exciting
  submissionAverage: number                  // Submission attempts per 15 min
  
  // Defensive stats (for style classification)
  strikingDefensePercentage: number
  takedownAverage: number
  takedownDefensePercentage: number
  
  // Calculated
  totalWins: number
  primaryStyle: 'striker' | 'wrestler' | 'grappler' | 'balanced'
  
  // Optional
  recentContext?: string                     // Web search context
}

interface FunScoreContext {
  eventName: string
  weightClass: string
  titleFight: boolean
  mainEvent: boolean
  rankings?: { fighter1Rank: number | null, fighter2Rank: number | null }
  rivalry?: boolean
  rematch?: boolean
}
```

**Output Structure**:
```typescript
interface FunScoreOutput {
  funScore: number  // 0-100
  confidence: number // 0-1
  breakdown: {
    paceScore: number              // 0-40 points
    finishRateScore: number        // 0-40 points (total primary = 80)
    secondaryScore: number         // 0-30 points
    styleMatchupScore: number      // 0-20 points
    contextBonus: number           // 0-10 points
    penalties: number              // Negative points
    reasoning: string              // Explanation
  }
}
```

**Weighting Scheme**:

| Category | Weight | Factors |
|----------|--------|---------|
| **Primary (40%)** | | Pace + Finish Rate |
| Pace | 20% | Strikes per minute (8+ = 40pts, <5 = 10pts) |
| Finish Rate | 20% | Avg of both fighters (70%+ = 40pts, <30% = 10pts) |
| **Secondary (30%)** | | Strike differential, knockdowns, subs |
| **Style Matchup (20%)** | | Striker vs Striker (20pts), vs Wrestler (15pts), etc. |
| **Context (10%)** | | Title fight (+5), Rivalry (+3), Rankings (+2) |
| **Penalties** | Negative | Low pace (-15), Boring patterns (-10) |

**Fighter Style Classification**:
- **Striker**: High striking, low takedowns
- **Wrestler**: High takedowns, low submissions
- **Grappler**: High submission average
- **Balanced**: Moderate across all dimensions

---

## 6. Database Schema & Models

### 6.1 Key Tables

**File**: `/prisma/schema.prisma`

#### Fighter Model
Stores detailed MMA fighter statistics:
- **Basic**: name, record, wins/losses/draws
- **Physical**: height, weight, reach, stance, DOB
- **Striking Stats**: SLpM, Str. Acc., SApM, Str. Def. %
- **Grappling Stats**: TD Avg., TD Acc. %, TD Def. %, Sub. Avg.
- **Win Methods**: KO wins, Sub wins, Decision wins
- **Loss Methods**: KO losses, Sub losses, Decision losses
- **Calculated**: finishRate, koPercentage, submissionPercentage, etc.

#### Fight Model
Stores fight matchups and predictions:
- **Matchup**: fighter1Id, fighter2Id, eventId, weightClass
- **Structure**: titleFight, mainEvent, scheduledRounds
- **Legacy Predictions**: funFactor, finishProbability (old system)
- **Outcome**: completed, winnerId, method, round, time
- **Relations**: event, fighter1, fighter2, predictions

#### PredictionVersion Model (NEW)
Tracks different versions of AI prompt templates:
- **Identification**: version string (e.g., "v1.0-abc123")
- **Hashes**: SHA256 of prompt template files
- **Metadata**: description, active flag
- **Metrics**: finishAccuracy, brierScore, funScoreCorrelation

#### Prediction Model (NEW)
Individual fight predictions with full details:
- **Finish Prediction**: probability, confidence, reasoning (JSON)
- **Fun Score Prediction**: score, confidence, breakdown (JSON)
- **Metadata**: modelUsed, tokensUsed, costUsd
- **Evaluation**: actualFinish, actualFinishMethod (filled after fight)
- **Unique Constraint**: [fightId, versionId] - one prediction per fight per version

#### PredictionUsage Model
Tracks API usage for billing/monitoring:
- API calls per event, tokens used, estimated costs
- Helps with budget tracking and optimization

---

## 7. Prediction Generation Pipeline

### 7.1 Main Runner Script

**File**: `/scripts/new-ai-predictions-runner.ts`

**Execution Flow**:

```
1. Parse Command Line Arguments
   ├─ --dry-run: Show what would happen
   ├─ --force: Regenerate existing predictions
   ├─ --event-id=<id>: Process specific event only
   ├─ --limit=<n>: Process N fights (for testing)
   └─ --no-web-search: Disable context enrichment

2. Get or Create Current Prediction Version
   ├─ Calculate SHA256 hashes of prompt template files
   ├─ Look up existing version by hashes
   ├─ Create new version if prompts have changed
   └─ Mark as active, deactivate others

3. Find Fights Needing Predictions
   ├─ Filter by completed=false (upcoming events only)
   ├─ Exclude cancelled fights
   ├─ Include fighters and event relations
   ├─ Skip if already predicted (unless --force)
   └─ Order by event date, then fight number

4. Initialize Services
   ├─ NewPredictionService (Claude/OpenAI)
   └─ FighterContextService (web search, optional)

5. Process Each Fight
   ├─ Fetch fighter context (if --no-web-search not set)
   ├─ Build finish probability input
   ├─ Build fun score input
   ├─ Call service.predictFight()
   ├─ Save to Prediction table (upsert)
   ├─ Calculate and save riskLevel to Fight table
   ├─ Rate limit: 2 second delay between fights
   └─ Log progress, tokens, cost

6. Summary Report
   ├─ Total fights processed
   ├─ Success/failure counts
   ├─ Total tokens used
   ├─ Total cost (USD)
   └─ Average cost per fight
```

**Usage Examples**:
```bash
# Generate predictions for upcoming events
npx ts-node scripts/new-ai-predictions-runner.ts

# Dry run to see what would happen
npx ts-node scripts/new-ai-predictions-runner.ts --dry-run

# Force regenerate with limit for testing
npx ts-node scripts/new-ai-predictions-runner.ts --force --limit=5

# Process specific event only
npx ts-node scripts/new-ai-predictions-runner.ts --event-id=cmh1234...

# Disable web search for faster runs
npx ts-node scripts/new-ai-predictions-runner.ts --no-web-search
```

---

## 8. Fighter Context Service

### 8.1 Web Search Enrichment

**File**: `/src/lib/ai/fighterContextService.ts`

**Purpose**: Fetch recent fighter news to enrich predictions

**Features**:
- In-memory caching (1 hour expiration)
- Rate limiting (1 second delay between searches)
- Graceful error handling (predictions work without context)
- Support for custom search functions (dependency injection)

**Usage in Prediction**:
```typescript
// Get context for both fighters
const context1 = await contextService.getFightContext(
  fighter1.name,
  fighter2.name,
  event.date
)

// Add to prediction input
finishInput.fighter1.recentContext = context1.recentNews
funInput.fighter1.recentContext = context1.recentNews
```

---

## 9. Key Factors Extraction

### 9.1 Two-Step Chain Approach

**Files**: `/src/lib/ai/prompts/keyFactorsExtraction.ts`

**Why Two Steps?**
- Single-step extraction: 80-95% reliability
- Two-step extraction: 95-99% reliability
- Step 2 is cheap (~200-300 tokens)

**Process**:
```
Step 1: Main Prediction
  ├─ Generate finish probability with full reasoning
  └─ Generate fun score with breakdown

Step 2: Key Factors Extraction
  ├─ Extract 1-2 factors from finish reasoning
  │  ├─ Focus on most critical factors
  │  └─ One-time format: "Weak Chin", "High Volume"
  └─ Extract 2-3 factors from fun score reasoning
     ├─ Focus on most important entertainment drivers
     └─ Examples: "Striker Battle", "Title Fight", "High Pace"
```

**Extraction Prompts**:
```
buildFinishKeyFactorsExtractionPrompt(reasoning: string)
  → Input: Final assessment text
  → Output: JSON array of 1-2 strings

buildFunKeyFactorsExtractionPrompt(reasoning: string)
  → Input: Breakdown reasoning text
  → Output: JSON array of 2-3 strings
```

---

## 10. Risk Level Classification

### 10.1 Calculation Method

**File**: `/src/lib/ai/newPredictionService.ts` → `calculateRiskLevel()`

**Purpose**: Classify fight unpredictability based on AI confidence scores

**Thresholds** (calibrated for 21-69-11 distribution):

| Risk Level | Avg Confidence | Interpretation | % of Fights |
|------------|---|---|---|
| **Low** | ≥ 0.78 | Very predictable outcome | ~11% |
| **Balanced** | 0.675-0.78 | Moderate uncertainty | ~69% |
| **High** | < 0.675 | Highly unpredictable | ~21% |

**Calculation**:
```typescript
const avgConfidence = (finishConfidence + funConfidence) / 2
if (avgConfidence >= 0.78) return 'low'
else if (avgConfidence >= 0.675) return 'balanced'
else return 'high'
```

**Based on Analysis of 207 Predictions**:
- Min confidence: 0.40
- Max confidence: 0.85
- Median confidence: 0.725
- 25th percentile: 0.70
- 75th percentile: 0.775

---

## 11. CI/CD Integration

### 11.1 GitHub Actions Workflow

**File**: `.github/workflows/ai-predictions.yml`

**Trigger**:
- Scheduled daily at 1:30 AM UTC (separate from scraper at 1:00 AM)
- Manual trigger with input options

**Inputs** (when manually triggered):
- `batch_size`: OpenAI batch size (default: 6)
- `force_regenerate`: Force regenerate existing predictions (true/false)

**Environment Variables**:
- `ANTHROPIC_API_KEY`: Claude API key
- `OPENAI_API_KEY`: OpenAI API key (for fallback)
- `DATABASE_URL`: Neon pooler connection
- `DIRECT_DATABASE_URL`: Direct connection for migrations
- `SENTRY_DSN`: Error monitoring

**Runner Configuration**:
- Image: ubuntu-latest
- Node: 20.x
- Timeout: 45 minutes
- Dependencies cached via npm ci

---

## 12. Testing & Validation

### 12.1 Validation Schemas

**File**: `/src/lib/scraper/validation.ts`

Validates scraped fighter data:
- Physical attributes (height, weight, reach)
- Striking statistics (SLpM, Str. Acc., SApM, Def. %)
- Grappling statistics (TD Avg., TD Acc./Def. %, Sub. Avg.)
- Win/Loss methods
- Calculated statistics

**File**: `/src/lib/ai/newPredictionService.ts`

Validates AI outputs:
- FinishProbabilityOutput: probability [0-1], confidence [0-1], reasoning object
- FunScoreOutput: score [0-100], confidence [0-1], breakdown object
- Key factors: arrays of 1-2 word strings

---

## 13. Related Scripts & Utilities

### 13.1 Cleanup & Maintenance Scripts

| Script | Purpose |
|--------|---------|
| `scripts/clear-predictions.js` | Clear old predictions from DB |
| `scripts/verify-predictions-cleared.js` | Verify predictions deleted |
| `scripts/show-prediction.ts` | Display specific prediction |
| `scripts/recalculate-risk-levels.ts` | Recalculate risk levels |

### 13.2 Data Exploration Scripts

| Script | Purpose |
|--------|---------|
| `check-fighters.ts` | Verify fighter stats |
| `check-final-results.js` | Verify fight outcomes |
| `generate-csv-report.js` | Export data to CSV |

---

## 14. Performance Considerations

### 14.1 Token Costs per Fight

**Breakdown** (Claude 3.5 Sonnet pricing):
```
Finish Probability:    ~1000 tokens × $0.009/1K = $0.009
Fun Score:             ~1000 tokens × $0.009/1K = $0.009
Key Factor Extraction: ~400 tokens  × $0.009/1K = $0.0036
────────────────────────────────────────────────────
Total per fight:                                    $0.0216
```

**Cost per UFC Event** (13 fights):
```
13 fights × $0.0216 = $0.28 per event
```

**Monthly Cost** (4 events):
```
4 events × $0.28 = $1.12 per month
```

### 14.2 Rate Limiting

- 2 second delay between fights (configurable)
- Prevents API rate limits and exceeding quota
- ~1 minute per 5 fights

### 14.3 Caching Strategies

- Fighter context cached 1 hour in memory
- Prediction versions tracked by prompt hash (avoid regenerating on no-change)
- Database queries indexed for efficient lookup

---

## 15. Current Status & Next Steps

### 15.1 Current Implementation Status

**Implemented** ✅:
- Finish Probability Prompt (4-step reasoning)
- Fun Score Prompt (weighted factor analysis)
- NewPredictionService (Claude & OpenAI support)
- Prediction Runner (with version tracking)
- Fighter Context Service (web search enrichment)
- Key Factors Extraction (two-step approach)
- Risk Level Calculation
- Database Schema & Models
- GitHub Actions Workflow

**In Development** 🔄:
- Evaluation metrics (accuracy tracking)
- Manual outcome recording system
- FOTN award correlation analysis

**Planned** 📋:
- Meta-prompt optimization (monthly)
- A/B testing framework
- Historical accuracy dashboards

### 15.2 File Locations Summary

| Component | File Location |
|-----------|---|
| Main Service | `/src/lib/ai/newPredictionService.ts` |
| Finish Probability Prompt | `/src/lib/ai/prompts/finishProbabilityPrompt.ts` |
| Fun Score Prompt | `/src/lib/ai/prompts/funScorePrompt.ts` |
| Key Factors Extraction | `/src/lib/ai/prompts/keyFactorsExtraction.ts` |
| Fighter Context Service | `/src/lib/ai/fighterContextService.ts` |
| Prediction Runner | `/scripts/new-ai-predictions-runner.ts` |
| Database Schema | `/prisma/schema.prisma` |
| GitHub Workflow | `.github/workflows/ai-predictions.yml` |
| Implementation Plan | `/docs/AI_PREDICTION_IMPLEMENTATION_PLAN.md` |

---

## 16. Key Metrics & Targets

### 16.1 Prediction Accuracy

| Metric | Target | Current |
|--------|--------|---------|
| Finish Accuracy | 65%+ | TBD |
| Brier Score | <0.25 | TBD |
| Fun Score Correlation | >0.5 | TBD |
| Cost per Prediction | <$0.05 | ~$0.02 |

### 16.2 System Health

| Metric | Target |
|--------|--------|
| Prediction Success Rate | >95% |
| API Error Rate | <1% |
| Average Response Time | <30s per fight |
| Monthly Cost | <$20 |

---

## Summary

The **Finish-Finder AI Prediction System** is a sophisticated two-prompt architecture that leverages:

1. **Chain-of-thought reasoning** for finish probability (4 analytical steps)
2. **Weighted factor analysis** for entertainment scoring (7 weighted factors)
3. **Dual LLM provider support** (Claude/OpenAI) for redundancy
4. **Web search enrichment** for real-time fighter context
5. **Version tracking** for prompt management and A/B testing
6. **Comprehensive validation** at every stage
7. **Detailed cost tracking** for budget management

The system is production-ready and running on a daily schedule via GitHub Actions. All data flows through a well-tested Prisma ORM with PostgreSQL backend, ensuring data integrity and performance.

---

*Last Updated: 2025-11-15*
*Generated from codebase exploration*
