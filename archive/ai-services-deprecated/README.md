# Deprecated AI Services (2025-02)

These AI prediction services have been superseded by the unified prediction architecture.

## Archived Services

### `hybridUFCService.ts`
- **Original Purpose**: Multi-source scraper combining Wikipedia, Tapology, and Sherdog
- **Status**: **BROKEN** - Imports from deleted scraper modules
- **Replacement**: `unifiedPredictionService.ts`

### `newPredictionService.ts`
- **Original Purpose**: Phase 3 experimental prediction service
- **Status**: Superseded by Phase 4 unified architecture
- **Replacement**: `unifiedPredictionService.ts`

### `enhancedPredictionService.ts`
- **Original Purpose**: Experimental enhanced predictions with embeddings
- **Status**: Experimental, never productionized
- **Replacement**: `unifiedPredictionService.ts` + `improvedFighterContextService.ts`

### `fighterContextService.ts`
- **Original Purpose**: Basic fighter context extraction
- **Status**: Superseded
- **Replacement**: `improvedFighterContextService.ts`

### `scrape-perf.test.ts`
- **Original Purpose**: Performance tests for hybridUFCService
- **Status**: Broken due to hybridUFCService dependencies
- **Replacement**: None (unified service has different test strategy)

## Current Architecture

Use these instead:
- **Primary**: `src/lib/ai/unifiedPredictionService.ts`
- **Prompts**: `src/lib/ai/prompts/unifiedPredictionPrompt.ts`
- **Scoring**: `src/lib/ai/scoreCalculator.ts`
- **Context**: `src/lib/ai/improvedFighterContextService.ts`

## Date Archived
February 2025

## Git History
All files preserved in git history. Use `git log` to view complete implementation history.
