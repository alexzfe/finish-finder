# AI Prediction — Domain Vocabulary

Terms used inside `src/lib/ai/`. Architecture concepts (module, seam, adapter) are in the team glossary; this file defines the *domain* names a Predictor module operates on.

## FightSnapshot

A validated, moment-in-time view of everything a **Predictor** needs to produce a **Prediction** for a single Fight. Built from Prisma rows by a single mapping function and validated at construction; downstream code never sees a raw DB row.

A FightSnapshot bundles three classes of data:

- **Hard stats** — Fighter columns the prompt formats (finish rates, striking metrics, etc.). The Prisma schema defaults these to `0`, so the snapshot mapper reads them as plain numbers. Snapshot construction fails loudly only on structural problems — empty Fighter name, empty event name, unknown archetype enum value — not on a Fighter who happens to have a 0 in every stat.
- **Soft context** — `entertainmentProfile` and `contextChunks`, attached when present. Optional forever — debutant Fighters won't have profiles.
- **Fight context** — weight class, title fight flag, main event flag.

## Predictor

The role that produces a Prediction from a FightSnapshot. Owns the LLM call (via an injected adapter), the deterministic finish-probability calculation, and the confidence post-processing. Does **not** know about Prisma — its inputs and outputs are domain objects, not DB rows.

A Predictor instance is parameterised by an LLM adapter; swapping providers means swapping adapters, never editing the Predictor.

## Prediction (the produced object)

The in-memory result returned by a Predictor — distinct from the Prisma `Prediction` row that's later persisted. Carries the user-facing fields (`funScore`, `finishProbability`, `keyFactors`, `confidence`) plus model metadata (model used, tokens, cost).

## PredictionVersion

A label saved with every persisted Prediction so evaluation can compare cohorts ("v3 was right 70% of the time, v4 is right 75%"). The version string is **bumped manually** by the developer when the prompt, the deterministic math, or the contract changes. Prior approach (hashing source files) was abandoned — too noisy. The current value lives as `PREDICTION_VERSION` in `scripts/generate-hybrid-predictions-all.ts`.

## Naming notes

- "Judgment" is an implementation trait of the current prompt strategy, not a domain concept. Don't reuse it in new module names — the math and the prompt may change, but a Predictor is still a Predictor.
- "Service" is avoided because it doesn't say what the thing does. Prefer role names: Predictor, Adapter, Snapshot.
