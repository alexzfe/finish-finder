import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  enabled: Boolean(process.env.SENTRY_DSN)
})
