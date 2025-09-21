# Roadmap

## Horizon: Now (0–2 weeks)
| Item | Why | Measurable Outcome | Effort | Risks/Mitigations | Owner | Dependencies |
| --- | --- | --- | --- | --- | --- | --- |
| Reinstate lint/type build blockers | Prevent silent regressions | `npm run build` fails on ESLint/TS errors; CI job enforcing `npm run lint` + `npx tsc --noEmit` | M | Existing issues may surface → schedule pairing to fix quickly | Triage Engineer | None |
| Secret hygiene remediation | Keys leaked in history | Rotated Sentry/OpenAI/Google tokens; secret scanning job added | M | Rotation requires coordination → stage rollouts by environment | Security Champ | Access to secret managers |
| JSON parsing & error handling tests | Lock in recent fixes | Vitest suite covering `parseJsonArray`, API transformers, and weight-class guard | M | Needs test harness → bootstrap minimal Vitest config | Backend Engineer | Reinstate lint/type blockers |
| GitHub Pages artifact policy | Reduce repo size | `docs/_next` removed from git; build workflow publishes artifacts instead | L | Need Pages alternative → keep manual fallback until automation lands | Ops Lead | Build automation PR |

## Horizon: Next (2–6 weeks)
| Item | Why | Measurable Outcome | Effort | Risks/Mitigations | Owner | Dependencies |
| --- | --- | --- | --- | --- | --- | --- |
| Scraper reliability hardening | Sherdog 403s & false cancellations | Proxy/backoff layer + integration tests; strike ledger configurable via admin | H | Proxy costs → evaluate lightweight rotating user agents first | Data Engineer | JSON parsing tests |
| Add automated test suites | Increase confidence | CI running Vitest (≥60% stmt coverage on `src/lib/**`) + Playwright smoke for UI | H | Flaky UI tests → start with headless-only smoke path | QA Lead | Reinstate build blockers, Vitest bootstrap |
| Observability enhancements | Improve triage | Standard log fields + scrape duration metrics + Sentry breadcrumb tagging | M | Requires schema for metrics storage → start with structured logs shipped to log store | Platform Engineer | Scraper hardening |
| Contributor onboarding refinements | Shorten ramp | Update handbook references, add `pnpm`/`docker` instructions, record walkthrough video | M | Docs drift quickly → assign owner for monthly review | DX Lead | Docs overhaul complete |

## Horizon: Later (6–12+ weeks)
| Item | Why | Measurable Outcome | Effort | Risks/Mitigations | Owner | Dependencies |
| --- | --- | --- | --- | --- | --- | --- |
| Prediction pipeline optimisation | Reduce OpenAI cost/latency | Batched inference with caching; 30% fewer tokens per scrape | H | Model drift risk → add evaluation dataset | ML Engineer | Observability metrics |
| Real-time data ingestion | Decrease reliance on scraping | Integrate UFC API or partner data feed; fallback scrape used only as backup | H | Licensing constraints → secure legal approval before build | Product Lead | Scraper hardening |
| Personalisation & notifications | Increase engagement | User preferences stored; email/push notifications for high-fun fights | H | Requires auth & consent flows | Product Team | Data pipeline stabilised |

## Quality Gates
- PRs must pass `npm run lint`, `npx tsc --noEmit`, and (once available) `npm run test` with coverage ≥60% on core libraries.
- Scraper jobs must exit 0 and update strike ledgers; add alert if consecutive failures ≥2.
- Require security scan (gitleaks or GitHub secret scanning) on every push to `main`.

## Observability Plan
- Standardise log payloads (`service`, `eventId`, `durationMs`, `result`) and ship to a managed log sink (e.g., Logtail) weekly.
- Instrument scraper duration and OpenAI token counts via custom metrics; expose Prometheus-style endpoint for Docker scheduler.
- Configure Sentry performance monitoring with meaningful transactions (scraper run, API request) and sample rate 0.2.
- Add health endpoint `/api/health` checking DB connectivity and last scrape timestamp.

## Security Hygiene
- Rotate secrets quarterly and immediately after any suspected leak.
- Enable Dependabot (monthly) for npm and GitHub Actions updates; triage within 7 days.
- Require PR template checkbox confirming no secrets or large artifacts were added.
- Document break-glass process for disabling scraper or OpenAI usage when quotas exhausted.
