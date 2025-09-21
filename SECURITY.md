# Security

## Table of Contents
1. [Guiding Principles](#guiding-principles)
2. [Secrets Management](#secrets-management)
3. [Data Handling](#data-handling)
4. [Dependency Hygiene](#dependency-hygiene)
5. [Vulnerability Reporting](#vulnerability-reporting)

## Guiding Principles
- Treat all API keys (OpenAI, Google, Sentry) as high-value secrets.
- Store production databases in managed services with role-based access.
- Limit third-party scraping frequency to avoid bans and require TLS for all outbound calls.
- Keep audit trails for scraper activity (logs + strike ledgers).

## Secrets Management
- Never commit `.env`, `.env.local`, or live credentials. `.env.example` contains placeholders only.
- Use Vercel/Render/Supabase secret stores for runtime configuration. GitHub Actions should pull secrets/variables from repository settings.
- Rotate credentials immediately if they appear in git history. See ROADMAP for automation to enforce secret scanning.

## Data Handling
- Stored data: upcoming event schedules, fighter records, AI predictions. No PII.
- Logs may contain scraped fighter names and Sherdog URLs; treat as public-level data but avoid distributing externally.
- When exporting `public/data/events.json`, ensure no internal tokens or admin annotations leak.
- If enabling fighter imagery scraping, respect robots.txt, set descriptive user agents, and cache aggressively to reduce load.

## Dependency Hygiene
- Review `npm audit` monthly and after upgrades. Lockfiles must be committed.
- Pin Prisma and OpenAI SDK versions; major bumps require re-running integration tests.
- Docker images should track current LTS (Node 20). Rebuild images when security patches land.
- Add GitHub Dependabot or Renovate (tracked in ROADMAP) to automate updates.

## Vulnerability Reporting
- Please disclose privately via the maintainer email in package metadata or direct GitHub security advisories.
- Include reproduction steps, impact assessment, and suggested remediation if available.
- Expect an acknowledgement within 2 business days and coordinated disclosure within 30 days for high-impact issues.
