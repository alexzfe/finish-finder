# AI Prompts

The system predicts **entertainment value**, not fight outcomes:
- **Finish Probability (0-100%)**: Likelihood the fight ends via stoppage (KO/TKO/SUB) vs decision
- **Fun Score (0-100)**: How entertaining the fight will be for viewers

The system does NOT predict winners or methods.

## Active architecture

The active prediction service is **`hybridJudgmentService.ts`** (one file up, in `src/lib/ai/`). It makes a single LLM call per fight (OpenAI Structured Outputs or Anthropic Tool Use), reads back qualitative attributes, then computes the finish probability deterministically and uses the AI's `funScore` directly.

```
┌─────────────────────────────────────────────────────────────────┐
│                        INPUT DATA                                │
│ • Fighter stats (offense, defense, finish rates, vulnerability) │
│ • Weight class baseline finish rates                            │
│ • Fight context (title fight, main event, rankings)             │
│ • Optional: entertainment-profile context per fighter           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│             SINGLE LLM CALL (Structured Output)                  │
│ Multi-persona prompt (Statistician, Tape Watcher, Synthesizer)  │
├─────────────────────────────────────────────────────────────────┤
│ Output:                                                          │
│   • reasoning {}         - Step-by-step analysis                │
│   • finishAnalysis       - 1-2 sentence WHY finish              │
│   • funAnalysis          - 1-2 sentence WHY entertaining        │
│   • narrative            - Fight simulation story               │
│   • pace (1-5)                                                   │
│   • finishDanger (1-5)   - calibrated per weight class          │
│   • technicality (1-5)                                           │
│   • styleClash           - Complementary/Neutral/Canceling      │
│   • funScore (0-100)     - direct AI judgment                   │
│   • confidence (0-1)                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              DETERMINISTIC TYPESCRIPT CALCULATION                │
│   finishProbability =                                            │
│       weightClassBaseline × finishDangerMultiplier × styleMod    │
└─────────────────────────────────────────────────────────────────┘
```

## Files in this directory

| File | Purpose |
|------|---------|
| `hybridJudgmentPrompt.ts` | Active prompt template + types (`JudgmentPredictionInput`, `JudgmentPredictionOutput`, `FightAttributes`, `FighterStyle`, `classifyFighterStyle`) |
| `weightClassRates.ts` | Statistical finish-rate baselines used by both the prompt (for `finishDanger` calibration) and the deterministic finish-probability calculation |
| `index.ts` | Barrel re-exporting `weightClassRates`. The hybrid service imports from `./hybridJudgmentPrompt` directly. |

## Multi-Persona Analysis

The prompt uses three analytical perspectives:

1. **The Statistician** — pure numbers: vulnerability vs offense matchups, decision rates, weight-class baselines.
2. **The Tape Watcher** — fighting habits, tendencies, style interactions, cardio, chin reputation.
3. **The Synthesizer** — reconciles both views into final qualitative ratings.

## Qualitative Attributes

The LLM outputs qualitative ratings rather than raw probabilities:

| Attribute | Scale | Description |
|-----------|-------|-------------|
| `pace` | 1-5 | 1=Stalemate, 3=Average, 5=War |
| `finishDanger` | 1-5 | Calibrated per weight class (e.g., HW: 1=~21%, 3=~70%, 5=~95%) |
| `technicality` | 1-5 | 1=Pure chaos, 5=High-level chess |
| `styleClash` | enum | Complementary / Neutral / Canceling |
| `brawlPotential` | bool | Both fighters willing to stand and trade |
| `groundBattleLikely` | bool | Grappling exchange expected |

## Dynamic Probability Anchors

The `finishDanger` rating guide is computed from each weight class's baseline:

```typescript
// Example for Heavyweight (70% baseline)
finishDanger=1 → ~21% (baseline × 0.3)
finishDanger=2 → ~42% (baseline × 0.6)
finishDanger=3 → ~70% (baseline)
finishDanger=4 → ~85% (baseline × 1.3, capped at 85)
finishDanger=5 → ~95% (baseline × 1.6, capped at 95)
```

## Structured Output Mode

The service uses native structured-output features for guaranteed JSON compliance:

- **OpenAI**: Structured Outputs (`response_format: { type: 'json_schema' }`)
- **Anthropic**: Tool Use mode with JSON schema definition

## Deterministic Finish-Probability Calculation

```typescript
finishProbability =
  weightClassBaseline ×
  finishDangerMultiplier ×          // 0.4 (danger=1) to 1.2 (danger=5)
  styleClashModifier                 // Complementary 1.15, Neutral 1.0, Canceling 0.75
```

`funScore` comes directly from the model — there is no deterministic recomputation.

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

- **`../hybridJudgmentService.ts`** — active service
- **`scripts/generate-hybrid-predictions-all.ts`** — batch runner
- **GitHub Actions** — `.github/workflows/ai-predictions.yml` runs the runner daily at 4:30 AM UTC, after the scraper

## UFC-Specific Statistics

All statistics shown to the LLM are explicitly labeled "UFC" (e.g., "UFC Finish Rate: 75%") to distinguish from career totals. Fighter input includes:
- UFC finish rate and win-method breakdown (KO/SUB/DEC percentages)
- UFC loss-method breakdown (vulnerability metrics)
- Strikes landed/absorbed per minute
- Takedown and submission averages
- Average fight time
