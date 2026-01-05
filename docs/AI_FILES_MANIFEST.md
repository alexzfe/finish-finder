# AI Prediction System - Complete File Manifest

## Core AI Service Files

### Main Service Class
| File | Purpose | Key Class |
|------|---------|-----------|
| `/src/lib/ai/newPredictionService.ts` | Main AI prediction service | `NewPredictionService` |
| `/src/lib/ai/fighterContextService.ts` | Web search enrichment | `FighterContextService` |
| `/src/lib/ai/hybridUFCService.ts` | Legacy hybrid service (archived) | `HybridUFCService` |
| `/src/lib/ai/webSearchWrapper.ts` | Search API wrapper | Various search functions |

## Prompt Templates & Builders

### Finish Probability
| File | Purpose |
|------|---------|
| `/src/lib/ai/prompts/finishProbabilityPrompt.ts` | 4-step finish probability prompt template |

**Key Exports**:
- `buildFinishProbabilityPrompt(input)`: Builds the prompt string
- `interface FinishProbabilityInput`: Input data structure
- `interface FinishProbabilityOutput`: Expected output structure
- `interface FighterFinishStats`: Fighter data needed for predictions

### Fun Score
| File | Purpose |
|------|---------|
| `/src/lib/ai/prompts/funScorePrompt.ts` | Weighted factor entertainment scoring prompt |

**Key Exports**:
- `buildFunScorePrompt(input)`: Builds the prompt string
- `classifyFighterStyle(stats)`: Determines fighter's primary style
- `interface FunScoreInput`: Input data structure
- `interface FunScoreOutput`: Expected output structure
- `interface FunScoreBreakdown`: Score breakdown details
- `type FighterStyle`: 'striker' | 'wrestler' | 'grappler' | 'balanced'

### Weight Classes & Base Rates
| File | Purpose |
|------|---------|
| `/src/lib/ai/prompts/weightClassRates.ts` | Historical finish rates by weight class |

**Key Exports**:
- `WEIGHT_CLASS_FINISH_RATES`: Lookup table for base rates
- `getWeightClassRates(weightClass)`: Get rates for a weight class
- `normalizeWeightClass(name)`: Normalize weight class names

### Key Factors Extraction
| File | Purpose |
|------|---------|
| `/src/lib/ai/prompts/keyFactorsExtraction.ts` | Two-step key factor extraction prompts |

**Key Exports**:
- `buildFinishKeyFactorsExtractionPrompt(reasoning)`: Extract 1-2 finish factors
- `buildFunKeyFactorsExtractionPrompt(reasoning)`: Extract 2-3 fun factors

### Prompt Index
| File | Purpose |
|------|---------|
| `/src/lib/ai/prompts/index.ts` | Central export point for all prompts |

**Exports**:
- All prompt builders
- All input/output interfaces
- Weight class utilities
- Fighter style classification

### Examples & Test Data
| File | Purpose |
|------|---------|
| `/src/lib/ai/prompts/examples.ts` | Example fighter data for testing |

## Runner Scripts

### Production Runner (Current)
| File | Purpose |
|------|---------|
| `/scripts/new-ai-predictions-runner.ts` | **CURRENT**: Phase 3 prediction runner with version tracking |

**Usage**:
```bash
npx ts-node scripts/new-ai-predictions-runner.ts [--dry-run] [--force] [--event-id=...] [--limit=n] [--no-web-search]
```

**Features**:
- SHA256 prompt hashing for version control
- Web search enrichment (optional)
- Rate limiting with configurable delays
- Comprehensive cost tracking
- Risk level calculation
- Progress reporting

### Legacy Runners
| File | Purpose | Status |
|------|---------|--------|
| `/scripts/generate-ai-predictions.js` | Older prediction generator | Legacy |
| `/scripts/ai-predictions-runner.js` | Alternative runner | Legacy |
| `/scripts/generate-predictions-only.js` | Predictions-only variant | Legacy |
| `/scripts/generate-event-predictions.js` | Event-level predictions | Legacy |

## Utility Scripts

