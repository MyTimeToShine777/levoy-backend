#!/bin/bash
# ============================================================================
# Verification for the four closed backend gaps:
#   1. closed self-signup + invitation-only registration + bootstrap admin
#   2. forgot/reset password (enumeration-safe, rate-limited)
#   3. call recordings end-to-end (auth, mime, size, stream, delete)
#   4. cross-call recordings list + has_recording on /api/calls
#
# Output: /tmp/verify_gaps.log   (real curl output, nothing mocked)
# ============================================================================
set -uo pipefail
API=http://localhost:3001
LOG=/tmp/verify_gaps.log
STAMP=$(date +%s)
mkdir -p /tmp/gaps
: > "$LOG"

hr()   { echo "" >> "$LOG"; echo "==================================================================" >> "$LOG"; echo "$1" >> "$LOG"; echo "==================================================================" >> "$LOG"; }
sub()  { echo "" >> "$LOG"; echo "-- $1 --" >> "$LOG"; }
note() { echo "  $1" >> "$LOG"; }
run()  { echo "\$ $1" >> "$LOG"; eval "$1" >> "$LOG" 2>&1; }
# Prints the HTTP code then the body, so every assertion in this file is
# backed by something a human can read back. Writes to $LOG itself so callers
# cannot forget to redirect.
code_body() {
  local m=$1 p=$2 t=${3:-} d=${4:-}
  local args=(-s -o /tmp/gaps/body -w '%{http_code}' -X "$m" "$API$p")
  [ -n "$t" ] && args+=(-H "Authorization: Bearer $t")
  [ -n "$d" ] && args+=(-H 'Content-Type: application/json' -d "$d")
  local c; c=$(curl "${args[@]}")
  { echo "HTTP $c"; head -c 1200 /tmp/gaps/body; echo; } >> "$LOG"
}

AT=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@levoy.co","password":"demo1234"}' | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
if [ -z "$AT" ]; then echo "FATAL: admin login failed" | tee -a "$LOG"; exit 1; fi
note "admin token acquired (${#AT} chars)"

# ══════════════════════════════════════════════════════════════════════════
hr "1. REGISTRATION IS CLOSED TO THE WORLD"
# 1.5 (bootstrap admin) and 1.6 (the ALLOW_SELF_REGISTER opt-in) live in
# verify_regpolicy.sh: they boot extra instances of server.js against a
# scratch database, and inlining them here made this file too large to
# scan. Run `bash verify_gaps.sh && bash verify_regpolicy.sh`; the
# policy section is appended to the same log.

# ══════════════════════════════════════════════════════════════════════════
sub "1.1 GET /api/auth/registration-status (public)"
code_body GET /api/auth/registration-status
note "-> expect self_register=false, requires_invite=true"

sub "1.2 POST /api/auth/register with no token is REFUSED"
code_body POST /api/auth/register "" "{\"email\":\"stranger$STAMP@evil.example\",\"password\":\"demo1234\",\"name\":\"Internet Stranger\"}"
note "-> expect 403 + the exact disable message"

sub "1.3 the refused address does NOT exist as a user (no account was minted)"
run "curl -s $API/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"stranger$STAMP@evil.example\",\"password\":\"demo1234\"}'"

sub "1.4 the first-user-becomes-admin rule is GONE: role is never inferred"
run "su postgres -c \"psql -d levoy -t -A -c \\\"SELECT count(*) FROM users WHERE email='stranger$STAMP@evil.example'\\\"\""
note "-> expect 0"

hr "2. THE INVITATION PATH STILL WORKS END TO END"
# ══════════════════════════════════════════════════════════════════════════
INV_EMAIL="qa.invited.$STAMP@example.com"
sub "2.1 an invited address cannot self-register without the token"
code_body POST /api/auth/register "" "{\"email\":\"$INV_EMAIL\",\"password\":\"demo1234\",\"name\":\"QA Invited\"}"

