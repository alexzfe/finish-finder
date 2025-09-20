# Environment Variables

| Variable | Scope | Description |
| --- | --- | --- |
| `DATABASE_URL` | Server | PostgreSQL connection string (Supabase) |
| `SHADOW_DATABASE_URL` | Server | Shadow DB URL for Prisma migrations (optional) |
| `OPENAI_API_KEY` | Server | OpenAI key for predictions |
| `SENTRY_DSN` | Server | Sentry backend DSN (finish-finder_backend) |
| `NEXT_PUBLIC_SENTRY_DSN` | Client | Sentry frontend DSN (finish-finder_frontend) |
| `SENTRY_TRACES_SAMPLE_RATE` | Server | Sampling rate for backend tracing |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Client | Sampling rate for frontend tracing |
| `SCRAPER_CANCEL_THRESHOLD` | Server | Event cancellation strikes (default 3) |
| `SCRAPER_FIGHT_CANCEL_THRESHOLD` | Server | Fight cancellation strikes (default 2) |
| `NEXT_PUBLIC_BASE_PATH` | Client | Base path for static hosting (GitHub Pages) |
| `SENTRY_TOKEN` | DevOps | Sentry API token for CLI / automation |

## Local (`.env.local`)
```
DATABASE_URL=postgresql://user:pass@db-host:5432/postgres?schema=public
SHADOW_DATABASE_URL=postgresql://user:pass@db-host:5432/postgres_shadow?schema=public
OPENAI_API_KEY=...
SENTRY_DSN=...
NEXT_PUBLIC_SENTRY_DSN=...
SENTRY_TRACES_SAMPLE_RATE=0.2
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
SCRAPER_CANCEL_THRESHOLD=3
SCRAPER_FIGHT_CANCEL_THRESHOLD=2
SENTRY_TOKEN=...
```

## Vercel Production Settings
Set via Project → Settings → Environment Variables:
- `DATABASE_URL`
- `OPENAI_API_KEY`
- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- Optional: `SENTRY_TRACES_SAMPLE_RATE`, `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`, `SCRAPER_CANCEL_THRESHOLD`, `SCRAPER_FIGHT_CANCEL_THRESHOLD`, `NEXT_PUBLIC_BASE_PATH`

Use Vercel secrets or the dashboard entries for Preview/Production envs.
