# Finish Finder Project Structure

Auto-generated file tree for AI agent context loading. This provides a complete overview of the codebase organization.

**Last Updated:** 2025-12-14

---

```
/home/alex/projects/finish-finder/
├── README.md                           # Project overview and quickstart
├── CLAUDE.md                           # AI agent working methodology
├── ARCHITECTURE.md                     # System architecture documentation
├── OPERATIONS.md                       # Runbooks and operations guide
├── ROADMAP.md                          # Product roadmap (Now/Next/Later)
├── CONTRIBUTING.md                     # Contribution guidelines
├── SECURITY.md                         # Security policy and practices
├── STYLEGUIDE.md                       # Code conventions and standards
├── CODEBASE_MAP.md                     # Quick reference codebase map
├── DEPLOYMENT.md                       # Deployment checklist
├── DATABASE_PRODUCTION_STATUS.md       # Database performance status
├── ENGINEERING_HANDOFF.md              # Engineering handoff notes (legacy)
│
├── package.json                        # Node.js dependencies and scripts
├── package-lock.json                   # Locked dependency versions
├── tsconfig.json                       # TypeScript configuration (strict mode)
├── next.config.ts                      # Next.js 15 configuration
├── eslint.config.mjs                   # ESLint flat config
├── postcss.config.mjs                  # PostCSS configuration
├── vitest.config.ts                    # Vitest test configuration
│
├── .env.example                        # Environment variable template
├── .env (gitignored)                   # Local environment configuration
├── .gitignore                          # Git ignore patterns
├── Dockerfile                          # Production Docker container
├── docker-compose.dev.yml              # Local development stack
│
├── sentry.client.config.ts             # Sentry browser error tracking
├── sentry.server.config.ts             # Sentry server error tracking
├── sentry.edge.config.ts               # Sentry edge function tracking
├── sentry.properties                   # Sentry project configuration
│
├── .claude/                            # Claude Code configuration
│   ├── settings.local.json             # Claude Code user settings
│   ├── commands/                       # Custom slash commands
│   │   ├── README.md
│   │   ├── full-context.md             # Full context gathering command
│   │   ├── create-docs.md              # Documentation generation command
│   │   ├── update-docs.md              # Documentation update command
│   │   ├── code-review.md              # Code review automation
│   │   ├── refactor.md                 # Refactoring workflow
│   │   ├── handoff.md                  # Engineering handoff generator
│   │   └── gemini-consult.md           # Gemini MCP consultation
│   └── hooks/                          # Git hook automation
│       ├── README.md
│       ├── config                      # Hook configuration
│       ├── setup                       # Hook installer
│       ├── gemini-context-injector.sh  # Gemini context hook
│       ├── subagent-context-injector.sh # Sub-agent context hook
│       ├── mcp-security-scan.sh        # Security scanning hook
│       ├── notify.sh                   # Notification hook
│       └── sounds/                     # Audio notifications
│
├── .github/                            # GitHub configuration
│   └── workflows/                      # GitHub Actions CI/CD
│       ├── scraper.yml                 # Daily scraper workflow (2 AM UTC)
│       └── ai-predictions.yml          # AI predictions workflow (1:30 AM UTC)
│
├── prisma/                             # Prisma ORM configuration
│   ├── schema.prisma                   # Database schema (11 models including CalibrationParams, PredictionLog)
│   │                                   # Fight model: composite unique constraint on (eventId, fighter1Id, fighter2Id)
│   ├── dev.db                          # SQLite local database
│   └── migrations/                     # Database migrations
│       ├── 20250920202459_initial_postgresql_migration/
│       ├── 20250920210000_add_events_performance_index/
│       ├── 20250921002053_add_query_metrics_for_monitoring/
│       ├── 20250921051500_add_query_metrics_for_monitoring/
│       ├── 20251101125236_add_scraper_fields/
│       ├── 20251101125238_add_scraper_fields/
│       ├── manual/                     # Manual SQL migrations (run via prisma db execute)
│       │   └── create_context_decay_function.sql  # Hybrid retrieval DB function
│       └── migration_lock.toml
│
├── src/                                # TypeScript source code
│   ├── app/                            # Next.js 15 App Router
│   │   ├── CONTEXT.md                  # **Tier 2: Frontend UI documentation**
│   │   ├── page.tsx                    # Main home page (client component)
│   │   ├── layout.tsx                  # Root layout with Sentry
│   │   ├── globals.css                 # Tailwind CSS + UFC theme
│   │   ├── favicon.ico                 # Site icon
│   │   ├── admin/                      # Admin dashboard
│   │   │   └── page.tsx                # Performance monitoring UI
│   │   └── api/                        # API routes (server-side)
│   │       ├── db-events/route.ts      # Events API (force-dynamic)
│   │       ├── health/route.ts         # Health check endpoint
│   │       ├── performance/route.ts    # Query performance metrics
│   │       ├── fighter-image/route.ts  # Fighter images (disabled)
│   │       ├── internal/               # Internal-only endpoints
│   │       │   └── ingest/route.ts     # Scraper data ingestion API (fighter order normalization)
│   │       └── admin/
│   │           └── wipe-database/route.ts  # Database reset utility
│   │
│   ├── components/                     # React components
│   │   ├── ui/                         # UI primitives
│   │   │   ├── EventNavigation.tsx     # Event carousel with swipe/keyboard navigation
│   │   │   ├── EventSelector.tsx       # Event dropdown selector
│   │   │   └── Header.tsx              # App header
│   │   ├── fight/                      # Fight card components
│   │   │   ├── FightList.tsx           # Main fight card (memoized, skeleton loading)
│   │   │   └── FightDetailsModal.tsx   # Fight analysis modal (mobile <768px)
│   │   ├── fighter/                    # Fighter components
│   │   │   └── FighterAvatar.tsx       # Avatar with Next.js Image, responsive sizing
│   │   └── admin/                      # Admin dashboard components
│   │       ├── PerformanceDashboard.tsx # Query metrics charts
│   │       └── DatabaseManagement.tsx  # DB operations UI
│   │
│   ├── hooks/                          # Custom React hooks
│   │   └── useFighterImage.ts          # Fighter image caching
│   │
│   ├── lib/                            # Shared libraries and services
│   │   ├── ai/                         # AI prediction services
│   │   │   ├── unifiedPredictionService.ts # Unified prediction service (structured output mode)
│   │   │   ├── scoreCalculator.ts      # Deterministic score calculation from attributes
│   │   │   ├── consistencyValidator.ts # Rule-based validation + LLM critique
│   │   │   ├── improvedFighterContextService.ts # Fighter context with web search
│   │   │   ├── webSearchWrapper.ts     # Brave Search enrichment
│   │   │   ├── fighterContextService.ts # Fighter context management
│   │   │   ├── hybridUFCService.ts     # Multi-source orchestrator
│   │   │   ├── newPredictionService.ts # Legacy prediction service
│   │   │   ├── predictionPrompt.ts     # Legacy prompt builder
│   │   │   ├── calibration/            # Calibration infrastructure
│   │   │   │   ├── index.ts            # Calibration module exports
│   │   │   │   ├── plattScaling.ts     # Log-odds Platt scaling (A=1.7034, B=-0.4888)
│   │   │   │   ├── conformalPrediction.ts # Conformal prediction intervals
│   │   │   │   ├── metricsTracker.ts   # Brier score, ECE, MCE tracking
│   │   │   │   ├── labelingFunctions.ts # Weak supervision labeling functions
│   │   │   │   └── rollingRecalibration.ts # Rolling window recalibration
│   │   │   ├── embeddings/             # Vector embeddings & retrieval
│   │   │   │   ├── index.ts            # Embeddings module exports
│   │   │   │   ├── embeddingService.ts # OpenAI embedding generation
│   │   │   │   ├── hybridRetrieval.ts  # Vector + BM25 + time-decay retrieval
│   │   │   │   └── predictionContextService.ts # Fighter context for predictions
│   │   │   ├── enhancedPredictionService.ts # Production prediction with calibration
│   │   │   ├── prompts/                # AI prompt templates
│   │   │   │   ├── CONTEXT.md          # **Tier 3: AI prompts documentation**
│   │   │   │   ├── index.ts            # Prompt exports
│   │   │   │   ├── unifiedPredictionPrompt.ts # Unified multi-persona prompt (dynamic anchors)
│   │   │   │   ├── anchorExamples.ts   # Few-shot calibration anchors
│   │   │   │   ├── weightClassRates.ts # Base rates by weight class
│   │   │   │   ├── finishProbabilityPrompt.ts # Legacy finish prompt
│   │   │   │   ├── funScorePrompt.ts   # Legacy fun score prompt
│   │   │   │   ├── keyFactorsExtraction.ts # Legacy extraction
│   │   │   │   └── examples.ts         # Prompt examples
│   │   │   └── __tests__/              # AI service tests
│   │   │       ├── ordering.test.ts
│   │   │       └── scrape-perf.test.ts
│   │   │
│   │   ├── database/                   # Database access layer
│   │   │   ├── prisma.ts               # Singleton PrismaClient
│   │   │   ├── monitoring.ts           # Query performance tracking
│   │   │   ├── validation.ts           # Input validation
│   │   │   ├── alert-rules.ts          # Alert thresholds
│   │   │   ├── structured-logger.ts    # JSON logging
│   │   │   ├── query-analyzer.ts       # Query optimization analysis
│   │   │   └── __tests__/              # Database tests
│   │   │       ├── validation.test.ts
│   │   │       └── monitoring-enhancements.test.ts
│   │   │
│   │   ├── scraper/                    # Scraper validation (NEW)
│   │   │   └── validation.ts           # Zod schemas for ingestion API
│   │   │
│   │   ├── scrapers/                   # Web scraping services (ARCHIVED)
│   │   │   └── (files moved to /archive/scrapers-old-2025-01/)
│   │   │
│   │   ├── images/                     # Fighter image services
│   │   │   ├── clientImageService.ts
│   │   │   └── tapologyService.ts
│   │   │
│   │   ├── monitoring/                 # Observability
│   │   │   └── logger.ts               # Sentry integration + structured logs
│   │   │
│   │   ├── search/                     # Search utilities
│   │   │   └── googleSearch.ts
│   │   │
│   │   └── utils/                      # Pure utility functions
│   │       ├── json.ts                 # Safe JSON parsing
│   │       ├── weight-class.ts         # Weight class normalization
│   │       └── __tests__/              # Utility tests
│   │           ├── json.test.ts
│   │           └── weight-class.test.ts
│   │
│   └── types/                          # TypeScript type definitions
│       ├── index.ts                    # Core domain types
│       └── unified.ts                  # Unified internal types
│
├── scripts/                            # Node.js automation scripts
│   ├── CONTEXT.md                      # **Tier 2: Automation documentation**
│   ├── automated-scraper.js            # Main scraper orchestrator (1611 lines)
│   ├── unified-ai-predictions-runner.ts # Unified AI prediction runner (structured output)
│   ├── bootstrap-calibration.ts        # Initialize calibration from historical data
│   ├── bootstrap-embeddings.ts         # Generate fighter embeddings (4,451 fighters)
│   ├── train-platt-from-dspy.ts        # Train Platt scaling from DSPy evaluation data
│   ├── test-enhanced-prediction.ts     # Test enhanced prediction service
│   ├── ai-predictions-runner.js        # Legacy AI prediction batch generator
│   ├── export-static-data.js           # GitHub Pages JSON export
│   ├── prepare-github-pages.js         # Static site build preparation
│   ├── generate-ai-predictions.js      # Prediction generation utility
│   ├── generate-event-predictions.js   # Event-specific predictions
│   ├── generate-predictions-only.js    # Predictions without scraping
│   ├── clear-predictions.js            # Clear all predictions
│   ├── verify-predictions-cleared.js   # Verify prediction removal
│   ├── scrape-tapology.js              # Tapology-only scraper
│   ├── show-collected-data.js          # Database inspection
│   ├── find-duplicates-simple.js       # Detect exact duplicate fights
│   ├── delete-reversed-duplicates.js   # Detect and cleanup reversed fighter pairings
│   ├── cleanup-duplicate-fights.js     # Bulk duplicate cleanup utility
│   ├── check-bonfim-fights.js          # Event-specific duplicate analysis
│   ├── test-vpn-scraper.sh             # VPN scraper testing
│   └── tsconfig.json                   # TypeScript config for scripts
│
├── public/                             # Static assets (served at /)
│   ├── data/
│   │   └── events.json                 # Static event data (fallback)
│   ├── images/
│   │   ├── fighter-placeholder.jpg
│   │   └── fighter-placeholder.svg
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
│
├── docs/                               # Documentation and GitHub Pages
│   ├── ai-context/                     # AI agent context files
│   │   ├── docs-overview.md            # **Documentation registry**
│   │   └── project-structure.md        # **This file**
│   │
│   ├── handbook/                       # Legacy handbook
│   │   └── README.md
│   │
│   ├── TAPOLOGY_SCRAPER_PLAN.md        # Tapology implementation plan
│   │
│   ├── index.html                      # GitHub Pages homepage
│   ├── 404.html                        # GitHub Pages 404 page
│   ├── data/events.json                # Static export for Pages
│   ├── _next/                          # Next.js static assets
│   ├── images/                         # Image assets
│   └── .nojekyll                       # Disable Jekyll processing
│
├── docker/                             # Docker configurations
│   └── mullvad/                        # Mullvad VPN container (Sherdog)
│       ├── Dockerfile
│       ├── entrypoint.sh
│       ├── README.md
│       └── scripts/
│
├── logs/                               # Runtime logs
│   ├── scraper.log                     # Scraper execution logs
│   ├── missing-events.json             # Strike ledger for events
│   ├── missing-fights.json             # Strike ledger for fights
│   └── dev-server.log                  # Development server logs
│
├── coverage/                           # Test coverage reports
│   ├── index.html                      # Coverage HTML report
│   ├── coverage-final.json             # JSON coverage data
│   ├── database/                       # Database module coverage
│   │   ├── index.html
│   │   └── validation.ts.html
│   └── utils/                          # Utils module coverage
│       ├── index.html
│       ├── json.ts.html
│       └── weight-class.ts.html
│
├── scraper/                            # Python/Scrapy web scraper (NEW)
│   ├── README.md                       # Scraper setup & usage guide
│   ├── scrapy.cfg                      # Scrapy project configuration
│   ├── pytest.ini                      # Pytest test configuration
│   ├── requirements.txt                # Production dependencies
│   ├── requirements-dev.txt            # Development & test dependencies
│   ├── ufc_scraper/                    # Main scraper package
│   │   ├── __init__.py
│   │   ├── items.py                    # Data models (EventItem, FightItem, FighterItem)
│   │   ├── parsers.py                  # HTML parsing functions
│   │   ├── pipelines.py                # Data transformation & API posting
│   │   ├── settings.py                 # Scrapy settings (rate limiting)
│   │   └── spiders/
│   │       ├── __init__.py
│   │       └── ufcstats.py             # Main UFCStats.com spider
│   ├── scripts/                        # Automation scripts (reserved)
│   └── tests/                          # Python unit & integration tests
│       ├── __init__.py
│       ├── conftest.py                 # Pytest fixtures
│       ├── test_parsers.py             # Parser unit tests (12 fighter profile tests)
│       └── fixtures/                   # HTML test fixtures
│           ├── event_list.html         # UFCStats.com upcoming events page
│           ├── event_detail_upcoming.html  # Upcoming event detail page
│           ├── event_detail_completed.html # Completed event detail page
│           └── fighter_profile_yanez.html  # Fighter profile with fight history table
│
├── archive/                            # Archived code & documentation (NEW)
│   ├── README.md                       # Archive explanation
│   ├── scrapers-old-2025-01/           # Old TypeScript scrapers
│   │   ├── wikipediaService.ts         # Wikipedia scraper (archived)
│   │   ├── tapologyService.ts          # Tapology enrichment (archived)
│   │   └── requestPolicy.ts            # Rate limiting (archived)
│   └── docs-old-2025-01/               # Old scraper documentation
│       ├── scrapers-CONTEXT.md         # Previous Tier 2 docs
│       └── TAPOLOGY_SCRAPER_PLAN.md    # Deprecated plan
│
├── inactive-legacy/                    # Deprecated code (pre-2025 archive)
│   ├── app-api/
│   │   └── api/                        # Old API routes
│   ├── scraping/
│   │   ├── ufcScraper.ts               # Old UFC scraper
│   │   └── ufcStatsCollector.ts        # Old stats collector
│   ├── funPredictor.ts                 # Old prediction logic
│   ├── ufcAiService.ts                 # Old AI service
│   └── test-scraper.js                 # Old scraper test
│
├── data/                               # Data directory
│   ├── scraped/                        # Scraped data cache
│   ├── dspy/                           # DSPy evaluation & optimization data
│   │   ├── monthly/                    # Monthly evaluation datasets (2024-01 through 2024-12)
│   │   │   └── final_calibration_dataset.json  # 516 fights with predictions + outcomes
│   │   └── optimized/                  # DSPy-optimized prompts
│   └── training/                       # ML training data pipeline
│       ├── README.md                   # Training data documentation
│       ├── DATA_QUALITY_REPORT.md      # Data quality analysis
│       ├── ufc_*.csv                   # Greco1899 UFC fight data (6 files)
│       ├── ufc_bonuses.csv             # Wikipedia bonus data (FOTN/POTN)
│       ├── training_data.csv           # Merged fight data (8,482 fights)
│       ├── normalized_training_data.csv # Era-adjusted normalized data
│       ├── snorkel_labeled_data.csv    # Final tier-labeled data
│       ├── label_matrix.npy            # Labeling function outputs (8,477×12)
│       ├── tier_probabilities.npy      # Tier probability distributions
│       ├── lf_weights.npy              # Learned LF weights
│       ├── scrape_wikipedia_bonuses.py # Wikipedia bonus scraper
│       ├── merge_training_data.py      # Data merging pipeline
│       ├── normalize_data.py           # Era-adjusted Z-scores, implied bonuses
│       ├── labeling_functions.py       # 12 Snorkel-style labeling functions
│       ├── train_label_model.py        # Hierarchical label aggregation
│       └── validate_labels.py          # Label quality validation
│
└── (Temporary/Debug Scripts)           # Ad-hoc debugging utilities
    ├── check-database-duplicates.js
    ├── analyze-specific-duplicates.js
    ├── cleanup-duplicates.js
    ├── cleanup-duplicates.sql
    ├── check-dates.js
    ├── check-enriched-data.js
    ├── check-final-results.js
    ├── check-all-events.js             # Event completion status inspector
    ├── fresh-duplicate-check.js
    ├── simple-duplicate-check.js
    ├── quick-check.js
    └── generate-csv-report.js
```

