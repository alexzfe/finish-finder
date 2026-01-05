# AI Prediction System - Quick Reference Guide

## Architecture Overview

```
Fighter Stats (from scraper) 
    → NewPredictionService 
    → 2 Parallel Prompts
    → PredictionVersion tracking
    → Database storage
    → Risk Level calculation
```

## Key Components

### 1. Main Service
**File**: `/src/lib/ai/newPredictionService.ts`

```typescript
class NewPredictionService {
  async predictFight(finishInput, funInput): Promise<FightPrediction>
  async predictFinishProbability(input): Promise<PredictionResult>
  async predictFunScore(input): Promise<PredictionResult>
  private extractKeyFactors(reasoning, type): Promise<string[]>
  calculateRiskLevel(finishConf, funConf): 'low' | 'balanced' | 'high'
}
```

### 2. Prediction Runner
**File**: `/scripts/new-ai-predictions-runner.ts`

```bash
# Basic usage
npx ts-node scripts/new-ai-predictions-runner.ts

# With options
npx ts-node scripts/new-ai-predictions-runner.ts --dry-run --limit=5 --force
```

**Command-line Options**:
- `--dry-run`: Preview without API calls
- `--force`: Regenerate existing predictions
- `--event-id=<id>`: Process specific event
- `--limit=<n>`: Process N fights (testing)
- `--no-web-search`: Skip context enrichment

### 3. Prompt Templates

#### Finish Probability
**File**: `/src/lib/ai/prompts/finishProbabilityPrompt.ts`

**Input**: Fighter stats + defensive metrics
**Output**: 0-1 probability, confidence, 4-step reasoning
**Process**: 
1. Compare defensive vulnerability
2. Compare offensive finish rates
3. Adjust for weight class baseline
4. Final assessment

#### Fun Score
**File**: `/src/lib/ai/prompts/funScorePrompt.ts`

**Input**: Fighter stats + fight context
**Output**: 0-100 score, confidence, weighted breakdown
**Weights**: 40% pace+finish, 30% secondary, 20% style, 10% context

### 4. Fighter Context Service
**File**: `/src/lib/ai/fighterContextService.ts`

Fetches recent fighter news via web search
- Caching: 1 hour in-memory
- Rate limit: 1s between searches
- Graceful degradation: Predictions work without context

### 5. Key Factors Extraction
**File**: `/src/lib/ai/prompts/keyFactorsExtraction.ts`

Two-step approach for 95%+ reliability:
- Step 1: Generate main prediction
- Step 2: Extract 1-2 (finish) or 2-3 (fun) word factors

## Database Models

### PredictionVersion
Tracks prompt template versions via SHA256 hashes
```sql
version | finishPromptHash | funScorePromptHash | active | finishAccuracy | brierScore
```

### Prediction
Individual fight predictions with full details
```sql
fightId | versionId | finishProbability | finishConfidence | funScore | funConfidence
modelUsed | tokensUsed | costUsd | actualFinish (after event)
```

## Pricing

**Per Fight**:
- ~2400 tokens total
- Claude 3.5 Sonnet: ~$0.022
- GPT-4o: ~$0.018

**Per Event** (13 fights):
- ~$0.28 (Claude) or $0.23 (GPT-4o)

**Monthly** (4 events):
- ~$1.12 (Claude) or $0.92 (GPT-4o)

## Risk Level Classification

**Thresholds** (average of finish + fun confidence):
- **Low** (≥0.78): Very predictable (~11% of fights)
- **Balanced** (0.675-0.78): Moderate uncertainty (~69%)
- **High** (<0.675): Unpredictable (~21%)

## Environment Variables

```bash
# Required for Claude (recommended)
ANTHROPIC_API_KEY=sk-ant-...

# Optional fallback for OpenAI
OPENAI_API_KEY=sk-...

# Configuration
AI_PROVIDER=anthropic  # or 'openai'

# Database
DATABASE_URL=postgresql://...
DIRECT_DATABASE_URL=postgresql://...

# Optional: Web search enrichment
GOOGLE_SEARCH_API_KEY=...
GOOGLE_SEARCH_ENGINE_ID=...
```

## Typical Workflow

```bash
# 1. Check git status
git status

# 2. Run predictions (dry run first)
npx ts-node scripts/new-ai-predictions-runner.ts --dry-run --limit=3

# 3. If looks good, run for real
npx ts-node scripts/new-ai-predictions-runner.ts --limit=3

# 4. Monitor cost and tokens in output
# Example output:
#   ✓ Success (2487 tokens, $0.0224)
#   ...
#   Total cost: $0.0672

# 5. Verify in database
psql $DATABASE_URL -c "SELECT COUNT(*) FROM predictions WHERE \"createdAt\" > now() - interval '1 hour';"
```