sub "2.2 admin creates an invitation for that address, role=manager"
INV=$(curl -s -X POST $API/api/invitations -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$INV_EMAIL\",\"role\":\"manager\"}")
echo "$INV" | python3 -m json.tool 2>/dev/null | head -20 >> "$LOG" || echo "$INV" >> "$LOG"
ITOK=$(echo "$INV" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')
[ -z "$ITOK" ] && { echo "FATAL: no invite token" | tee -a "$LOG"; exit 1; }
note "invite token: ${ITOK:0:16}..."

sub "2.3 the invitee registers THROUGH /api/auth/register carrying the token"
code_body POST /api/auth/register "" \
  "{\"email\":\"$INV_EMAIL\",\"password\":\"demo1234\",\"name\":\"QA Invited\",\"token\":\"$ITOK\"}"
note "-> expect 201 and role=manager (the INVITED role, not admin)"

sub "2.4 that account can log in, and really is a manager"
ILOGIN=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$INV_EMAIL\",\"password\":\"demo1234\"}")
echo "$ILOGIN" | python3 -m json.tool 2>/dev/null | head -16 >> "$LOG" || echo "$ILOGIN" >> "$LOG"

sub "2.5 the invite is now single-use: replaying the token is rejected"
code_body POST /api/auth/register "" \
  "{\"email\":\"$INV_EMAIL\",\"password\":\"demo1234\",\"name\":\"QA Replay\",\"token\":\"$ITOK\"}"
note "-> expect 409 'Invitation already used'"

sub "2.6 every account creation is audit-logged WITH the path that created it"
note "(queried from audit_log directly — the API caps page size below 200,"
note " and a creation can predate the current page)"
run "su postgres -c \"psql -d levoy -c \\\"SELECT action, entity_type, entity_id, details->>'path' AS path, details->>'email' AS email FROM audit_log WHERE details ? 'path' AND details->>'path' IN ('invite','self_register','bootstrap') ORDER BY id DESC LIMIT 8\\\"\""

# ══════════════════════════════════════════════════════════════════════════
hr "3. FORGOT PASSWORD — NO USER ENUMERATION"
# ══════════════════════════════════════════════════════════════════════════
sub "3.1 KNOWN email  -> body"
KNOWN_BODY=$(curl -s -X POST $API/api/auth/forgot-password -H 'Content-Type: application/json' \
  -d '{"email":"agent1@levoy.co"}')
echo "  $KNOWN_BODY" >> "$LOG"

sub "3.2 UNKNOWN email -> body"
UNKNOWN_BODY=$(curl -s -X POST $API/api/auth/forgot-password -H 'Content-Type: application/json' \
  -d "{\"email\":\"nobody-$STAMP@nowhere.example\"}")
echo "  $UNKNOWN_BODY" >> "$LOG"

sub "3.3 status code for each"
code_body POST /api/auth/forgot-password "" '{"email":"agent2@levoy.co"}'
code_body POST /api/auth/forgot-password "" "{\"email\":\"nobody-$STAMP@nowhere.example\"}"

sub "3.4 THE BODIES ARE BYTE-IDENTICAL (proves no enumeration)"
if [ "$KNOWN_BODY" = "$UNKNOWN_BODY" ]; then
  echo "  IDENTICAL: yes" >> "$LOG"
  echo "  known  : $KNOWN_BODY" >> "$LOG"
  echo "  unknown: $UNKNOWN_BODY" >> "$LOG"
else
  echo "  IDENTICAL: NO -- ENUMERATION LEAK" >> "$LOG"
  echo "  known  : $KNOWN_BODY" >> "$LOG"
  echo "  unknown: $UNKNOWN_BODY" >> "$LOG"
fi

sub "3.5 the public response never contains a token (that would defeat 3.4)"
echo "  token present in response? $(echo "$KNOWN_BODY" | grep -c -i token) (expect 0)" >> "$LOG"

sub "3.6 but a reset row WAS created server-side for the known address"
run "su postgres -c \"psql -d levoy -t -A -F'|' -c \\\"SELECT u.email, (pr.used_at IS NULL) AS unused, (pr.expires_at > NOW()) AS live FROM password_resets pr JOIN users u ON u.id=pr.user_id WHERE u.email='agent1@levoy.co' ORDER BY pr.id DESC LIMIT 1\\\"\""

