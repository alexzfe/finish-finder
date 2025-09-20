# Prisma + Supabase Migration Checklist

1. **Switch Prisma Datasource**
   ```diff
   datasource db {
-    provider = "sqlite"
-    url      = "file:./dev.db"
+    provider = "postgresql"
+    url      = env("DATABASE_URL")
   }
   ```

2. **Provision Supabase Databases**
   - Create a Supabase project.
   - Add a `postgres_shadow` database (required for Prisma migrate in hosted environments):
     ```sql
     create database postgres_shadow;
     ```

3. **Apply Migrations**
   ```bash
   # Optional: generate new migration if the schema changed
   npx prisma migrate dev

   # Deploy migrations to Supabase
   DATABASE_URL=... SHADOW_DATABASE_URL=... npx prisma migrate deploy
   ```

4. **Verify Schema**
   ```bash
   DATABASE_URL=... npx prisma db pull
   ```

5. **Update Environment Variables**
   - Set `DATABASE_URL` in Vercel (and GitHub Actions) to the Supabase URI.
   - Ensure scraper cron job uses the same connection string.

6. **Update Local Dev**
   - If you still want SQLite for quick prototyping, keep a `.env.local` pointing to `file:./dev.db` and only use Postgres in production. Otherwise, use Supabase for all environments.
