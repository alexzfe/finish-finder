# Finish Finder - Claude Context

## Current Project State

### AI Predictions
The active prediction path is `Predictor` + an `LLMAdapter` (OpenAI/Anthropic) → `PredictionStore`. See `ARCHITECTURE.md` for the data-flow description.

- **Finish Probability** (0-1): deterministic, computed in `src/lib/ai/math/finishProbability.ts` from the qualitative attributes the LLM returns and the per-weight-class baseline.
- **Fun Score** (1-10 integer): direct AI judgment, no recomputation.
- **Confidence** (0-1): the model's stated certainty, used to display uncertainty in the UI. Replaces the old `riskLevel`.
- **Model**: OpenAI GPT-4o (default) via `OpenAIAdapter`. `AnthropicAdapter` exists for swap-out.
- **Runner**: `scripts/generate-hybrid-predictions-all.ts` (`npm run predict:all`); GitHub Actions daily at 4:30 AM UTC (after scraper).
- **Versioning**: `PREDICTION_VERSION` constant in the runner, bumped manually whenever the prompt, deterministic math, or output contract changes.

### Fighter Image Backfill
Images come from ESPN headshots (Wikipedia as fallback). Backfill script: `scraper/scripts/backfill_fighter_images.py`.

---

## Handy Recon (use if needed; otherwise ask once for minimal paths/outputs)
- `git status -sb && git branch --show-current && git describe --tags --always || true`
- `command -v tree >/dev/null && tree -a -I 'node_modules|.git|dist|build|venv|.venv|target|.next|.turbo|__pycache__' -L 3 || true`
- JS/TS: `pnpm|yarn|npm run lint && … run typecheck && … run test -i`
- Prisma/SQL (only if present): `npx prisma validate && npx prisma migrate status`

## Quick Commands

### AI Predictions
```bash
# Generate predictions for all fights missing them (or use npm run predict:all)
npx ts-node scripts/generate-hybrid-predictions-all.ts
```

### Fighter Images
```bash
cd scraper
DATABASE_URL="..." python3 scripts/backfill_fighter_images.py --limit 100
```

### Database Check
```bash
npx ts-node scripts/verify-predictions.ts
```
