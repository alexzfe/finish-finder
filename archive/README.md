# Archive - Old Scraper Implementation (2025-01)

## Purpose
This directory contains the archived scraper implementation that was replaced as part of the complete scraper redesign. The old implementation had reliability issues with Wikipedia/Tapology/Sherdog multi-source architecture.

## What's Archived

### Code (`scrapers-old-2025-01/`)
- `wikipediaService.ts` - Wikipedia UFC event scraper (primary source)
- `tapologyService.ts` - Tapology fighter enrichment service
- `requestPolicy.ts` - Rate limiting and request headers

### Documentation (`docs-old-2025-01/`)
- `scrapers-CONTEXT.md` - Component context for old scraper subsystem
- `TAPOLOGY_SCRAPER_PLAN.md` - Deprecated Tapology-first scraper plan

## Why Archived
The old implementation suffered from:
- Intermittent failures despite extensive debugging
- Complex multi-source deduplication logic
- Aggressive anti-scraping from Tapology/Sherdog
- Site structure changes breaking scrapers
- TypeScript complexity for web scraping tasks

## New Approach
Starting fresh with:
- **UFCStats.com as primary target** (recommended by research)
- **Python-based implementation** (industry standard for scraping)
- **Simpler, more maintainable architecture**
- **Content hash-based change detection**
- **Better anti-blocking strategies**

## Reference Materials Kept
- `Building a comprehensive.md` - Comprehensive UFC scraper research guide (kept in root)
- Existing database schema (Prisma)
- AI prediction pipeline (unchanged)

## Date Archived
January 2025

## Git History
All files are preserved in git history. Use `git log` to view complete implementation history.
