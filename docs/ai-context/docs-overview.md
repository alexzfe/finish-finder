# Finish Finder Documentation Overview

This file serves as the **documentation registry** for the Finish Finder project, organized by tier to optimize AI agent context loading and human navigation.

## Documentation Tier System

**Tier 1 (Foundational):** System-wide architecture, operations, and conventions - essential reading for all team members

**Tier 2 (Component-Level):** Major subsystem documentation with technical implementation details - reference for specialists

**Tier 3 (Feature-Specific):** Detailed feature/module documentation - deep-dive references

---

## Tier 1: Foundational Documentation

Essential documentation for understanding the entire system.

### Core Architecture & Design

- **`/CLAUDE.md`** - AI agent prime directive and working methodology for codebase interactions
- **`/docs/ARCHITECTURE.md`** - Complete system architecture, components, data flow, and external integrations
- **`/docs/ARCHITECTURE_DIAGRAMS.md`** - Mermaid diagrams for system, data flow, and component visualization
- **`/CODEBASE_MAP.md`** - Quick reference map of project structure and key modules
- **`/README.md`** - Project overview, quickstart guide, and deployment instructions

### Operations & Maintenance

- **`/docs/OPERATIONS.md`** - Runbooks, incident response, environment configuration, and observability
- **`/docs/DEPLOYMENT.md`** - Production deployment checklist and Vercel configuration
- **`/docs/DATABASE_PRODUCTION_STATUS.md`** - Database performance status and monitoring details

### Quality & Standards

- **`/docs/TESTING.md`** - Testing strategy, coverage goals, and test patterns
- **`/STYLEGUIDE.md`** - Code conventions, TypeScript standards, and React patterns
- **`/SECURITY.md`** - Security policy, secret management, and vulnerability reporting
- **`/CONTRIBUTING.md`** - Contribution workflow, branch strategy, and PR guidelines

### Planning & Roadmap

- **`/docs/ROADMAP.md`** - Product roadmap with Now/Next/Later prioritization
- **`/docs/handbook/README.md`** - Legacy handbook consolidating reference materials

---

## Tier 2: Component-Level Documentation

Technical deep-dives for major subsystems.

### Frontend & UI Layer

- **`/src/app/CONTEXT.md`** - Next.js 15 App Router frontend layer, React components, API integration patterns, and admin dashboard

### Data Collection

- **`/scraper/CONTEXT.md`** - Python Scrapy scraper architecture, UFC-only statistics patterns, and finish rate calculations

### Automation & Scripts

- **`/scripts/CONTEXT.md`** - Automation scripts for scraping orchestration, AI predictions, database maintenance, and static exports

**Archived:**
- **`/archive/docs-old-2025-01/scrapers-CONTEXT.md`** - Previous TypeScript multi-source scraper documentation (superseded by Python/Scrapy implementation)

---

## Tier 3: Feature-Specific Documentation

Detailed feature and module references.

### AI Prediction System

- **`/src/lib/ai/prompts/CONTEXT.md`** - Unified AI prediction architecture with structured output mode, concise analysis summaries (finishAnalysis, funAnalysis), dynamic probability anchors, few-shot calibration, deterministic score calculation, Platt scaling, and weak supervision labeling

### ML Training Data Pipeline

- **`/data/training/README.md`** - Training data pipeline for entertainment tier prediction with 8,477 labeled UFC fights, 12 Snorkel-style labeling functions, era-adjusted normalization, and hierarchical label aggregation
- **`/data/training/DATA_QUALITY_REPORT.md`** - Data quality analysis documenting issues found and fixes applied (knockdown type conversion, event name whitespace, temporal bias)

### Scraper Architecture & Implementation

- **`/docs/NEW_SCRAPER_ARCHITECTURE.md`** - Python/Scrapy scraper architecture design and implementation plan
- **`/docs/SCRAPER_TESTING_STRATEGY.md`** - Comprehensive testing strategy for Python scraper and TypeScript API
- **`/scraper/README.md`** - Python scraper setup, usage guide, and troubleshooting

**Archived:**
- **`/docs/TAPOLOGY_SCRAPER_PLAN.md`** - Previous Tapology-first scraper plan (superseded)
- **`/wikipedia-enrichment-summary.md`** - Wikipedia enrichment feature summary (superseded)

### Historical/Legacy Documentation

- **`/ENGINEERING_HANDOFF.md`** - Engineering handoff notes (dated Sep 2025)
- **`/TYPESCRIPT_MIGRATION_PLAN.md`** - TypeScript strict mode migration plan (completed Sep 2025)
- **`/VERCEL_DEPLOYMENT_TEST.md`** - Vercel deployment testing notes (dated Sep 2025)
- **`/VERCEL_COMPATIBILITY_PLAN.md`** - Vercel compatibility assessment (dated Sep 2025)
- **`/SHERDOG_SCRAPING_TESTING_PLAN.md`** - Sherdog scraper testing strategy (local testing only)
- **`/SCRAPING_DISABLED.md`** - Notes on scraping feature status
- **`/COMPREHENSIVE_TEST_ANALYSIS.md`** - Test coverage analysis report
- **`/launch_plan.md`** - Pre-launch planning artifact

---

## Quick Reference: Documentation by Use Case

### For New Team Members

1. Start with `/README.md` for project overview
2. Read `/docs/DEVELOPER_GUIDE.md` for setup and workflow
3. Review `/docs/ARCHITECTURE.md` for system design
4. Check `/CONTRIBUTING.md` for contribution guidelines

### For Debugging Production Issues

1. `/docs/OPERATIONS.md` §Incident Response
2. `/docs/DATABASE_PRODUCTION_STATUS.md` for monitoring
3. `/docs/ARCHITECTURE.md` §Runtime Components for service locations

### For Adding Features

1. `/docs/ARCHITECTURE.md` for integration points
2. Relevant Tier 2 CONTEXT.md for subsystem patterns
3. `/STYLEGUIDE.md` for coding standards
4. `/docs/TESTING.md` for test strategy

### For DevOps/Deployment

1. `/docs/DEPLOYMENT.md` for deployment steps
2. `/docs/OPERATIONS.md` for runbooks
3. `/SECURITY.md` for secrets management

---

## Maintenance Guidelines

**Documentation Ownership:**
- Tier 1 docs: Reviewed monthly by tech lead
- Tier 2 docs: Reviewed quarterly by subsystem owners
- Tier 3 docs: Reviewed as needed or archived if stale

**Update Triggers:**
- Architecture changes → Update ARCHITECTURE.md
- New components → Create Tier 2 CONTEXT.md
- Feature completion → Update ROADMAP.md
- Security changes → Update SECURITY.md

**Archive Policy:**
- Historical docs (>6 months old) → Move to `/docs/archive/`
- Completed plans → Mark as completed in ROADMAP.md
- Legacy docs → Add "LEGACY" prefix to filename

---

## Related Files

- **`/docs/ai-context/project-structure.md`** - Complete file tree for AI context
- **`/.claude/commands/`** - Claude Code automation command templates
- **`/.claude/hooks/`** - Pre-commit hook configurations

---

## API Documentation

- **`/docs/api/openapi.yaml`** - OpenAPI 3.1 specification for all API endpoints
- **`/docs/DEVELOPER_GUIDE.md`** - Complete developer setup and workflow guide
- **`/docs/USER_GUIDE.md`** - End-user guide for the application

---

**Last Updated:** 2026-01-05
**Registry Version:** 1.3
**Total Documentation Files:** 35+ markdown files
