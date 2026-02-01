# AI Prediction System - Research Findings

> **Research Period**: 2024-2025 | **Budget Constraint**: $0.01/prediction

## Executive Summary

This document consolidates research findings for improving the MMA entertainment prediction system. Key areas: probability calibration, prompt engineering, RAG architectures, and validation methods.

---

## 1. Probability Calibration

### The Problem

LLMs are systematically overconfident when verbalizing probabilities (ICLR 2024, "Can LLMs Express Their Uncertainty?").

### Solution: Platt Scaling

**For finish probabilities** (binary classification):

```python
def platt_calibrate(raw_prob, A, B):
    logit = np.log(raw_prob / (1 - raw_prob + 1e-10))
    return 1 / (1 + np.exp(-(A * logit + B)))

# Typical parameters with ~100 fights:
# A ≈ 1.2-1.5 (compression factor)
# B ≈ -0.1 to 0.1 (bias correction)
```

**Impact**: 40-60% reduction in Expected Calibration Error.

### For Fun Scores (Continuous)

Use **Conformal Prediction** for 0-100 continuous outputs:
- Provides prediction intervals with guaranteed coverage
- Non-parametric approach works with small samples
- Adapts to local density (wider intervals where data is sparse)

### Target Metrics

| Metric | Target | Interpretation |
|--------|--------|----------------|
| **Brier Score** | < 0.20 | Overall accuracy |
| **ECE** | < 0.10 | Calibration quality |
| **MCE** | < 0.15 | Worst-case bin error |

---

## 2. Prompt Engineering

### Scale Design (5-point vs 10-point)

Research (Thomson Reuters 2024, "Likert or Not") shows **5-point scales** achieve optimal balance:

```
FINISH LIKELIHOOD:
1 = Very Unlikely (~5%)
2 = Unlikely (~20%)
3 = Possible (~45%)
4 = Likely (~70%)
5 = Very Likely (~90%)
```

### Few-Shot Anchoring

Include 3-5 reference examples in every prompt:

| Rating | Example |
|--------|---------|
| 5/5 | "Gaethje vs Chandler - non-stop action, FOTN" |
| 3/5 | "Standard competitive 3-round fight" |
| 1/5 | "One-sided grappling, minimal striking" |

### JSON Output Ordering

Optimal order: `{ reasoning, narrative, attributes, keyFactors, confidence }`

Reasoning first forces the model to think before outputting.

---

## 3. RAG Architecture

### Pre-computed Fighter Profiles

For batch processing, **pre-compute fighter profiles weekly** rather than dynamic retrieval:

```
Weekly Batch:
1. Scrape new fighter data
2. Generate embedding profiles
3. Store in pgvector
4. Batch predictions use cached profiles
```

### Hybrid Retrieval Stack

Use PostgreSQL with **pgvector** for both structured and vector search:

```sql
-- HNSW index for fast similarity
CREATE INDEX ON fighter_profiles 
USING hnsw (embedding vector_cosine_ops);
```

### Retrieval Strategy

1. **Retrieve**: 20 similar fighters via vector similarity
2. **Rerank**: Top 3 most relevant (reduces tokens)
3. **Inject**: Into prediction prompt as context

---

## 4. Context Ingestion

### Multi-Source Strategy

| Source | Use Case | Priority |
|--------|----------|----------|
| **UFCStats.com** | Fighter statistics | Primary |
| **ESPN API** | Fighter images | High |
| **Wikipedia** | Event info, cross-reference | Medium |
| **Brave Search** | Recent news, context | Low |

### Embedding Strategy

**Use pgvector for narrative text, NOT raw stats** (numbers don't embed semantically):

- ✅ Fighter biographies, fight narratives
- ❌ Win/loss records, strike counts

### Caching Strategy

```typescript
// Fighter context caching
const CACHE_TTL = 3600; // 1 hour

async function getFighterContext(name: string) {
  const cached = await cache.get(`fighter:${name}`);
  if (cached) return cached;
  
  const context = await fetchFromAPIs(name);
  await cache.set(`fighter:${name}`, context, CACHE_TTL);
  return context;
}
```

---

## 5. Validation Methods

### Structured Outputs

Use provider Tool Use/Structured Outputs for guaranteed JSON:

```typescript
// OpenAI Structured Output
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [...],
  response_format: { type: "json_object" }
});
```

### Rule-Based Validation

Post-process AI outputs with deterministic checks:

```typescript
function validatePrediction(pred: Prediction) {
  // Confidence bounds
  if (pred.finishProbability < 0 || pred.finishProbability > 1)
    throw new Error("Invalid probability");
  
  // Consistency checks
  if (pred.funScore > 80 && pred.finishProbability < 0.3)
    console.warn("High fun + low finish - unusual combination");
}
```

---

## 6. Ensemble Methods

### Persona Variation

Don't repeat identical prompts. Vary persona emphasis:

```typescript
const personas = [
  "Expert MMA analyst focusing on grappling",
  "Striking specialist evaluating standup",
  "Entertainment-focused analyst for casual fans"
];

// Run 3 predictions with different personas
// Average results for ensemble prediction
```

### Cost-Effective Ensemble

At $0.01/prediction budget:
- 1 primary prediction (GPT-4o): $0.008
- 2 validation critiques (GPT-4o-mini): $0.002
- Total: $0.01 per fight

---

## 7. Implementation Priorities

### Phase 1: Zero Cost (Immediate)
- [ ] Add dynamic probability anchors to prompts
- [ ] Create few-shot anchor examples
- [ ] Reorder JSON output (reasoning first)
- [ ] Request decimal probabilities (0.00-1.00)

### Phase 2: Calibration (1-2 weeks)
- [ ] Implement Platt scaling for finish probability
- [ ] Add Conformal Prediction for fun scores
- [ ] Create calibration dashboard
- [ ] Set up rolling window recalibration

### Phase 3: RAG (2-4 weeks)
- [ ] Set up pgvector for embeddings
- [ ] Create fighter profile pipeline
- [ ] Implement similarity search
- [ ] Add retrieval to prediction flow

### Phase 4: Validation (Ongoing)
- [ ] Add structured output mode
- [ ] Implement rule-based validation
- [ ] Create accuracy tracking
- [ ] Build evaluation dashboard

---

## 8. Key Research Papers

| Paper | Year | Key Finding |
|-------|------|-------------|
| "Can LLMs Express Their Uncertainty?" | ICLR 2024 | LLMs overconfident; use 0-1 scale |
| "Calibrate Before Use" (Zhao et al.) | 2024 | Few-shot anchoring reduces drift |
| "Leveraging Log Probabilities" | Jan 2025 | Brier scores < 0.20 achievable |
| "Likert or Not" (Thomson Reuters) | 2024 | 5-point scales optimal |

---

## 9. Budget-Constrained Recommendations

At $0.01/prediction with 50-100 fights/month:

| Technique | Cost | Impact | Priority |
|-----------|------|--------|----------|
| Platt scaling | $0 | High | ⭐⭐⭐ |
| Few-shot prompts | $0 | Medium | ⭐⭐⭐ |
| 5-point scales | $0 | Medium | ⭐⭐ |
| pgvector RAG | $0 (infra) | Medium | ⭐⭐ |
| Ensembles | 3x cost | Low | ⭐ |
| Fine-tuning | High | ? | ⭐ |

---

**Last Updated**: 2026-02-01
**Sources**: prediction_agent_research.md, context-ingestion-research.md
