# Testing

## Table of Contents
1. [Current State](#current-state)
2. [Available Checks](#available-checks)
3. [Testing Strategy](#testing-strategy)
4. [Fixtures & Test Data](#fixtures--test-data)
5. [Coverage Goals](#coverage-goals)

## Current State
- ✅ **Vitest test suite implemented** with comprehensive JSON parsing, weight-class validation, and database validation tests.
- ✅ **60 tests passing** with 99.06% statement coverage on tested `src/lib` modules.
- ESLint (`npm run lint`) and TypeScript checks are enforced; unit tests now run via `npm run test`.
- ROADMAP includes upcoming tasks for CI integration and Playwright smoke tests.

## Available Checks
| Area | Command | Notes |
| --- | --- | --- |
| Linting | `npm run lint` | Uses `eslint.config.mjs` with Next.js defaults. |
| Type Safety | `npx tsc --noEmit` | Temporary manual command until a package script is added. |
| **Unit Tests** | `npm run test` | **Vitest interactive mode with file watching.** |
| **Test Runner** | `npm run test:run` | **Vitest single run mode for CI/scripts.** |
| **Test Coverage** | `npm run test:coverage` | **Coverage report with 60% thresholds on tested modules.** |
| Scraper Dry Run | `npm run scraper:check` | Exercises data pipeline end-to-end; requires external services. |
| Static Export | `npm run pages:build` | Validates export scripts and Prisma access. |
| Tapology Enrichment (1 event) | `TAPOLOGY_ENRICH_RECORDS=true node scripts/test-enrich-records.js 1` | Verifies fighter record enrichment without DB writes. |
| Sherdog Local Probe | `npm run sherdog:test:local` | Checks local Sherdog accessibility with rotated headers. |
| Single Fighter Record | `node scripts/test-tapology-fighter-record.js "Name"` | Fetches a fighter's W-L-D from Tapology. |

## Testing Strategy
1. **Unit Tests** (✅ **Vitest Implemented**)
   - ✅ **JSON utilities** (`src/lib/utils/json.ts`) - parseJsonArray, parseJsonSafe, stringifyJsonSafe with error handling and fallbacks
   - ✅ **Weight class validation** (`src/lib/utils/weight-class.ts`) - normalization, validation, display names with common variations
   - ✅ **Database validation** (`src/lib/database/validation.ts`) - fight/fighter data validation with type checking and error accumulation
   - 🔄 **Upcoming**: `src/lib/ai` prompt builders and utility parsers.
   - 🔄 **Upcoming**: `src/lib/images` sanitisation and slug helpers.
2. **Integration Tests**
   - Use Prisma test database (SQLite in-memory) to simulate scraper writes and API reads.
   - Mock OpenAI responses to verify prediction handling without live calls.
3. **End-to-End Smoke**
   - Use Playwright against local `npm run dev` with seeded data to assert key UI flows (event navigation, fight selection, fallback messaging).
4. **Regression Protection**
   - Add snapshot tests for `public/data/events.json` shape to detect schema drift.

## Fixtures & Test Data
- ✅ **Test patterns established** with comprehensive edge case coverage (null/undefined, invalid JSON, circular references, type mismatches)
- ✅ **Realistic test data** for fight/fighter validation scenarios with common scraping variations
- ✅ **Console mocking** implemented for error handling verification
- 🔄 **Upcoming**: Prisma test database (SQLite in-memory) for integration tests
- 🔄 **Upcoming**: OpenAI response mocking under `tests/fixtures/openai/`
- 🔄 **Upcoming**: Sherdog HTML fixtures for scraping utilities

## Coverage Goals
| Horizon | Target | Status |
| --- | --- | --- |
| Now | Lint + TypeScript clean on every PR. | ✅ **Achieved** |
| Next | ≥60% statement coverage on `src/lib/**` and API routes using Vitest. | ✅ **Achieved - 99.06% on tested modules** |
| Later | Playwright smoke suite covering navigation, fight selection, and error states. | 🔄 **Planned** |

## Test File Structure
```
src/lib/
├── utils/
│   ├── __tests__/
│   │   ├── json.test.ts          # 18 tests - JSON parsing & error handling
│   │   └── weight-class.test.ts  # 19 tests - validation & normalization
│   ├── json.ts                   # Utilities with graceful fallbacks
│   └── weight-class.ts           # WeightClass validation & display
├── database/
│   ├── __tests__/
│   │   └── validation.test.ts    # 23 tests - fight/fighter validation
│   └── validation.ts             # Database input validation
└── vitest.config.ts              # Test configuration with coverage thresholds
```

## Test Implementation Patterns
- **Error handling verification** with console.warn mocking
- **Edge case coverage** for null, undefined, invalid JSON, circular references
- **Type validation** with realistic scraped data scenarios
- **Integration scenarios** testing common scraping variations
- **Focused coverage** on JSON utilities, weight-class validation, database validation

Document test additions in PR descriptions and keep fixtures lightweight to avoid bloating the repo.