---

## Key Directories Explained

### `/src/app/` - Next.js 15 App Router

Next.js pages, layouts, and API routes using the App Router architecture.

**Important Files:**
- `page.tsx` - Main home page with event/fight display
- `layout.tsx` - Root layout with Sentry error boundary
- `api/db-events/route.ts` - Primary data API endpoint

### `/scraper/` - Python/Scrapy Web Scraper

Independent Python-based scraper for UFCStats.com. Handles all web scraping logic decoupled from the Next.js application.

**Key Files:**
- `ufc_scraper/spiders/ufcstats.py` - Main spider scraping http://ufcstats.com/statistics/events/upcoming
- `ufc_scraper/items.py` - Data models (EventItem, FightItem, FighterItem with comprehensive statistics)
- `ufc_scraper/parsers.py` - HTML parsing utilities with fight history extraction for win methods (KO/SUB/DEC)
- `ufc_scraper/pipelines.py` - Data validation and API posting pipeline
- `ufc_scraper/settings.py` - Scrapy configuration (rate limits, headers, retry logic)
- `requirements.txt` - Python dependencies (Scrapy 2.11.0, BeautifulSoup 4.12.2)
- `tests/` - Unit and integration tests with pytest (12 fighter profile tests, 90%+ coverage target)
- `tests/fixtures/fighter_profile_yanez.html` - Real UFCStats.com HTML fixture for testing

