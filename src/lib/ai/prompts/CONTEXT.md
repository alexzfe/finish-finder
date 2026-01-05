# AI Prompts Documentation

*This file documents AI prompt engineering patterns and implementations for MMA fight entertainment predictions.*

## Prediction Goals

The system predicts **entertainment value**, not fight outcomes:
- **Finish Probability (0-100%)**: Likelihood the fight ends via stoppage (KO/TKO/SUB) vs decision
- **Fun Score (0-100)**: How entertaining the fight will be for viewers

The system does NOT predict winners or methods.

## Unified Prompt Architecture

The system uses a **single-call unified architecture** for fight analysis:

```
┌─────────────────────────────────────────────────────────────────┐
│                        INPUT DATA                                │
├─────────────────────────────────────────────────────────────────┤
│ • Fighter stats (offense, defense, finish rates, vulnerability) │
│ • Weight class baseline finish rates + dynamic anchors          │
│ • Fight context (title fight, main event, rankings)             │
│ • Few-shot calibration anchors (HIGH/MEDIUM/LOW entertainment)  │
│ • Optional: Web search for recent fighter news                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│             SINGLE LLM CALL (Structured Output)                  │
│  Multi-persona prompt (Statistician, Tape Watcher, Synthesizer) │
│  Uses Tool Use (Anthropic) or Structured Outputs (OpenAI)       │
├─────────────────────────────────────────────────────────────────┤
│ Chain-of-Thought output (reasoning first):                       │
│   • reasoning {}         - Step-by-step analysis (FIRST)        │
│   • finishAnalysis       - Concise 1-2 sentence WHY finish      │
│   • funAnalysis          - Concise 1-2 sentence WHY entertaining│
│   • narrative            - Fight simulation story                │
│   • pace (1-5)           - Action level                         │
│   • finishDanger (1-5)   - Risk of stoppage (calibrated)        │
│   • technicality (1-5)   - Strategic complexity                 │
│   • styleClash           - Complementary/Neutral/Canceling      │
│   • brawlPotential       - boolean                              │
│   • groundBattleLikely   - boolean                              │
│   • confidence (0-1)     - Analysis confidence                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              DETERMINISTIC TYPESCRIPT CALCULATION                │
├─────────────────────────────────────────────────────────────────┤
│ finishProbability = baseline × finishDangerMultiplier × styleMod│
│ funScore = (pace × 35) + (danger × 35) + (tech × 10) + bonuses  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CONSISTENCY VALIDATION                         │
│  Rule-based checks + optional LLM critique if issues detected   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              CALIBRATION (Optional Post-Processing)              │
│  Platt scaling for finish probability, weak supervision labels   │
└─────────────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `unifiedPredictionPrompt.ts` | Multi-persona prompt with dynamic anchors and reasoning-first output |
| `anchorExamples.ts` | Few-shot calibration anchors (HIGH/MEDIUM/LOW entertainment) + DSPy examples |
| `scoreCalculator.ts` | Deterministic TypeScript score calculation from attributes |
| `consistencyValidator.ts` | Rule-based validation with optional LLM critique |
| `../unifiedPredictionService.ts` | Service with structured output mode (Tool Use/Structured Outputs) |
| `../enhancedPredictionService.ts` | Production service with Platt calibration, embeddings context, prediction logging |
| `weightClassRates.ts` | Statistical finish rate baselines by weight class |
| `../calibration/plattScaling.ts` | Log-odds Platt scaling for finish probability calibration |
| `../embeddings/hybridRetrieval.ts` | Hybrid vector + time-decay context retrieval |
| `../embeddings/predictionContextService.ts` | Enriched fighter context for predictions |

## Multi-Persona Analysis

The unified prompt uses three analytical perspectives:

1. **The Statistician**: Pure numbers analysis - vulnerability vs offense matchups, decision rates, weight class baselines
2. **The Tape Watcher**: Fighting habits, tendencies, style interactions, cardio, chin reputation
3. **The Synthesizer**: Reconciles both views into final qualitative ratings

## Qualitative Attributes

The LLM outputs qualitative ratings (1-5 scales) rather than numerical probabilities:

| Attribute | Scale | Description |
|-----------|-------|-------------|
| `pace` | 1-5 | 1=Stalemate, 3=Average, 5=War |
| `finishDanger` | 1-5 | Calibrated per weight class (e.g., HW: 1=~21%, 3=~70%, 5=~95%) |
| `technicality` | 1-5 | 1=Pure chaos, 5=High-level chess |
| `styleClash` | enum | Complementary (action), Neutral, Canceling (nullify) |
| `brawlPotential` | bool | Both fighters willing to stand and trade |
| `groundBattleLikely` | bool | Grappling exchange expected |

## Concise Analysis Summaries

The LLM outputs focused 1-2 sentence summaries for UI display:

| Field | Purpose | Example |
|-------|---------|---------|
| `finishAnalysis` | WHY the fight will/won't be a finish | "High finish likelihood due to Garry's 50% KO rate against Page's absorbed strikes." |
| `funAnalysis` | WHY the fight will/won't be entertaining | "Striker vs striker matchup with high combined output promises constant action." |

These concise summaries focus on the key vulnerability vs offense matchup (finish) and pace/style clash (fun).

## Dynamic Probability Anchors

The `finishDanger` rating guide includes weight-class-specific probability percentages calculated dynamically:

```typescript
// Example for Heavyweight (70% baseline)
finishDanger=1 → ~21% (baseline × 0.3)
finishDanger=2 → ~42% (baseline × 0.6)
finishDanger=3 → ~70% (baseline)
finishDanger=4 → ~85% (baseline × 1.3, capped at 85)
finishDanger=5 → ~95% (baseline × 1.6, capped at 95)
```

## Few-Shot Anchor Examples

`anchorExamples.ts` provides reference fights spanning the entertainment spectrum:

| Tier | Example | Key Attributes |
|------|---------|----------------|
| HIGH | Gaethje vs Chandler | pace=5, finishDanger=5, brawlPotential=true |
| MEDIUM | Competitive mixed styles | pace=3, finishDanger=3, styleClash=Neutral |
| LOW | Dominant wrestler vs striker | pace=1, finishDanger=2, styleClash=Canceling |

These anchors are injected into the prompt to calibrate the LLM's attribute ratings.

## Structured Output Mode

The service uses native structured output features for guaranteed JSON compliance:

- **Anthropic**: Tool Use mode with JSON schema definition
- **OpenAI**: Structured Outputs (`response_format: { type: 'json_schema' }`)

This eliminates JSON parsing errors and ensures valid attribute values.

## Deterministic Score Calculation

Scores are calculated in TypeScript from qualitative attributes, ensuring consistency:

**Finish Probability:**
```typescript
finishProbability = weightClassBaseline × finishDangerMultiplier × styleClashModifier
// finishDangerMultiplier: 0.4 (danger=1) to 1.2 (danger=5)
// styleClashModifier: Complementary=1.15, Neutral=1.0, Canceling=0.75
```

**Fun Score:**
```typescript
funScore =
  (pace / 5 × 35) +           // Max 35 points
  (finishDanger / 5 × 35) +   // Max 35 points
  (technicality × ~10) +      // Max 10 points (peaks at 3-4)
  (brawlPotential ? 10 : 0) + // Bonus for brawlers
  contextBonuses -            // Title fight, main event, rivalry
  (styleClash === 'Canceling' ? 15 : 0)  // Penalty for canceling styles
