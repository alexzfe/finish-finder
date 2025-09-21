# Roadmap

## Horizon: Now (0–2 weeks)
| Item | Why | Measurable Outcome | Effort | Risks/Mitigations | Owner | Dependencies |
| --- | --- | --- | --- | --- | --- | --- |
| ✅ **Database performance optimization** | **Critical performance and safety improvements** | **Indexes added, connection pooling optimized, transactions implemented** | **M** | **Low risk, backward compatible** | **Database Engineer** | **None** |
| ✅ **TypeScript strict mode migration** | **Eliminate `any` types causing runtime errors** | **Strict mode enabled, all `any` types documented with ESLint disable comments, Vercel deployment successful** | **M** | **Low risk, compile-time safety** | **Frontend Engineer** | **None** |
| ✅ **Local development environment** | **Enable developers to run project locally** | **Docker Compose, .env.local template, development documentation** | **S** | **Low risk, dev-only changes** | **DevOps Engineer** | **None** |
| ✅ **Repository cleanup** | **Reduce repo size and git noise** | **Build artifacts removed from git, gitignore updated** | **L** | **Low risk, housekeeping** | **Maintenance** | **None** |
| ✅ **Lint/type build blocker infrastructure** | **Infrastructure to prevent silent regressions** | **Build configuration tested and confirmed working** | **M** | **Low risk, infrastructure ready** | **DevOps Engineer** | **TypeScript fixes** |
| ✅ **TypeScript strict mode infrastructure** | **Enable comprehensive type safety enforcement** | **TypeScript compilation passes; ESLint strict mode active** | **M** | **Low risk, quality gate working** | **Frontend Engineer** | **Build infrastructure** |
| Secret hygiene remediation | Keys leaked in history | Rotated Sentry/OpenAI/Google tokens; secret scanning job added | M | Rotation requires coordination → stage rollouts by environment | Security Champ | Access to secret managers |
| ✅ **JSON parsing & error handling tests** | **Lock in recent fixes** | **Vitest suite with 60 tests achieving 99.06% coverage on JSON utilities, weight-class validation, and database validation functions** | **M** | **✅ Complete - Vitest config bootstrapped, comprehensive test patterns established** | **Backend Engineer** | **✅ Lint/type blockers working** |

## Horizon: Next (2–6 weeks)
| Item | Why | Measurable Outcome | Effort | Risks/Mitigations | Owner | Dependencies |
| --- | --- | --- | --- | --- | --- | --- |
| **Database query monitoring** | **Visibility into performance as data scales** | **Slow query logging and alerts implemented** | **M** | **Observability only, low risk** | **Database Engineer** | **Database optimization complete** |
| Scraper reliability hardening | Sherdog 403s & false cancellations | Proxy/backoff layer + integration tests; strike ledger configurable via admin | H | Proxy costs → evaluate lightweight rotating user agents first | Data Engineer | ✅ JSON parsing tests complete |
| Add automated test suites | Increase confidence | CI running Vitest (≥60% stmt coverage on `src/lib/**`) + Playwright smoke for UI | H | Flaky UI tests → start with headless-only smoke path | QA Lead | ✅ Vitest bootstrap complete |
| Observability enhancements | Improve triage | Standard log fields + scrape duration metrics + Sentry breadcrumb tagging | M | Requires schema for metrics storage → start with structured logs shipped to log store | Platform Engineer | Scraper hardening |
| Contributor onboarding refinements | Shorten ramp | Update handbook references, add `pnpm`/`docker` instructions, record walkthrough video | M | Docs drift quickly → assign owner for monthly review | DX Lead | Docs overhaul complete |

## Horizon: Later (6–12+ weeks)
| Item | Why | Measurable Outcome | Effort | Risks/Mitigations | Owner | Dependencies |
| --- | --- | --- | --- | --- | --- | --- |
| **Database partitioning strategy** | **Scale to handle historical data growth** | **Event partitioning by date implemented** | **L** | **High complexity, requires careful migration** | **Database Engineer** | **Query monitoring baseline** |
| **Read replica implementation** | **Separate read/write workloads** | **Read replica configured with lag monitoring** | **L** | **Data consistency challenges** | **Database Engineer** | **Query monitoring, partitioning** |
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
