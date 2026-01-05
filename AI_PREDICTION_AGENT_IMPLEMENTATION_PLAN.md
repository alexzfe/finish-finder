# AI Prediction Agent Improvements - Implementation Plan

## Overview

Implement state-of-the-art techniques from `prediction_agent_research.md` to improve the MMA entertainment prediction agent. All 4 phases will be implemented.

### Key Design Decisions (from Gemini Review)

1. **Platt scaling for finish probability ONLY** (binary classification)
2. **Conformal Prediction for fun score** (continuous 0-100, not suitable for Platt)
3. **Bootstrap calibration on historical data** - Use weak supervision on 2+ years (~1000 fights) before going live
4. **Dynamic weight-class anchors** - No hardcoded percentages, inject baseline from weightClassRates
5. **pgvector for narrative text, NOT raw stats** - Numbers don't embed well semantically
6. **Reranker for retrieval** - Retrieve 20 docs, rerank to top 3 to stay within budget
7. **Structured Outputs** - Use provider Tool Use mode for guaranteed JSON compliance
8. **Persona variation for ensembles** - Don't repeat identical prompts; vary persona emphasis

---

## Phase 1: Prompt Improvements (Zero Cost)

### 1.1 Add DYNAMIC Probability Anchors to Rating Scales

**File:** `src/lib/ai/prompts/unifiedPredictionPrompt.ts`

Update finishDanger scale with weight-class-specific anchors (calculated dynamically):

```typescript
// Calculate dynamic anchors from weight class baseline
const baselinePercent = (weightClassRates.finishRate * 100).toFixed(0)
const low = (weightClassRates.finishRate * 0.3 * 100).toFixed(0)
const belowAvg = (weightClassRates.finishRate * 0.6 * 100).toFixed(0)
const aboveAvg = Math.min(85, weightClassRates.finishRate * 1.3 * 100).toFixed(0)
const high = Math.min(95, weightClassRates.finishRate * 1.6 * 100).toFixed(0)

**finishDanger** (Risk of Stoppage):
1 = Very Low (~${low}% finish rate for ${weightClass})
2 = Below Average (~${belowAvg}% finish rate)
3 = Average (~${baselinePercent}% finish rate) - ${weightClass} baseline
4 = Above Average (~${aboveAvg}% finish rate)
5 = Very High (~${high}% finish rate)
```

This ensures Heavyweight (70% baseline) gets different anchors than Flyweight (50%).

### 1.2 Create Few-Shot Anchor Examples

**New file:** `src/lib/ai/prompts/anchorExamples.ts`

Add 3-5 reference fights spanning the entertainment spectrum:
- 5/5: Gaethje vs Chandler (war, FOTN) - pace=5, finishDanger=5
- 3/5: Standard competitive fight - pace=3, finishDanger=3
- 1/5: Lay-and-pray dominant grappling - pace=1, finishDanger=2

Include these examples in the prompt for calibration anchoring.

### 1.3 Reorder JSON Output (Reasoning First)

**File:** `src/lib/ai/prompts/unifiedPredictionPrompt.ts`

Change output order from:
```json
{ "narrative", "attributes", "reasoning", "keyFactors", "confidence" }
```
To:
```json
{ "reasoning", "narrative", "attributes", "keyFactors", "confidence" }
```

Update `FightSimulationOutput` interface to match.

### 1.4 Request Decimal Probabilities + Structured Output

Update confidence instruction: `"confidence": <0.00-1.00 decimal>`

Consider using Anthropic's Tool Use or OpenAI's Structured Outputs mode for guaranteed JSON compliance.

---

## Phase 2: Calibration Infrastructure

### 2.0 Bootstrap Calibration Data (CRITICAL - Do First)

**New file:** `scripts/bootstrap-calibration-data.ts`

Before training any calibration, generate "Silver Standard" ground truth:
1. Query all completed fights from last 2+ years (~1000 fights)
2. Apply weak supervision labeling functions to each fight
3. Store labels in database for calibration training

This avoids the "Small N" problem of waiting for new fights.

### 2.1 Database Schema Additions

**File:** `prisma/schema.prisma`

```prisma
model CalibrationParams {
  id                String   @id @default(cuid())
  predictionType    String   // "finish" (Platt) or "fun" (Conformal)

  // Platt scaling params (for finish probability)
  paramA            Float?
  paramB            Float?

  // Conformal prediction params (for fun score)
  conformityScores  Json?    // Array of historical residuals
  coverageLevel     Float?   // e.g., 0.90

  trainedOn         Int
  brierScoreBefore  Float?
  brierScoreAfter   Float?
  eceScore          Float?
  mceScore          Float?
  active            Boolean  @default(false)
  validFrom         DateTime
  validTo           DateTime
  createdAt         DateTime @default(now())

  @@index([predictionType, active])
  @@map("calibration_params")
}

model WeakSupervisionLabel {
  id              String   @id @default(cuid())
  fightId         String   @unique

  // Binary labels
  actualFinish    Boolean

  // Entertainment label from labeling functions
  entertainmentLabel  String   // "HIGH", "MEDIUM", "LOW", "ABSTAIN"
  entertainmentConfidence Float
  contributingFunctions String[] // Which labeling functions voted

  // Raw metrics used
  significantStrikes  Int?
  knockdowns          Int?
  finishRound         Int?
  bonusAwarded        Boolean?

  createdAt       DateTime @default(now())

  fight           Fight    @relation(fields: [fightId], references: [id])

  @@map("weak_supervision_labels")
}
```

