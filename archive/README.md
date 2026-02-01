# Archive

This directory contains deprecated code and documentation preserved for reference.

## Archive Structure

### `scrapers-old-2025-01/` - TypeScript Scraper Implementation
**Date**: January 2025  
**Reason**: Replaced by Python/Scrapy implementation
- `wikipediaService.ts` - Wikipedia UFC event scraper
- `tapologyService.ts` - Tapology fighter enrichment service  
- `requestPolicy.ts` - Rate limiting and request headers

### `docs-old-2025-01/` - Old Documentation
**Date**: January 2025
- `scrapers-CONTEXT.md` - Component context for old scraper subsystem
- `TAPOLOGY_SCRAPER_PLAN.md` - Deprecated Tapology-first scraper plan

### `inactive-legacy-2025-09/` - Legacy AI & Scraping Code
**Date**: September 2025  
**Reason**: Superseded by unified prediction service and Python scraper
- `ufcAiService.ts` - Old AI prediction service
- `funPredictor.ts` - Legacy fun score predictor
- `scraping/ufcScraper.ts` - Old TypeScript UFC scraper
- `scraping/ufcStatsCollector.ts` - Legacy stats collector
- `app-api/api/` - Old API route implementations

### `scripts-deprecated/` - Deprecated Scripts
**Date**: February 2025  
**Reason**: Consolidated into unified prediction runner
- `ai-predictions-runner.js` - Original AI runner
- `new-ai-predictions-runner.ts` - Phase 3 experimental runner
- `generate-ai-predictions.js` - Old generation script
- `test-enhanced-prediction.ts` - Test script for enhanced service

## Current Implementation
- **Scraping**: `scraper/ufc_scraper/` (Python/Scrapy with UFCStats.com)
- **AI Predictions**: `src/lib/ai/unifiedPredictionService.ts` + `scripts/unified-ai-predictions-runner.ts`
- **API**: `src/app/api/internal/ingest/route.ts`

## Git History
All files are preserved in git history. Use `git log` to view complete implementation history.
