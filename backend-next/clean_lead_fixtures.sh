#!/usr/bin/env bash
# Remove ONLY the rows this feature's own fixtures created, identified by the
# exact remarks markers from make_fixtures.js.
#
# This is deliberately NOT "DELETE FROM leads": the book holds real demo leads
# the app depends on, and the whole point of the engine is upsert-never-truncate.
# Every statement below is bounded by a marker list, so if the list is ever
# wrong the WHERE clause matches nothing and deletes nothing.
set -uo pipefail

MARKERS=(
  "Wants a demo next week"
  "Follow-up lapsed long ago"
  "No answer, retry evening"
  "Never dialled"
  "Comparing two vendors"
  "Signed — duplicate pharmacy+locality of row 1"
  "Demo completed, sending payment link"
  "Not interested, close the file"
  "Asked to call back next week"
  "Wants pricing for 5 outlets"
  "Second copy of the same phone number"
  "Phone is unusable"
  "Row has no name at all"
  "Status that is not in lead_status_rules"
  "Wants a demo booked this week"
  "Demo today, chase the payment link"
  "Different pharmacy owner, same Gupta Medical / Andheri"
)

# Build an exact-match IN list, quoted safely for psql.
LIST=""
for m in "${MARKERS[@]}"; do
  esc=${m//\'/\'\'}
  LIST="$LIST${LIST:+, }'$esc'"
done

echo "before: $(su postgres -c "psql -d levoy -tAc 'SELECT count(*) FROM leads'")"

# Child rows first so the FK constraints stay satisfied.
su postgres -c "psql -d levoy -tAc \"
  DELETE FROM lead_activities WHERE lead_id IN (SELECT id FROM leads WHERE remarks IN ($LIST));
  DELETE FROM lead_assignees  WHERE lead_id IN (SELECT id FROM leads WHERE remarks IN ($LIST));
  DELETE FROM lead_assignments WHERE lead_id IN (SELECT id FROM leads WHERE remarks IN ($LIST));
  DELETE FROM lead_follow_ups  WHERE lead_id IN (SELECT id FROM leads WHERE remarks IN ($LIST));
  DELETE FROM lead_tags        WHERE lead_id IN (SELECT id FROM leads WHERE remarks IN ($LIST));
  DELETE FROM leads            WHERE remarks IN ($LIST);
\"" 2>&1 | grep -v '^$' || true

# Telecaller bookkeeping is entirely this feature's, so it is cleared wholesale.
su postgres -c "psql -d levoy -tAc 'DELETE FROM lead_telecaller_unmatched; DELETE FROM lead_telecaller_map;'" 2>&1

echo "after:  $(su postgres -c "psql -d levoy -tAc 'SELECT count(*) FROM leads'")"
echo "fixture rows remaining: $(su postgres -c "psql -d levoy -tAc \"SELECT count(*) FROM leads WHERE remarks IN ($LIST)\"")"