### 2.2 Platt Scaling Service (Finish Probability Only)

**New file:** `src/lib/ai/calibration/plattScaling.ts`

- `calibrate(rawProbability)` - Apply Platt scaling transformation
- `train(predictions)` - Learn A, B parameters from historical data
- Formula: `calibrated = 1 / (1 + exp(-(A * logit + B)))`
- **Only used for binary finish probability, NOT fun score**

### 2.3 Calibration Metrics Tracker

**New file:** `src/lib/ai/calibration/metricsTracker.ts`

- `calculateBrierScore()` - Target < 0.20
- `calculateECE()` - Expected Calibration Error, target < 0.10
- `calculateMCE()` - Maximum Calibration Error, target < 0.15
- `generateReliabilityDiagram()` - 5-bin breakdown (not 10, given sample size)

### 2.4 Weak Supervision Labeling Functions

**New file:** `src/lib/ai/evaluation/labelingFunctions.ts`

Programmatic labeling for entertainment ground truth:
- `high_action`: significantStrikes > 100 = HIGH (weight: 0.9)
- `quick_finish`: finishRound === 1 = HIGH (weight: 0.85)
- `knockdown_party`: knockdowns >= 3 = HIGH (weight: 0.95)
- `bonus_winner`: FOTN/POTN = HIGH (weight: 1.0)
- `lay_and_pray`: controlTime > 300 && strikes < 40 = LOW (weight: 0.7)
- `submission_battle`: submissionAttempts >= 5 = HIGH (weight: 0.75)

Weighted voting to combine function outputs.

### 2.5 Calibration Runner Script

**New file:** `scripts/run-calibration.ts`

```bash
npx ts-node scripts/run-calibration.ts --bootstrap  # First time: generate weak labels
npx ts-node scripts/run-calibration.ts --train      # Train calibration params
npx ts-node scripts/run-calibration.ts --evaluate   # Show metrics
```

---

## Phase 3: Fighter Profile System with pgvector

### 3.1 Enable pgvector on Supabase

Run in Supabase SQL editor:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3.2 Database Schema for Profiles

**File:** `prisma/schema.prisma`

```prisma
model FighterProfile {
  id                  String   @id @default(cuid())
  fighterId           String   @unique

  // Text content for embedding (NOT raw stats)
  styleAnalysis       String   @db.Text  // "Aggressive pressure fighter..."
  strengthsWeaknesses String   @db.Text  // "Elite takedown defense, suspect cardio..."
  recentFormSummary   String   @db.Text  // "Coming off 2 KO wins..."

  // Vector embedding of concatenated text
  embedding           Unsupported("vector(1536)")?

  lastUpdated         DateTime

  fighter             Fighter  @relation(fields: [fighterId], references: [id])

  @@map("fighter_profiles")
}
```

**Key insight from Gemini:** Embed NARRATIVE TEXT, not raw statistics. Numbers don't embed well semantically.

### 3.3 Fighter Profile Service

**New file:** `src/lib/ai/profiles/fighterProfileService.ts`

- `getProfile(fighterId)` - Get cached profile or null
- `generateProfile(fighterId)` - Generate using cheap model (Haiku/GPT-3.5)
- `isExpired(lastUpdated)` - 7-day expiry
- Weekly batch regeneration instead of per-prediction
- Generate embeddings from `styleAnalysis + strengthsWeaknesses + recentFormSummary`

### 3.4 Time-Decay Weighting

**New file:** `src/lib/ai/profiles/timeDecay.ts`

Half-life by information type:
- Fight performance: 180 days
- Training camp news: 30 days
- Injury reports: 90 days
- Career stats: 365 days

### 3.5 Context Budget Manager with Reranker

**New file:** `src/lib/ai/context/budgetManager.ts`

Budget allocation (2500 tokens total):
- System prompt: ~800 tokens
- Fighter stats: ~400 tokens
- Fighter profiles: ~600 tokens
- Recent context: ~400 tokens
- Output reserve: ~300 tokens

**Retrieval strategy (from Gemini):**
1. Retrieve 20 similar fight analyses via pgvector
2. Rerank using relevance scoring (e.g., style match + recency)
3. Feed only top 3 into context

### 3.6 Profile Generation Script

**New file:** `scripts/generate-fighter-profiles.ts`

