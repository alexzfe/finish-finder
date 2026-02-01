# Audit

| Issue | File/Line | Severity | Evidence | Proposed Fix |
| --- | --- | --- | --- | --- |
| Secrets committed to repo history | `.env:1-8` | High | `.env` is versioned and previously stored live Sentry DSNs/token. Even after redaction, history exposure requires rotation. | Rotate all affected keys (Sentry, OpenAI, Google), rewrite git history if feasible, and keep `.env` limited to placeholders. Enforce secret scanning (e.g., GitHub Advanced Security, gitleaks) in CI. |
| API crashed on malformed JSON | `src/app/api/db-events/route.ts:11-25` | Medium | `JSON.parse(fight.keyFactors)` lacked guarding; corrupted DB value 500’d `/api/db-events`. Added `parseJsonArray` helper returning a safe fallback. | Keep helper, add unit tests around DB payload parsing, and validate JSON before persisting in scraper scripts. |
| UI weight class formatter could throw | `src/app/page.tsx:10-17` | Medium | `formatWeightClass` called `.split` on `undefined` when upstream data lacked weight class. Added null guard returning `TBD`. | Retain guard and expand to handle more display-friendly synonyms during future refactors. |
| Builds ignore lint/type errors | `next.config.ts:10-15` | Medium | `eslint.ignoreDuringBuilds` and `typescript.ignoreBuildErrors` are `true`, letting regressions reach production. | Flip both flags to `false`, fix outstanding issues, and gate PRs/CI on `npm run lint` + `npx tsc --noEmit`. |
| Repository bloat from static exports | `docs/_next/static/**` | Low | Generated Next.js assets (~1.4 GB repo) are tracked, slowing clones and reviews. | Move `docs/_next` and `out/` to release artifacts or build on demand. Keep only `public/data/events.json` or tagged snapshots. |
| Missing automated tests | `package.json:5-29` | Medium | No `test` script or framework; linting is the only safety net. | Add Vitest/Jest for unit suites, Playwright for smoke, and wire `npm run test` + coverage thresholds into CI (see ROADMAP). |
