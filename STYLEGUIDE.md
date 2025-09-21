# Style Guide

## Table of Contents
1. [TypeScript](#typescript)
2. [React & Next.js](#react--nextjs)
3. [Styling](#styling)
4. [Logging & Monitoring](#logging--monitoring)
5. [Scripts & Automation](#scripts--automation)
6. [Git Hygiene](#git-hygiene)

## TypeScript
- Prefer explicit interfaces for domain objects. Re-export shared types from `src/types/index.ts`.
- Avoid `any`; fall back to `unknown` with runtime refinement when necessary.
- Group helper functions near usage; export only what the component boundary requires.
- Narrow third-party JSON with dedicated parsing helpers (example: `parseJsonArray` in `src/app/api/db-events/route.ts`).

## React & Next.js
- Client components should declare `'use client'` and keep state local. Promote shared logic to hooks under `src/lib/hooks/`.
- Derive UI state from props instead of duplicating data. Memoise expensive lists (see `FightList`).
- Handle undefined/null gracefully before rendering to avoid runtime crashes. Guard user-facing strings with defaults.
- Keep fetch logic inside `useEffect` with abort guards when integrating additional endpoints.

## Styling
- Use the UFC-inspired CSS variables defined in `globals.css`. Utility classes are Tailwind-flavoured; prefer composition over bespoke class names.
- Reuse typography classes (`ufc-condensed`, tracking utilities) for visual consistency.
- Keep inline styles minimal—promote repeating patterns to CSS modules or shared utility classes.

## Logging & Monitoring
- Use the typed loggers from `src/lib/monitoring/logger.ts` instead of raw `console.log` in new code.
- Include context objects for warnings/errors (`{ eventId, fightId }`) to simplify triage.
- Capture errors with Sentry where appropriate (`Sentry.captureException`).

## Scripts & Automation
- Keep scripts idempotent and re-runnable. Ensure they exit with non-zero status on failure.
- Validate JSON/CSV writes before overwriting files under `public/data` or `docs/`.
- When adding new scripts, update `package.json` and `OPERATIONS.md` runbooks.

## Git Hygiene
- Do not commit secrets, personal `.env` files, or generated artifacts outside `docs/` static exports.
- One logical change per commit. Use conventional-style prefixes when possible: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
- Update CHANGELOG/roadmap docs when shipping user-visible features or operational changes.
