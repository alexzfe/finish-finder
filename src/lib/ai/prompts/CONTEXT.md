# AI Prompts

The system predicts **entertainment value**, not fight outcomes:
- **Finish Probability (0-100%)**: Likelihood the fight ends via stoppage (KO/TKO/SUB) vs decision
- **Fun Score (1-10)**: Integer entertainment rating for viewers

The system does NOT predict winners or methods.

## Active architecture

The active producer is **`Predictor`** (`src/lib/ai/predictor.ts`). The Predictor is parameterised by an **LLMAdapter** (`src/lib/ai/adapters/`) and consumes a **FightSnapshot** (`src/lib/ai/snapshot.ts`). It makes a single LLM call per fight, reads back qualitative attributes, computes the finish probability deterministically (`src/lib/ai/math/finishProbability.ts`), and uses the AI's `funScore` directly.

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
├─────────────────────────────────────────────────────────────────┤
│ Output:                                                          │
│   • attributes:           pace, finishDanger, technicality (1-5),│
│                           styleClash, brawlPotential,            │
│                           groundBattleLikely                     │
│   • funScore (1-10 int)  - direct AI judgment                   │
│   • keyFactors           - 3-5 short phrases                    │
│   • confidence (0-1)     - the model's stated certainty         │
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
| `hybridJudgmentPrompt.ts` | Prompt template (`buildJudgmentPredictionPrompt(snapshot)`) + LLM-output type (`JudgmentPredictionOutput`), `FightAttributes`, `FighterStyle`, `classifyFighterStyle` |
| `judgmentResponseSchema.ts` | The `StructuredOutputSchema` paired with the prompt — passed through to whichever `LLMAdapter` runs the call |
| `weightClassRates.ts` | Statistical finish-rate baselines used both inside the prompt (for `finishDanger` calibration) and by `math/finishProbability.ts` |
| `index.ts` | Barrel re-export |

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

`JUDGMENT_RESPONSE_SCHEMA` is one JSON-Schema object reused by every adapter:

- **OpenAIAdapter**: passes it inside `response_format: { type: 'json_schema' }`
- **AnthropicAdapter**: passes it inside a Tool Use definition
- **FakeAdapter**: ignores it; tests script the response directly

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

- **`../predictor.ts`** — the Predictor that consumes this prompt
- **`../adapters/`** — the LLMAdapter implementations the Predictor injects
- **`scripts/generate-hybrid-predictions-all.ts`** — batch runner
- **GitHub Actions** — `.github/workflows/ai-predictions.yml` runs the runner daily at 4:30 AM UTC, after the scraper

## UFC-Specific Statistics

All statistics shown to the LLM are explicitly labeled "UFC" (e.g., "UFC Finish Rate: 75%") to distinguish from career totals. Fighter input includes:
- UFC finish rate and win-method breakdown (KO/SUB/DEC percentages)
- UFC loss-method breakdown (vulnerability metrics)
- Strikes landed/absorbed per minute
- Takedown and submission averages
- Average fight time
