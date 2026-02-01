# Codebase Map

## Architecture Overview
- **Frontend** (`src/app`, `src/components`) – Next.js 15 App Router client rendering. `src/app/page.tsx` orchestrates event fetching with API-first, static-second fallback.
- **API Layer** (`src/app/api`) – `/api/db-events` returns Prisma-backed event payloads, now resilient to malformed JSON. `/api/fighter-image` currently short-circuits to a placeholder while the scraping policy is revisited.
- **Domain & Utilities** (`src/lib`, `src/types`) – Hybrid scraping/prediction service, prompt builders, search helpers, logger utilities, and shared type definitions.
- **Persistence** (`prisma/`) – Prisma schema for fighters, fights, events, prediction telemetry. Includes Postgres migration history (`prisma/migrations/**`) and local SQLite database (`prisma/dev.db`).
- **Automation** (`scripts/`) – Scraper, prediction management, static export, GitHub Pages prep, and maintenance scripts. `.github/workflows/scraper.yml` runs the scraper in Docker every 4 hours.
- **Static Artifacts** (`docs/`, `out/`, `public/data`) – Generated site bundles and JSON data for GitHub Pages fallback.

## Key Modules & Responsibilities
| Module | Responsibility |
| --- | --- |
| `src/lib/ai/hybridUFCService.ts` | Scrape Sherdog events/fights, detect changes, and trigger OpenAI predictions (with Sherdog block detection).
| `scripts/automated-scraper.js` | End-to-end automation: scrape → diff → update DB → queue predictions → maintain strike ledgers.
| `scripts/generate-*.js` | Manual control over AI backfills, clearing predictions, and verifying resets.
| `scripts/export-static-data.js` | Serialises Prisma data into `public/data/events.json` for static deployments.
| `src/lib/monitoring/logger.ts` | Structured logging and performance helpers for scraper and API surfaces.
| `src/lib/images/*` | Tapology/UFC/Sherdog image lookup helpers (currently dormant behind placeholder API response).

## External Dependencies
| Package | Version | Usage |
| --- | --- | --- |
| `next` | 15.5.3 | App Router frontend. |
| `react` / `react-dom` | 19.1.0 | UI rendering. |
| `@prisma/client` / `prisma` | 6.16.2 | ORM for Postgres/SQLite. |
| `@sentry/nextjs` | 10.12.0 | Error monitoring for UI/API. |
| `axios` / `cheerio` | 1.12.2 / 1.1.2 | Scraping Sherdog/Tapology HTML.
| `openai` | 5.21.0 | GPT-4o predictions.
| `puppeteer` | 24.22.0 | (Legacy) advanced scraping when needed.
| `date-fns` | 4.1.0 | Date formatting.
| `framer-motion` | 12.23.14 | UI animations.
| Dev tooling: `eslint@9`, `typescript@5`, `tailwindcss@4`, `ts-node@10.9.2`.

## Build & Test Commands
| Task | Command |
| --- | --- |
| Install | `npm install` (runs `prisma generate` via `postinstall`). |
| Dev server | `npm run dev` (Next.js + Turbopack). |
| Build | `npm run build` (Prisma generate + `next build`). |
| Start | `npm run start` (serves `.next` build). |
| Lint | `npm run lint`. |
| Static export | `npm run pages:build`. |
| Scraper dry run | `npm run scraper:check`. |
| Prediction replay | `npm run predict:event`, `npm run predict:all`, etc. |
| Prisma migrations | `npm run db:migrate`, `npm run db:push`, `npm run db:reset`. |

## Runtime & Operations
- **Environment** – `.env.example` documents required variables; `.env.local` must hold secrets locally. Build ignores TypeScript/ESLint errors via `next.config.ts` (needs tightening).
- **Docker** – `Dockerfile` installs dependencies (including dev deps for `ts-node`) and defaults to running the scraper in `check` mode.
- **CI/CD** – GitHub Actions workflow builds the scraper container and runs scheduled jobs. No automated build/test pipeline for the Next.js app yet.
- **Logs** – Local JSON/NDJSON logs in `logs/`; Sentry instrumentation for app surfaces; structured loggers available.

## Known Gaps & Risks
- **Secrets** – `.env` previously contained live Sentry DSNs/token; replaced with placeholders. Keys must be rotated if leaked previously.
- **Build Safety** – `next.config.ts` sets `ignoreDuringBuilds` and `ignoreBuildErrors` to `true`, allowing lint/type failures to ship.
- **Testing** – No automated unit/integration tests. Manual linting is the only guard.
- **Repo Weight** – `docs/_next/` and `out/` directories bloat the git repo (~1.4 GB). Consider pruning or generating dynamically.
- **Image Service** – `fighter-image` API returns placeholder; re-enabling scraping requires rate-limit aware strategy.
- **Supabase Migration** – Postgres migrations exist but automation for deploy (`prisma migrate deploy`) not wired into CI.
