-- SQL script to clean up duplicate events in production database

-- 1. Remove fights from corrupted numbered events first (to avoid FK constraints)
DELETE FROM fights
WHERE event_id IN (
  SELECT id FROM events
  WHERE name IN ('733', '734', '735', '736', '737', '738', '739', '740', '741', '742', '743', '744', '745', '746', '747')
);

-- 2. Remove the corrupted numbered events
DELETE FROM events
WHERE name IN ('733', '734', '735', '736', '737', '738', '739', '740', '741', '742', '743', '744', '745', '746', '747');

-- 3. Remove fights from duplicate UFC Fight Night events (keep newer versions)
DELETE FROM fights
WHERE event_id IN (
  'ufc-fight-night-262-de-ridder-vs-allen',
  'ufc-fight-night-261-oliveira-vs-fiziev'
);

-- 4. Remove the older duplicate UFC Fight Night events
DELETE FROM events
WHERE id IN (
  'ufc-fight-night-262-de-ridder-vs-allen',
  'ufc-fight-night-261-oliveira-vs-fiziev'
);

-- 5. Check remaining duplicates by showing events with same date
SELECT
  date,
  COUNT(*) as event_count,
  STRING_AGG(name, ' | ') as event_names
FROM events
GROUP BY date
HAVING COUNT(*) > 1
ORDER BY date DESC;

-- 6. Show final count and recent events
SELECT COUNT(*) as total_events FROM events;

SELECT
  name,
  date,
  id,
  (SELECT COUNT(*) FROM fights WHERE event_id = events.id) as fight_count
FROM events
ORDER BY date DESC
LIMIT 10;