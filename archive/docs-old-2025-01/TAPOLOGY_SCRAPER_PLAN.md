# Tapology Scraper Plan

## Goal
- Build a robust Tapology-first scraper (UFC promotions page → event page → ordered fight list + fighter images/records), integrate it into the scraper → DB → AI pipeline with clean contracts and observability.

## Source & Data
- Source: https://www.tapology.com/fightcenter/promotions/1-ultimate-fighting-championship-ufc
- Data:
  - Upcoming UFC events: name, date, venue, location, canonical `tapologyUrl`.
  - Per-event fights ordered with card position, title flags, scheduled rounds.
  - Fighters: names, records (W-L-D), wins/losses/draws, profile links and images.

## Data Model Mapping
- Event: `id/slug`, `name`, `date`, `venue`, `location`, `source='tapology'`, `tapologyUrl`.
- Fight: `id=eventSlug-match-<num>`, `eventId`, `fighter1Id/2Id`, `cardPosition` (`main|preliminary|early-preliminary`), `scheduledRounds`, `titleFight?`, `mainEvent?`, `fightNumber`.
- Fighter: `id=normalized-name` (or tapology slug), `name`, `record` (`W-L-D`) parsed to `wins/losses/draws`, optional `imageUrl`.

## Architecture
- `src/lib/scrapers/tapologyService.ts`
  - `getUpcomingEvents()` – parse promotions page upcoming events.
  - `getEventFights(url)` – parse event page fights in card order; mark headliner; compute `fightNumber`.
  - `getFighterRecordByName()` / image helpers (already present) – used for enrichment.
- Orchestrator integration (`HybridUFCService`)
  - Prefer Tapology for discovery and fight details; fallback to Wikipedia; Sherdog optional.
  - Upsert fighters first (records/images), then events and fights.
  - Preserve AI fields on updates.

## Selectors & Parsing (initial)
- Promotions page: `.fightcenter_event_listing, .event_listing, .promotion_event` → anchor `href` to event; extract event name/date and venue/location.
- Event page: `.fight_card_bout, .bout, .fight_listing` → fighter names (anchors), records, `weight_class`, title badges; infer card position sections.
- Fighter profile: `.fighter-image img`, fallbacks.

## Anti-Blocking & Performance
- Realistic headers; small randomized delays; retry/backoff on 429/5xx.
- Conservative concurrency; basic in-memory cache for event listings and fighter lookups.

## Validation & Idempotency
- Use `validateFightData`/`validateFighterData`; JSON fields via `validateJsonField`.
- Event-scoped fight IDs; upserts and `createMany` with `skipDuplicates`.
- Keep AI columns untouched unless updated intentionally.

## Observability
- Structured logs: scrape start/end, event counts, per-event fight counts, validation failures, DB upserts, retries.
- Optional DEBUG mode to dump parsed artifacts under `logs/`.

## Testing Strategy
- Unit: fixture-driven HTML parser tests for promotions/event pages; record parsing edge cases.
- Integration: offline parse → normalized fights → mock DB write.
- E2E: single live smoke (flagged/skipped in CI without network), verify ordered fights/headliner.

## Workflow Integration
- New source order in `HybridUFCService`: Tapology → Wikipedia → Sherdog.
- Add `scripts/scrape-tapology.js` for local dev (list/dump).
- CI: keep “Automated Scraper”; network on; modest event limit.

## Rollout Plan
1. Build/verify parser against fixtures (1–2 days).
2. Integrate in orchestrator; write to dev DB; verify API/UI (1 day).
3. Hardening: retry/backoff, caching, logs (0.5 day).
4. CI wiring + small dry run (0.5 day).
5. Expand limits; monitor; remove legacy fallbacks as confidence grows.

## Risks & Mitigations
- Site drift → fixture tests + selector fallbacks.
- Anti-bot friction → headers, backoff, low concurrency, cache.
- Dupes → event-scoped IDs and upsert policies.

## Definition of Done
- Tapology-first scrape yields ordered fights across ≥3 upcoming events.
- Fighters enriched with records/images when available.
- `/api/db-events` returns correct ordering; UI shows headliner first.
- Tests added; CI scraper succeeds with small limit; logs clean.