# ══════════════════════════════════════════════════════════════════════════
hr "4. RATE LIMITER ACTUALLY TRIPS"
# ══════════════════════════════════════════════════════════════════════════
sub "4.1 12 rapid requests to /forgot-password, each a different email"
echo "  # | http | body" >> "$LOG"
for i in $(seq 1 12); do
  c=$(curl -s -o /tmp/gaps/b -w '%{http_code}' -X POST $API/api/auth/forgot-password \
      -H 'Content-Type: application/json' -d "{\"email\":\"rl-$STAMP-$i@nowhere.example\"}")
  printf "  %2s | %s | %s\n" "$i" "$c" "$(head -c 90 /tmp/gaps/b)" >> "$LOG"
done
note "-> per-IP budget is 10/15min: expect 200s then 429s"
sub "4.2 the limiter is per-IP, not global: a known email from the same IP is also blocked"
code_body POST /api/auth/forgot-password "" '{"email":"agent1@levoy.co"}'
note "-> expect 429 (IP budget exhausted)"

sub "4.3 forgot-password rate limit headers"
curl -s -D - -o /dev/null -X POST $API/api/auth/forgot-password -H 'Content-Type: application/json' \
  -d "{\"email\":\"agent1@levoy.co\"}" | grep -iE '^(HTTP|retry-after|x-ratelimit)' >> "$LOG"

