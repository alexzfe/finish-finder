# Environment Variables

| Variable | Scope | Description |
| --- | --- | --- |
| `DATABASE_URL` | Server | Connection string for Prisma (Postgres/Supabase). |
| `SHADOW_DATABASE_URL` | Server | Optional shadow DB for Prisma migrations in CI. |
| `OPENAI_API_KEY` | Server | OpenAI key used by the scraper and prediction scripts. |
| `SENTRY_DSN` | Server | Backend Sentry DSN (`finish-finder_backend`). |
| `NEXT_PUBLIC_SENTRY_DSN` | Client | Frontend Sentry DSN (`finish-finder_frontend`). |
| `SENTRY_TRACES_SAMPLE_RATE` | Server | Backend tracing sample rate (default 0.2). |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Client | Frontend tracing sample rate (default 0.1). |
| `SCRAPER_CANCEL_THRESHOLD` | Server | Consecutive misses before an event is marked cancelled (default 3). |
| `SCRAPER_FIGHT_CANCEL_THRESHOLD` | Server | Consecutive misses before a fight is removed (default 2). |
| `NEXT_PUBLIC_BASE_PATH` | Client | Base path for static export (GitHub Pages). |
| `SENTRY_TOKEN` | DevOps | Personal/Org token for Sentry CLI/automation. |

## Local Development (`.env.local`)
```
DATABASE_URL=postgresql://user:password@host:5432/postgres?schema=public
SHADOW_DATABASE_URL=postgresql://user:password@host:5432/postgres_shadow?schema=public
OPENAI_API_KEY=sk-...
SENTRY_DSN=...
NEXT_PUBLIC_SENTRY_DSN=...
SENTRY_TRACES_SAMPLE_RATE=0.2
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
SCRAPER_CANCEL_THRESHOLD=3
SCRAPER_FIGHT_CANCEL_THRESHOLD=2
SENTRY_TOKEN=...
```

## Production (Vercel recommended)
Set the above variables in Vercel → Project → Settings → Environment Variables.  
For GitHub Actions / cron jobs, supply the same secrets as repository or organization secrets.
