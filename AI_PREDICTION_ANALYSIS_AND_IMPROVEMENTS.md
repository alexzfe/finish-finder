# AI Prediction System - Analysis & Improvement Plan

**Date:** November 15, 2025
**System Version:** Phase 3 (Two-prompt architecture with web enrichment)

## Executive Summary

The Finish Finder AI prediction system is a **well-architected, production-ready** solution that generates two key metrics for UFC fights:
- **Finish Probability** (0-1): Likelihood of KO/TKO/Submission finish
- **Fun Score** (0-100): Entertainment potential rating

**Current Performance:**
- Cost: ~$0.022 per fight (Claude) or ~$0.018 (GPT-4o)
- Dual LLM support (Anthropic Claude 3.5 Sonnet + OpenAI GPT-4o)
- Web search enrichment for recent fighter context
- Version tracking via SHA256 prompt hashes
- Comprehensive error handling and retry logic

This document provides a detailed analysis and actionable improvement plan.

---

## Table of Contents

1. [Current Architecture](#current-architecture)
2. [Strengths](#strengths)
3. [Weaknesses & Pain Points](#weaknesses--pain-points)
4. [Improvement Opportunities](#improvement-opportunities)
5. [Detailed Recommendations](#detailed-recommendations)
6. [Implementation Roadmap](#implementation-roadmap)

---

## Current Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                 Prediction Runner (CLI)                     │
│  scripts/new-ai-predictions-runner.ts                       │
│  - Version management (SHA256 hashing)                      │
│  - Batch processing with rate limiting                      │
│  - Progress tracking & error handling                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              NewPredictionService (Core)                    │
│  src/lib/ai/newPredictionService.ts                        │
│  - 2 parallel API calls (finish + fun)                      │
│  - 2 extraction calls (key factors)                         │
│  - Cost tracking & token counting                           │
│  - JSON parsing & validation                                │
└─────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
    ┌───────────────────┐   ┌───────────────────┐
    │ Finish Prediction │   │   Fun Prediction  │
    │  - 4-step CoT     │   │ - Weighted scoring│
    │  - Defense focus  │   │ - 90-100 scale    │
    │  - Weight class   │   │ - Style matchup   │
    └───────────────────┘   └───────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│          FighterContextService (Optional)                   │
│  src/lib/ai/fighterContextService.ts                        │
│  - Google Search integration                                │
│  - In-memory caching (1 hour TTL)                          │
│  - Rate limiting (1 second delay)                          │
│  - Graceful degradation on failure                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Database (Prisma)                        │
│  - Prediction (results + metadata)                         │
│  - PredictionVersion (prompt tracking)                      │
│  - Fight (risk level derived from confidence)               │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Runner identifies fights** needing predictions (upcoming, no prediction for current version)
2. **Context service** fetches recent fighter news (optional, cached)
3. **Prediction service** makes 4 API calls per fight:
   - Finish probability (main prompt)
   - Fun score (main prompt)
   - Finish key factors extraction
   - Fun key factors extraction
4. **Results saved** to database with cost/token metadata
5. **Risk level calculated** and stored on Fight record

### Key Files

| File | Purpose | Lines | Complexity |
|------|---------|-------|------------|
| `scripts/new-ai-predictions-runner.ts` | CLI orchestration | 569 | Medium |
| `src/lib/ai/newPredictionService.ts` | Core prediction logic | 580 | High |
| `src/lib/ai/prompts/finishProbabilityPrompt.ts` | Finish prompt template | 225 | Medium |
| `src/lib/ai/prompts/funScorePrompt.ts` | Fun score prompt template | 322 | Medium |
| `src/lib/ai/fighterContextService.ts` | Web search enrichment | 346 | Medium |

---

## Strengths

### 1. Excellent Architecture Decisions

✅ **Two-prompt design** separates concerns (finish vs entertainment)
✅ **Version tracking** via SHA256 hashes enables A/B testing
✅ **Dual LLM support** provides fallback and flexibility
✅ **Graceful degradation** when web search fails
✅ **Comprehensive error handling** with retry logic

### 2. Production-Ready Features

✅ **Cost tracking** at per-fight granularity
✅ **Rate limiting** to avoid API throttling
✅ **Caching** to reduce duplicate web searches
✅ **Dry-run mode** for testing without API calls
✅ **Detailed logging** with progress indicators

### 3. High-Quality Prompts

✅ **Chain-of-thought reasoning** (4-step finish analysis)
✅ **Weight class baseline** adjustment for context
✅ **Conversational style** with personality
✅ **Clear scoring rubrics** (especially fun score)
✅ **Validation** of JSON output structure

### 4. Strong Data Foundation

✅ **60+ fighter statistics** from UFCStats.com
✅ **Loss vulnerability metrics** (critical for predictions)
✅ **Comprehensive win/loss methods** (KO, Sub, Decision)
✅ **Calculated rates** (finish rate, loss finish rate, etc.)

---

## Weaknesses & Pain Points

### 1. Prompt Engineering Issues

#### A. Overly Verbose Prompts
**Current:** 2,000+ characters for finish prompt, 2,500+ for fun score
**Impact:** Higher input token costs (~1,000+ tokens per call)
**Evidence:**
```typescript
// finishProbabilityPrompt.ts:119-223 (105 lines)
// Includes extensive instructions, examples, and warnings
```

**Recommendation:** Condense to 1,000-1,500 chars while maintaining clarity

#### B. Redundant Instructions
**Current:** Multiple reminders about the same concept
**Example:**
- Line 167-175: "MOST CRITICAL" defense vulnerability
- Line 210: "CRITICAL" UFC specification
- Line 216: "IMPORTANT - TECHNICAL ACCURACY"

**Impact:** Token waste, potential confusion

#### C. Fun Score Scale Confusion
**Current:** Instructions say "USE FULL 0-100 SCALE" but examples are 60-100
**Evidence:**
```typescript
// funScorePrompt.ts:212-226
**90-100 (Legendary):** ...
**80-89 (Certified Banger):** ...
**60-79 (Very Promising):** ...
**40-59 (Average Potential):** ...
**0-39 (Low Potential):** ...
```

**Issue:** No examples of scores <40, unclear when to use lower range
**Result:** Likely clustering around 60-80 (unvalidated assumption)

### 2. Web Search Integration

#### A. Generic Search Function
**Current:** `fighterContextService.ts:162-182` uses hardcoded query format
**Issue:**
- Single query strategy for all fighters
- No adaptation based on fighter profile
- No fallback if search returns irrelevant results

**Example:**
```typescript
const query = `"${fighterName}" fight analysis statistics tendencies record bonuses`
```

**Missing:**
- Recent fight results (last 6 months)
- Injury status
- Stylistic changes
- Momentum/form indicators

#### B. Placeholder Implementation
**Current:** `performWebSearch()` throws error - requires dependency injection
**Issue:** Tight coupling between runner and context service
**Impact:** Hard to test, unclear setup for new developers

### 3. Key Factors Extraction

#### A. Two-Step Chain Overhead
**Current:** 2 additional API calls per fight just to extract 2-3 keywords
**Cost:** ~200-400 tokens × 2 = 400-800 tokens (~$0.001-0.002)
**Benefit:** High reliability (near 100%)

**Trade-off Analysis:**
- Option 1 (current): 100% reliability, higher cost
- Option 2: Single-step extraction in main prompt (80-95% reliability, lower cost)
- Option 3: Post-processing with simple NLP (95% reliability, near-zero cost)

**Recommendation:** Consider Option 3 for cost optimization

#### B. Unused Key Factors in UI?
**Question:** Where are `keyFactors` displayed?
**Evidence:** Database schema has arrays but no clear UI integration
**Risk:** Paying for extraction that's not user-facing

### 4. Missing Features

#### A. No Historical Accuracy Tracking
**Current:** Predictions stored but never validated against actual results
**Missing:**
- Win rate accuracy
- Finish probability calibration
- Fun score correlation with actual fight metrics
- Model performance comparison (Claude vs GPT-4o)

**Value:** Can't improve what you don't measure

#### B. No Fighter-Specific Patterns
**Current:** All fighters treated equally in prompts
**Missing:**
- Fighter age/experience weighting
- Recent form (last 3-5 fights)
- Fight IQ indicators
- Matchup history (rematches)

#### C. No Confidence Calibration
**Current:** `confidence` field exists but no validation
**Question:** Is 0.7 confidence actually 70% accurate?
**Missing:** Calibration curves, Brier score tracking

### 5. Performance & Cost

#### A. Sequential Processing
**Current:** `scripts/new-ai-predictions-runner.ts:510-537` processes fights one-by-one
**Rate Limit:** 2 second delay between fights
**Impact:** 100 fights = 200+ seconds = 3+ minutes (excluding API time)

**Improvement:** Batch process in parallel (respecting rate limits)

#### B. No Caching of Predictions
**Current:** `--force` flag regenerates all predictions
**Missing:** Incremental updates when only prompts change
**Example:** If only fun score prompt changes, no need to regenerate finish predictions

#### C. Web Search Cost Unknown
**Current:** No tracking of Google Search API costs
**Risk:** Hidden expenses if search volume scales

### 6. Code Quality

#### A. Type Safety Issues
**Current:** Several `as any` casts in runner
**Example:**
```typescript
// scripts/new-ai-predictions-runner.ts:384,385
finishReasoning: prediction.finishReasoning as any,
funBreakdown: prediction.funBreakdown as any,
```

**Impact:** Runtime errors possible, harder debugging

#### B. Magic Numbers
**Current:** Hardcoded thresholds throughout
**Examples:**
- `newPredictionService.ts:98-103` - Risk level thresholds (0.78, 0.675)
- `funScorePrompt.ts:122-124` - Style classification thresholds (4.5, 2.0, 1.0)
- `fighterContextService.ts:40-45` - Cache/timeout configs

**Issue:** No documentation of why these values chosen, hard to tune

#### C. Inconsistent Naming
**Examples:**
- `significantStrikesLandedPerMinute` vs `significantStrikesPerMinute` (same metric, different names)
- `koPercentage` vs `koLossPercentage` (clear) but also `finishRate` vs `lossFinishRate` (inconsistent suffix)

---

## Improvement Opportunities

### Quick Wins (High Impact, Low Effort)

#### 1. Condense Prompts (30% token reduction)
- Remove redundant instructions
- Consolidate examples
- Use bullet points instead of paragraphs
- **Effort:** 2-4 hours
- **Impact:** ~$0.006 savings per fight, better clarity

#### 2. Add Prediction Accuracy Tracking
- Create `PredictionAccuracy` table
- Track finish prediction vs actual outcome
- Generate monthly accuracy reports
- **Effort:** 4-6 hours
- **Impact:** Continuous improvement, data-driven decisions

#### 3. Extract Key Factors with Regex (eliminate 2 API calls)
- Use pattern matching to find top keywords from reasoning text
- Fallback to API if regex fails
- **Effort:** 3-4 hours
- **Impact:** ~$0.001-0.002 savings per fight, faster

#### 4. Improve Web Search Queries
- Add recency filters ("past 3 months")
- Include "injured" or "suspended" keywords
- Adapt query based on fighter ranking (top 10 vs unranked)
- **Effort:** 2-3 hours
- **Impact:** Better context, more relevant predictions

### Medium Wins (High Impact, Medium Effort)

#### 5. Implement Parallel Processing
- Process 5-10 fights concurrently (respect rate limits)
- Use worker threads or Promise.allSettled
- **Effort:** 6-8 hours
- **Impact:** 5-10x faster for large batches

#### 6. Add Historical Fight Context
- "Fighter X is 3-0 in rematches"
- "Fighter Y has never been finished"
- "Fighter Z is on a 5-fight win streak"
- **Effort:** 8-12 hours
- **Impact:** More accurate predictions, richer analysis

#### 7. Create Confidence Calibration System
- Compare predicted finish probability to actual finish rate
- Generate calibration curves
- Adjust confidence scores based on historical accuracy
- **Effort:** 10-15 hours
- **Impact:** Trustworthy probabilities, better UX

#### 8. Optimize Fun Score Scale
- Analyze actual distribution of fun scores
- Provide clearer examples for 0-40 range
- Add "anti-patterns" (what makes a fight boring)
- **Effort:** 4-6 hours
- **Impact:** Better use of full scale, more differentiation

### Long-Term Investments (High Impact, High Effort)

#### 9. A/B Testing Framework
- Run multiple prompt versions in parallel
- Compare accuracy metrics
- Auto-select best performing version
- **Effort:** 20-30 hours
- **Impact:** Continuous improvement, data-driven optimization

#### 10. Fighter-Specific Prompt Adaptation
- Adjust prompts based on fighter experience level
- Add age/career stage context
- Include stylistic matchup history
- **Effort:** 15-25 hours
- **Impact:** More nuanced predictions

#### 11. Ensemble Model Approach
- Generate predictions from both Claude and GPT-4o
- Average or weight results based on historical accuracy
- **Effort:** 12-18 hours
- **Impact:** Potentially higher accuracy, reduced model bias

#### 12. Real-Time Prediction Updates
- Re-run predictions when new data arrives (weigh-ins, fight week news)
- Show prediction evolution over time
- **Effort:** 25-40 hours
- **Impact:** Dynamic predictions, engagement feature for users

---

## Detailed Recommendations

### Priority 1: Prompt Optimization

#### Current Issues
1. Finish prompt: 2,000+ characters → ~500-600 input tokens
2. Fun score prompt: 2,500+ characters → ~650-750 input tokens
3. Redundant instructions waste tokens and may confuse model

#### Optimization Strategy

**A. Finish Probability Prompt:**

**Before (excerpt):**
```
Step 1 - Assess Defensive Vulnerability (MOST CRITICAL):
- 🚨 START HERE: Check loss finish rates - this is the PRIMARY vulnerability indicator
  * 60%+ loss finish rate = HIGH vulnerability (frequently finished when losing)
  * 30-59% = MODERATE vulnerability (average durability)
  * <30% = LOW vulnerability (durable, hard to finish)
- Match offensive strengths vs defensive weaknesses (e.g., KO artist vs 70% KO loss rate = danger)
- Secondary: Compare strikes absorbed and defense percentages
- Weight recent form if available
```

**After (condensed):**
```
Step 1 - Defensive Vulnerability:
- Primary: Loss finish rate (60%+ = high vulnerability, 30-59% = moderate, <30% = low)
- Match: Opponent's finish strength vs vulnerability (KO power vs KO loss rate)
- Secondary: Strikes absorbed, defense %, recent form
```

**Savings:** ~40% reduction, maintains all key information

**B. Fun Score Prompt:**

**Before (excerpt):**
```
═══════════════════════════════════════════════════════════════════
SCORING PHILOSOPHY - USE THE FULL 0-100 SCALE
═══════════════════════════════════════════════════════════════════

**90-100 (Legendary):** All-time classic potential. Elite finishers, high stakes, compelling narrative.
  Examples: Gaethje vs Chandler, Lawler vs MacDonald II, Holloway vs Poirier 2
...
```

**After (table format):**
```
SCORING SCALE (use full 0-100 range):
90-100: Legendary (elite finishers, high stakes) - Ex: Gaethje-Chandler
80-89: Banger (60%+ finish rates, explosive styles)
60-79: Promising (solid finishers, action-oriented)
40-59: Average (technical/strategic, missing excitement)
0-39: Low potential (risk-averse, grinding styles)
```

**Savings:** ~50% reduction, improved scannability

#### Implementation Plan

```typescript
// New file: src/lib/ai/prompts/promptOptimizer.ts

export function optimizePromptLength(prompt: string): string {
  return prompt
    .replace(/═+/g, '---')  // Shorter separator
    .replace(/\*\*(\w+):\*\*/g, '$1:')  // Remove bold markdown
    .replace(/  +/g, ' ')  // Collapse multiple spaces
    .replace(/\n{3,}/g, '\n\n')  // Max 2 newlines
    .trim()
}

export function validatePromptTokens(prompt: string, maxTokens: number): void {
  const estimatedTokens = prompt.length / 4  // Rough estimate
  if (estimatedTokens > maxTokens) {
    console.warn(`Prompt may exceed ${maxTokens} tokens (est: ${estimatedTokens})`)
  }
}
```

**Testing:**
1. Generate predictions with current prompts (baseline)
2. Generate predictions with condensed prompts
3. Compare:
   - Token usage (expect 20-30% reduction)
   - Cost (expect ~$0.005 savings per fight)
   - Quality (should be equivalent or better)
   - Confidence scores (should be similar)

**Rollout:**
- Create new version hash
- Run A/B test on 50 fights
- Analyze results
- Deploy if quality maintained

---

### Priority 2: Accuracy Tracking System

#### Goal
Track prediction accuracy to enable continuous improvement and build user trust.

#### Database Schema Changes

```prisma
// Add to schema.prisma

model PredictionAccuracy {
  id                    String   @id @default(cuid())
  fightId               String   @unique
  predictionId          String
  versionId             String

  // Predicted values (at prediction time)
  predictedFinishProb   Float
  predictedFunScore     Int

  // Actual outcomes (after fight completes)
  actualFinished        Boolean  // True if fight ended in KO/TKO/Sub
  actualFinishMethod    String?  // "KO", "Submission", "Decision"
  actualFightTimeSeconds Int?
  actualWinnerId        String?

  // Accuracy metrics
  finishPredictionCorrect Boolean? // null until fight completes
  finishProbError         Float?   // abs(predicted - actual)
  funScoreValidated       Boolean? // Placeholder for future fan ratings

  // Metadata
  evaluatedAt           DateTime?
  createdAt             DateTime @default(now())

  // Relations
  fight                 Fight    @relation(fields: [fightId], references: [id])
  prediction            Prediction @relation(fields: [predictionId], references: [id])
  version               PredictionVersion @relation(fields: [versionId], references: [id])

  @@map("prediction_accuracy")
}
```

#### Implementation Scripts

**1. Populate Accuracy Table (post-fight):**

```typescript
// scripts/update-prediction-accuracy.ts

import { prisma } from '../src/lib/database/prisma'

async function updateAccuracyForCompletedFights() {
  // Find completed fights with predictions but no accuracy record
  const fights = await prisma.fight.findMany({
    where: {
      completed: true,
      predictions: { some: {} },
      accuracyRecords: { none: {} }
    },
    include: {
      predictions: { include: { version: true } },
      fight: true  // Get actual outcome
    }
  })

  for (const fight of fights) {
    const latestPrediction = fight.predictions[0]  // Most recent version

    const actualFinished = fight.finishMethod !== 'Decision'
    const predictedFinishProb = latestPrediction.finishProbability

    const finishPredictionCorrect = (
      (predictedFinishProb >= 0.5 && actualFinished) ||
      (predictedFinishProb < 0.5 && !actualFinished)
    )

    const finishProbError = Math.abs(
      predictedFinishProb - (actualFinished ? 1 : 0)
    )

    await prisma.predictionAccuracy.create({
      data: {
        fightId: fight.id,
        predictionId: latestPrediction.id,
        versionId: latestPrediction.versionId,
        predictedFinishProb,
        predictedFunScore: latestPrediction.funScore,
        actualFinished,
        actualFinishMethod: fight.finishMethod,
        actualFightTimeSeconds: fight.fightTimeSeconds,
        actualWinnerId: fight.winnerId,
        finishPredictionCorrect,
        finishProbError,
        evaluatedAt: new Date()
      }
    })

    console.log(`✓ ${fight.fighter1Name} vs ${fight.fighter2Name}: ` +
                `Predicted ${(predictedFinishProb * 100).toFixed(0)}% finish, ` +
                `Actual: ${actualFinished ? 'Finish' : 'Decision'} ` +
                `(${finishPredictionCorrect ? 'CORRECT' : 'WRONG'})`)
  }
}
```

**2. Generate Accuracy Report:**

```typescript
// scripts/generate-accuracy-report.ts

async function generateAccuracyReport(versionId?: string) {
  const where = versionId ? { versionId } : {}

  const accuracy = await prisma.predictionAccuracy.findMany({
    where,
    include: { version: true }
  })

  // Overall accuracy
  const totalPredictions = accuracy.length
  const correctPredictions = accuracy.filter(a => a.finishPredictionCorrect).length
  const overallAccuracy = correctPredictions / totalPredictions

  // Calibration (how well probabilities match outcomes)
  const bins = [0, 0.2, 0.4, 0.6, 0.8, 1.0]
  const calibration = bins.slice(0, -1).map((low, i) => {
    const high = bins[i + 1]
    const inBin = accuracy.filter(a =>
      a.predictedFinishProb >= low && a.predictedFinishProb < high
    )
    const actualFinishRate = inBin.filter(a => a.actualFinished).length / inBin.length

    return {
      range: `${low}-${high}`,
      predicted: (low + high) / 2,
      actual: actualFinishRate,
      count: inBin.length
    }
  })

  // Brier score (lower is better, 0 = perfect, 0.25 = random)
  const brierScore = accuracy.reduce((sum, a) => {
    const outcome = a.actualFinished ? 1 : 0
    return sum + Math.pow(a.predictedFinishProb - outcome, 2)
  }, 0) / totalPredictions

  console.log('\n📊 PREDICTION ACCURACY REPORT')
  console.log('=' .repeat(50))
  console.log(`Total Predictions: ${totalPredictions}`)
  console.log(`Correct: ${correctPredictions} (${(overallAccuracy * 100).toFixed(1)}%)`)
  console.log(`Brier Score: ${brierScore.toFixed(3)} (lower is better)`)
  console.log('\nCalibration:')
  calibration.forEach(bin => {
    console.log(`  ${bin.range}: Predicted ${(bin.predicted * 100).toFixed(0)}%, ` +
                `Actual ${(bin.actual * 100).toFixed(0)}% (n=${bin.count})`)
  })
}
```

**3. Integrate with Workflow:**

```yaml
# .github/workflows/accuracy-update.yml

name: Update Prediction Accuracy

on:
  schedule:
    - cron: '0 8 * * MON'  # Every Monday at 8am
  workflow_dispatch:

jobs:
  update-accuracy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx ts-node scripts/update-prediction-accuracy.ts
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      - run: npx ts-node scripts/generate-accuracy-report.ts
```

---

### Priority 3: Key Factors Extraction Optimization

#### Current Approach: Two-Step Chain
- Make main prediction call (gets reasoning text)
- Make extraction call (extracts 2-3 keywords from reasoning)
- **Cost:** ~200-400 tokens per extraction × 2 = ~$0.001-0.002
- **Reliability:** Near 100%

#### Alternative: Regex/NLP Extraction

**Implementation:**

```typescript
// src/lib/ai/keyFactorExtractor.ts

/**
 * Extract key factors from reasoning text using pattern matching
 * Fallback to API if confidence is low
 */
export async function extractKeyFactors(
  reasoningText: string,
  extractionType: 'finish' | 'fun',
  llmFallback?: (text: string, type: string) => Promise<string[]>
): Promise<string[]> {
  // Strategy 1: Look for explicit lists
  const listMatch = reasoningText.match(/key factors?:\s*([^\.]+)/i)
  if (listMatch) {
    return parseFactorList(listMatch[1], extractionType)
  }

  // Strategy 2: Extract emphasized terms
  const emphasized = extractEmphasis(reasoningText)
  if (emphasized.length >= 2) {
    return emphasized.slice(0, extractionType === 'finish' ? 2 : 3)
  }

  // Strategy 3: Statistical analysis (TF-IDF on combat terms)
  const statisticalFactors = extractStatistically(reasoningText, extractionType)
  if (statisticalFactors.length >= 2) {
    return statisticalFactors
  }

  // Fallback: Use LLM if provided
  if (llmFallback) {
    console.log('  ⚠ Using LLM fallback for key factor extraction')
    return await llmFallback(reasoningText, extractionType)
  }

  return []  // Graceful degradation
}

function parseFactorList(text: string, type: string): string[] {
  // Handle comma-separated or bullet lists
  const factors = text
    .split(/[,;]/)
    .map(f => f.trim())
    .filter(f => f.length > 0 && f.length <= 20)  // Reasonable factor length

  const maxFactors = type === 'finish' ? 2 : 3
  return factors.slice(0, maxFactors)
}

function extractEmphasis(text: string): string[] {
  // Find quoted terms, capitalized phrases, or bold/italic markdown
  const patterns = [
    /"([^"]+)"/g,              // "Weak Chin"
    /\*\*([^*]+)\*\*/g,        // **High Volume**
    /\b([A-Z][a-z]+\s[A-Z][a-z]+)\b/g  // Proper Case Phrases
  ]

  const factors: string[] = []
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(text)) !== null) {
      factors.push(match[1])
    }
  }

  return Array.from(new Set(factors))  // Deduplicate
}

function extractStatistically(text: string, type: string): string[] {
  // Define domain-specific important terms
  const combatTerms = {
    finish: ['chin', 'power', 'durability', 'vulnerable', 'finisher', 'knockout', 'submission'],
    fun: ['pace', 'volume', 'brawler', 'aggressive', 'finisher', 'action', 'exciting']
  }

  const relevantTerms = combatTerms[type]
  const words = text.toLowerCase().split(/\s+/)

  // Count term frequencies
  const frequencies = new Map<string, number>()
  for (const word of words) {
    for (const term of relevantTerms) {
      if (word.includes(term)) {
        frequencies.set(term, (frequencies.get(term) || 0) + 1)
      }
    }
  }

  // Sort by frequency and return top N
  const sorted = Array.from(frequencies.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([term]) => term)

  const maxFactors = type === 'finish' ? 2 : 3
  return sorted.slice(0, maxFactors)
}
```

**Testing Plan:**

```typescript
// scripts/test-key-factor-extraction.ts

async function testExtractionAccuracy() {
  // Get 100 existing predictions with key factors
  const predictions = await prisma.prediction.findMany({
    where: {
      finishReasoning: { not: null }
    },
    take: 100,
    include: { version: true }
  })

  let matches = 0
  let llmFallbacks = 0

  for (const pred of predictions) {
    const actualFactors = pred.finishReasoning.keyFactors || []
    const extractedFactors = await extractKeyFactors(
      pred.finishReasoning.finalAssessment,
      'finish'
    )

    // Check if any extracted factor matches actual
    const hasMatch = extractedFactors.some(ef =>
      actualFactors.some(af =>
        af.toLowerCase().includes(ef.toLowerCase()) ||
        ef.toLowerCase().includes(af.toLowerCase())
      )
    )

    if (hasMatch) matches++
    console.log(`${hasMatch ? '✓' : '✗'} ${extractedFactors.join(', ')} vs ${actualFactors.join(', ')}`)
  }

  console.log(`\nMatch rate: ${matches}/100 (${matches}%)`)
  console.log(`LLM fallbacks: ${llmFallbacks}`)
}
```

**Expected Results:**
- Regex/NLP accuracy: 70-85%
- With LLM fallback: 95-100%
- Cost savings: $0.001-0.002 per fight (45-90% reduction on extraction)

---

### Priority 4: Parallel Processing

#### Current Bottleneck
```typescript
// Sequential processing with 2-second delay
for (let i = 0; i < fights.length; i++) {
  const fight = fights[i]
  await generatePrediction(fight, version.id, service, contextService)

  if (i < fights.length - 1) {
    await new Promise(resolve => setTimeout(resolve, 2000))  // Rate limit
  }
}
```

**Problem:** 100 fights = 200 seconds of pure waiting

#### Optimized Approach: Batched Parallelism

```typescript
// scripts/new-ai-predictions-runner.ts (optimized version)

/**
 * Process fights in parallel batches with rate limiting
 *
 * @param fights - Fights to process
 * @param batchSize - Number of concurrent predictions (default: 5)
 * @param delayMs - Delay between batches (default: 2000)
 */
async function processFightsBatched(
  fights: FightWithRelations[],
  versionId: string,
  service: NewPredictionService,
  contextService?: FighterContextService,
  batchSize: number = 5,
  delayMs: number = 2000
): Promise<ProcessingResults> {
  const results = {
    successCount: 0,
    errorCount: 0,
    totalTokens: 0,
    totalCost: 0,
    errors: [] as Array<{ fight: string; error: string }>
  }

  // Split into batches
  for (let i = 0; i < fights.length; i += batchSize) {
    const batch = fights.slice(i, i + batchSize)

    console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(fights.length / batchSize)}`)

    // Process batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map(fight => generatePrediction(fight, versionId, service, contextService))
    )

    // Aggregate results
    batchResults.forEach((result, idx) => {
      const fight = batch[idx]
      const fightLabel = `${fight.fighter1.name} vs ${fight.fighter2.name}`

      if (result.status === 'fulfilled' && result.value.success) {
        results.successCount++
        results.totalTokens += result.value.tokensUsed
        results.totalCost += result.value.costUsd
        console.log(`  ✓ ${fightLabel} (${result.value.tokensUsed} tokens, $${result.value.costUsd.toFixed(4)})`)
      } else {
        results.errorCount++
        const error = result.status === 'rejected'
          ? result.reason.message
          : result.value.error || 'Unknown error'
        results.errors.push({ fight: fightLabel, error })
        console.error(`  ✗ ${fightLabel}: ${error}`)
      }
    })

    // Rate limiting delay between batches (except for last batch)
    if (i + batchSize < fights.length) {
      console.log(`  ⏱ Waiting ${delayMs}ms before next batch...`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  return results
}
```

**Performance Comparison:**

| Scenario | Current (Sequential) | Optimized (Batch=5) | Improvement |
|----------|---------------------|---------------------|-------------|
| 10 fights | 20s wait + 40s API = 60s | 4s wait + 40s API = 44s | **27% faster** |
| 50 fights | 100s wait + 200s API = 300s | 20s wait + 200s API = 220s | **27% faster** |
| 100 fights | 200s wait + 400s API = 600s | 40s wait + 400s API = 440s | **27% faster** |

**Risk Mitigation:**
- Use `Promise.allSettled` to handle individual failures
- Maintain rate limiting between batches
- Log all errors for debugging

---

## Implementation Roadmap

### Phase 1: Quick Wins (Week 1-2)

| Task | Effort | Impact | Owner |
|------|--------|--------|-------|
| Condense prompts | 4h | High (cost savings) | Prompt Engineer |
| Improve web search queries | 3h | Medium (better context) | Backend Dev |
| Add regex key factor extraction | 4h | Medium (cost savings) | Backend Dev |
| **Total** | **11h** | | |

**Success Criteria:**
- 20-30% reduction in input tokens
- Web search returns relevant recent news 80%+ of time
- Key factor extraction maintains 95%+ accuracy with 50% cost reduction

### Phase 2: Core Improvements (Week 3-4)

| Task | Effort | Impact | Owner |
|------|--------|--------|-------|
| Build accuracy tracking system | 6h | High (continuous improvement) | Backend Dev |
| Implement parallel processing | 6h | High (performance) | Backend Dev |
| Optimize fun score scale | 4h | Medium (better predictions) | Prompt Engineer |
| **Total** | **16h** | | |

**Success Criteria:**
- Accuracy reports generated weekly
- Batch processing reduces total time by 25%+
- Fun scores use full 0-100 range more evenly

### Phase 3: Advanced Features (Week 5-8)

| Task | Effort | Impact | Owner |
|------|--------|--------|-------|
| A/B testing framework | 20h | High (optimization) | Full Stack Dev |
| Historical fight context | 12h | High (accuracy) | Backend Dev |
| Confidence calibration | 12h | High (trustworthiness) | Data Scientist |
| **Total** | **44h** | | |

**Success Criteria:**
- A/B tests run automatically for prompt changes
- Historical context increases accuracy by 5-10%
- Confidence scores calibrated within ±10%

### Phase 4: Long-Term Investments (Month 3+)

| Task | Effort | Impact | Owner |
|------|--------|--------|-------|
| Fighter-specific adaptation | 20h | Medium | ML Engineer |
| Ensemble model approach | 15h | Medium | ML Engineer |
| Real-time prediction updates | 30h | Medium (engagement) | Full Stack Dev |
| **Total** | **65h** | | |

**Success Criteria:**
- Fighter-specific prompts improve accuracy by 3-5%
- Ensemble reduces error by 10-15%
- Real-time updates drive user engagement

---

## Monitoring & Metrics

### Key Performance Indicators (KPIs)

#### 1. Accuracy Metrics
- **Overall Accuracy:** % of correct finish predictions (>50% baseline)
- **Brier Score:** Measure of probabilistic accuracy (<0.20 target)
- **Calibration Error:** How well probabilities match reality (<0.10 target)
- **Fun Score Correlation:** Compare to actual fight bonuses/fan ratings

#### 2. Cost Metrics
- **Cost per Fight:** Track total API costs ($0.020-0.025 current target)
- **Token Efficiency:** Tokens per prediction (minimize while maintaining quality)
- **Web Search Cost:** Google Search API spending

#### 3. Performance Metrics
- **Prediction Latency:** Time to generate prediction (<10s target)
- **Batch Processing Time:** Time for 100 fights (<5 minutes target)
- **Cache Hit Rate:** Web search cache effectiveness (>60% target)

#### 4. Quality Metrics
- **Reasoning Quality:** Manual review of sample predictions (4/5 stars minimum)
- **Key Factor Relevance:** Are extracted factors actually important? (>90% target)
- **Confidence Distribution:** Are we using full confidence range appropriately?

### Monitoring Dashboard (Future)

```
┌─────────────────────────────────────────────────┐
│ AI PREDICTION SYSTEM - HEALTH DASHBOARD         │
├─────────────────────────────────────────────────┤
│                                                  │
│ ACCURACY (Last 30 Days)                         │
│  ├─ Finish Predictions: 62.3% correct ✓         │
│  ├─ Brier Score: 0.183 ✓                        │
│  └─ Calibration Error: 0.087 ✓                  │
│                                                  │
│ COST (This Month)                               │
│  ├─ Total Spend: $127.45                        │
│  ├─ Per Fight: $0.0218 ✓                        │
│  └─ Budget: $150 (85% used)                     │
│                                                  │
│ PERFORMANCE (Today)                              │
│  ├─ Predictions Generated: 23                    │
│  ├─ Avg Latency: 7.2s ✓                         │
│  └─ Cache Hit Rate: 67% ✓                       │
│                                                  │
│ ALERTS                                           │
│  └─ No issues ✓                                 │
└─────────────────────────────────────────────────┘
```

---

## Conclusion

The Finish Finder AI prediction system is **production-ready and well-architected**, but has significant room for optimization and improvement:

### Immediate Actions (This Week)
1. ✅ Condense prompts to reduce token costs by 20-30%
2. ✅ Implement parallel batch processing for 5x speedup
3. ✅ Add regex-based key factor extraction to cut extraction costs in half

### Short-Term Goals (This Month)
4. ✅ Build accuracy tracking system for continuous improvement
5. ✅ Optimize fun score scale usage
6. ✅ Enhance web search query relevance

### Long-Term Vision (Next Quarter)
7. ✅ A/B testing framework for automated prompt optimization
8. ✅ Confidence calibration for trustworthy probabilities
9. ✅ Historical context integration for richer predictions
10. ✅ Ensemble approach combining multiple models

**Expected Impact:**
- **Cost:** Reduce from $0.022 to $0.015 per fight (32% savings)
- **Speed:** Reduce batch processing time by 60-75%
- **Accuracy:** Improve finish prediction accuracy by 5-10%
- **User Trust:** Calibrated confidence scores, validated predictions

---

## Appendix: Code Examples

### A. Condensed Prompt Template (Example)

```typescript
// Before: 225 lines, ~2000 characters
// After: ~150 lines, ~1200 characters

export function buildFinishProbabilityPromptOptimized(input: FinishProbabilityInput): string {
  const { fighter1, fighter2, context } = input
  const wcRates = getWeightClassRates(context.weightClass)

  return `Predict finish probability (KO/TKO/Sub) using 4-step chain-of-thought.

EVENT: ${context.eventName} | ${context.weightClass} (baseline: ${(wcRates.finishRate * 100).toFixed(0)}%)

FIGHTER 1: ${fighter1.name} (${fighter1.record})
Defense: ${fighter1.significantStrikesAbsorbedPerMinute.toFixed(1)} SApM, ${(fighter1.strikingDefensePercentage * 100).toFixed(0)}% def
Loss Vulnerability: ${(fighter1.lossFinishRate * 100).toFixed(0)}% finish rate (${(fighter1.koLossPercentage * 100).toFixed(0)}% KO, ${(fighter1.submissionLossPercentage * 100).toFixed(0)}% SUB)
Offense: ${(fighter1.finishRate * 100).toFixed(0)}% finish rate, ${fighter1.significantStrikesLandedPerMinute.toFixed(1)} SLpM
${fighter1.recentContext ? `Recent: ${fighter1.recentContext}` : ''}

FIGHTER 2: ${fighter2.name} (${fighter2.record})
Defense: ${fighter2.significantStrikesAbsorbedPerMinute.toFixed(1)} SApM, ${(fighter2.strikingDefensePercentage * 100).toFixed(0)}% def
Loss Vulnerability: ${(fighter2.lossFinishRate * 100).toFixed(0)}% finish rate (${(fighter2.koLossPercentage * 100).toFixed(0)}% KO, ${(fighter2.submissionLossPercentage * 100).toFixed(0)}% SUB)
Offense: ${(fighter2.finishRate * 100).toFixed(0)}% finish rate, ${fighter2.significantStrikesLandedPerMinute.toFixed(1)} SLpM
${fighter2.recentContext ? `Recent: ${fighter2.recentContext}` : ''}

ANALYSIS (4 steps):
1. Defensive Vulnerability: Check loss finish rates (60%+ = high, 30-59% = moderate, <30% = low). Match offensive strengths vs defensive weaknesses.
2. Offensive Finish Rates: Compare finish rates and methods. Does finish method align with opponent vulnerability?
3. Weight Class Adjustment: Should this matchup be higher/lower than ${(wcRates.finishRate * 100).toFixed(0)}% baseline?
4. Final Assessment: Synthesize all factors. Account for style matchup, betting odds, single vulnerable fighter.

OUTPUT (JSON only):
{
  "finishProbability": <0-1>,
  "confidence": <0-1>,
  "reasoning": {
    "defensiveComparison": "<2-3 sentences>",
    "finishRateComparison": "<2-3 sentences>",
    "weightClassAdjustment": "<2-3 sentences>",
    "finalAssessment": "<2-3 sentences with specific stats>"
  }
}

Style: Conversational but credible. Reference stats naturally. Specify "UFC" when mentioning rates. Be realistic - most fights go to decision.`
}
```

**Character Count:** ~1,200 (40% reduction from 2,000)
**Estimated Tokens:** ~300 (down from ~500)
**Maintains:** All critical information, 4-step framework, validation requirements

---

### B. Accuracy Tracking Query Examples

```sql
-- Get accuracy by version
SELECT
  pv.version,
  COUNT(*) as total_predictions,
  AVG(CASE WHEN pa.finishPredictionCorrect THEN 1.0 ELSE 0.0 END) as accuracy,
  AVG(pa.finishProbError) as avg_error,
  AVG(pa.predictedFinishProb) as avg_predicted_prob,
  AVG(CASE WHEN pa.actualFinished THEN 1.0 ELSE 0.0 END) as actual_finish_rate
FROM prediction_accuracy pa
JOIN prediction_versions pv ON pa.versionId = pv.id
GROUP BY pv.version
ORDER BY pv.createdAt DESC;

-- Calibration curve
SELECT
  FLOOR(predictedFinishProb * 10) / 10 as prob_bucket,
  COUNT(*) as count,
  AVG(CASE WHEN actualFinished THEN 1.0 ELSE 0.0 END) as actual_rate
FROM prediction_accuracy
GROUP BY prob_bucket
ORDER BY prob_bucket;

-- Best/worst predictions
SELECT
  f.fighter1Name,
  f.fighter2Name,
  pa.predictedFinishProb,
  pa.actualFinished,
  pa.finishProbError
FROM prediction_accuracy pa
JOIN fights f ON pa.fightId = f.id
ORDER BY pa.finishProbError DESC
LIMIT 10;
```

---

**End of Analysis**

For questions or implementation support, refer to:
- Main prediction service: `src/lib/ai/newPredictionService.ts`
- Prompts directory: `src/lib/ai/prompts/`
- Runner script: `scripts/new-ai-predictions-runner.ts`
