# Finish Finder — Claude Context

Next.js 16 (App Router) + Prisma + Supabase Postgres, with a Python/Scrapy
scraper and OpenAI-driven prediction pipeline. Reads served via
`/api/db-events`; ingest at `/api/internal/ingest`.

## Architecture rules

- **Each Store is the single seam for its table.** Don't query Prisma
  directly from new callers. Stores: `PredictionStore`
  (`src/lib/ai/persistence/`), `FighterStore` / `EventStore` / `FightStore`
  (`src/lib/database/`).
- **The system predicts entertainment value — never winners or methods.**
  Outputs: `funScore` (1-10 integer, AI judgment), `finishProbability` (0-1,
  deterministic from attributes), `confidence` (0-1).
- **`PREDICTION_VERSION` is bumped manually.** Edit the constant in
  `scripts/generate-hybrid-predictions-all.ts` whenever the prompt,
  deterministic math, or output contract changes. An earlier auto-hash
  approach churned versions on cosmetic edits and was dropped.
- **Scraper writes are transactional.** `IngestOrchestrator`
  (`src/lib/scraper/ingestOrchestrator.ts`) coordinates Fighter/Event/Fight
  upserts inside one `prisma.$transaction`; the route handler is just auth +
  parse + delegate.
- **OpenAI calls must set `timeout`** (default 60_000) — the SDK hangs without it.

## System map

| Layer | Key files |
| --- | --- |
| UI | `src/app/page.tsx`, `src/components/**` |
| API routes | `src/app/api/db-events/`, `src/app/api/internal/ingest/`, `src/app/api/health/` |
| Stores | `src/lib/database/{fighterStore,eventStore,fightStore}.ts`, `src/lib/ai/persistence/predictionStore.ts` |
| Predictions | `src/lib/ai/{predictor,snapshot}.ts`, `src/lib/ai/adapters/`, `src/lib/ai/math/finishProbability.ts` |
| Scraper (TS) | `src/lib/scraper/{validation,fightReconciler,contentHash,ingestOrchestrator}.ts` |
| Scraper (Python) | `scraper/ufc_scraper/` |
| Schema | `prisma/schema.prisma` |

## Daily jobs (UTC)

- **02:00** — Python scraper → ingest API (`.github/workflows/scraper.yml`)
- **04:30** — AI predictions (`.github/workflows/ai-predictions.yml`, calls `npm run predict:all`)

## Quick commands

```bash
npm run predict:all                          # generate predictions for fights missing them
npx ts-node scripts/verify-predictions.ts    # sanity-check the prediction store
cd scraper && DATABASE_URL=... python3 scripts/backfill_fighter_images.py --limit 100
```

## Gotchas

- Node `-e` inline scripts break with `!` escaping on Node v24 — write a `.js` file instead.
- Fighter image route currently returns a placeholder until rate-limiting is solved.

## Where else to look

- `OPERATIONS.md` — env vars, runbooks, incident response
- `ROADMAP.md` — work tracking
- `prisma/schema.prisma` — canonical data model
