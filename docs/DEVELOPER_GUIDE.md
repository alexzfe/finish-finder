# Finish Finder Developer Guide

Complete guide for setting up, developing, and contributing to the Finish Finder project.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Project Structure](#project-structure)
4. [Development Workflow](#development-workflow)
5. [Database Setup](#database-setup)
6. [Running the Scraper](#running-the-scraper)
7. [AI Predictions](#ai-predictions)
8. [Testing](#testing)
9. [Deployment](#deployment)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 20+ | Next.js runtime |
| npm | 10+ | Package management |
| Python | 3.11+ | Scrapy scraper |
| PostgreSQL | 15+ | Database (with pgvector) |

### Optional Tools

- **Docker** - For containerized development
- **VS Code** - Recommended IDE with extensions:
  - Prisma
  - ESLint
  - Tailwind CSS IntelliSense
  - Mermaid Preview

### API Keys (for full functionality)

| Service | Required For | Get Key |
|---------|--------------|---------|
| OpenAI | AI predictions, embeddings | [platform.openai.com](https://platform.openai.com) |
| Anthropic | Alternative LLM | [console.anthropic.com](https://console.anthropic.com) |
| Brave Search | Fighter context enrichment | [brave.com/search/api](https://brave.com/search/api) |
| Sentry | Error monitoring | [sentry.io](https://sentry.io) |

---

## Quick Start

### 1. Clone and Install

```bash
# Clone repository
git clone https://github.com/your-org/finish-finder.git
cd finish-finder

# Install Node.js dependencies
npm install

# Install Python dependencies (for scraper)
cd scraper
pip install -r requirements.txt
pip install -r requirements-dev.txt  # For testing
cd ..
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env.local

# Edit with your values
nano .env.local
```

Required environment variables:

```env
# Database (Supabase PostgreSQL)
DATABASE_URL="postgresql://user:password@host:6543/postgres?pgbouncer=true"
DIRECT_DATABASE_URL="postgresql://user:password@host:5432/postgres"

# AI Services
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."  # Optional

# Scraper Authentication
INGEST_API_SECRET="your-secret-key"

# Optional
BRAVE_SEARCH_API_KEY="..."
SENTRY_DSN="..."
```

### 3. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database (development)
npx prisma db push

# Or run migrations (production)
npx prisma migrate deploy
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Project Structure

```
finish-finder/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            # Main page
│   │   ├── layout.tsx          # Root layout
│   │   ├── api/                # API routes
│   │   └── admin/              # Admin dashboard
│   │
│   ├── components/             # React components
│   │   ├── ui/                 # Base UI components
│   │   ├── fight/              # Fight-related components
│   │   └── fighter/            # Fighter components
│   │
│   ├── lib/                    # Shared libraries
│   │   ├── ai/                 # AI prediction system
│   │   │   ├── unifiedPredictionService.ts
│   │   │   ├── scoreCalculator.ts
│   │   │   ├── calibration/    # Platt scaling, conformal
│   │   │   ├── embeddings/     # pgvector integration
│   │   │   └── prompts/        # LLM prompts
│   │   │
│   │   ├── database/           # Prisma + monitoring
│   │   └── utils/              # Utility functions
│   │
│   ├── hooks/                  # React hooks
│   └── types/                  # TypeScript types
│
├── scraper/                    # Python Scrapy scraper
│   ├── ufc_scraper/
│   │   ├── spiders/            # Scrapy spiders
│   │   ├── items.py            # Data models
│   │   ├── parsers.py          # HTML parsing
│   │   └── pipelines.py        # Data processing
│   └── tests/                  # Python tests
│
├── scripts/                    # Automation scripts
├── prisma/                     # Database schema
├── docs/                       # Documentation
└── public/                     # Static assets
```

---

## Development Workflow

### Git Branching Strategy

```
main (production)
  └── dev (integration)
       ├── feature/add-new-component
       ├── fix/resolve-bug
       └── refactor/improve-performance
```

### Commit Convention

Use conventional commits:

```bash
feat(ai): add calibration support for fun scores
fix(scraper): handle missing fighter images
docs(api): update OpenAPI specification
refactor(db): optimize event queries
test(components): add FightList tests
```

### Code Quality

```bash
# Lint code
npm run lint

# Type check
npm run typecheck

# Run tests
npm run test:run

# All checks
npm run lint && npm run typecheck && npm run test:run
```

---

## Database Setup

### Local Development (SQLite)

For quick local development without PostgreSQL:

```bash
# Use SQLite for local development
DATABASE_URL="file:./prisma/dev.db"

# Push schema
npx prisma db push
```

### Production (Supabase PostgreSQL)

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Enable pgvector extension:

```sql
-- Run in Supabase SQL Editor
CREATE EXTENSION IF NOT EXISTS vector;
```

3. Configure connection strings:

```env
# Transaction pooler (for runtime)
DATABASE_URL="postgresql://postgres.[project]:password@aws-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"

# Direct connection (for migrations)
DIRECT_DATABASE_URL="postgresql://postgres.[project]:password@aws-[region].pooler.supabase.com:5432/postgres"
```

4. Run migrations:

```bash
DATABASE_URL="..." DIRECT_DATABASE_URL="..." npx prisma migrate deploy
```

### Database Commands

```bash
# View database in Prisma Studio
npx prisma studio

# Reset database (development only)
npx prisma migrate reset

# Generate migration
npx prisma migrate dev --name your_migration_name

# Pull remote schema
npx prisma db pull
```

---

## Running the Scraper

### Basic Usage

```bash
cd scraper

# Scrape upcoming events (default: all)
scrapy crawl ufcstats

# Limit to N events
scrapy crawl ufcstats -a limit=5

# Include completed events
scrapy crawl ufcstats -a include_completed=true

# Fetch fighter images
scrapy crawl ufcstats -a fetch_images=true

# Full scrape with all options
scrapy crawl ufcstats -a limit=10 -a include_completed=true -a fetch_images=true
```

### Environment Variables

```bash
# API endpoint (defaults to localhost:3000)
export INGEST_API_URL="https://finish-finder.vercel.app/api/internal/ingest"

# Authentication token
export INGEST_API_SECRET="your-secret-key"

# Run with env vars
INGEST_API_URL="..." INGEST_API_SECRET="..." scrapy crawl ufcstats
```

### Testing the Scraper

```bash
cd scraper

# Run all tests
pytest

# Run with coverage
pytest --cov=ufc_scraper

# Run specific test file
pytest tests/test_parsers.py

# Verbose output
pytest -v
```

---

## AI Predictions

### Running Predictions Manually

```bash
# Run unified AI predictions for all upcoming events
npx ts-node scripts/unified-ai-predictions-runner.ts

# Force regenerate predictions
npx ts-node scripts/unified-ai-predictions-runner.ts --force

# Specific event only
npx ts-node scripts/unified-ai-predictions-runner.ts --event "UFC 299"
```

### Calibration Training

```bash
# Bootstrap calibration from historical data
npx ts-node scripts/bootstrap-calibration.ts

# Train Platt scaling from DSPy evaluation data
npx ts-node scripts/train-platt-from-dspy.ts

# Generate fighter embeddings
OPENAI_API_KEY="..." npx ts-node scripts/bootstrap-embeddings.ts
```

### Testing Predictions

```bash
# Test enhanced prediction service
npx ts-node scripts/test-enhanced-prediction.ts

# Generate DSPy evaluation data
npx ts-node scripts/generate-dspy-eval-data.ts --limit 50
```

### Understanding the Prediction Pipeline

1. **Input**: Fighter statistics + event context
2. **Context Enrichment**: Similar fighters, news, analysis (via embeddings)
3. **LLM Call**: Multi-persona prompt with structured output
4. **Score Calculation**: Deterministic TypeScript formulas
5. **Validation**: Rule-based + optional LLM critique
6. **Calibration**: Platt scaling + conformal intervals
7. **Output**: Calibrated predictions with confidence intervals

Key files:
- `src/lib/ai/unifiedPredictionService.ts` - Main service
- `src/lib/ai/scoreCalculator.ts` - Score formulas
- `src/lib/ai/prompts/unifiedPredictionPrompt.ts` - LLM prompt

---

## Testing

### Running Tests

```bash
# Run all tests
npm run test:run

# Watch mode
npm run test

# Coverage report
npm run test:coverage

# Specific test file
npm run test:run -- src/lib/utils/__tests__/json.test.ts
```

### Test Structure

```
src/
├── lib/
│   ├── ai/__tests__/
│   │   ├── ordering.test.ts      # Fighter ordering tests
│   │   └── scrape-perf.test.ts   # Performance tests
│   ├── database/__tests__/
│   │   ├── validation.test.ts    # Input validation
│   │   └── monitoring-enhancements.test.ts
│   └── utils/__tests__/
│       ├── json.test.ts          # JSON parsing
│       └── weight-class.test.ts  # Weight class normalization
```

### Writing Tests

```typescript
// src/lib/utils/__tests__/example.test.ts
import { describe, it, expect } from 'vitest'
import { myFunction } from '../myModule'

describe('myFunction', () => {
  it('should handle basic case', () => {
    expect(myFunction('input')).toBe('expected')
  })

  it('should handle edge case', () => {
    expect(myFunction(null)).toBe(null)
  })
})
```

---

## Deployment

### Vercel Deployment

1. Connect repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy:

```bash
# Manual deploy
vercel deploy

# Production deploy
vercel deploy --prod
```

### Environment Variables for Production

Set these in Vercel dashboard:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection (pooler) |
| `DIRECT_DATABASE_URL` | PostgreSQL connection (direct) |
| `OPENAI_API_KEY` | OpenAI API key |
| `INGEST_API_SECRET` | Scraper authentication |
| `SENTRY_DSN` | Sentry error tracking |
| `NEXT_PUBLIC_BASE_PATH` | Base path (if not root) |

### GitHub Actions

The project includes two automated workflows:

1. **scraper.yml** (2:00 AM UTC daily)
   - Runs Python scraper
   - Posts data to ingestion API

2. **ai-predictions.yml** (1:30 AM UTC daily)
   - Generates AI predictions for new fights

Required GitHub Secrets:
- `DATABASE_URL`
- `INGEST_API_SECRET`
- `OPENAI_API_KEY`

---

## Troubleshooting

### Common Issues

#### Database Connection Errors

```
Error: Can't reach database server
```

**Solution**: Check `DATABASE_URL` format and network connectivity.

```bash
# Test connection
npx prisma db pull
```

#### Prisma Client Not Generated

```
Error: @prisma/client did not initialize
```

**Solution**: Regenerate Prisma client.

```bash
npx prisma generate
```

#### Scraper Authentication Failed

```
401 Unauthorized
```

**Solution**: Verify `INGEST_API_SECRET` matches server configuration.

#### OpenAI Rate Limits

```
Error: Rate limit exceeded
```

**Solution**: Add delays between requests or upgrade API tier.

```typescript
// In prediction runner, add delay between fights
await new Promise(resolve => setTimeout(resolve, 1000))
```

#### Memory Issues in Development

```
JavaScript heap out of memory
```

**Solution**: Increase Node.js memory limit.

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run dev
```

### Getting Help

1. Check existing documentation in `/docs`
2. Search GitHub issues
3. Review error logs in Sentry
4. Create a new issue with:
   - Error message
   - Steps to reproduce
   - Environment details

---

## API Quick Reference

### Public Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/db-events` | GET | Get all events with fights |
| `/api/health` | GET | System health check |
| `/api/performance` | GET | Query metrics |
| `/api/fighter-image?name=` | GET | Fighter image URL |

### Internal Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/internal/ingest` | POST | Bearer | Ingest scraped data |
| `/api/admin/wipe-database` | POST | Password | Reset database |

### Example API Calls

```bash
# Get events
curl https://finish-finder.vercel.app/api/db-events

# Health check
curl https://finish-finder.vercel.app/api/health

# Ingest data (authenticated)
curl -X POST \
  -H "Authorization: Bearer your-secret" \
  -H "Content-Type: application/json" \
  -d '{"events":[],"fights":[],"fighters":[]}' \
  https://finish-finder.vercel.app/api/internal/ingest
```

---

## Code Conventions

### TypeScript

- Use strict mode (`"strict": true` in tsconfig)
- Prefer interfaces over type aliases for objects
- Use explicit return types for public functions
- Avoid `any` - use `unknown` with type guards

### React Components

- Use functional components with hooks
- Memoize expensive computations with `useMemo`
- Use `memo()` for components that receive stable props
- Keep components focused and composable

### File Naming

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `FightList.tsx` |
| Services | camelCase | `unifiedPredictionService.ts` |
| API routes | kebab-case | `db-events/route.ts` |
| Tests | `*.test.ts` | `json.test.ts` |

### Documentation

- Add JSDoc comments for public functions
- Update CONTEXT.md files when modifying subsystems
- Keep README files current with setup changes

---

**Last Updated:** 2026-01-05