**Technology:**
- Python 3.11+
- Scrapy 2.11.0 (web scraping framework)
- BeautifulSoup 4.12.2 (HTML parsing)
- pytest (testing with coverage)

**Architecture:**
- Single data source: UFCStats.com upcoming events page and fighter profiles
- Scrapes all upcoming events by default (use `-a limit=N` to restrict)
- Fighter profile parsing extracts 13 statistical fields plus win method breakdown (KO/SUB/DEC)
- Fight history table analysis calculates finish rates and win method percentages
- Data extraction → JSON → POST to `/api/internal/ingest`
- Configurable rate limiting and anti-blocking measures
- Content hash-based change detection (SHA256) enables automatic updates

**Related Documentation:**
- `/docs/NEW_SCRAPER_ARCHITECTURE.md` - Complete architecture design
- `/docs/SCRAPER_TESTING_STRATEGY.md` - Testing approach and patterns

### `/src/lib/` - Shared Services & Utilities

Reusable business logic, external integrations, and utility functions.

**Key Subsystems:**
- `scraper/` - Validation schemas for Python scraper ingestion API (Zod)
- `database/` - Prisma client, monitoring, validation
- `ai/` - Unified prediction service with structured output, deterministic scoring, calibration, and consistency validation
- `ai/calibration/` - Log-odds Platt scaling (trained on 516 fights), metrics tracking, weak supervision labeling
- `ai/embeddings/` - pgvector embeddings (4,451 fighters), hybrid retrieval with time-decay weighting
- `utils/` - Pure functions (JSON parsing, weight class normalization)

