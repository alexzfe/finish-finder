# AI Prompts Documentation

*This file documents AI prompt engineering patterns and implementations for MMA fight predictions.*

## Prompt Architecture

The system uses a **two-prompt architecture** for fight analysis:
- **Finish Probability**: Predicts likelihood of finish (KO/TKO/SUB) using 4-step reasoning chain with emphasis on defensive vulnerability metrics
- **Fun Score**: Rates entertainment potential (0-100) using holistic, narrative-driven analysis with concise 2-3 sentence reasoning

Both prompts use Temperature 0.3 for consistent, deterministic outputs and return structured JSON validated with TypeScript interfaces.

## Two-Step Chain Pattern

Key factors extraction uses a two-step chain (Solution 2) for 95-99% reliability:
1. **Main Analysis**: Generate finish/fun predictions without keyFactors in schema
2. **Extraction**: Use focused extraction prompt to pull 1-2 (finish) or 2-3 (fun) key factors from reasoning text

Implementation in `keyFactorsExtraction.ts`:
- `buildFinishKeyFactorsExtractionPrompt()`: Extracts 1-2 factors from finish reasoning
- `buildFunKeyFactorsExtractionPrompt()`: Extracts 2-3 factors from fun reasoning

## Finish Probability Prompt Design

Uses **4-step chain-of-thought reasoning** with defensive vulnerability emphasis (`finishProbabilityPrompt.ts`):
- **Step 1 - Defensive Vulnerability (MOST CRITICAL)**: UFC loss finish rate is PRIMARY indicator (60%+ = high vulnerability)
- **Step 2 - Offensive Finish Rates**: Match offensive strengths vs defensive weaknesses (KO artist vs high KO loss rate)
- **Step 3 - Weight Class Baseline**: Adjust for weight class base rates
- **Step 4 - Final Assessment**: Synthesize all factors, emphasizing vulnerable fighter + strong finisher = higher probability

Key principle: **Defense determines finish probability more than offense**. A durable fighter (low UFC loss finish rate) significantly reduces finish probability even against elite finishers.

**UFC-Specific Statistics Clarity**: All finish rate statistics displayed in prompts explicitly specify "UFC" (e.g., "UFC Finish Rate: 75%", "UFC Loss Finish Rate: 50%") to prevent viewer confusion about whether rates refer to UFC-only or career totals. LLM instructions require using "UFC" qualifier in generated reasoning (e.g., "100% UFC finish rate" not "100% finish rate").

## Fun Score Prompt Design

Uses **holistic scoring philosophy** instead of rigid checklist (`funScorePrompt.ts`):
- **Positive anchoring**: 90-100 range with real examples (Gaethje vs Chandler, Holloway vs Poirier)
- **Realistic thresholds**: 6.0+ pace = elite, 50%+ UFC finish = elite (calibrated to UFC averages)
- **Narrative focus**: "Start with MOST EXCITING aspect" - AI synthesizes 2-3 key factors into story
- **Concise reasoning**: 2-3 punchy sentences (reduced from 3-4) - direct and engaging
- **Explicit pace instruction**: "DO NOT mention pace unless exceptional (10.0+)"
- **Full scale usage**: Removes "Scores >80 should be rare" negative anchoring
- **UFC-Specific Statistics Clarity**: All finish rates labeled as "UFC Finish Rate" with explicit note that statistics are UFC-only, not career totals. LLM instructions require "UFC" qualifier in reasoning.

## Weight Class Base Rates

`weightClassRates.ts` provides statistical finish rate baselines by weight class, used for Bayesian-style adjustments in finish probability predictions.

## Integration Points

- **newPredictionService.ts**: Consumes all prompts, executes two-step chain (4 API calls: 2 main + 2 extraction)
- **API route** (`/api/db-events`): Exposes `funReasoning` field for narrative text, `funFactors` for bubble tags
- **Frontend modal** (`FightDetailsModal.tsx`): Displays fun reasoning as paragraph, key factors as styled bubbles

---

*This file was created as part of the 3-tier documentation system to document AI prompt engineering patterns.*
