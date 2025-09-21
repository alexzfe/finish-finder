# Testing

## Table of Contents
1. [Current State](#current-state)
2. [Available Checks](#available-checks)
3. [Testing Strategy](#testing-strategy)
4. [Fixtures & Test Data](#fixtures--test-data)
5. [Coverage Goals](#coverage-goals)

## Current State
- There is no automated test suite committed yet.
- ESLint (`npm run lint`) is the only enforced check; TypeScript and unit tests run manually when needed.
- ROADMAP includes tasks to add Vitest/Jest for unit coverage and Playwright for smoke tests.

## Available Checks
| Area | Command | Notes |
| --- | --- | --- |
| Linting | `npm run lint` | Uses `eslint.config.mjs` with Next.js defaults. |
| Type Safety | `npx tsc --noEmit` | Temporary manual command until a package script is added. |
| Scraper Dry Run | `npm run scraper:check` | Exercises data pipeline end-to-end; requires external services. |
| Static Export | `npm run pages:build` | Validates export scripts and Prisma access. |

## Testing Strategy
1. **Unit Tests** (Target: Vitest/Jest)
   - `src/lib/ai` prompt builders and utility parsers.
   - `src/lib/images` sanitisation and slug helpers.
   - `src/app/api` logic such as JSON parsing, filtering, and fallbacks.
2. **Integration Tests**
   - Use Prisma test database (SQLite in-memory) to simulate scraper writes and API reads.
   - Mock OpenAI responses to verify prediction handling without live calls.
3. **End-to-End Smoke**
   - Use Playwright against local `npm run dev` with seeded data to assert key UI flows (event navigation, fight selection, fallback messaging).
4. **Regression Protection**
   - Add snapshot tests for `public/data/events.json` shape to detect schema drift.

## Fixtures & Test Data
- Use thin Prisma seed scripts or factory helpers to create events/fights/fighters per test run.
- When mocking OpenAI, store prompt/response JSON under `tests/fixtures/openai/` (to be created).
- For scraping utilities, rely on stored HTML fixtures representing Sherdog pages to avoid live network calls.

## Coverage Goals
| Horizon | Target |
| --- | --- |
| Now | Lint + TypeScript clean on every PR. |
| Next | ≥60% statement coverage on `src/lib/**` and API routes using Vitest. |
| Later | Playwright smoke suite covering navigation, fight selection, and error states. |

Document test additions in PR descriptions and keep fixtures lightweight to avoid bloating the repo.
