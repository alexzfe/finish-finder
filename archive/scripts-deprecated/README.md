# Archive - Deprecated Scripts (2025-02)

## Purpose
These scripts have been superseded by newer implementations and are no longer used in production.

## Deprecated Scripts

### AI Prediction Runners
- `ai-predictions-runner.js` - Original AI prediction runner (superseded by unified runner)
- `new-ai-predictions-runner.ts` - Phase 3 experimental runner (superseded by unified runner)
- `generate-ai-predictions.js` - Old generation script (superseded by unified runner)

### Test Scripts  
- `test-enhanced-prediction.ts` - Test script for enhanced prediction service (experimental)

## Current Implementation
Use these instead:
- **Primary**: `scripts/unified-ai-predictions-runner.ts` (Phase 4, SOTA architecture)
- **Legacy npm scripts**: 
  - `npm run predict:event` → `scripts/generate-event-predictions.js`
  - `npm run predict:all` → `scripts/generate-predictions-only.js`

## Date Archived
February 2025

## Git History
All files preserved in git history. Use `git log` to view complete implementation history.
