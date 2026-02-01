# Archive - Inactive Legacy Code (2025-09)

## Purpose
This directory contains legacy code that has been superseded by newer implementations.

## What's Archived

### AI Services
- `ufcAiService.ts` - Old AI prediction service (replaced by UnifiedPredictionService)
- `funPredictor.ts` - Legacy fun score predictor

### Scraping
- `scraping/ufcScraper.ts` - Old TypeScript UFC scraper
- `scraping/ufcStatsCollector.ts` - Legacy stats collector (replaced by Python/Scrapy)

### API Routes
- `app-api/api/` - Old API route implementations

### Tests
- `test-scraper.js` - Legacy scraper tests

## Why Archived
These files represent earlier iterations of:
1. **AI Prediction System** - Now using UnifiedPredictionService with deterministic scoring
2. **Data Collection** - Migrated from TypeScript to Python/Scrapy for better reliability
3. **API Architecture** - Reorganized with new ingestion API

## Current Implementation
- **AI**: `src/lib/ai/unifiedPredictionService.ts` (single LLM call, deterministic scoring)
- **Scraping**: `scraper/ufc_scraper/` (Python/Scrapy with UFCStats.com)
- **API**: `src/app/api/internal/ingest/route.ts` (transaction-safe upserts)

## Date Archived
September 2025

## Git History
All files preserved in git history. Use `git log` to view complete implementation history.
