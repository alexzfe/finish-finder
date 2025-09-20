# Prisma + Supabase Checklist

1. **Update Prisma provider**
   ```diff
   datasource db {
-    provider = "sqlite"
-    url      = "file:./dev.db"
+    provider = "postgresql"
+    url      = env("DATABASE_URL")
   }
   ```

2. **Create Supabase minimal shadow database**
   - In Supabase SQL editor:
     ```sql
     create database postgres_shadow;
     ```

3. **Apply migrations**
   ```bash
   # Generate migration if schema changed
   npx prisma migrate dev

   # Deploy migrations to Supabase
   DATABASE_URL=... SHADOW_DATABASE_URL=... npx prisma migrate deploy
   ```

4. **Seed / verify**
   ```bash
   DATABASE_URL=... npx prisma db pull
   ```

5. **Update scraper/API to point to Supabase**
   - Ensure `DATABASE_URL` is set in environment for cron jobs and the Vercel app.