## Common Tasks

### Force Regenerate Predictions for an Event
```bash
npx ts-node scripts/new-ai-predictions-runner.ts --force --event-id=cmh1234567 --limit=5
```

### Check Specific Prediction
```bash
npx ts-node scripts/show-prediction.ts cmh1234567-fight-id
```

### Clear Old Predictions
```bash
node scripts/clear-predictions.js
node scripts/verify-predictions-cleared.js
```

### Recalculate Risk Levels
```bash
npx ts-node scripts/recalculate-risk-levels.ts
```

## API Endpoints

### Health Check
```
GET /api/health
```

### Get Events with Predictions
```
GET /api/db-events
```

### Internal Scraper Ingestion
```
POST /api/internal/ingest
Headers: { "Authorization": "Bearer <INGEST_API_SECRET>" }
Body: { fighters: [...], fights: [...], events: [...] }
```

## GitHub Actions

**File**: `.github/workflows/ai-predictions.yml`

**Schedule**: Daily at 1:30 AM UTC
**Manual Trigger**: Available with batch_size and force_regenerate inputs

## Monitoring

### Key Metrics
- `finishAccuracy`: % of correct finish predictions (target: >60%)
- `brierScore`: Probability calibration (target: <0.25)
- `costUsd`: Track API spending (budget: <$20/month)
- `tokensUsed`: Monitor API usage

### Where to Find Metrics
- `PredictionVersion` table: Historical accuracy
- `Prediction` table: Individual prediction details
- GitHub Actions logs: Recent run costs and tokens
- Console output: Real-time statistics

## Prompt Engineering Notes

### Temperature
- Always 0.3 for consistency
- Not configurable (hardcoded in NewPredictionService)

### Max Tokens
- Main predictions: 1000 (finish & fun)
- Key extraction: 200 (per extraction)

### JSON Validation
- Finish: probability [0-1], confidence [0-1], reasoning object
- Fun: score [0-100], confidence [0-1], breakdown object
- Key factors: Array of strings (1-2 or 2-3 words)

## Troubleshooting

### API Rate Limit Error
```
Solution: Reduce --limit or add delay in CONFIG.rateLimit.delayMs
Default: 2000ms (2 second) delay between fights
```

### JSON Parse Error
```
Solution: Check that LLM returned valid JSON
Retry: Automatic (3 attempts with exponential backoff)
```

### Empty Fighter Context
```
Solution: --no-web-search flag disables context enrichment
Impact: Predictions still work, just without recent news context
```

### Database Connection Error
```
Solution: Check DATABASE_URL and DIRECT_DATABASE_URL
Note: Direct URL needed only for migrations
```

## Version Control

Predictions are version-controlled via:
1. **Prompt hashes**: SHA256 of template files
2. **Version IDs**: Unique identifier per prompt set
3. **Active flag**: Which version is current
4. **Metrics**: Accuracy tracked per version

This enables:
- A/B testing prompt changes
- Rolling back to previous versions
- Comparing accuracy across versions

## Integration Points

### Scraper Integration
```
UFCStats.com → Python Scrapy Spider
  ↓
/api/internal/ingest → Validates & saves fighters
  ↓
PostgreSQL (Fighter table)
  ↓
AI Prediction Runner (reads Fighter stats)
```

### UI Integration
```
React Components
  ↓
GET /api/db-events (events with fights)
  ↓
Display: finishProbability, funScore, risk level, key factors
```

## Performance Tips

1. **Batch Processing**: Process ~13 fights per event = ~30 seconds
2. **Rate Limiting**: 2s delay prevents API throttling
3. **Caching**: Fighter context cached 1 hour
4. **Parallel API Calls**: Finish & fun predictions run in parallel
5. **Web Search**: Optional, can be disabled with --no-web-search

## Related Scripts

- `generate-ai-predictions.js`: Legacy runner (older approach)
- `ai-predictions-runner.js`: Alternative runner
- `clear-predictions.js`: Clean old data
- `recalculate-risk-levels.ts`: Recalculate confidence-based risks
- `show-prediction.ts`: Display single prediction details

---

**Last Updated**: 2025-11-15
**Status**: Production-ready
**Provider**: Anthropic Claude 3.5 Sonnet (primary), OpenAI GPT-4o (fallback)