```

## Consistency Validation

Rule-based checks catch logical inconsistencies:

| Rule | Severity | Description |
|------|----------|-------------|
| LOW_PACE_BRAWL | Error | Low pace (1-2) but brawlPotential=true |
| CANCELING_HIGH_PACE | Warning | Canceling styles with high pace (4+) |
| HIGH_TECH_BRAWL | Warning | Maximum technicality with brawlPotential=true |
| INVALID_ATTRIBUTE | Error | Attribute value outside 1-5 range |
| LOW_CONFIDENCE | Warning | Confidence below 0.4 threshold |

If validation fails or confidence is low, an optional LLM critique (cheap model) can suggest corrections.

## Weight Class Base Rates

`weightClassRates.ts` provides statistical finish rate baselines:

| Weight Class | Baseline Finish Rate |
|--------------|---------------------|
| Heavyweight | 70% |
| Light Heavyweight | 58% |
| Middleweight | 52% |
| Welterweight | 48% |
| Lightweight | 50% |
| Featherweight | 52% |
| Bantamweight | 48% |
| Flyweight | 45% |
| Women's divisions | 45-52% |

## Integration Points

- **`unifiedPredictionService.ts`**: Orchestrates single LLM call, deterministic calculation, and validation
- **`unified-ai-predictions-runner.ts`**: Script for batch prediction generation
- **`bootstrap-calibration.ts`**: Script to initialize calibration from historical data
- **GitHub Actions**: `ai-predictions.yml` runs predictions daily at 1:30 AM UTC

## Calibration Infrastructure

The `../calibration/` module provides post-processing calibration:

### Platt Scaling (`plattScaling.ts`)

Transforms raw finish probabilities using log-odds logistic regression:

```typescript
// Convert probability to log-odds space for stable calibration
logit(p) = log(p / (1 - p))
calibrated = sigmoid(A * logit(raw_p) + B)
// A, B learned from historical prediction outcomes (516 DSPy evaluation fights)
```

**Trained Parameters:**
- A = 1.7034 (slope in log-odds space)
- B = -0.4888 (intercept)
- Training data: 516 UFC fights from 2024 with known outcomes
- Brier Score improvement: 5.8%
- ECE improvement: 77.2%

### Calibration Metrics (`metricsTracker.ts`)

Tracks prediction quality:
- **Brier Score**: Mean squared error (lower = better calibration)
- **ECE**: Expected Calibration Error
- **MCE**: Maximum Calibration Error
- **FOTN Correlation**: Fun score correlation with Fight of the Night awards

### Weak Supervision (`labelingFunctions.ts`)

Generates entertainment labels from fight statistics without manual annotation:

| Function | Signal | Label |
|----------|--------|-------|
| `quickFinishLabel` | First-round KO/SUB | HIGH |
| `bonusWinnerLabel` | FOTN/POTN awarded | HIGH (0.95 confidence) |
| `highActionLabel` | >15 strikes/min | HIGH |
| `knockdownDramaLabel` | 2+ knockdowns | HIGH |
| `decisionGrindLabel` | High control, low strikes | LOW |

### Database Models

- **`CalibrationParams`**: Stores Platt scaling parameters (A, B), training metadata, and metrics
- **`WeakSupervisionLabel`**: Stores generated entertainment labels per fight
- **`PredictionLog`**: Logs raw and calibrated predictions for future calibration refinement

## Embeddings & Hybrid Retrieval

The `../embeddings/` module provides semantic context retrieval for enriched predictions:

### Fighter Embeddings

Each fighter has a 1536-dimensional embedding (OpenAI `text-embedding-3-small`) stored in PostgreSQL via pgvector:
- Profile text summarizing fighting style, recent performance, notable attributes
- HNSW index for efficient cosine similarity search
- 4,451 fighters with embeddings in production

### Hybrid Retrieval (`hybridRetrieval.ts`)

Combines vector similarity with time-decay weighting for context chunk retrieval:

```sql
-- Database function: get_fighter_context_with_decay
-- Retrieves relevant context with recency scoring
relevance_score = 1.0 - cosine_distance(query_embedding, chunk_embedding)
recency_score = exp(-0.693 * age_days / half_life)
combined_score = 0.7 * relevance_score + 0.3 * recency_score
```

**Time Decay Half-Lives:**
| Content Type | Half-Life |
|-------------|-----------|
| news, training_camp | 30 days |
| analysis, injury | 90 days |
| fight_history | 180 days |
| career_stats | 365 days |

### Context Chunks (`FighterContextChunk`)

Stores enriched fighter context for retrieval:
- Recent news and training camp reports
- Fight analysis and injury reports
- Career statistics summaries
- Embedded for semantic search (vector column)

## UFC-Specific Statistics

All statistics displayed in prompts explicitly specify "UFC" (e.g., "UFC Finish Rate: 75%") to distinguish from career totals. Fighter statistics include:
- UFC finish rate and win method breakdown (KO/SUB/DEC percentages)
- UFC loss finish rate and loss method breakdown (vulnerability metrics)
- Strikes landed/absorbed per minute
- Takedown and submission averages
- Average fight time

---

*This file documents the unified AI prediction architecture for entertainment-focused MMA fight analysis.*