### Data Inspection & Display
| File | Purpose |
|------|---------|
| `/scripts/show-prediction.ts` | Display specific prediction details |
| `/scripts/show-new-prediction.js` | Display new-format prediction |

### Cleanup & Maintenance
| File | Purpose |
|------|---------|
| `/scripts/clear-predictions.js` | Delete all predictions (careful!) |
| `/scripts/verify-predictions-cleared.js` | Verify deletion completed |

### Recalculation
| File | Purpose |
|------|---------|
| `/scripts/recalculate-risk-levels.ts` | Recalculate risk levels from confidences |

## Database & ORM

### Prisma Configuration
| File | Purpose |
|------|---------|
| `/prisma/schema.prisma` | Complete database schema (CRITICAL) |

**Key Models**:
- `Fighter`: 60+ fields for fighter statistics
- `Fight`: Fight matchups with predictions
- `Event`: UFC events
- `PredictionVersion`: Track prompt template versions
- `Prediction`: Individual fight predictions (NEW)
- `PredictionUsage`: API usage tracking
- `QueryMetric`: Performance monitoring
- `ScrapeLog`: Scraper execution logs
- `FunScoreHistory`: Legacy prediction history

### Prisma Client
| File | Purpose |
|------|---------|
| `/src/lib/database/prisma.ts` | Prisma client singleton |

### Validation
| File | Purpose |
|------|---------|
| `/src/lib/database/validation.ts` | Zod schemas for data validation |
| `/src/lib/scraper/validation.ts` | Scraper data validation |

## API Endpoints

### Event Data
| File | Purpose | Endpoint |
|------|---------|----------|
| `/src/app/api/db-events/route.ts` | Get events with fights | `GET /api/db-events` |
| `/src/app/api/health/route.ts` | Health check | `GET /api/health` |
| `/src/app/api/performance/route.ts` | Performance metrics | `GET /api/performance` |

### Internal Ingestion
| File | Purpose | Endpoint |
|------|---------|----------|
| `/src/app/api/internal/ingest/route.ts` | Scraper data ingestion | `POST /api/internal/ingest` |

### Administration
| File | Purpose | Endpoint |
|------|---------|----------|
| `/src/app/api/admin/wipe-database/route.ts` | Database reset (admin) | `POST /api/admin/wipe-database` |

## CI/CD & Automation

### GitHub Actions
| File | Purpose |
|------|---------|
| `.github/workflows/ai-predictions.yml` | **ACTIVE**: Daily AI prediction generation |
| `.github/workflows/scraper.yml` | Daily scraper execution |

**AI Predictions Workflow**:
- Trigger: Daily 1:30 AM UTC
- Timeout: 45 minutes
- Runs: `scripts/new-ai-predictions-runner.ts`
- Manual inputs: batch_size, force_regenerate

## Documentation Files

### Implementation & Planning
| File | Purpose |
|------|---------|
| `/docs/AI_PREDICTION_IMPLEMENTATION_PLAN.md` | Complete 4-phase implementation plan |
| `/docs/ai-context/HANDOFF.md` | AI context handoff document |
| `/docs/ai-context/project-structure.md` | Project organization overview |
| `/docs/ai-context/key-factors-generation.md` | Key factors extraction strategies |

### Quick References
| File | Purpose |
|------|---------|
| `/docs/CODEBASE_EXPLORATION_SUMMARY.md` | Full codebase overview (this document) |
| `/docs/AI_SYSTEM_QUICK_REFERENCE.md` | Quick command reference guide |

### Context Files
| File | Purpose |
|------|---------|
| `/src/lib/ai/prompts/CONTEXT.md` | Prompt-specific context notes |
| `/scripts/CONTEXT.md` | Scripts context notes |
| `/src/app/CONTEXT.md` | App directory context notes |

## Supporting Files

### Environment & Configuration
| File | Purpose |
|------|---------|
| `.env` | Environment variables (local) |
| `.env.local` | Local overrides |
| `.env.example` | Example environment setup |
| `tsconfig.json` | TypeScript configuration |

