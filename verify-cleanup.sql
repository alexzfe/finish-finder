-- Simple verification queries to check if duplicates were removed

-- 1. Check total event count
SELECT COUNT(*) as total_events FROM events;

-- 2. Check for events with same date (potential duplicates)
SELECT
  date::date,
  COUNT(*) as event_count,
  STRING_AGG(name, ' | ' ORDER BY name) as event_names
FROM events
GROUP BY date::date
HAVING COUNT(*) > 1
ORDER BY date DESC;

-- 3. Check if specific duplicates were removed
SELECT id, name, date::date
FROM events
WHERE name LIKE '%de Ridder vs. Allen%'
   OR name LIKE '%Oliveira vs. Fiziev%'
ORDER BY date, name;

-- 4. Check for corrupted numbered events
SELECT id, name, date::date
FROM events
WHERE name IN ('733', '734', '735', '736', '737', '738', '739', '740', '741', '742', '743', '744', '745', '746', '747')
ORDER BY name;

-- 5. Show recent events
SELECT
  id,
  name,
  date::date,
  (SELECT COUNT(*) FROM fights WHERE event_id = events.id) as fight_count
FROM events
ORDER BY date DESC
LIMIT 10;