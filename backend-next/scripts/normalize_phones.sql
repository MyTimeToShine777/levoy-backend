-- One-off: bring phone numbers saved BEFORE the "default country" setting into the canonical "+<code><number>" form
-- (BUGS B7 / B14). From now on the API does this for every new or edited lead and every logged call.
--
-- Run once PER CUSTOMER DATABASE:
--     psql "$DATABASE_URL" -f scripts/normalize_phones.sql
--
-- It uses that workspace's default country (Settings → Phone numbers, default 91) and only touches numbers that are
-- exactly 10 digits with no "+" (so numbers that already carry a country code are never altered). Matching between leads
-- and calls already uses the last 10 digits, so nothing breaks either way.
-- The transaction ROLLS BACK by default: read the counts, then change the last line to COMMIT and run again.

BEGIN;

CREATE TEMP TABLE _cc AS
SELECT COALESCE((SELECT value FROM workspace_settings WHERE key = 'default_country' AND value ~ '^[1-9][0-9]{0,3}$'), '91') AS code;

\echo '--- leads to update'
SELECT count(*) AS leads_to_update FROM leads WHERE phone ~ '^[0-9]{10}$';
UPDATE leads SET phone = '+' || (SELECT code FROM _cc) || phone WHERE phone ~ '^[0-9]{10}$';

\echo '--- calls to update'
SELECT count(*) AS calls_to_update FROM call_events WHERE phone_number ~ '^[0-9]{10}$';
UPDATE call_events SET phone_number = '+' || (SELECT code FROM _cc) || phone_number WHERE phone_number ~ '^[0-9]{10}$';

-- Change ROLLBACK to COMMIT once the counts look right.
ROLLBACK;
