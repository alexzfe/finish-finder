# Finish Finder - Claude Context

## Current Project State

### Recent Work (February 2025)

#### 1. Hybrid Judgment AI Predictions (v3.0-hybrid) ✅
Implemented new AI prediction approach that separates finish probability (deterministic) from fun score (AI-judged):

- **Finish Probability**: Deterministic calculation from fighter attributes (vulnerability + offense + style matchup)
- **Fun Score**: AI-judged 0-100 based on holistic expert assessment of stats, entertainment profiles, and intangibles
- **Coverage**: 54 upcoming fights across 6 events (UFC 325, UFC Fight Nights, UFC 326)
- **Cost**: ~$0.009 per fight (~$0.50 total)
- **Model**: OpenAI GPT-4o with structured outputs

Key files:
- `src/lib/ai/hybridJudgmentService.ts` - Core service
- `src/lib/ai/prompts/hybridJudgmentPrompt.ts` - Prompt template
- `scripts/generate-hybrid-predictions-all.ts` - Batch runner

#### 2. Fighter Image Backfill ✅
Backfilled 84 fighter images from ESPN API:
- **Success rate**: 97.7% (84/86 fighters)
- **Still missing**: 2 fighters (Josh Hokit, Zach Reese - newer fighters without photos)
- **Source**: ESPN headshots primarily, Wikipedia fallback
- **Script**: `scraper/scripts/backfill_fighter_images.py`

#### 3. Legacy Service Cleanup ✅
Marked 3 legacy AI prediction services as deprecated:
- `hybridUFCService.ts` - Old hybrid approach
- `enhancedPredictionService.ts` - Enhanced single-call approach  
- `newPredictionService.ts` - Phase 3 experimental

Current active service:
- `unifiedPredictionService.ts` - Production v2.0-unified
- `hybridJudgmentService.ts` - New v3.0-hybrid (deterministic + AI fun)

---

## Handy Recon (use if needed; otherwise ask once for minimal paths/outputs)
- `git status -sb && git branch --show-current && git describe --tags --always || true`
- `command -v tree >/dev/null && tree -a -I 'node_modules|.git|dist|build|venv|.venv|target|.next|.turbo|__pycache__' -L 3 || true`
- JS/TS: `pnpm|yarn|npm run lint && … run typecheck && … run test -i`
- Prisma/SQL (only if present): `npx prisma validate && npx prisma migrate status`

## Quick Commands

### AI Predictions
```bash
# Generate hybrid judgment predictions for all fights without predictions
npx ts-node scripts/generate-hybrid-predictions-all.ts

# Dry run to see what would be processed
npx ts-node scripts/generate-hybrid-predictions-all.ts --dry-run

# Legacy unified predictions (v2.0)
npx ts-node scripts/unified-ai-predictions-runner.ts
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
