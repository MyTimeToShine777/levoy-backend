#!/bin/bash
# Verification for multi-assignee leads, admin user management, audit log, capacity.
# Every section prints the real curl response + HTTP status.
API=http://localhost:3001
LOG=/tmp/verify_admin.log
: > "$LOG"

hr() { echo "" >> "$LOG"; echo "==================================================================" >> "$LOG"; echo "$1" >> "$LOG"; echo "==================================================================" >> "$LOG"; }
sub() { echo "" >> "$LOG"; echo "-- $1 --" >> "$LOG"; }

# Writes to $LOG *and* stdout so callers can capture the body with $( ).
call() {
  local m=$1 p=$2 tok=$3 body=$4
  local out
  if [ -n "$tok" ]; then
    out=$(curl -s -w '\n<<HTTP %{http_code}>>' -X "$m" "$API$p" -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' ${body:+-d "$body"})
  else
    out=$(curl -s -w '\n<<HTTP %{http_code}>>' -X "$m" "$API$p" -H 'Content-Type: application/json' ${body:+-d "$body"})
  fi
  echo "$out" >> "$LOG"
  echo "$out"
}
# status only
code() {
  local m=$1 p=$2 tok=$3 body=$4
  if [ -n "$tok" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$m" "$API$p" -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' ${body:+-d "$body"}
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$m" "$API$p" -H 'Content-Type: application/json' ${body:+-d "$body"}
  fi
}
# Extract a field from a JSON body. Strips the trailing "<<HTTP nnn>>" marker
# first — call() appends it, and a bare json.load() on that input raises
# "Extra data", which would silently yield an empty variable.
jq_() { python3 -c "
import sys, json
raw = sys.stdin.read().rsplit('<<HTTP', 1)[0].strip()
try:
    d = json.loads(raw)
except Exception:
    print(''); sys.exit(0)
try:
    print($1)
except Exception:
    print('')
" 2>/dev/null; }

echo "###########################################################" >> "$LOG"
echo "# Callio — multi-assignee / admin users / audit / capacity" >> "$LOG"
echo "# run: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
echo "###########################################################" >> "$LOG"

hr "0. TOKENS"
sub "admin login"
ADMIN=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@levoy.co","password":"demo1234"}')
echo "$ADMIN" >> "$LOG"
AT=$(echo "$ADMIN" | jq_ "d['access_token']")
ADMIN_ID=$(echo "$ADMIN" | jq_ "d['user']['id']")
sub "manager login"
MGR=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' -d '{"email":"manager@levoy.co","password":"demo1234"}')
echo "$MGR" >> "$LOG"
MT=$(echo "$MGR" | jq_ "d['access_token']")
sub "agent1 login (must be blocked from every admin route)"
AG=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' -d '{"email":"agent1@levoy.co","password":"demo1234"}')
echo "$AG" >> "$LOG"
GT=$(echo "$AG" | jq_ "d['access_token']")
AGENT1_ID=$(echo "$AG" | jq_ "d['user']['id']")
echo "admin_id=$ADMIN_ID agent1_id=$AGENT1_ID" >> "$LOG"

# Every id below is used to build a URL; a silently-empty one would produce a
# 404 that looks like a server bug instead of a broken test.
need() { [ -n "$2" ] || { echo "FATAL: \$$1 is empty — aborting" | tee -a "$LOG"; exit 1; }; }

STAMP=$(date +%s%N | tail -c 8)
EMAIL_A="qa.created.$STAMP@levoy.co"
EMAIL_B="qa.gen.$STAMP@levoy.co"
EMAIL_INV="qa.invited.$STAMP@levoy.co"
EMAIL_REV="qa.revoked.$STAMP@levoy.co"
EMAIL_SELF="qa.selfreg.$STAMP@levoy.co"

hr "A. ADMIN CREATES USERS"
sub "A1. POST /api/users with an EXPLICIT password"
UA=$(call POST /api/users "$AT" "{\"email\":\"$EMAIL_A\",\"name\":\"QA Explicit\",\"phone\":\"+9190000001\",\"role\":\"agent\",\"password\":\"explicit123\",\"team_ids\":[2]}")
echo "$UA" >> "$LOG"
QAUID_A=$(echo "$UA" | jq_ "d['id']")
need QAUID_A "$QAUID_A"
echo "  -> user id $QAUID_A" >> "$LOG"

sub "A2. duplicate email is rejected"
call POST /api/users "$AT" "{\"email\":\"$EMAIL_A\",\"name\":\"Dup\",\"role\":\"agent\"}"

sub "A3. invalid email rejected"
call POST /api/users "$AT" '{"email":"not-an-email","name":"X","role":"agent"}'

sub "A4. invalid role rejected"
call POST /api/users "$AT" "{\"email\":\"qa.badrole.$STAMP@levoy.co\",\"name\":\"X\",\"role\":\"superuser\"}"

sub "A5. POST /api/users with NO password -> generated, returned ONCE"
UB=$(call POST /api/users "$AT" "{\"email\":\"$EMAIL_B\",\"name\":\"QA Generated\",\"role\":\"agent\"}")
GENPASS=$(echo "$UB" | jq_ "d['password']")
need GENPASS "$GENPASS"
QAUID_B=$(echo "$UB" | jq_ "d['id']")
need QAUID_B "$QAUID_B"
echo "  -> user id $QAUID_B, generated password length = ${#GENPASS}" >> "$LOG"

sub "A6. agent CANNOT create users (403)"
call POST /api/users "$GT" '{"email":"qa.agent.$STAMP@levoy.co","name":"Nope","role":"agent"}'

hr "B. NEW USERS LOG IN"
sub "B1. explicit-password user logs in"
call POST /api/auth/login "" "{\"email\":\"$EMAIL_A\",\"password\":\"explicit123\"}"
sub "B2. generated-password user logs in with the password from A5"
GENTOK=$(call POST /api/auth/login "" "{\"email\":\"$EMAIL_B\",\"password\":\"$GENPASS\"}")
GENTOKEN=$(echo "$GENTOK" | jq_ "d['access_token']")
need GENTOKEN "$GENTOKEN"
echo "  -> keeping this token to prove a deactivation kills it mid-flight" >> "$LOG"
sub "B3. GET /api/users?include_inactive=true shows the new users with teams + counts"
call GET "/api/users?include_inactive=true" "$AT"
sub "B4. GET /api/users (default) — existing response fields still present for agent1"
call GET /api/users "$AT"

hr "C. OLD SELF-REGISTER PATH STILL WORKS"
sub "C1. POST /api/auth/register with a fresh email"
call POST /api/auth/register "" "{\"email\":\"$EMAIL_SELF\",\"password\":\"demo1234\",\"name\":\"QA Self Reg\"}"
sub "C2. that account can log in"
call POST /api/auth/login "" "{\"email\":\"$EMAIL_SELF\",\"password\":\"demo1234\"}"

hr "D. MULTI-ASSIGNEE"
# fresh lead
LEAD=$(curl -s -X POST $API/api/leads -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "{\"name\":\"QA Multi $STAMP\",\"phone\":\"+9195$STAMP\",\"status\":\"new\"}")
LID=$(echo "$LEAD" | jq_ "d['id']")
need LID "$LID"
echo "created lead id=$LID" >> "$LOG"

sub "D1. assign ONE person via the LEGACY single shape {assigned_to}"
call POST "/api/leads/$LID/assign" "$MT" "{\"assigned_to\":$AGENT1_ID,\"note\":\"legacy shape\"}"

sub "D2. assign THREE people with roles owner/collaborator/watcher"
R=$(call POST "/api/leads/$LID/assign" "$MT" "{\"note\":\"full squad\",\"assignments\":[{\"user_id\":$AGENT1_ID,\"role\":\"owner\"},{\"user_id\":9,\"role\":\"collaborator\"},{\"user_id\":10,\"role\":\"watcher\"}]}")

sub "D3. GET /api/leads/$LID/assignees — full list with names, roles, who assigned, when"
call GET "/api/leads/$LID/assignees" "$AT"

sub "D4. owner demotion: make user 9 the new owner -> 8 must become collaborator"
R=$(call POST "/api/leads/$LID/assign" "$MT" "{\"assignments\":[{\"user_id\":9,\"role\":\"owner\"},{\"user_id\":$AGENT1_ID,\"role\":\"collaborator\"},{\"user_id\":10,\"role\":\"watcher\"}]}")

sub "D5. leads.assigned_to must be in sync with the owner row (DB ground truth)"
su postgres -c "psql -d levoy -A -F' | ' -c \"SELECT l.id, l.assigned_to, au.name, (SELECT string_agg(la.role, ',' ORDER BY la.id) FROM lead_assignees la WHERE la.lead_id=l.id) FROM leads l LEFT JOIN users au ON au.id=l.assigned_to WHERE l.id=$LID\"" >> "$LOG" 2>&1

sub "D6. GET /api/leads/$LID — detail carries assignees + assignee_count + assigned_to_name"
call GET "/api/leads/$LID" "$AT"

sub "D7. GET /api/leads?search=QA — list carries assignees + assignee_count"
call GET "/api/leads?search=QA%20Multi" "$AT"

sub "D8. REMOVE THE OWNER (user 9) -> a collaborator must be promoted"
R=$(call DELETE "/api/leads/$LID/assignees/9" "$MT")

sub "D9. DB ground truth after removal"
su postgres -c "psql -d levoy -A -F' | ' -c \"SELECT l.id, l.assigned_to, (SELECT string_agg(la.role, ',' ORDER BY la.id) FROM lead_assignees la WHERE la.lead_id=l.id) FROM leads l WHERE l.id=$LID\"" >> "$LOG" 2>&1

sub "D10. remove a plain collaborator + the watcher"
call DELETE "/api/leads/$LID/assignees/10" "$MT"
call GET "/api/leads/$LID/assignees" "$AT"

sub "D11. bulk-assign MULTI form: assignments:[{lead_ids:[], user_id, role}]"
LEAD2=$(curl -s -X POST $API/api/leads -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "{\"name\":\"QA BulkMulti $STAMP\",\"phone\":\"+9196$STAMP\"}")
LID2=$(echo "$LEAD2" | jq_ "d['id']")
need LID2 "$LID2"
call POST /api/leads/bulk-assign "$MT" "{\"assignments\":[{\"lead_ids\":[$LID2],\"user_id\":$AGENT1_ID,\"role\":\"owner\"},{\"lead_ids\":[$LID2],\"user_id\":9,\"role\":\"collaborator\"}]}"
call GET "/api/leads/$LID2/assignees" "$AT"

sub "D12. validation: invalid assignee role rejected"
call POST "/api/leads/$LID2/assign" "$MT" "{\"assignments\":[{\"user_id\":$AGENT1_ID,\"role\":\"boss\"}]}"
sub "D13. validation: empty assignments array rejected"
call POST "/api/leads/$LID2/assign" "$MT" '{"assignments":[]}'
sub "D14. validation: legacy missing assigned_to still 400"
call POST "/api/leads/$LID2/assign" "$MT" '{}'
sub "D15. agent cannot assign / remove assignees (403 x2)"
call POST "/api/leads/$LID2/assign" "$GT" "{\"assigned_to\":$AGENT1_ID}"
call DELETE "/api/leads/$LID2/assignees/$AGENT1_ID" "$GT"
sub "D16. legacy GET /api/leads/:id/assignments history still works"
call GET "/api/leads/$LID/assignments" "$AT"

hr "E. INVITATIONS"
sub "E1. POST /api/invitations"
IV=$(call POST /api/invitations "$AT" "{\"email\":\"$EMAIL_INV\",\"role\":\"manager\"}")
TOKEN=$(echo "$IV" | jq_ "d['token']")
need TOKEN "$TOKEN"
IVID=$(echo "$IV" | jq_ "d['id']")
need IVID "$IVID"
echo "  -> invite id=$IVID" >> "$LOG"

sub "E2. POST /api/auth/accept-invite (PUBLIC — no token)"
AR=$(call POST /api/auth/accept-invite "" "{\"token\":\"$TOKEN\",\"name\":\"QA Invited Manager\",\"password\":\"invited123\"}")
INV_TOK=$(echo "$AR" | jq_ "d['access_token']")
INV_ID=$(echo "$AR" | jq_ "d['user']['id']")
echo "  -> accepted user id=$INV_ID" >> "$LOG"

sub "E3. the accepted user logs in AND has the INVITED role (manager)"
call POST /api/auth/login "" "{\"email\":\"$EMAIL_INV\",\"password\":\"invited123\"}"
su postgres -c "psql -d levoy -A -F' | ' -c \"SELECT id,email,role FROM users WHERE id=$INV_ID\"" >> "$LOG" 2>&1

sub "E4. the same invite token cannot be reused (409)"
call POST /api/auth/accept-invite "" "{\"token\":\"$TOKEN\",\"name\":\"Second Try\",\"password\":\"invited123\"}"

sub "E5. a manager CANNOT create invitations (403)"
call POST /api/invitations "$MT" '{"email":"qa.nope@levoy.co","role":"agent"}'

sub "E6. GET /api/invitations (admin)"
call GET /api/invitations "$AT"

sub "E7. create a second invite, then REVOKE it"
IV2=$(call POST /api/invitations "$AT" "{\"email\":\"$EMAIL_REV\",\"role\":\"agent\"}")
TOKEN2=$(echo "$IV2" | jq_ "d['token']")
IVID2=$(echo "$IV2" | jq_ "d['id']")
call DELETE "/api/invitations/$IVID2" "$AT"
sub "E8. accepting a REVOKED invite is rejected (410)"
call POST /api/auth/accept-invite "" "{\"token\":\"$TOKEN2\",\"name\":\"Nope\",\"password\":\"nope1234\"}"
sub "E9. revoking an already-accepted invite is rejected (400)"
call DELETE "/api/invitations/$IVID" "$AT"

hr "F. DEACTIVATE"
sub "F1. admin PATCH is_active=false on the generated-password user ($QAUID_B)"
call PATCH "/api/users/$QAUID_B" "$AT" '{"is_active":false,"name":"QA Generated (disabled)"}'

sub "F2. that user can NO LONGER log in"
call POST /api/auth/login "" "{\"email\":\"$EMAIL_B\",\"password\":\"$GENPASS\"}"

sub "F3. the token they were ALREADY holding is now dead too (authMW re-reads is_active)"
echo "  the token below was minted in B2, BEFORE the deactivation in F1:" >> "$LOG"
call GET /api/auth/me "$GENTOKEN"
echo "  -> 403 above proves a live token cannot outlive an is_active=false flag" >> "$LOG"

sub "F3b. an UNRELATED active user's token still works (the block is per-user)"
TOK_A=$(call POST /api/auth/login "" "{\"email\":\"$EMAIL_A\",\"password\":\"explicit123\"}")
TAKEOVER=$(echo "$TOK_A" | jq_ "d['access_token']")
need TAKEOVER "$TAKEOVER"
call GET /api/auth/me "$TAKEOVER"
sub "F4. GET /api/users?include_inactive=true shows is_active=false"
curl -s $API/api/users?include_inactive=true -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(json.dumps([u for u in d if u['id']==$QAUID_B], indent=2))" >> "$LOG"
sub "F5. GET /api/users default hides the deactivated user"
curl -s $API/api/users -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('deactivated user visible in default list:', any(u['id']==$QAUID_B for u in d))" >> "$LOG"

sub "F6. admin cannot deactivate THEMSELVES (400)"
call PATCH "/api/users/$ADMIN_ID" "$AT" '{"is_active":false}'

sub "F7. role change via PATCH + audit"
call PATCH "/api/users/$QAUID_A" "$AT" '{"role":"manager"}'
sub "F8. invalid role in PATCH rejected"
call PATCH "/api/users/$QAUID_A" "$AT" '{"role":"wizard"}'
sub "F9. agent cannot PATCH users (403)"
call PATCH "/api/users/$QAUID_A" "$GT" '{"role":"admin"}'

hr "G. CHANGE PASSWORD"
sub "G1. change-password with the WRONG current password is rejected (400)"
call POST /api/auth/change-password "$TAKEOVER" '{"current_password":"nope12345","new_password":"newpass123"}'
sub "G2. change-password with the RIGHT current password"
call POST /api/auth/change-password "$TAKEOVER" '{"current_password":"explicit123","new_password":"brandnew123"}'
sub "G3. OLD password no longer works"
call POST /api/auth/login "" "{\"email\":\"$EMAIL_A\",\"password\":\"explicit123\"}"
sub "G4. NEW password works"
call POST /api/auth/login "" "{\"email\":\"$EMAIL_A\",\"password\":\"brandnew123\"}"
sub "G5. too-short new password rejected (400)"
NT=$(echo "$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL_A\",\"password\":\"brandnew123\"}")" | jq_ "d['access_token']")
call POST /api/auth/change-password "$NT" '{"current_password":"brandnew123","new_password":"abc"}'

hr "H. ADMIN PASSWORD RESET"
sub "H1. POST /api/users/:id/reset-password with NO password -> generated once"
RS=$(call POST "/api/users/$QAUID_A/reset-password" "$AT" '{}')
RESETPASS=$(echo "$RS" | jq_ "d['password']")
need RESETPASS "$RESETPASS"
echo "  -> generated password length = ${#RESETPASS}" >> "$LOG"
sub "H2. admin-reset password works"
call POST /api/auth/login "" "{\"email\":\"$EMAIL_A\",\"password\":\"$RESETPASS\"}"
sub "H3. reset-password with an explicit password"
call POST "/api/users/$QAUID_A/reset-password" "$AT" '{"password":"adminset123"}'
call POST /api/auth/login "" "{\"email\":\"$EMAIL_A\",\"password\":\"adminset123\"}"
sub "H4. agent cannot reset passwords (403)"
call POST "/api/users/$QAUID_A/reset-password" "$GT" '{"password":"hack1234"}'

hr "I. CAPACITY"
sub "I1. admin creates a fresh agent used only for the capacity test"
QACAPUSER=$(call POST /api/users "$AT" "{\"email\":\"qa.cap.$STAMP@levoy.co\",\"name\":\"QA Cap Agent\",\"role\":\"agent\"}")
QACAPID=$(echo "$QACAPUSER" | jq_ "d['id']")
need QACAPID "$QACAPID"
CAPPASS=$(echo "$QACAPUSER" | jq_ "d['password']")
echo "  -> capacity test user id=$QACAPID" >> "$LOG"

sub "I2. PUT /api/users/$QACAPID/capacity  max_open_leads=2"
call PUT "/api/users/$QACAPID/capacity" "$AT" '{"max_open_leads":2}'

sub "I3. GET /api/users/$QACAPID/capacity"
call GET "/api/users/$QACAPID/capacity" "$AT"

# 3 leads to push INTO the cap user's workload
QACAPLEADS=()
for i in 1 2 3; do
  L=$(curl -s -X POST $API/api/leads -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
    -d "{\"name\":\"QA Cap $STAMP-$i\",\"phone\":\"+9197$STAMP$i\"}")
  QACAPLEADS+=("$(echo "$L" | jq_ "d['id']")")
done
echo "  leads that will be given to the cap user: ${QACAPLEADS[*]}" >> "$LOG"

sub "I4. give the cap user 2 open leads by hand (cap is 2, so this fills them)"
call POST /api/leads/bulk-assign "$AT" "{\"lead_ids\":[${QACAPLEADS[0]},${QACAPLEADS[1]}],\"strategy\":\"manual\",\"assigned_to\":$QACAPID}"
call GET "/api/users/$QACAPID/capacity" "$AT"

# Now two MORE leads with no owner, which must NOT go to the capped agent.
LEADS_LEFT=()
for i in 4 5; do
  L=$(curl -s -X POST $API/api/leads -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
    -d "{\"name\":\"QA Cap $STAMP-$i\",\"phone\":\"+9198$STAMP$i\"}")
  LEADS_LEFT+=("$(echo "$L" | jq_ "d['id']")")
done
echo "  unassigned leads for the round_robin test: ${LEADS_LEFT[*]}" >> "$LOG"

sub "I5. squeeze every OTHER agent to max_open_leads=0 so the cap user is the only one with room, then fill them"
# Everyone else is set to 0, which excludes them from the pool immediately
# (0 open leads is already >= a 0 limit) — this isolates the cap user.
POOLIDS=$(curl -s "$API/api/users" -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(' '.join(str(u['id']) for u in d if u['id'] not in ($QACAPID,) and u['role'] in ('agent','manager')))")
for pid in $POOLIDS; do
  curl -s -o /dev/null -X PUT "$API/api/users/$pid/capacity" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"max_open_leads":0}'
done
echo "  agents squeezed to 0: $POOLIDS" >> "$LOG"
call GET "/api/users/$QACAPID/capacity" "$AT"

sub "I6. round_robin 1 more lead -> the ONLY under-cap agent is now full, so it must be skipped with reason at_capacity"
R=$(call POST /api/leads/bulk-assign "$AT" "{\"lead_ids\":[${LEADS_LEFT[0]}],\"strategy\":\"round_robin\"}")
echo "$R" | python3 -c "
import sys,json
d=json.loads(sys.stdin.read().rsplit('<<HTTP',1)[0])
print('assigned:', json.dumps(d['assigned']))
print('skipped :', json.dumps(d['skipped'], indent=2))
print('reasons :', sorted({s['reason'] for s in d['skipped']}))
print('AT_CAPACITY CONFIRMED:', any(s['reason']=='at_capacity' for s in d['skipped']))
" >> "$LOG" 2>&1

sub "I7. least_loaded with the SAME setup -> identical at_capacity skip"
R=$(call POST /api/leads/bulk-assign "$AT" "{\"lead_ids\":[${LEADS_LEFT[1]}],\"strategy\":\"least_loaded\"}")
echo "$R" | python3 -c "
import sys,json
d=json.loads(sys.stdin.read().rsplit('<<HTTP',1)[0])
print('assigned:', json.dumps(d['assigned']))
print('skipped :', json.dumps(d['skipped'], indent=2))
print('AT_CAPACITY CONFIRMED:', any(s['reason']=='at_capacity' for s in d['skipped']))
" >> "$LOG" 2>&1

sub "I8. the capped agent is NOT in the returned pool summary"
echo "$R" | python3 -c "
import sys,json
d=json.loads(sys.stdin.read().rsplit('<<HTTP',1)[0])
print('pool:', json.dumps(d['pool']))
print('capped agent $QACAPID in pool:', any(p['id']==$QACAPID for p in d['pool']))
" >> "$LOG" 2>&1

sub "I9. lower the cap to 1 while 2 leads are open -> at_capacity flips to true"
call PUT "/api/users/$QACAPID/capacity" "$AT" '{"max_open_leads":1}'
call GET "/api/users/$QACAPID/capacity" "$AT"
sub "I10. GET /api/agents/workload — at_capacity consistent with the per-user cap"
curl -s "$API/api/agents/workload" -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('global capacity:', d['capacity'])
for a in d['agents']:
    if a['id']==$QACAPID:
        print(json.dumps(a, indent=2))
" >> "$LOG" 2>&1

sub "I11. manager CAN set capacity; agent CANNOT"
call PUT "/api/users/$AGENT1_ID/capacity" "$MT" '{"max_open_leads":25}'
call PUT "/api/users/$AGENT1_ID/capacity" "$GT" '{"max_open_leads":99}'
sub "I12. invalid capacity rejected (400)"
call PUT "/api/users/$QACAPID/capacity" "$AT" '{"max_open_leads":-5}'
sub "I13. capacity cleared back to unlimited (null)"
call PUT "/api/users/$QACAPID/capacity" "$AT" '{"max_open_leads":null}'
call GET "/api/users/$QACAPID/capacity" "$AT"
sub "I14. CLEANUP — every capacity set during this test is reset to unlimited"
for pid in $POOLIDS $AGENT1_ID $QACAPID; do
  curl -s -o /dev/null -X PUT "$API/api/users/$pid/capacity" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"max_open_leads":null}'
done
echo "  remaining rows in user_capacity:" >> "$LOG"
su postgres -c "psql -d levoy -c \"SELECT * FROM user_capacity ORDER BY user_id\"" >> "$LOG" 2>&1
call GET /api/agents/workload "$AT" > /dev/null
curl -s "$API/api/agents/workload" -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('after cleanup, any agent at_capacity (global 50):', any(a['at_capacity'] for a in d['agents']))
print('any personal cap still set:', [ (a['id'],a['max_open_leads']) for a in d['agents'] if a['max_open_leads'] is not None])
" >> "$LOG" 2>&1

hr "J. AUDIT LOG"
sub "J1. GET /api/audit-log (admin) — total + the most recent entries"
curl -s "$API/api/audit-log?limit=200" -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('total entries:', d['total'])
seen={}
for e in d['entries']:
    seen[e['action']]=seen.get(e['action'],0)+1
print('actions seen:', json.dumps(seen, indent=2))
print()
print('%-4s %-22s %-28s %-16s %-10s %s' % ('id','action','entity_type','entity_id','actor','created'))
for e in d['entries'][:30]:
    print('%-4s %-22s %-28s %-16s %-10s %s' % (e['id'], e['action'], e['entity_type'], e['entity_id'], e['actor_name'], e['created_at']))
" >> "$LOG"

sub "J2. filter by action=user.created"
call GET "/api/audit-log?action=user.created&limit=5" "$AT"
sub "J3. filter by actor_id=$ADMIN_ID"
call GET "/api/audit-log?actor_id=$ADMIN_ID&limit=5" "$AT"
sub "J4. filter by entity_type=user"
call GET "/api/audit-log?entity_type=user&limit=5" "$AT"
sub "J5. date-range filter (today only)"
call GET "/api/audit-log?from=$(date -u +%Y-%m-%d)&limit=3" "$AT"
sub "J6. pagination limit=2 offset=2"
call GET "/api/audit-log?limit=2&offset=2" "$AT"

sub "J7. AGENT must get 403 on audit-log, invitations, user create, users list"
echo "GET /api/audit-log                 -> $(code GET /api/audit-log "$GT")" >> "$LOG"
echo "GET /api/invitations               -> $(code GET /api/invitations "$GT")" >> "$LOG"
echo "POST /api/invitations              -> $(code POST /api/invitations "$GT" '{"email":"x@y.com","role":"agent"}')" >> "$LOG"
echo "POST /api/users                    -> $(code POST /api/users "$GT" '{"email":"z@y.com","name":"Z","role":"agent"}')" >> "$LOG"
echo "PATCH /api/users/$QAUID_A            -> $(code PATCH "/api/users/$QAUID_A" "$GT" '{"role":"admin"}')" >> "$LOG"
echo "POST /api/users/$QAUID_A/reset-pw    -> $(code POST "/api/users/$QAUID_A/reset-password" "$GT" '{}')" >> "$LOG"
echo "PUT  /api/users/$QACAPID/capacity    -> $(code PUT "/api/users/$QACAPID/capacity" "$GT" '{"max_open_leads":1}')" >> "$LOG"
echo "DELETE /api/invitations/1          -> $(code DELETE /api/invitations/1 "$GT")" >> "$LOG"

sub "J8. manager is 403 on every ADMIN-only route (audit-log, invitations, users, reset-pw)"
echo "GET /api/audit-log                 -> $(code GET /api/audit-log "$MT")" >> "$LOG"
echo "GET /api/invitations               -> $(code GET /api/invitations "$MT")" >> "$LOG"
echo "POST /api/users                    -> $(code POST /api/users "$MT" '{"email":"m@y.com","name":"M","role":"agent"}')" >> "$LOG"
echo "POST /api/users/1/reset-password   -> $(code POST /api/users/1/reset-password "$MT" '{}')" >> "$LOG"

sub "J9. audit rows for the lead-assignment + team-member + review actions"
curl -s "$API/api/audit-log?entity_type=lead&limit=6" -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('total lead-assignment audit rows:', d['total'])
for e in d['entries'][:6]:
    print(json.dumps({'action':e['action'],'entity_id':e['entity_id'],'actor':e['actor_name'],'details':e['details']}))
" >> "$LOG" 2>&1
call GET "/api/audit-log?action=lead.bulk_assigned&limit=3" "$AT"

hr "K. ROLE CHANGES VIA THE LEGACY ENDPOINT ARE AUDITED"
call POST "/api/users/$QAUID_A/role?role=agent" "$AT"
call GET "/api/audit-log?action=user.role_changed&limit=5" "$AT"

sub "K2. team member add/remove writes audit rows"
TEAMID=$(curl -s "$API/api/teams" -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d[0]['id'] if d else '')")
need TEAMID "$TEAMID"
call POST "/api/teams/$TEAMID/members" "$AT" "{\"user_id\":$QAUID_A}"
call GET "/api/teams/$TEAMID/analytics" "$AT" > /dev/null
call DELETE "/api/teams/$TEAMID/members/$QAUID_A" "$AT"
call DELETE "/api/teams/$TEAMID/members/$QAUID_A" "$AT"
call GET "/api/audit-log?action=team.member_added&limit=3" "$AT"
call GET "/api/audit-log?action=team.member_removed&limit=3" "$AT"

sub "K3. call review creation writes an audit row"
# agent_id is explicit: the default is the caller of the call, and the newest call
# may belong to an admin, which the review endpoint correctly refuses.
CALLID=$(curl -s "$API/api/calls?limit=1" -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d[0]['id'] if d else '')")
need CALLID "$CALLID"
REV=$(call POST "/api/calls/$CALLID/reviews" "$MT" "{\"agent_id\":$AGENT1_ID,\"scores\":{\"Opening\":4,\"Discovery\":4,\"Resolution\":5,\"Communication\":4,\"Compliance\":5,\"Closing\":4}}")
echo "$REV" | python3 -c "
import sys,json
d=json.loads(sys.stdin.read().rsplit('<<HTTP',1)[0])
print('review id=%s overall=%s' % (d.get('id'), d.get('overall_score')))
" >> "$LOG" 2>&1
call GET "/api/audit-log?action=call.review_created&limit=3" "$AT"

sub "K4. every audited action from the brief has at least one row"
su postgres -c "psql -d levoy -c \"
SELECT action, count(*) FROM audit_log
 WHERE action IN ('user.created','user.updated','user.deactivated','user.password_reset',
                  'user.role_changed','invitation.created','invitation.revoked','invitation.accepted',
                  'lead.assignment_changed','lead.assignee_removed','lead.bulk_assigned',
                  'team.member_added','team.member_removed','call.review_created')
 GROUP BY action ORDER BY action\"" >> "$LOG" 2>&1

hr "L. REGRESSION — the 20 pre-existing endpoints from /tmp/verify_lead_qa.log"
echo "  (expected status codes are the ones recorded in that log)" >> "$LOG"
printf "  %-3s  %-8s %s\n" "ST" "EXPECTED" "ENDPOINT" >> "$LOG"
reg_check() { # METHOD PATH TOKEN EXPECTED [BODY]
  local m=$1 p=$2 tok=$3 exp=$4 body=$5
  local got; got=$(code "$m" "$p" "$tok" "$body")
  local mark="OK "; [ "$got" != "$exp" ] && mark="!! "
  printf "  %s%-3s %-8s %s\n" "$mark" "$got" "$exp" "$m $p" >> "$LOG"
}
reg_check GET  /health                              "" 200
reg_check GET  /                                    "" 200
reg_check GET  /api/auth/me                         "$AT" 200
reg_check GET  "/api/calls?limit=3"                 "$AT" 200
reg_check GET  /api/calls/stats                     "$AT" 200
reg_check GET  "/api/calls?search=123&direction=outgoing" "$AT" 200
reg_check GET  "/api/leads?limit=3"                 "$AT" 200
reg_check GET  "/api/leads?status=new"              "$AT" 200
reg_check GET  /api/leads/1                         "$AT" 200
reg_check GET  /api/users                           "$AT" 200
reg_check GET  /api/teams                           "$AT" 200
reg_check GET  "/api/reports/daily?days=3"          "$AT" 200
reg_check GET  /api/notifications                   "$AT" 200
reg_check GET  /api/exports                         "$AT" 200
reg_check GET  /api/whatsapp-templates              "$AT" 200
reg_check GET  /api/user-settings                   "$AT" 200
reg_check GET  /api/users/me                        "$AT" 200
reg_check GET  /api/calls/1/recordings              "$AT" 200
reg_check POST /api/calls                           "$AT" 201 '{"phone_number":"+9190000111","duration_seconds":30}'
reg_check POST /api/calls/batch                     "$AT" 200 '{"events":[{"phone_number":"+9190000222"},{"phone_number":"+9190000333"}]}'
reg_check POST /api/leads/1/contact                 "$AT" 200
echo "  --- plus the search path (3x ILIKE placeholder class) ---" >> "$LOG"
reg_check GET  "/api/leads?search=QA"               "$AT" 200
echo "  --- plus the lead/QA endpoints exercised in that log ---" >> "$LOG"
reg_check GET  /api/leads/1/follow-ups              "$AT" 200
reg_check GET  /api/leads/1/assignments             "$AT" 200
reg_check GET  /api/follow-ups/due?scope=all        "$AT" 200
reg_check GET  /api/agents/workload                 "$AT" 200
reg_check GET  /api/agents/performance              "$AT" 200
reg_check GET  /api/quality/leaderboard             "$AT" 200
reg_check GET  /api/teams/1/analytics               "$AT" 200

sub "L2a. legacy single assign to the CURRENT owner — a history row is STILL written (pre-existing behaviour)"
R=$(call POST /api/leads/1/assign "$MT" "{\"assigned_to\":$AGENT1_ID,\"note\":\"regression same owner\"}")
echo "$R" | python3 -c "
import sys,json
d=json.loads(sys.stdin.read().rsplit('<<HTTP',1)[0])
print(json.dumps({k:d[k] for k in ['lead_id','assigned_to','assigned_to_name','previous_assigned_to','reassigned','note','assignee_count']}))
print('history row written:', d['history'] is not None, json.dumps(d['history']))
" >> "$LOG" 2>&1

sub "L2b. legacy single assign to a DIFFERENT owner — reassigned=true, previous recorded"
R=$(call POST /api/leads/1/assign "$MT" "{\"assigned_to\":9,\"note\":\"regression switch\"}")
echo "$R" | python3 -c "
import sys,json
d=json.loads(sys.stdin.read().rsplit('<<HTTP',1)[0])
print(json.dumps({k:d[k] for k in ['lead_id','assigned_to','assigned_to_name','previous_assigned_to','reassigned','note','assignee_count','demoted_owner']}))
print('history:', json.dumps(d['history']))
" >> "$LOG" 2>&1
call GET /api/leads/1/assignments "$AT"

sub "L2c. legacy validation errors unchanged"
call POST /api/leads/1/assign "$MT" '{"assigned_to":99999}'
call POST /api/leads/1/assign "$MT" "{\"assigned_to\":$ADMIN_ID}"
call POST /api/leads/1/assign "$MT" "{\"assigned_to\":$QAUID_B}"
call POST /api/leads/1/assign "$MT" '{}'
call POST /api/leads/bulk-assign "$MT" '{"lead_ids":[1],"strategy":"manual"}'
call POST /api/leads/bulk-assign "$MT" '{"lead_ids":[1],"strategy":"nonsense","assigned_to":8}'

sub "L2d. legacy bulk-assign strategies still behave (manual / round_robin / least_loaded)"
B1=$(call POST /api/leads/bulk-assign "$MT" "{\"lead_ids\":[1],\"strategy\":\"manual\",\"assigned_to\":$AGENT1_ID}")
call POST /api/leads/bulk-assign "$AT" "{\"lead_ids\":[${QACAPLEADS[0]}],\"strategy\":\"round_robin\"}"
call POST /api/leads/bulk-assign "$AT" "{\"lead_ids\":[${QACAPLEADS[1]}],\"strategy\":\"least_loaded\"}"
sub "L2e. unknown lead id is reported in skipped[], not a 500"
call POST /api/leads/bulk-assign "$MT" "{\"lead_ids\":[999999],\"strategy\":\"manual\",\"assigned_to\":$AGENT1_ID}"
# put lead 1 back the way the earlier sections found it
curl -s -o /dev/null -X POST "$API/api/leads/1/assign" -H "Authorization: Bearer $MT" -H 'Content-Type: application/json' -d "{\"assigned_to\":$AGENT1_ID,\"note\":\"restored\"}"

sub "L3. agent 403s on the manager routes from the original log"
echo "POST /api/leads/1/assign         -> $(code POST /api/leads/1/assign "$GT" '{"assigned_to":8}')" >> "$LOG"
echo "POST /api/leads/bulk-assign      -> $(code POST /api/leads/bulk-assign "$GT" '{"lead_ids":[1],"assigned_to":8}')" >> "$LOG"
echo "GET  /api/agents/performance     -> $(code GET /api/agents/performance "$GT")" >> "$LOG"
echo "GET  /api/agents/workload        -> $(code GET /api/agents/workload "$GT")" >> "$LOG"
echo "GET  /api/quality/leaderboard    -> $(code GET /api/quality/leaderboard "$GT")" >> "$LOG"
echo "GET  /api/users                  -> $(code GET /api/users "$GT")" >> "$LOG"

hr "M. DB GROUND TRUTH — new tables exist with the expected shape"
su postgres -c "psql -d levoy -c \"\\d lead_assignees\"" >> "$LOG" 2>&1
su postgres -c "psql -d levoy -c \"\\d invitations\"" >> "$LOG" 2>&1
su postgres -c "psql -d levoy -c \"\\d audit_log\"" >> "$LOG" 2>&1
su postgres -c "psql -d levoy -c \"\\d user_capacity\"" >> "$LOG" 2>&1

sub "M2. consistency check: every leads.assigned_to has a matching owner row"
su postgres -c "psql -d levoy -c \"
SELECT COUNT(*) AS leads_with_assigned_to
  FROM leads WHERE assigned_to IS NOT NULL;
SELECT COUNT(*) AS owner_rows FROM lead_assignees WHERE role='owner';
SELECT COUNT(*) AS mismatched
  FROM leads l WHERE l.assigned_to IS DISTINCT FROM
    (SELECT user_id FROM lead_assignees la WHERE la.lead_id=l.id AND la.role='owner');\"" >> "$LOG" 2>&1

sub "M3. audit action histogram (whole table)"
su postgres -c "psql -d levoy -c \"SELECT action, count(*) FROM audit_log GROUP BY action ORDER BY 2 DESC\"" >> "$LOG" 2>&1

hr "RESULT"
echo "  generated /tmp/verify_admin.log" >> "$LOG"
echo "" >> "$LOG"
echo "### NOTE: see each '<<HTTP ...>>' marker above — none should be 500." >> "$LOG"
