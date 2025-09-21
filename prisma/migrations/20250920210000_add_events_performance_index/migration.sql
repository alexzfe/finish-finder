-- Add composite index for event queries filtering by date and completion status
-- This optimizes the main API query in src/app/api/db-events/route.ts:44-46
CREATE INDEX "idx_events_date_completed" ON "public"."events"("date", "completed");

-- Add index for fight eventId foreign key joins
-- This optimizes fight queries when joining with events
CREATE INDEX "idx_fights_event_id" ON "public"."fights"("eventId");

-- Add index for fighter foreign key joins in fights
-- This optimizes queries when joining fights with fighters
CREATE INDEX "idx_fights_fighter1_id" ON "public"."fights"("fighter1Id");
CREATE INDEX "idx_fights_fighter2_id" ON "public"."fights"("fighter2Id");