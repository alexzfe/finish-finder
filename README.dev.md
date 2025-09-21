# Local Development Setup

## Quick Start

1. **Setup Environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your local database URL
   ```

2. **Start Local Database (Docker)**
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

3. **Initialize Database**
   ```bash
   npm run db:migrate
   npm run db:test
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

## Environment Variables

The `.env.local` file should contain:
- `DATABASE_URL` - PostgreSQL connection string for local development
- `OPENAI_API_KEY` - (Optional) For AI predictions
- Sentry keys - (Optional) For error monitoring

## Database Commands

- `npm run db:migrate` - Run database migrations
- `npm run db:push` - Push schema changes
- `npm run db:reset` - Reset database
- `npm run db:test` - Test database connection

## Troubleshooting

- If database connection fails, ensure PostgreSQL is running
- For SQLite fallback, change `provider = "postgresql"` to `provider = "sqlite"` in `prisma/schema.prisma`