# ══════════════════════════════════════════════════════════════════════════
hr "5. RESET PASSWORD — VALID TOKEN, THEN REUSE/EXPIRY"
# ══════════════════════════════════════════════════════════════════════════
RESET_EMAIL="qa.reset.$STAMP@example.com"
sub "5.0 create the account to reset via an invitation"
INV2=$(curl -s -X POST $API/api/invitations -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$RESET_EMAIL\",\"role\":\"agent\"}")
ITOK2=$(echo "$INV2" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')
curl -s -X POST $API/api/auth/register -H 'Content-Type: application/json' \
  -d "{\"email\":\"$RESET_EMAIL\",\"password\":\"original123\",\"name\":\"QA Reset\",\"token\":\"$ITOK2\"}" > /dev/null
sub "5.0.1 the account logs in with its ORIGINAL password"
code_body POST /api/auth/login "" "{\"email\":\"$RESET_EMAIL\",\"password\":\"original123\"}"

sub "5.1 admin issues a reset link (no SMTP in this deployment)"
LINK=$(curl -s -X POST $API/api/admin/password-reset-link -H "Authorization: Bearer $AT" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$RESET_EMAIL\"}")
echo "$LINK" | python3 -m json.tool 2>/dev/null | head -20 >> "$LOG" || echo "$LINK" >> "$LOG"
RTOK=$(echo "$LINK" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')
[ -z "$RTOK" ] && { echo "FATAL: no reset token" | tee -a "$LOG"; exit 1; }
note "reset token: ${RTOK:0:16}..."

sub "5.1.1 that admin route is admin-only (a manager is refused)"
MT=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"manager@levoy.co","password":"demo1234"}' | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
code_body POST /api/admin/password-reset-link "$MT" '{"email":"agent1@levoy.co"}'
note "-> expect 403 Admin only"

sub "5.2 reset-password with the VALID token"
code_body POST /api/auth/reset-password "" "{\"token\":\"$RTOK\",\"new_password\":\"brandnew456\"}"
note "-> expect 200"

sub "5.3 the NEW password works"
code_body POST /api/auth/login "" "{\"email\":\"$RESET_EMAIL\",\"password\":\"brandnew456\"}"

sub "5.4 the OLD password no longer works"
code_body POST /api/auth/login "" "{\"email\":\"$RESET_EMAIL\",\"password\":\"original123\"}"
note "-> expect 401 Invalid credentials"

sub "5.5 REUSING the same token is rejected (single-use)"
code_body POST /api/auth/reset-password "" "{\"token\":\"$RTOK\",\"new_password\":\"third789\"}"
note "-> expect 400 invalid-or-expired"

sub "5.6 an EXPIRED token is rejected"
# The token is planted directly rather than captured from a RETURNING clause:
# psql echoes "INSERT 0 1" after the id, which would be spliced into the JSON
# body and produce an unparseable request (that is what 5.6 did on the first
# run — the 400 it produced was body-parser rejecting our curl, not the route).
cat > /tmp/gaps/expired.sql <<SQL
INSERT INTO password_resets (user_id, token, expires_at)
SELECT id, 'expired-$STAMP', NOW() - interval '1 hour'
  FROM users WHERE email='$RESET_EMAIL';
SQL
chmod 644 /tmp/gaps/expired.sql
su postgres -c "psql -q -d levoy -f /tmp/gaps/expired.sql" >> "$LOG" 2>&1
EXPIRED="expired-$STAMP"
note "planted an expired token: $EXPIRED"
code_body POST /api/auth/reset-password "" "{\"token\":\"$EXPIRED\",\"new_password\":\"never123\"}"
note "-> expect 400 invalid-or-expired (expiry, not a different code path)"

sub "5.7 a token that never existed is rejected identically to an expired one"
code_body POST /api/auth/reset-password "" "{\"token\":\"never-existed-$STAMP\",\"new_password\":\"never123\"}"

sub "5.8 a too-short new password is a 400"
code_body POST /api/auth/reset-password "" '{"token":"whatever","new_password":"123"}'

sub "5.9 issuing a second link supersedes the first (old link is dead)"
LINK2=$(curl -s -X POST $API/api/admin/password-reset-link -H "Authorization: Bearer $AT" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$RESET_EMAIL\"}")
RTOK2=$(echo "$LINK2" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')
code_body POST /api/auth/reset-password "" "{\"token\":\"$RTOK2\",\"new_password\":\"superseded\"}"
note "-> the NEWER link works"
code_body POST /api/auth/reset-password "" "{\"token\":\"$RTOK2\",\"new_password\":\"reused\"}"
note "-> the NEWER link is now spent too"

sub "5.10 reset completion is audit-logged"
run "su postgres -c \"psql -d levoy -t -A -F'|' -c \\\"SELECT action, entity_type, details->>'path' FROM audit_log WHERE action LIKE 'password_reset%' OR action LIKE 'user.password_reset%' ORDER BY id DESC LIMIT 6\\\"\""

# ══════════════════════════════════════════════════════════════════════════
hr "6. CALL RECORDINGS END TO END"
# ══════════════════════════════════════════════════════════════════════════
# A real, small, valid-ish audio file: a 0.25s silent MP3 frame stream is more
# than the server needs (it checks type + size, not content), but using a real
# audio header keeps the GET-side content-type assertion honest.
python3 - <<'PY'
import struct
# Minimal but structurally valid MP3: 3 silent MPEG-1 Layer III frames.
hdr = b'\xff\xfb\x90\x00'
frame = hdr + b'\x00' * 413
open('/tmp/gaps/good.mp3','wb').write(frame * 3)
# 30 MB of noise, declared as mp3 -> over the 25 MB recording cap.
open('/tmp/gaps/toobig.mp3','wb').write(b'\x00' * (30*1024*1024))
# Not audio at all.
open('/tmp/gaps/evil.html','wb').write(b'<html><script>alert(1)</script></html>')
PY
ls -l /tmp/gaps/good.mp3 /tmp/gaps/toobig.mp3 /tmp/gaps/evil.html >> "$LOG"

CALLID=$(curl -s "$API/api/calls?limit=1" -H "Authorization: Bearer $AT" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d[0]["id"] if isinstance(d,list) and d else "")')
note "using call id $CALLID"
[ -z "$CALLID" ] && { echo "FATAL: no call to attach to" | tee -a "$LOG"; exit 1; }

sub "6.1 upload with NO auth is rejected"
curl -s -o /tmp/gaps/b -w 'HTTP %{http_code}\n' -X POST "$API/api/calls/$CALLID/recordings" \
  -F "recording=@/tmp/gaps/good.mp3;type=audio/mpeg" >> "$LOG"
echo "  body: $(cat /tmp/gaps/b)" >> "$LOG"
note "-> expect 401"

sub "6.2 a DISALLOWED mime type is rejected with 400 (audio/html)"
curl -s -o /tmp/gaps/b -w 'HTTP %{http_code}\n' -X POST "$API/api/calls/$CALLID/recordings" \
  -H "Authorization: Bearer $AT" -F "recording=@/tmp/gaps/evil.html;type=text/html" >> "$LOG"
echo "  body: $(head -c 400 /tmp/gaps/b)" >> "$LOG"

sub "6.3 a non-audio oversize file is rejected with 400 (30MB declared audio/mpeg)"
curl -s -o /tmp/gaps/b -w 'HTTP %{http_code}\n' -X POST "$API/api/calls/$CALLID/recordings" \
  -H "Authorization: Bearer $AT" -F "recording=@/tmp/gaps/toobig.mp3;type=audio/mpeg" >> "$LOG"
echo "  body: $(head -c 400 /tmp/gaps/b)" >> "$LOG"
note "-> expect 400 too large, NOT 500"

sub "6.4 the two REJECTED uploads wrote nothing to disk"
# Compare the directory listing before and after the rejected attempts rather
# than counting files absolutely, so a leftover from an earlier run cannot be
# mistaken for evidence that a rejected upload was persisted.
PRE=$(ls -1 /root/callyzer-clone/backend-next/uploads/recordings 2>/dev/null | wc -l)
curl -s -o /dev/null -X POST "$API/api/calls/$CALLID/recordings" -H "Authorization: Bearer $AT" \
  -F "recording=@/tmp/gaps/evil.html;type=text/html"
curl -s -o /dev/null -X POST "$API/api/calls/$CALLID/recordings" -H "Authorization: Bearer $AT" \
  -F "recording=@/tmp/gaps/toobig.mp3;type=audio/mpeg"
POST_CNT=$(ls -1 /root/callyzer-clone/backend-next/uploads/recordings 2>/dev/null | wc -l)
echo "  files before rejected uploads: $PRE" >> "$LOG"
echo "  files after  rejected uploads: $POST_CNT" >> "$LOG"
[ "$PRE" = "$POST_CNT" ] && echo "  unchanged -> neither rejected upload was persisted: yes" >> "$LOG" \
                         || echo "  CHANGED -> a rejected upload leaked to disk" >> "$LOG"

sub "6.5 a REAL small audio file is accepted"
UP=$(curl -s -X POST "$API/api/calls/$CALLID/recordings" -H "Authorization: Bearer $AT" \
  -F "recording=@/tmp/gaps/good.mp3;type=audio/mpeg" -F "duration=180")
echo "  $UP" >> "$LOG"
RECID=$(echo "$UP" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')
FILEPATH=$(echo "$UP" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("file_path",""))')
note "recording id=$RECID path=$FILEPATH"

sub "6.6 the file exists on disk at the stored path"
run "ls -l /root/callyzer-clone/backend-next${FILEPATH}"

sub "6.6.1 the stored filename is GENERATED, not the client's (no traversal)"
echo "  client sent: good.mp3" >> "$LOG"
echo "  stored as  : $FILEPATH" >> "$LOG"

sub "6.7 GET the file returns the right content type and the exact bytes"
curl -s -D /tmp/gaps/h -o /tmp/gaps/dl -H "Authorization: Bearer $AT" \
  "$API/api/calls/$CALLID/recordings/$RECID/file"
grep -iE '^(HTTP|content-type|content-length|cache-control)' /tmp/gaps/h >> "$LOG"
echo "  bytes downloaded: $(stat -c%s /tmp/gaps/dl)  (source: $(stat -c%s /tmp/gaps/good.mp3))" >> "$LOG"
echo "  sha256 match: $( [ "$(sha256sum < /tmp/gaps/dl | cut -d' ' -f1)" = "$(sha256sum < /tmp/gaps/good.mp3 | cut -d' ' -f1)" ] && echo yes || echo NO )" >> "$LOG"
note "-> expect 200 + audio/mpeg (or audio/mp4) and an identical checksum"

sub "6.8 GET the file with NO auth is rejected"
curl -s -o /dev/null -w 'HTTP %{http_code}\n' "$API/api/calls/$CALLID/recordings/$RECID/file" >> "$LOG"
note "-> expect 401"

sub "6.9 the same file is also reachable as a static asset (existing behaviour)"
run "curl -s -o /dev/null -w 'static GET /uploads/... HTTP %{http_code}\n' $API$FILEPATH"

sub "6.9.1 a traversal path stored in the DB is REFUSED, not served"
# The INSERT goes through a temp SQL file: nesting psql -c inside su -c inside
# $( ) inside eval is four levels of quote-escaping, and psql also appends
# "INSERT 0 1" to stdout which would corrupt $EVILID.
cat > /tmp/gaps/evil.sql <<SQL
INSERT INTO call_recordings (call_id, user_id, file_path, file_size)
VALUES ($CALLID, (SELECT user_id FROM call_events WHERE id=$CALLID), '/../../../../etc/passwd', 1)
RETURNING id;
SQL
chmod 644 /tmp/gaps/evil.sql
EVILID=$(su postgres -c "psql -q -d levoy -t -A -f /tmp/gaps/evil.sql")
note "planted out-of-tree path as recording id=$EVILID"
code_body GET "/api/calls/$CALLID/recordings/$EVILID/file" "$AT"
note "-> expect 400 Invalid recording path (NOT the contents of /etc/passwd)"
curl -s -o /dev/null -w '  DELETE cleanup HTTP %{http_code}\n' -X DELETE \
  -H "Authorization: Bearer $AT" "$API/api/recordings/$EVILID" >> "$LOG"

sub "6.10 list recordings for this call"
code_body GET "/api/calls/$CALLID/recordings" "$AT"

sub "6.11 an agent cannot attach a recording to someone ELSE's call"
A1T=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"agent1@levoy.co","password":"demo1234"}' | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
A1CALL=$(su postgres -c "psql -d levoy -t -A -c \"SELECT id FROM call_events WHERE user_id=(SELECT id FROM users WHERE email='agent2@levoy.co') LIMIT 1\"")
curl -s -o /tmp/gaps/b -w 'HTTP %{http_code}\n' -X POST "$API/api/calls/$A1CALL/recordings" \
  -H "Authorization: Bearer $A1T" -F "recording=@/tmp/gaps/good.mp3;type=audio/mpeg" >> "$LOG"
echo "  body: $(cat /tmp/gaps/b)" >> "$LOG"
note "-> expect 403 Not your call"

sub "6.12 an agent cannot read another agent's recording file"
curl -s -o /tmp/gaps/b -w 'HTTP %{http_code}\n' -H "Authorization: Bearer $A1T" \
  "$API/api/calls/$CALLID/recordings/$RECID/file" >> "$LOG"
echo "  body: $(cat /tmp/gaps/b)" >> "$LOG"
note "-> expect 403 Forbidden"

sub "6.13 an agent cannot delete another agent's recording"
curl -s -o /tmp/gaps/b -w 'HTTP %{http_code}\n' -X DELETE -H "Authorization: Bearer $A1T" \
  "$API/api/recordings/$RECID" >> "$LOG"
note "-> expect 403 Forbidden"

# ══════════════════════════════════════════════════════════════════════════
hr "7. GET /api/recordings — JOINED CALL METADATA"
# ══════════════════════════════════════════════════════════════════════════
sub "7.1 admin sees the list with call + agent metadata joined (one request)"
curl -s "$API/api/recordings?limit=5" -H "Authorization: Bearer $AT" | python3 -m json.tool | head -45 >> "$LOG"

sub "7.2 filter by call_id"
code_body GET "/api/recordings?call_id=$CALLID" "$AT"

sub "7.3 filter by date range (a window with nothing in it)"
code_body GET "/api/recordings?date_from=1999-01-01&date_to=1999-01-02" "$AT"

sub "7.4 an agent only ever sees their OWN recordings (hard scope, not a filter)"
curl -s "$API/api/recordings" -H "Authorization: Bearer $A1T" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
ids={r['user_id'] for r in d['recordings']}
print('  total:',d['total'],'| distinct user_ids:',ids)
print('  -> scoped to caller only' if len(ids)<=1 else '  -> LEAK: multiple users visible')
" >> "$LOG"

sub "7.5 an agent cannot smuggle user_id in to widen the scope"
curl -s "$API/api/recordings?user_id=1" -H "Authorization: Bearer $A1T" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
ids={r['user_id'] for r in d['recordings']}
print('  requested user_id=1, saw user_ids:',ids)
" >> "$LOG"

sub "7.6 unauthenticated list is rejected"
curl -s -o /dev/null -w 'HTTP %{http_code}\n' "$API/api/recordings" >> "$LOG"

# ══════════════════════════════════════════════════════════════════════════
hr "8. /api/calls EXPOSES has_recording"
# ══════════════════════════════════════════════════════════════════════════
sub "8.1 the call we attached a recording to"
curl -s "$API/api/calls?limit=200" -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for c in d:
    if c['id']==$CALLID:
        print('  id',c['id'],'has_recording',c['has_recording'],'recording_count',c['recording_count'])
        break
else:
    print('  call not in page')
" >> "$LOG"

sub "8.2 a call with no recording reports false / 0"
curl -s "$API/api/calls?limit=200" -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for c in d:
    if not c['has_recording']:
        print('  id',c['id'],'has_recording',c['has_recording'],'recording_count',c['recording_count']); break
" >> "$LOG"

sub "8.3 the fields survive the pre-existing filters (agent scoping, phone, date)"
curl -s "$API/api/calls?phone=&date_from=2000-01-01&limit=2" -H "Authorization: Bearer $AT" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('  keys:',sorted(d[0].keys()) if d else 'EMPTY')" >> "$LOG"

sub "8.4 /api/calls/stats still works (the correlated subquery did not break it)"
curl -s "$API/api/calls/stats" -H "Authorization: Bearer $AT" | head -c 300 >> "$LOG"; echo >> "$LOG"

# ══════════════════════════════════════════════════════════════════════════
hr "9. DELETE REMOVES THE ROW *AND* THE FILE"
# ══════════════════════════════════════════════════════════════════════════
sub "9.1 the file is on disk immediately before the delete"
run "ls -l /root/callyzer-clone/backend-next${FILEPATH}"
sub "9.1.1 and so is its row"
run "su postgres -c \"psql -d levoy -t -A -F'|' -c \\\"SELECT id, call_id, file_path FROM call_recordings WHERE id=$RECID\\\"\""

sub "9.2 DELETE the recording"
code_body DELETE "/api/recordings/$RECID" "$AT"

sub "9.3 the ROW is gone"
run "su postgres -c \"psql -d levoy -t -A -c \\\"SELECT count(*) FROM call_recordings WHERE id=$RECID\\\"\""
note "-> expect 0"

sub "9.4 the FILE is gone from disk"
if [ -e "/root/callyzer-clone/backend-next${FILEPATH}" ]; then
  echo "  STILL PRESENT -- FILE LEAK" >> "$LOG"; ls -l "/root/callyzer-clone/backend-next${FILEPATH}" >> "$LOG"
else
  echo "  removed from disk: yes" >> "$LOG"
fi

sub "9.5 the legacy call_events.recording_path pointer was cleared"
run "su postgres -c \"psql -d levoy -t -A -c \\\"SELECT COALESCE(recording_path,'(null)') FROM call_events WHERE id=$CALLID\\\"\""

sub "9.6 fetching the deleted file is now a 404"
curl -s -o /dev/null -w 'HTTP %{http_code}\n' -H "Authorization: Bearer $AT" \
  "$API/api/calls/$CALLID/recordings/$RECID/file" >> "$LOG"

sub "9.7 deleting it again is a 404"
curl -s -o /dev/null -w 'HTTP %{http_code}\n' -X DELETE -H "Authorization: Bearer $AT" \
  "$API/api/recordings/$RECID" >> "$LOG"

# ══════════════════════════════════════════════════════════════════════════
hr "10. SEEDED NEW-FEATURE DATA IS VISIBLE THROUGH THE API"
# ══════════════════════════════════════════════════════════════════════════
sub "10.1 follow-ups across all four buckets (overdue / today / upcoming / all)"
for s in overdue today upcoming all; do
  n=$(curl -s "$API/api/follow-ups/due?scope=$s" -H "Authorization: Bearer $AT" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')
  note "scope=$s -> $n tasks"
done

sub "10.2 the buckets genuinely straddle now (overdue rows really are in the past)"
run "su postgres -c \"psql -d levoy -t -A -F'|' -c \\\"SELECT count(*) FILTER (WHERE due_at < NOW() AND completed_at IS NULL) AS overdue, count(*) FILTER (WHERE due_at >= date_trunc('day',NOW()) AND due_at < date_trunc('day',NOW())+interval '1 day' AND completed_at IS NULL) AS due_today, count(*) FILTER (WHERE due_at >= NOW() AND completed_at IS NULL) AS upcoming, count(*) FILTER (WHERE completed_at IS NOT NULL) AS completed FROM lead_follow_ups WHERE notes LIKE 'demo:%'\\\"\""

sub "10.3 tags exist and are attached to leads"
run "su postgres -c \"psql -d levoy -t -A -F'|' -c \\\"SELECT t.name, count(lt.lead_id) FROM tags t LEFT JOIN lead_tags lt ON lt.tag_id=t.id GROUP BY t.name ORDER BY t.name\\\"\""

sub "10.4 assignment rules: a fixed-assignee rule by source and a round-robin rule by priority"
code_body GET /api/assignment-rules "$AT"

sub "10.5 QA review history exists per agent"
run "su postgres -c \"psql -d levoy -c \\\"SELECT u.email, count(*) AS reviews, round(avg(cr.overall_score),1) AS avg_qa, count(DISTINCT date_trunc('month',cr.created_at)) AS trend_points FROM call_reviews cr JOIN users u ON u.id=cr.agent_id WHERE cr.notes LIKE 'demo:%' GROUP BY u.email ORDER BY u.email\\\"\""
run "su postgres -c \"psql -d levoy -c \\\"SELECT count(*) AS demo_reviews, count(*) FILTER (WHERE is_compliance_violation) AS violations, min(overall_score) AS min_s, max(overall_score) AS max_s FROM call_reviews WHERE notes LIKE 'demo:%'\\\"\""

sub "10.6 the stored overall_score agrees with the API's own weighting (recomputed from review_scores)"
run "su postgres -c \"psql -d levoy -t -A -F'|' -c \\\"WITH rc AS (SELECT cr.id, cr.overall_score stored, cr.is_compliance_violation viol, CASE WHEN cr.is_compliance_violation THEN 0 ELSE round(SUM(rs.score::numeric/5*rs.weight),2) END recomputed FROM call_reviews cr JOIN review_scores rs ON rs.review_id=cr.id WHERE cr.notes LIKE 'demo:%' GROUP BY cr.id, cr.overall_score, cr.is_compliance_violation) SELECT count(*)||' reviews, '||count(*) FILTER (WHERE stored=recomputed)||' match the formula, '||count(*) FILTER (WHERE stored<>recomputed)||' mismatch' FROM rc\\\"\""

sub "10.7 the API's agent-quality screen reads the seeded reviews (trend has points)"
A1ID=$(su postgres -c "psql -d levoy -t -A -c \"SELECT id FROM users WHERE email='agent1@levoy.co'\"")
curl -s "$API/api/agents/$A1ID/quality" -H "Authorization: Bearer $AT" > /tmp/gaps/q.json
python3 -c "
import json
d=json.load(open('/tmp/gaps/q.json'))
print('  review_count',d['review_count'],'| qa_score',d['qa_score'],'| violations',d['compliance_violations'])
print('  qa_trend:',[(t['period'],t['avg_score'],t['reviews']) for t in d.get('qa_trend',[])])
print('  category_averages:',[(c['category'],c['avg_score'],c['ratings']) for c in d.get('category_averages',[])])
print('  worst_category:',d.get('worst_category'),d.get('worst_category_avg'))
" >> "$LOG"

sub "10.8 the follow-up task panel a dashboard would actually render"
curl -s "$API/api/follow-ups/due?scope=today" -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for f in d[:6]:
    print('  due',f['due_at'][:16],'|',f['type'],'|',f.get('lead_name'),'|',f.get('user_name'),'| overdue',f['is_overdue'])
print('  total today:',len(d))
" >> "$LOG"

echo "" >> "$LOG"
echo "==================================================================" >> "$LOG"
echo "verify_gaps.sh complete" >> "$LOG"
echo "==================================================================" >> "$LOG"
echo "log: $LOG"
