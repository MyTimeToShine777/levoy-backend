-- One-off clean-up of call data uploaded before the server de-duplicated calls and corrected "connected" (BUGS B19, B20).
--
-- Run it once PER CUSTOMER DATABASE (each customer has its own, e.g. levoy_c6):
--     psql "$DATABASE_URL" -f scripts/fix_call_data.sql
--
-- It runs inside a transaction that ROLLS BACK by default and prints what it would change. Read the output, then change
-- the last line from ROLLBACK to COMMIT and run it again.
--
-- 1. A call the phone logged as "connected" but that lasted 0 seconds was never answered:
--    incoming -> missed, outgoing -> unanswered (the API now does this on upload).
-- 2. The same call stored twice (same user, same number, direction, length and second) is reduced to one row.
--    A row that has a recording, a QA review or a tag is always the one kept, so none of those are ever deleted.

BEGIN;

\echo '--- 1. zero-second "connected" calls that will be relabelled'
SELECT direction, count(*) AS calls
  FROM call_events
 WHERE status = 'connected' AND COALESCE(duration_seconds, 0) = 0
 GROUP BY direction;

UPDATE call_events
   SET status = CASE WHEN direction = 'incoming' THEN 'missed' ELSE 'unanswered' END
 WHERE status = 'connected' AND COALESCE(duration_seconds, 0) = 0;

\echo '--- 2. duplicate calls that will be removed'
CREATE TEMP TABLE call_dupes AS
WITH ranked AS (
  SELECT c.id,
         row_number() OVER (
           PARTITION BY c.user_id, c.phone_key, c.direction, COALESCE(c.duration_seconds, 0), date_trunc('second', c.timestamp)
           ORDER BY (EXISTS (SELECT 1 FROM call_recordings r WHERE r.call_id = c.id)
                  OR EXISTS (SELECT 1 FROM call_reviews v WHERE v.call_id = c.id)
                  OR EXISTS (SELECT 1 FROM call_event_tags t WHERE t.call_id = c.id)) DESC,
                    c.id ASC) AS rn
    FROM call_events c
   WHERE c.phone_key IS NOT NULL
)
SELECT r.id
  FROM ranked r
 WHERE r.rn > 1
   AND NOT EXISTS (SELECT 1 FROM call_recordings x WHERE x.call_id = r.id)
   AND NOT EXISTS (SELECT 1 FROM call_reviews x WHERE x.call_id = r.id)
   AND NOT EXISTS (SELECT 1 FROM call_event_tags x WHERE x.call_id = r.id);

SELECT count(*) AS duplicate_calls_to_delete FROM call_dupes;

DELETE FROM call_events WHERE id IN (SELECT id FROM call_dupes);

SELECT count(*) AS calls_left FROM call_events;

-- Change ROLLBACK to COMMIT once the numbers above look right.
ROLLBACK;
