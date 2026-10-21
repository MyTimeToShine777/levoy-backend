-- One-off: leads that already have calls in the call log but still read "(Not called yet)" / "Last contacted: Never".
-- From now on the API does this when a call is uploaded (BUGS B14).
--
-- Run once PER CUSTOMER DATABASE, AFTER scripts/fix_call_data.sql:
--     psql "$DATABASE_URL" -f scripts/backfill_lead_call_status.sql
--
-- For each lead that has a call from the person it is assigned to (matched on the last 10 digits):
--   * "last contacted" is set to the newest such call (never moved backwards);
--   * a lead with no call status yet becomes "Called" if anyone spoke, otherwise "Not Answered" if the agent rang.
-- A status an agent already chose is never touched.
-- Afterwards press "Recalculate" on the Lead Rules page (or open each lead) so tier, score and next action catch up.
-- The transaction ROLLS BACK by default: read the counts, then change the last line to COMMIT and run again.

BEGIN;

INSERT INTO lead_status_rules (call_status, status_key, base_priority, active_pipeline, win_prob, next_action, reached, interested_plus, demo_plus, sort_order)
VALUES ('Called', 'called', 30, true, 0.02, 'Record the outcome of the call', true, false, false, 10)
ON CONFLICT (status_key) DO NOTHING;

CREATE TEMP TABLE _lead_calls AS
SELECT l.id AS lead_id,
       max(c.timestamp)                                                        AS last_call,
       bool_or(COALESCE(c.duration_seconds, 0) > 0)                            AS spoke,
       bool_or(c.direction = 'outgoing')                                       AS rang
  FROM leads l
  JOIN call_events c
    ON c.user_id = l.assigned_to
   AND c.phone_key = right(regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g'), 10)
 WHERE l.deleted_at IS NULL AND l.merged_into_lead_id IS NULL
   AND (COALESCE(c.duration_seconds, 0) > 0 OR c.direction = 'outgoing')
 GROUP BY l.id;

\echo '--- leads that will be updated'
SELECT count(*) AS leads_with_calls FROM _lead_calls;
SELECT count(*) AS will_become_called
  FROM _lead_calls x JOIN leads l ON l.id = x.lead_id
 WHERE x.spoke AND lower(regexp_replace(COALESCE(l.call_status, ''), '[^a-zA-Z0-9]+', '', 'g')) IN ('', 'notcalledyet');
SELECT count(*) AS will_become_not_answered
  FROM _lead_calls x JOIN leads l ON l.id = x.lead_id
 WHERE NOT x.spoke AND x.rang AND lower(regexp_replace(COALESCE(l.call_status, ''), '[^a-zA-Z0-9]+', '', 'g')) IN ('', 'notcalledyet');

UPDATE leads l SET
       last_contacted_at   = CASE WHEN l.last_contacted_at IS NULL OR l.last_contacted_at < x.last_call THEN x.last_call ELSE l.last_contacted_at END,
       call_status         = CASE WHEN lower(regexp_replace(COALESCE(l.call_status, ''), '[^a-zA-Z0-9]+', '', 'g')) IN ('', 'notcalledyet')
                                  THEN CASE WHEN x.spoke THEN 'Called' ELSE 'Not Answered' END ELSE l.call_status END,
       call_attempted_date = CASE WHEN lower(regexp_replace(COALESCE(l.call_status, ''), '[^a-zA-Z0-9]+', '', 'g')) IN ('', 'notcalledyet')
                                  THEN x.last_call::date ELSE l.call_attempted_date END,
       updated_at = NOW()
  FROM _lead_calls x
 WHERE x.lead_id = l.id;

-- Change ROLLBACK to COMMIT once the counts look right.
ROLLBACK;