**Archived:**
- `scrapers/` - Old TypeScript multi-source scrapers moved to `/archive/scrapers-old-2025-01/`

### `/scripts/` - Automation Scripts

Node.js automation for scraping, predictions, and database maintenance.

**Main Scripts:**
- `automated-scraper.js` - Multi-source scraping orchestrator (1611 lines)
- `ai-predictions-runner.js` - Batch AI prediction generation
- `export-static-data.js` - Static JSON export for fallback

### `/prisma/` - Database Schema & Migrations

Prisma ORM configuration and PostgreSQL migrations.

**Models:**
- Fighter, Event, Fight (core data with scraper fields: sourceUrl, contentHash, lastScrapedAt)
- ScrapeLog (scraper execution audit trail)
- PredictionModel, PredictionUsage, FunScoreHistory (AI tracking)
- CalibrationParams (Platt scaling A/B parameters, conformal scores, validity period)
- WeakSupervisionLabel (generated entertainment labels per fight)
- PredictionLog (raw + calibrated predictions for calibration refinement)
- FighterContextChunk (embedded context chunks for hybrid retrieval)
- QueryMetric (performance monitoring)

**Connection Configuration:**
- `DATABASE_URL` - Transaction pooler for runtime (PgBouncer)
- `DIRECT_DATABASE_URL` - Direct connection for migrations

