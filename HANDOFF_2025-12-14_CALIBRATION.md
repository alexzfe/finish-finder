# Engineering Handoff: Platt Scaling Calibration & Hybrid Retrieval

**Date:** 2025-12-14
**Session Focus:** Training Platt scaling from DSPy data, creating hybrid retrieval database function

---

## Summary

This session completed the calibration pipeline for the AI prediction system by:
1. Training Platt scaling parameters from 516 historical UFC fights
2. Creating the missing `get_fighter_context_with_decay` database function
3. Testing the full enhanced prediction pipeline

---

## What Was Accomplished

### 1. Platt Scaling Training

**Problem:** The `EnhancedPredictionService` loaded calibration parameters but none existed in the database.

**Solution:** Created `scripts/train-platt-from-dspy.ts` to train Platt scaling from existing DSPy evaluation data.

**Key Details:**
- Training data: 516 UFC fights from 2024 (all 12 months)
- Data source: `data/dspy/monthly/2024-*_eval.json` files
- Uses log-odds transformation for stable probability calibration

**Trained Parameters:**
```
A = 1.7034 (slope in log-odds space)
B = -0.4888 (intercept)
Valid: 2025-12-15 to 2026-12-15
```

**Calibration Improvements:**
| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Brier Score | 0.2257 | 0.2127 | +5.8% |
| ECE | 0.0917 | 0.0210 | +77.2% |
| Accuracy | 54.3% | 66.1% | +11.8% |

**Example Transformations:**
```
25% raw → 8.6% calibrated
50% raw → 38.0% calibrated
65% raw → 63.8% calibrated
85% raw → 92.2% calibrated
```

### 2. Updated Platt Scaling Formula

**Modified:** `src/lib/ai/calibration/plattScaling.ts`

**Old Formula (unstable for probability inputs):**
```typescript
calibrated = 1 / (1 + exp(A * raw_p + B))
```

**New Formula (log-odds transformation):**
```typescript
logit(p) = log(p / (1 - p))
calibrated = sigmoid(A * logit(raw_p) + B)
```

This is more stable because:
- Standard Platt scaling expects raw SVM scores, not probabilities
- Log-odds transformation maps [0,1] to (-∞, +∞) before fitting
- Prevents gradient descent divergence

### 3. Database Function: `get_fighter_context_with_decay`

**Problem:** Hybrid retrieval was failing with error:
```
function get_fighter_context_with_decay(text, vector, text[], bigint, bigint) does not exist
```

**Solution:** Created the function in production database.

**Location:** `prisma/migrations/manual/create_context_decay_function.sql`

**Function Signature:**
```sql
get_fighter_context_with_decay(
  p_fighter_id TEXT,
  p_query_embedding vector(1536),
  p_content_types TEXT[],
  p_max_age_days BIGINT,
  p_limit BIGINT
) RETURNS TABLE (...)
```

**Features:**
- Vector similarity search using pgvector cosine distance
- Time-decay weighting with content-type-specific half-lives
- Combined score: 70% relevance + 30% recency

**Time Decay Half-Lives:**
| Content Type | Half-Life |
|-------------|-----------|
| news, training_camp | 30 days |
| analysis, injury | 90 days |
| fight_history | 180 days |
| career_stats | 365 days |

### 4. Added Embedding Column to Context Chunks

The `fighter_context_chunks` table was missing the `embedding` column:
```sql
ALTER TABLE fighter_context_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS fighter_context_chunks_embedding_idx
  ON fighter_context_chunks USING hnsw (embedding vector_cosine_ops);
```

---

## Files Created/Modified

### New Files
| File | Purpose |
|------|---------|
| `scripts/train-platt-from-dspy.ts` | Train Platt scaling from DSPy evaluation data |
| `prisma/migrations/manual/create_context_decay_function.sql` | Hybrid retrieval DB function |

### Modified Files
| File | Changes |
|------|---------|
| `src/lib/ai/calibration/plattScaling.ts` | Updated formula to use log-odds transformation |
| `src/lib/ai/prompts/CONTEXT.md` | Documented calibration and embeddings |
| `docs/ai-context/project-structure.md` | Updated file tree and models |

---

## Database State

**Production Database:** `postgresql://postgres.niaiixwcxvkohtsmatvc:***@aws-1-us-east-1.pooler.supabase.com:5432/postgres`

**Calibration Parameters Stored:**
```sql
SELECT * FROM calibration_params WHERE prediction_type = 'finish' AND active = true;
-- ID: cmj6e15ff0000ijvg41jwzsr7
-- param_a: 1.7034
-- param_b: -0.4888
-- trained_on: 516 fights
-- valid_from: 2025-12-15
-- valid_to: 2026-12-15
```

**Database Function Created:**
- `get_fighter_context_with_decay` - deployed and working

**Fighter Context Chunks:**
- Table exists with embedding column
- Currently 0 rows (context chunks not yet populated)
- System falls back gracefully with "medium" context quality

---

## Test Results

**Test Command:**
```bash
DATABASE_URL="postgresql://..." OPENAI_API_KEY="..." npx ts-node scripts/test-enhanced-prediction.ts
```

**Output:**
```
Fight: Jackson McVey vs Robert Valentin
Event: UFC Fight Night: Bonfim vs. Brown

Finish Probability: 46.3% (calibrated from ~55% raw)
  Calibration Applied: true

Fun Score: 25
  Confidence: 70%

Context Quality: medium
Model: gpt-4o
Cost: $0.0174
```

---

## Remaining Gaps

| Gap | Status | Notes |
|-----|--------|-------|
| ✅ Platt Scaling | Complete | Trained, saved, working |
| ✅ DB Function | Complete | Deployed, tested |
| ❌ Conformal Intervals | Cannot train | Need actual fun score ratings |
| ⚠️ Context Chunks | Empty | `fighter_context_chunks` has 0 rows |

### About Conformal Prediction
Conformal prediction intervals for fun score require `(predicted_fun_score, actual_fun_score)` pairs. We don't collect actual entertainment ratings from users, so this cannot be trained. The system works without it.

### About Context Chunks
The `fighter_context_chunks` table is empty because:
- No news/analysis ingestion pipeline exists yet
- System falls back to fighter profile embeddings only
- Context quality shows "medium" instead of "high"

---

## How to Re-run Calibration

If you need to retrain Platt scaling (e.g., with new data):

```bash
# Generate new DSPy evaluation data (optional)
DATABASE_URL="..." OPENAI_API_KEY="..." npx ts-node scripts/generate-dspy-eval-by-month.ts --year 2025 --month 1

# Train Platt scaling
DATABASE_URL="..." npx ts-node scripts/train-platt-from-dspy.ts
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    EnhancedPredictionService                     │
├─────────────────────────────────────────────────────────────────┤
│ 1. Load Platt params from DB (A=1.7034, B=-0.4888)              │
│ 2. Get enriched context via hybrid retrieval                     │
│    └─ get_fighter_context_with_decay() SQL function             │
│ 3. Call base prediction service                                  │
│ 4. Apply Platt scaling: sigmoid(A * logit(raw) + B)             │
│ 5. Return calibrated prediction                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Next Steps (Suggested)

1. **Populate Context Chunks** - Build pipeline to ingest fighter news/analysis
2. **Monitor Calibration** - Track Brier score on new predictions
3. **Recalibrate Quarterly** - Retrain as more outcome data accumulates
4. **Consider Fun Score Collection** - If user ratings added, enable conformal intervals

---

*Handoff prepared: 2025-12-14*
