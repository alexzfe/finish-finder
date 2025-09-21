# Contributing

## Table of Contents
1. [Workflow](#workflow)
2. [Development Environment](#development-environment)
3. [Quality Expectations](#quality-expectations)
4. [Pull Request Checklist](#pull-request-checklist)
5. [Issue Reporting](#issue-reporting)

## Workflow
- Fork or branch from `main`.
- Use feature branches named `feature/<slug>`, `fix/<slug>`, or `ops/<slug>`.
- Keep changes atomic; prefer multiple small PRs over one large drop.
- Rebase before merging to keep history linear.
- Require review from at least one maintainer. Production infrastructure changes need an additional review from an ops owner.

## Development Environment
1. Install dependencies with `npm install`.
2. Copy `.env.example` → `.env.local` and fill in secrets (OpenAI, Postgres, Sentry). Never commit `.env.local`.
3. Start the dev server with `npm run dev`.
4. Optional: seed data by exporting static JSON via `npm run pages:build` or running the scraper in `check` mode against a populated database.

### Helpful Commands
| Task | Command |
| --- | --- |
| Format & lint | `npm run lint` (Next.js ESLint configuration) |
| Type check | `npx tsc --noEmit` (temporary until dedicated script is added) |
| Run scraper | `npm run scraper:check` |
| Regenerate predictions | `npm run predict:event` / `npm run predict:all` |
| Export static bundle | `npm run pages:build` |

## Quality Expectations
- Typescript: prefer explicit types on exported functions and complex objects. Avoid `any`.
- React: favour pure components and memoisation for large lists; avoid prop drilling by promoting shared hooks.
- Prisma: run `npm run db:push` and inspect diffs before committing migrations.
- Errors: log via Sentry or `src/lib/monitoring/logger.ts`; do not swallow exceptions silently.
- Secrets: never commit live API keys, tokens, or connection strings. Rotate anything that leaks.

## Pull Request Checklist
- [ ] Branch is rebased on latest `main`.
- [ ] `npm run lint` (and future `npm run test`) succeed locally.
- [ ] Relevant scripts (scraper, prediction) pass when feature touches automation.
- [ ] Updated docs, configuration, and samples as needed.
- [ ] Added or updated logging/monitoring for new failure paths.
- [ ] Included screenshots or JSON samples for significant UI/data changes.

## Issue Reporting
- Use GitHub issues for bugs, enhancements, and chores.
- Include reproduction steps, expected vs. actual behaviour, and environment details (database provider, scraper mode).
- Flag security-sensitive findings privately via the maintainer contact listed in [`SECURITY.md`](SECURITY.md).