### Package Management
| File | Purpose |
|------|---------|
| `package.json` | NPM dependencies & scripts |
| `package-lock.json` | Dependency lock file |

## Testing Files

### AI Tests
| File | Purpose |
|------|---------|
| `/src/lib/ai/__tests__/ordering.test.ts` | Test fight ordering |
| `/src/lib/ai/__tests__/scrape-perf.test.ts` | Scraper performance tests |

### Database Tests
| File | Purpose |
|------|---------|
| `/src/lib/database/__tests__/validation.test.ts` | Validation tests |
| `/src/lib/database/__tests__/monitoring-enhancements.test.ts` | Monitoring tests |

### Utility Tests
| File | Purpose |
|------|---------|
| `/src/lib/utils/__tests__/json.test.ts` | JSON utility tests |
| `/src/lib/utils/__tests__/weight-class.test.ts` | Weight class utility tests |

## Configuration Files

### Monitoring & Logging
| File | Purpose |
|------|---------|
| `/src/lib/monitoring/logger.ts` | Structured logging |
| `/src/lib/database/structured-logger.ts` | Database logging |
| `/src/lib/database/monitoring.ts` | Monitoring utilities |
| `/src/lib/database/alert-rules.ts` | Alert configuration |
| `/sentry.client.config.ts` | Client error tracking |
| `/sentry.server.config.ts` | Server error tracking |
| `/sentry.edge.config.ts` | Edge function tracking |

### Build Configuration
| File | Purpose |
|------|---------|
| `next.config.ts` | Next.js configuration |
| `postcss.config.mjs` | PostCSS configuration |
| `vitest.config.ts` | Vitest configuration |
| `eslint.config.mjs` | ESLint configuration |

## Type Definitions

### Main Types
| File | Purpose |
|------|---------|
| `/src/types/index.ts` | Central type exports |
| `/src/types/unified.ts` | Unified type system |

## Data Files

### Public Assets
| File | Purpose |
|------|---------|
| `/public/data/events.json` | Static event data |

### Documentation Data
| File | Purpose |
|------|---------|
| `/docs/data/events.json` | Documentation example data |

## Archived/Legacy Files

### Old Implementation
| File | Purpose |
|------|---------|
| `/inactive-legacy/` | Pre-rewrite implementations |
| `/archive/` | Archived documentation |

---

## File Organization Summary

```
src/lib/ai/                              # AI system (CORE)
├── newPredictionService.ts              # Main service
├── fighterContextService.ts             # Context enrichment
├── prompts/                             # Prompt templates
│   ├── finishProbabilityPrompt.ts       # Finish prediction
│   ├── funScorePrompt.ts                # Entertainment scoring
│   ├── weightClassRates.ts              # Weight class data
│   ├── keyFactorsExtraction.ts          # Key factor extraction
│   ├── index.ts                         # Central exports
│   └── examples.ts                      # Test data
└── __tests__/                           # AI tests

scripts/                                 # Execution scripts
├── new-ai-predictions-runner.ts         # Current runner
├── show-prediction.ts                   # Display utility
├── clear-predictions.js                 # Cleanup
└── [other utilities]

prisma/                                  # Database
├── schema.prisma                        # Database schema (CRITICAL)
└── migrations/                          # Migration history

.github/workflows/                       # CI/CD
└── ai-predictions.yml                   # Daily job

docs/                                    # Documentation
├── AI_PREDICTION_IMPLEMENTATION_PLAN.md # Full plan
├── CODEBASE_EXPLORATION_SUMMARY.md      # Exploration summary
├── AI_SYSTEM_QUICK_REFERENCE.md         # Quick guide
└── ai-context/                          # Detailed context
```

---

**Total AI-Related Files**: 50+
**Database Models for AI**: 6 (Fighter, Fight, PredictionVersion, Prediction, PredictionUsage, QueryMetric)
**Prompt Templates**: 5 (finishProbability, funScore, keyFactors×2, weightClassRates)
**Runner Scripts**: 1 active + 3 legacy
**Documentation Files**: 7 main + context files

**Last Updated**: 2025-11-15
**Maintained by**: Claude Code