```bash
npx ts-node scripts/generate-fighter-profiles.ts --limit=50
```

---

## Phase 4: Continuous Improvement

### 4.1 Adaptive Ensembling with Persona Variation

**New file:** `src/lib/ai/ensembling/adaptiveEnsemble.ts`

Dynamic approach based on confidence:
- High (>85%): 1 call (standard multi-persona)
- Moderate (60-85%): 3 calls with **different persona emphasis**
- Low (<60%): 5 calls with **varied personas**

**Key insight from Gemini:** Don't repeat identical prompts - they have the same biases. Instead:
- Call 1: Emphasize Statistician view
- Call 2: Emphasize Tape Watcher view
- Call 3: Emphasize recent form/momentum
- Aggregate with weighted voting

### 4.2 Conformal Prediction (Primary for Fun Score)

**New file:** `src/lib/ai/calibration/conformalPrediction.ts`

- `train(calibrationData)` - Learn conformity scores from residuals
- `getInterval(pointEstimate, coverage=0.90)` - Returns {lower, upper}
- Provides prediction intervals with coverage guarantees
- **Use for Fun Score (continuous) instead of Platt scaling**

Output example: "Fun Score: 72 (90% CI: 65-79)"

### 4.3 Monthly Recalibration Scheduler

**New file:** `scripts/scheduled-calibration.ts`

Designed for cron: `0 0 1 * *` (1st of each month)
- Retrain Platt scaling with rolling 6-8 month window
- Update conformal prediction thresholds
- Generate calibration report
- Alert if metrics degrade

---

## Integration Points

### Update Unified Prediction Service

**File:** `src/lib/ai/unifiedPredictionService.ts`

Add integration points:
1. Load active CalibrationParams on startup
2. Apply Platt scaling to raw finishProbability (binary)
3. Apply Conformal Prediction to fun score (continuous)
4. Include fighter profiles in prompt context
5. Log predictions for future training
6. Optional: Apply adaptive ensembling for title fights

### Update Prediction Runner

**File:** `scripts/unified-ai-predictions-runner.ts`

1. Load fighter profiles before batch
2. Apply calibration if parameters exist
3. Store raw vs calibrated probabilities
4. Generate profiles for new fighters

---

## File Summary

### New Files to Create
```
src/lib/ai/
├── calibration/
│   ├── plattScaling.ts          # Binary finish probability
│   ├── conformalPrediction.ts   # Continuous fun score
│   └── metricsTracker.ts
├── evaluation/
│   └── labelingFunctions.ts
├── profiles/
│   ├── fighterProfileService.ts
│   └── timeDecay.ts
├── context/
│   └── budgetManager.ts         # Includes reranker logic
├── ensembling/
│   └── adaptiveEnsemble.ts      # Persona variation
└── prompts/
    └── anchorExamples.ts

scripts/
├── bootstrap-calibration-data.ts  # Generate weak labels from history
├── run-calibration.ts
├── generate-fighter-profiles.ts
└── scheduled-calibration.ts
```

### Files to Modify
```
src/lib/ai/prompts/unifiedPredictionPrompt.ts  # Dynamic anchors, JSON order
src/lib/ai/unifiedPredictionService.ts         # Integration
scripts/unified-ai-predictions-runner.ts       # Integration
prisma/schema.prisma                           # New models
```

---

## Implementation Order

1. **Phase 1** (Day 1-2): Prompt improvements - can deploy immediately
2. **Phase 2.0** (Day 3): Bootstrap weak supervision labels from historical data
3. **Phase 2** (Day 4-6): Calibration infrastructure
4. **Phase 3** (Day 7-11): pgvector setup + fighter profiles + reranker
5. **Phase 4** (Day 12-14): Ensembling + conformal prediction + scheduler

---

## Testing Strategy

### Unit Tests
- `src/lib/ai/__tests__/calibration.test.ts` - Platt scaling, conformal prediction
- `src/lib/ai/__tests__/profiles.test.ts` - Profile service, time decay
- `src/lib/ai/__tests__/ensembling.test.ts` - Persona variation logic
- `src/lib/ai/__tests__/labelingFunctions.test.ts` - Weak supervision

### Integration Tests
- End-to-end prediction with calibration
- Profile retrieval and caching
- Budget manager with reranker

---

## Cost Impact

| Phase | One-Time | Monthly | Improvement |
|-------|----------|---------|-------------|
| 1 | $0 | $0 | 10-15% calibration |
| 2 | $0 | $0 | 40-60% ECE reduction |
| 3 | ~$20 | ~$2 | Better context |
| 4 | $0 | ~$0.50 | Uncertainty quantification |
| **Total** | **~$20** | **~$2.50** | **Substantial improvement** |

---

## Reference Documents

- `prediction_agent_research.md` - Original research with SOTA techniques
- `src/lib/ai/prompts/CONTEXT.md` - Current prompt architecture documentation