### `/.claude/` - Claude Code Configuration

Custom commands and hooks for Claude Code AI assistance.

**Commands:**
- `/full-context` - Comprehensive context gathering
- `/create-docs` - Generate documentation
- `/code-review` - Automated code review

### `/.github/workflows/` - CI/CD Pipelines

GitHub Actions workflows for automation.

**Workflows:**
- `scraper.yml` - Daily scraper run (2:00 AM UTC), scrapes upcoming + 2 most recent completed events by default
- `ai-predictions.yml` - Daily predictions (1:30 AM UTC)

---

## Tier 2 Documentation Locations

- **Frontend:** `/src/app/CONTEXT.md`
- **Scripts:** `/scripts/CONTEXT.md`

**Archived:**
- **Scrapers:** `/archive/docs-old-2025-01/scrapers-CONTEXT.md` (old TypeScript scrapers)

---

## File Naming Conventions

| Pattern | Usage | Example |
|---------|-------|---------|
| **PascalCase.tsx** | React components | `FightList.tsx`, `EventNavigation.tsx` |
| **camelCase.ts** | Services, utilities | `hybridUFCService.ts`, `wikipediaService.ts` |
| **kebab-case/route.ts** | API routes | `db-events/route.ts`, `fighter-image/route.ts` |
| **UPPER_SNAKE.md** | Documentation | `ARCHITECTURE.md`, `OPERATIONS.md` |
| **lowercase.config.ts** | Config files | `next.config.ts`, `vitest.config.ts` |

---

## Ignored Directories (Not Shown)

- `node_modules/` - NPM dependencies
- `.next/` - Next.js build cache
- `out/` - Static export output
- `dist/`, `build/` - Build artifacts
- `.git/` - Git repository data
- `__pycache__/` - Python cache (if any)

---

**Total Lines of Code (estimated):**
- TypeScript/JavaScript: ~15,000 lines
- Documentation: ~3,500 lines
- Configuration: ~500 lines

**Key Technologies:**
- Next.js 16.1.1 (App Router)
- React 19.1.0
- Prisma 6.16.2
- Sentry 10.32.1 (error tracking)
- Vitest 3.2.4
- Tailwind CSS 4
- OpenAI API (GPT-4o, text-embedding-3-small)
- pgvector (PostgreSQL vector extension for embeddings)
- **Python 3.11+** (web scraper)
- **Scrapy 2.11.0** (scraping framework)
- **BeautifulSoup 4.12.2** (HTML parsing)

---

## Related Documentation

- **`/docs/ai-context/docs-overview.md`** - Documentation tier registry
- **`/CODEBASE_MAP.md`** - Quick reference guide
- **`/ARCHITECTURE.md`** - System architecture
