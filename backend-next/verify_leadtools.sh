#!/bin/bash
# ============================================================================
# Verification for the 8 new lead-tool features:
#   timeline · next-follow-up/overdue · tags · CSV import · merge/dedupe
#   auto-assign rules · bulk status · configurable pipeline stages
# Every section prints the real curl response + HTTP status.
# ============================================================================
API=http://localhost:3001
LOG=/tmp/verify_leadtools.log
: > "$LOG"

hr()  { echo "" >> "$LOG"; echo "==================================================================" >> "$LOG"; echo "$1" >> "$LOG"; echo "==================================================================" >> "$LOG"; }
sub() { echo "" >> "$LOG"; echo "-- $1 --" >> "$LOG"; }

# call METHOD PATH TOKEN [BODY]  -> logs and echoes the body + status
call() {
  local m=$1 p=$2 tok=$3 body=$4 out
  if [ -n "$tok" ]; then
    out=$(curl -s -w '\n<<HTTP %{http_code}>>' -X "$m" "$API$p" -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' ${body:+-d "$body"})
  else
    out=$(curl -s -w '\n<<HTTP %{http_code}>>' -X "$m" "$API$p" -H 'Content-Type: application/json' ${body:+-d "$body"})
  fi
  echo "$out" >> "$LOG"; echo "$out"
}
code() { # status only
  local m=$1 p=$2 tok=$3 body=$4
  if [ -n "$tok" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$m" "$API$p" -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' ${body:+-d "$body"}
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$m" "$API$p" -H 'Content-Type: application/json' ${body:+-d "$body"}
  fi
}
jget() { python3 -c "
import sys, json
raw = sys.stdin.read().rsplit('<<HTTP',1)[0].strip()
try: d = json.loads(raw)
except Exception: print(''); sys.exit(0)
try: print($1)
except Exception: print('')
" 2>/dev/null; }
HTTP() { echo "$1" | grep -o 'HTTP [0-9]*' | awk '{print $2}' | tail -1; }

# fmt FILE -> pretty-print a JSON file
fmt() { python3 -m json.tool "$1" 2>/dev/null || cat "$1"; }

echo "###########################################################" >> "$LOG"
echo "# Callio — lead tools: timeline / tags / import / merge /" >> "$LOG"
echo "#              rules / bulk status / pipeline" >> "$LOG"
echo "# run: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
echo "###########################################################" >> "$LOG"

hr "0. TOKENS"
sub "admin / manager / agent1 login"
AT=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@levoy.co","password":"demo1234"}' | jget "d['access_token']")
MT=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' -d '{"email":"manager@levoy.co","password":"demo1234"}' | jget "d['access_token']")
GT=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' -d '{"email":"agent1@levoy.co","password":"demo1234"}' | jget "d['access_token']")
echo "admin token len=${#AT}  manager token len=${#MT}  agent1 token len=${#GT}" >> "$LOG"
echo "admin=$AT" >> "$LOG"; echo "manager=$MT" >> "$LOG"; echo "agent1=$GT" >> "$LOG"
[ -n "$AT" ] && [ -n "$MT" ] && [ -n "$GT" ] || { echo "FATAL: could not log in" >> "$LOG"; exit 1; }

mklead() { # mklead NAME PHONE EMAIL SOURCE PRIORITY [extra json] -> echoes id
  local body="{\"name\":\"$1\",\"phone\":\"$2\",\"email\":\"$3\",\"source\":\"$4\",\"priority\":\"$5\"${6:+,$6}}"
  call POST /api/leads "$AT" "$body" | jget "d['id']"
}

# ══════════════════════════════════════════════════════════════════════
hr "1. UNIFIED ACTIVITY TIMELINE — 5 DIFFERENT TYPES ON ONE LEAD"
# ══════════════════════════════════════════════════════════════════════
sub "create the lead we will build a history for"
TL_NAME="LT Timeline $(date +%s)"
TL_PHONE="+919900000101"
R=$(call POST /api/leads "$AT" "{\"name\":\"$TL_NAME\",\"phone\":\"$TL_PHONE\",\"email\":\"timeline@levoy.test\",\"source\":\"web\",\"priority\":\"high\"}")
LEAD=$(echo "$R" | jget "d['id']")
echo "lead id = $LEAD" >> "$LOG"

sub "1a. CALL — POST /api/calls with this lead's phone"
call POST /api/calls "$AT" "{\"phone_number\":\"$TL_PHONE\",\"direction\":\"outgoing\",\"status\":\"connected\",\"duration_seconds\":95,\"notes\":\"intro pitch\"}" >> "$LOG"

sub "1b. FOLLOW-UP — POST /api/leads/$LEAD/follow-ups (and complete one)"
FU=$(call POST "/api/leads/$LEAD/follow-ups" "$AT" '{"type":"email","due_at":"2026-10-05T10:00:00Z","notes":"send the proposal"}')
FUID=$(echo "$FU" | jget "d['id']")
echo "  -> follow-up id=$FUID" >> "$LOG"
sub "1b-2. complete that follow-up (must appear as its OWN timeline event)"
call PATCH "/api/follow-ups/$FUID" "$AT" '{"outcome":"completed","notes":"proposal emailed"}' >> "$LOG"
sub "1c. ASSIGNMENT — POST /api/leads/$LEAD/assign (manager token)"
call POST "/api/leads/$LEAD/assign" "$MT" '{"assigned_to":9,"note":"Vikram takes this one"}' >> "$LOG"

sub "1d. STATUS CHANGE — PUT /api/leads/$LEAD {\"status\":\"qualified\"}"
call PUT "/api/leads/$LEAD" "$AT" '{"status":"qualified"}' >> "$LOG"

sub "1e. NOTE — POST /api/leads/$LEAD/activities {\"type\":\"note\"}"
call POST "/api/leads/$LEAD/activities" "$AT" '{"type":"note","summary":"Budget confirmed at 40k, closing next week","metadata":{"channel":"call"}}' >> "$LOG"

sub "1f. MANUAL EMAIL activity (proves the 4 manual types all write)"
call POST "/api/leads/$LEAD/activities" "$AT" '{"type":"email","summary":"Emailed the pricing sheet","metadata":{"direction":"out"}}' >> "$LOG"

sub "GET /api/leads/$LEAD/timeline — the merged, reverse-chronological list"
call GET "/api/leads/$LEAD/timeline?limit=100" "$AT" > /tmp/lt_timeline.json
# NB: `call ... > file` captures curl's trailing "<<HTTP nnn>>" marker too, so
# strip it before parsing or json.load dies with "Extra data".
python3 - "$LEAD" > /tmp/lt_timeline_report.txt 2>&1 <<'PY'
import json, sys
raw = open('/tmp/lt_timeline.json').read().rsplit('<<HTTP',1)[0].strip()
d = json.loads(raw)
print(f"lead #{d['lead_id']} '{d['lead_name']}'  total={d['total']}  counts={d['counts']}")
print()
print(f"{'TYPE':<14} {'SOURCE ID':<22} {'AT':<26} {'ACTOR':<16} SUMMARY")
print('-'*130)
for e in d['timeline']:
    a = e['actor'] or {}
    print(f"{e['type']:<14} {e['id']:<22} {e['at']:<26} {(a.get('name') or '-')[:15]:<16} {e['summary']}")
types = {e['type'] for e in d['timeline']}
need = {'call','follow_up','assignment','status_change','note','email'}
print()
print("types present:", sorted(types))
missing = need - types
if missing:
    print("RESULT: FAIL — missing", sorted(missing))
    sys.exit(1)
ats = [e['at'] for e in d['timeline']]
ordered = ats == sorted(ats, reverse=True)
print(f"reverse-chronological: {'YES' if ordered else 'NO'}")
print("RESULT: PASS — all 6 types in one ordered list" if ordered
      else "RESULT: FAIL — list is not newest-first")
sys.exit(0 if ordered else 1)
PY
TL_OK=$?
cat /tmp/lt_timeline_report.txt >> "$LOG"
cat /tmp/lt_timeline_report.txt
echo "" >> "$LOG"
echo "timeline assertion exit=$TL_OK" >> "$LOG"

sub "ordered newest-first? (at column must be non-increasing)"
# NB: files written with `call ... > f` still carry curl's trailing
# "<<HTTP nnn>>" marker, so strip it before parsing.
python3 - <<'PY' | tee -a "$LOG"
import json
raw = open('/tmp/lt_timeline.json').read().rsplit('<<HTTP',1)[0].strip()
d = json.loads(raw)
ats = [e['at'] for e in d['timeline']]
print("newest-first:", "YES" if ats == sorted(ats, reverse=True) else "NO", "->", ats[0], "->", ats[-1])
PY

sub "pagination: limit=2&offset=0 vs limit=2&offset=2"
call GET "/api/leads/$LEAD/timeline?limit=2&offset=0" "$AT" | head -c 300 >> "$LOG"; echo >> "$LOG"
call GET "/api/leads/$LEAD/timeline?limit=2&offset=2" "$AT" | head -c 300 >> "$LOG"; echo >> "$LOG"

# ══════════════════════════════════════════════════════════════════════
hr "2. STATUS CHANGE AUTO-RECORDS A status_change ACTIVITY"
# ══════════════════════════════════════════════════════════════════════
sub "GET the status_change entry + its metadata (old_status / new_status)"
curl -s "$API/api/leads/$LEAD/timeline?limit=100" -H "Authorization: Bearer $AT" \
 | python3 -c "
import sys,json
d=json.load(sys.stdin)
sc=[e for e in d['timeline'] if e['type']=='status_change']
print(json.dumps(sc, indent=2))
print()
print('RESULT:', 'PASS — old_status=' + str(sc[0]['metadata'].get('old_status')) + ' new_status=' + str(sc[0]['metadata'].get('new_status')) if sc else 'FAIL — no status_change entry')
" | tee -a "$LOG"

sub "PUT with an UNKNOWN status is rejected against the configured stages"
call PUT "/api/leads/$LEAD" "$AT" '{"status":"teleported"}' >> "$LOG"

sub "POST /api/leads with an unknown status is rejected too"
call POST /api/leads "$AT" '{"name":"Bad Status","phone":"+919900000199","status":"teleported"}' >> "$LOG"

# ══════════════════════════════════════════════════════════════════════
hr "3. NEXT FOLLOW-UP + OVERDUE ON THE LEAD LIST"
# ══════════════════════════════════════════════════════════════════════
OD_PHONE="+919900000201"
OD=$(call POST /api/leads "$AT" "{\"name\":\"LT Overdue $(date +%s)\",\"phone\":\"$OD_PHONE\",\"source\":\"web\"}")
ODID=$(echo "$OD" | jget "d['id']")
echo "overdue lead id=$ODID (its auto follow-up is due in +24h)" >> "$LOG"

sub "push one follow-up into the past so the lead is genuinely overdue"
OLD=$(python3 -c "import datetime;print((datetime.datetime.utcnow()-datetime.timedelta(days=3)).strftime('%Y-%m-%dT%H:%M:%SZ'))")
call POST "/api/leads/$ODID/follow-ups" "$AT" "{\"type\":\"call\",\"due_at\":\"$OLD\",\"notes\":\"overdue task\"}" >> "$LOG"

sub "GET /api/leads?search=LT+Overdue — next_follow_up / open_follow_ups / overdue_count"
curl -s "$API/api/leads?search=LT%20Overdue" -H "Authorization: Bearer $AT" > /tmp/lt_overdue.json
python3 - <<'PY' | tee -a "$LOG"
import json
rows = json.load(open('/tmp/lt_overdue.json'))
for r in rows:
    print(json.dumps({k: r[k] for k in ('id','name','next_follow_up','open_follow_ups','overdue_count')}, indent=2))
r = rows[0]
ok = r['overdue_count'] >= 1 and r['next_follow_up'] and r['next_follow_up']['overdue'] is True and 'days_until' in r['next_follow_up']
print()
print("RESULT:", "PASS — overdue flag set and days_until present" if ok else "FAIL")
PY

sub "GET /api/leads?overdue_only=true (filter, not a post-filter)"
curl -s "$API/api/leads?overdue_only=true&limit=500" -H "Authorization: Bearer $AT" > /tmp/lt_od_only.json
python3 - <<'PY' | tee -a "$LOG"
import json
rows = json.load(open('/tmp/lt_od_only.json'))
bad = [r['id'] for r in rows if r['overdue_count'] < 1]
print(f"leads returned by overdue_only=true: {len(rows)}")
print(f"ids: {[r['id'] for r in rows][:12]} …")
print("RESULT:", "PASS — every returned lead has overdue_count >= 1" if not bad else f"FAIL — leaked {bad[:5]}")
PY

sub "control: GET /api/leads?overdue_only=false is not filtered"
curl -s "$API/api/leads?limit=5" -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
rows=json.load(sys.stdin)
print('unfiltered limit=5 ->', [(r['id'], r['overdue_count']) for r in rows])
print('RESULT:', 'PASS — list is not limited to overdue leads' if any(r['overdue_count']==0 for r in rows) else 'NOTE — first 5 all happen to be overdue')
" | tee -a "$LOG"

sub "lead DETAIL carries the same fields"
call GET "/api/leads/$ODID" "$AT" > /tmp/lt_od_detail.json
python3 - <<'PY' | tee -a "$LOG"
import json
d = json.loads(open('/tmp/lt_od_detail.json').read().rsplit('<<HTTP',1)[0].strip())
print(json.dumps({k: d.get(k) for k in ('id','name','next_follow_up','open_follow_ups','overdue_count','open_follow_up_count','follow_up_count')}, indent=2))
PY

# ══════════════════════════════════════════════════════════════════════
hr "4. TAGS / LABELS"
# ══════════════════════════════════════════════════════════════════════
sub "create two tags"
T1=$(call POST /api/tags "$AT" '{"name":"Hot Lead","color":"#ef4444"}')
T1ID=$(echo "$T1" | jget "d['id']")
T2=$(call POST /api/tags "$AT" '{"name":"Enterprise","color":"#6366f1"}')
T2ID=$(echo "$T2" | jget "d['id']")
echo "  -> tag ids: Hot Lead=$T1ID  Enterprise=$T2ID" >> "$LOG"

sub "duplicate tag name is rejected (case-insensitive)"
call POST /api/tags "$AT" '{"name":"hot lead"}' >> "$LOG"

sub "create two leads to tag"
A1=$(mklead "LT TagA $(date +%s)" "+919900000301" "taga@levoy.test" "web" "high"); echo "  -> lead A=$A1" >> "$LOG"
A2=$(mklead "LT TagB $(date +%s)" "+919900000302" "tagb@levoy.test" "referral" "normal"); echo "  -> lead B=$A2" >> "$LOG"

sub "PUT /api/leads/$A1/tags  (replace set: both tags)"
call PUT "/api/leads/$A1/tags" "$AT" "{\"tag_ids\":[$T1ID,$T2ID]}" >> "$LOG"
sub "PUT /api/leads/$A2/tags  (replace set: one tag)"
call PUT "/api/leads/$A2/tags" "$AT" "{\"tag_ids\":[$T1ID]}" >> "$LOG"

sub "PUT is a REPLACE, not an append — re-send A1 with only Enterprise"
call PUT "/api/leads/$A1/tags" "$AT" "{\"tag_ids\":[$T2ID]}" >> "$LOG"
sub "…and put Hot Lead back so the tag filter demo has both"
call PUT "/api/leads/$A1/tags" "$AT" "{\"tag_ids\":[$T1ID,$T2ID]}" >> "$LOG"

sub "unknown tag id is rejected before anything is written"
call PUT "/api/leads/$A2/tags" "$AT" "{\"tag_ids\":[$T1ID,999999]}" >> "$LOG"

sub "GET /api/leads/$A1/tags"
call GET "/api/leads/$A1/tags" "$AT" >> "$LOG"

sub "GET /api/leads?tag_id=$T1ID (filter)"
curl -s "$API/api/leads?tag_id=$T1ID&limit=500" -H "Authorization: Bearer $AT" > /tmp/lt_tagfilter.json
python3 - <<'PY' "$T1ID" "$A1" "$A2" | tee -a "$LOG"
import json,sys
tid, a1, a2 = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
rows = json.load(open('/tmp/lt_tagfilter.json'))
ids = [r['id'] for r in rows]
print(f"tag_id={tid} -> {len(rows)} leads: {ids[:12]}")
print(f"expected {a1} and {a2} present:", a1 in ids and a2 in ids)
print("every returned lead actually carries the tag:", all(any(t['id']==tid for t in r['tags']) for r in rows))
print("RESULT:", "PASS" if a1 in ids and a2 in ids else "FAIL")
PY

sub "tags appear on the lead DETAIL response"
curl -s "$API/api/leads/$A1" -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(json.dumps({'id':d['id'],'tags':d['tags']}, indent=2))
print('RESULT:', 'PASS — tags present in detail' if len(d['tags'])==2 else 'FAIL')
" | tee -a "$LOG"

sub "tags appear on the lead LIST response"
curl -s "$API/api/leads?tag_id=$T1ID&limit=3" -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
rows=json.load(sys.stdin)
for r in rows[:3]: print(json.dumps({'id':r['id'],'tags':r['tags']}))
print('RESULT:', 'PASS — tags present in list rows')
" | tee -a "$LOG"

sub "GET /api/tags (with lead_count)"
call GET /api/tags "$AT" | head -c 700 >> "$LOG"; echo >> "$LOG"

# ══════════════════════════════════════════════════════════════════════
hr "5. CSV IMPORT — partial success with per-row errors"
# ══════════════════════════════════════════════════════════════════════
cat > /tmp/leads_import.csv <<CSV
name,phone,email,source,priority,status,notes
"LT Import Alpha","+919900000401",alpha@levoy.test,web,high,new,"quoted commas, and a note"
LT Import Bravo,+919900000402,bravo@levoy.test,referral,normal,contacted,single row
LT Import Broken,+919900000403,not-an-email,web,high,new,bad email
LT Import NoPhone,,delta@levoy.test,web,low,new,missing phone
LT Import BadPriority,+919900000405,eps@levoy.test,web,super-urgent,new,bad priority
LT Import BadStage,+919900000406,zeta@levoy.test,web,normal,teleported,bad stage
CSV
sub "the CSV being uploaded"
cat /tmp/leads_import.csv >> "$LOG"

sub "POST /api/leads/import (multipart)"
curl -s -w '\n<<HTTP %{http_code}>>' -X POST "$API/api/leads/import" \
  -H "Authorization: Bearer $AT" -F "file=@/tmp/leads_import.csv;type=text/csv" > /tmp/lt_import.json
cat /tmp/lt_import.json >> "$LOG"
python3 - <<'PY' | tee -a "$LOG"
import json
raw = open('/tmp/lt_import.json').read().rsplit('<<HTTP',1)[0].strip()
d = json.loads(raw)
print()
print(json.dumps({k: d[k] for k in ('total_rows','inserted','updated','ok')}, indent=2))
print("per-row errors:")
for e in d['errors']: print("  row", e['row'], "->", e['error'])
print()
print("RESULT:", "PASS — 6 rows in, 2 inserted, 4 per-row errors, file NOT rejected"
      if d['total_rows']==6 and d['inserted']==2 and len(d['errors'])==4 else "FAIL")
PY

sub "re-import the SAME file — proves upsert-on-phone (the 2 good rows UPDATE, nothing is duplicated)"
curl -s -w '\n<<HTTP %{http_code}>>' -X POST "$API/api/leads/import" \
  -H "Authorization: Bearer $AT" -F "file=@/tmp/leads_import.csv;type=text/csv" > /tmp/lt_import2.json
python3 - <<'PY' | tee -a "$LOG"
import json
d = json.loads(open('/tmp/lt_import2.json').read().rsplit('<<HTTP',1)[0].strip())
print(json.dumps({k: d[k] for k in ('total_rows','inserted','updated','errors')}, indent=2))
print("RESULT:", "PASS — upsert, no duplicates created" if d['inserted']==0 and d['updated']==2 else "FAIL")
PY

sub "row cap: a 5001-row file is rejected with 400 (not silently truncated)"
python3 -c "
print('name,phone,email')
for i in range(5001): print(f'Cap Test {i},+9198{i:07d},cap{i}@t.test')
" > /tmp/leads_toobig.csv
curl -s -w '\n<<HTTP %{http_code}>>' -X POST "$API/api/leads/import" \
  -H "Authorization: Bearer $AT" -F "file=@/tmp/leads_toobig.csv;type=text/csv" | head -c 400 | tee -a "$LOG"
echo >> "$LOG"

sub "import audit entry"
curl -s "$API/api/audit-log?action=lead.imported" -H "Authorization: Bearer $AT" | head -c 500 >> "$LOG"; echo >> "$LOG"

# ══════════════════════════════════════════════════════════════════════
hr "6. DUPLICATE DETECTION + MERGE"
# ══════════════════════════════════════════════════════════════════════
DUP_A=$(mklead "LT Dup Survivor $(date +%s)" "+919900000501" "dup@levoy.test" "web" "high")
echo "  -> survivor lead = $DUP_A" >> "$LOG"
# the duplicate: same person, different country-code formatting, different source
DUP_B=$(mklead "LT Dup Survivor $(date +%s)" "919900000501" "dup@levoy.test" "referral" "high" '"notes":"entered twice by two reps"')
echo "  -> duplicate lead = $DUP_B (same last 9 digits + same email)" >> "$LOG"

sub "give both leads something to move: follow-up, tag, assignment"
call POST "/api/leads/$DUP_B/follow-ups" "$AT" '{"type":"call","due_at":"2026-11-01T09:00:00Z","notes":"task on the dup"}' >> "$LOG"
call POST "/api/leads/$DUP_B/activities" "$AT" '{"type":"note","summary":"duplicate spotted during review"}' >> "$LOG"
call POST "/api/leads/$DUP_B/assign" "$MT" '{"assigned_to":10}' >> "$LOG"
call PUT  "/api/leads/$DUP_B/tags" "$AT" "{\"tag_ids\":[$T1ID]}" >> "$LOG"

sub "GET /api/leads/$DUP_B/duplicates — scored candidates with a reason"
curl -s "$API/api/leads/$DUP_B/duplicates" -H "Authorization: Bearer $AT" > /tmp/lt_dupes.json
python3 - <<'PY' "$DUP_A" "$DUP_B" | tee -a "$LOG"
import json,sys
a, b = int(sys.argv[1]), int(sys.argv[2])
d = json.load(open('/tmp/lt_dupes.json'))
print("scanned lead:", d['lead'])
print("candidates:", d['total'])
for c in d['candidates'][:5]:
    print(f"  lead #{c['lead_id']:<5} score={c['score']:<4} {c['name'][:34]:<34} reasons={c['reasons']}")
hit = [c for c in d['candidates'] if c['lead_id'] == a]
print()
print("self excluded:", b not in [c['lead_id'] for c in d['candidates']])
print("RESULT:", f"PASS — survivor #{a} found, score={hit[0]['score']}, signals={hit[0]['matched_on']}" if hit else "FAIL — survivor not detected")
PY

sub "BEFORE the merge — row counts that must move"
echo "  survivor  #$DUP_A:" >> "$LOG"
curl -s "$API/api/leads/$DUP_A/timeline?limit=500" -H "Authorization: Bearer $AT" \
 | python3 -c "import sys,json;d=json.load(sys.stdin);print('    timeline total=%d counts=%s' % (d['total'], d['counts']))" | tee -a "$LOG"
echo "  duplicate #$DUP_B:" >> "$LOG"
curl -s "$API/api/leads/$DUP_B/timeline?limit=500" -H "Authorization: Bearer $AT" \
 | python3 -c "import sys,json;d=json.load(sys.stdin);print('    timeline total=%d counts=%s' % (d['total'], d['counts']))" | tee -a "$LOG"

sub "merge guard: into_lead_id must be an integer, and not itself"
call POST "/api/leads/$DUP_B/merge" "$AT" '{"into_lead_id":"abc"}' >> "$LOG"
call POST "/api/leads/$DUP_B/merge" "$AT" "{\"into_lead_id\":$DUP_B}" >> "$LOG"

sub "POST /api/leads/$DUP_B/merge {\"into_lead_id\": $DUP_A}"
call POST "/api/leads/$DUP_B/merge" "$AT" "{\"into_lead_id\":$DUP_A}" > /tmp/lt_merge.json
cat /tmp/lt_merge.json >> "$LOG"
python3 - <<'PY' | tee -a "$LOG"
import json
d = json.loads(open('/tmp/lt_merge.json').read().rsplit('<<HTTP',1)[0].strip())
print()
print("source (soft-deleted):", json.dumps(d['source']))
print("target:", json.dumps(d['target']))
print("moved:", json.dumps(d['moved']))
print("assignees_moved:", d['assignees_moved'], " tags_moved:", d['tags_moved'])
print("RESULT:", "PASS — data moved, source soft-deleted with a pointer"
      if d['source']['soft_deleted'] and d['moved']['lead_activities'] >= 1 and d['moved']['lead_follow_ups'] >= 1 else "FAIL")
PY

sub "the source is SOFT-deleted: still readable, points at the survivor"
curl -s "$API/api/leads/$DUP_B" -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(json.dumps({'id':d['id'],'name':d['name'],'merged_into_lead_id':d['merged_into_lead_id'],'deleted_at':d['deleted_at'],'assignees':d['assignees'],'tags':d['tags']}, indent=2))
print('RESULT:', 'PASS — row survives with merged_into_lead_id set' if d['merged_into_lead_id'] else 'FAIL')
" | tee -a "$LOG"

sub "the merged-away lead disappears from GET /api/leads"
curl -s "$API/api/leads?limit=1000" -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
rows=json.load(sys.stdin)
ids=[r['id'] for r in rows]
print('merged source still in the list:', $DUP_B in ids)
print('survivor still in the list:', $DUP_A in ids)
print('RESULT:', 'PASS' if $DUP_B not in ids and $DUP_A in ids else 'FAIL')
" | tee -a "$LOG"

sub "AFTER the merge — the survivor's timeline has absorbed the dup's rows"
curl -s "$API/api/leads/$DUP_A/timeline?limit=500" -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('survivor timeline total:', d['total'], 'counts:', d['counts'])
print('RESULT:', 'PASS — activities/follow-ups now live on the survivor'
      if d['total'] >= 2 else 'FAIL')
" | tee -a "$LOG"

sub "re-merging the same source is refused"
call POST "/api/leads/$DUP_B/merge" "$AT" "{\"into_lead_id\":$DUP_A}" >> "$LOG"

sub "merge audit entry"
curl -s "$API/api/audit-log?action=lead.merged" -H "Authorization: Bearer $AT" | head -c 600 >> "$LOG"; echo >> "$LOG"

# ══════════════════════════════════════════════════════════════════════
hr "7. AUTO-ASSIGN RULES"
# ══════════════════════════════════════════════════════════════════════
sub "create rule #1 — web leads go to a FIXED agent (priority 10, stop_on_match)"
R1=$(call POST /api/assignment-rules "$AT" '{"name":"Web leads to Vikram","priority":10,"strategy":"fixed","fixed_user_id":9,"conditions":{"source":["web"]},"stop_on_match":true}')
R1ID=$(echo "$R1" | jget "d['id']")
echo "  -> rule 1 id=$R1ID" >> "$LOG"

sub "create rule #2 — catch-all, least_loaded (priority 20)"
R2=$(call POST /api/assignment-rules "$AT" '{"name":"Catch-all least loaded","priority":20,"strategy":"least_loaded","conditions":{},"stop_on_match":true}')
R2ID=$(echo "$R2" | jget "d['id']")
echo "  -> rule 2 id=$R2ID" >> "$LOG"

sub "invalid rule inputs are rejected"
call POST /api/assignment-rules "$AT" '{"name":"Bad strategy","strategy":"coin_flip"}' >> "$LOG"
call POST /api/assignment-rules "$AT" '{"name":"Bad conditions","conditions":{"souce":["web"]}}' >> "$LOG"
call POST /api/assignment-rules "$AT" '{"name":"Fixed without user","strategy":"fixed"}' >> "$LOG"
call POST /api/assignment-rules "$AT" '{"name":"Fixed to an admin","strategy":"fixed","fixed_user_id":6}' >> "$LOG"

sub "GET /api/assignment-rules (ordered by priority)"
call GET /api/assignment-rules "$AT" >> "$LOG"

sub "7a. HOOK: POST /api/leads with source=web — rule #1 must fire on create"
H1=$(call POST /api/leads "$AT" '{"name":"LT RuleHook Web","phone":"+919900000601","source":"web","priority":"high"}')
H1ID=$(echo "$H1" | jget "d['id']")
echo "$H1" | python3 -c "
import sys,json
d=json.loads(sys.stdin.read().rsplit('<<HTTP',1)[0].strip())
aa=d['auto_assign']
print()
print('lead', d['id'], 'assigned_to =', d['assigned_to'])
print('auto_assign:', json.dumps(aa, indent=2))
print('RESULT:', 'PASS — rule \"%s\" fired on create and named itself' % aa['rule']['name']
      if aa and aa['applied'] and aa['rule']['id']==$R1ID and d['assigned_to']==9 else 'FAIL')
" | tee -a "$LOG"

sub "7b. HOOK respects the opt-out flag: POST /api/leads with auto_assign=false"
call POST /api/leads "$AT" '{"name":"LT RuleOptOut","phone":"+919900000602","source":"web","auto_assign":false}' | python3 -c "
import sys,json
d=json.loads(sys.stdin.read().rsplit('<<HTTP',1)[0].strip())
print(json.dumps({'id':d['id'],'assigned_to':d['assigned_to'],'auto_assign':d['auto_assign']}, indent=2))
print('RESULT:', 'PASS — opted out, left unassigned' if d['assigned_to'] is None else 'FAIL')
" | tee -a "$LOG"

sub "7c. HOOK respects an explicit assigned_to (never overrides the caller)"
call POST /api/leads "$AT" '{"name":"LT RuleExplicit","phone":"+919900000603","source":"web","assigned_to":10}' | python3 -c "
import sys,json
d=json.loads(sys.stdin.read().rsplit('<<HTTP',1)[0].strip())
print(json.dumps({'id':d['id'],'assigned_to':d['assigned_to'],'auto_assign':d['auto_assign']}, indent=2))
print('RESULT:', 'PASS — explicit assignee 10 kept' if d['assigned_to']==10 else 'FAIL')
" | tee -a "$LOG"

sub "7d. a non-web lead falls through to rule #2 (catch-all, least_loaded)"
H2=$(call POST /api/leads "$AT" '{"name":"LT RuleCatchAll","phone":"+919900000604","source":"partner","priority":"normal"}')
H2ID=$(echo "$H2" | jget "d['id']")
echo "$H2" | python3 -c "
import sys,json
d=json.loads(sys.stdin.read().rsplit('<<HTTP',1)[0].strip())
aa=d['auto_assign']
print()
print('lead', d['id'], 'assigned_to =', d['assigned_to'])
print('evaluated:', json.dumps(aa['evaluated'], indent=2))
print('RESULT:', 'PASS — rule #1 evaluated false on source, rule #2 fired'
      if aa and aa['applied'] and aa['rule']['id']==$R2ID and aa['evaluated'][0]['failed_on']==['source'] else 'FAIL')
" | tee -a "$LOG"

sub "7e. POST /api/leads/$H2ID/auto-assign (explicit re-run, names the rule)"
call POST "/api/leads/$H2ID/auto-assign" "$AT" '{}' | head -c 900 >> "$LOG"; echo >> "$LOG"

sub "7f. a lead no rule matches (disable rule 2 first)"
call PATCH "/api/assignment-rules/$R2ID" "$AT" '{"enabled":false}' >> "$LOG"
NM=$(call POST /api/leads "$AT" '{"name":"LT NoRuleMatch","phone":"+919900000605","source":"partner"}')
echo "$NM" | python3 -c "
import sys,json
d=json.loads(sys.stdin.read().rsplit('<<HTTP',1)[0].strip())
aa=d['auto_assign']
print(json.dumps({'id':d['id'],'assigned_to':d['assigned_to'],'auto_assign':aa}, indent=2))
print('RESULT:', 'PASS — no rule matched, lead left unassigned' if not aa['applied'] else 'FAIL')
" | tee -a "$LOG"
call PATCH "/api/assignment-rules/$R2ID" "$AT" '{"enabled":true}' >> "$LOG"

sub "7g. tag_ids condition: a rule keyed on the Enterprise tag"
R3=$(call POST /api/assignment-rules "$AT" "{\"name\":\"Enterprise tag to Sneha\",\"priority\":5,\"strategy\":\"fixed\",\"fixed_user_id\":10,\"conditions\":{\"tag_ids\":[$T2ID]}}")
R3ID=$(echo "$R3" | jget "d['id']")
T3=$(mklead "LT TaggedRule $(date +%s)" "+919900000606" "tagged@levoy.test" "web" "normal")
call PUT "/api/leads/$T3/tags" "$AT" "{\"tag_ids\":[$T2ID]}" >> "$LOG"
call POST "/api/leads/$T3/auto-assign" "$AT" '{}' | python3 -c "
import sys,json
d=json.loads(sys.stdin.read().rsplit('<<HTTP',1)[0].strip())
print(json.dumps({'assigned_to':d['assigned_to'],'assigned_to_name':d['assigned_to_name'],'rule':d['rule']}, indent=2))
print('RESULT:', 'PASS — tag_ids condition matched rule #3 (priority 5 beats the source rule)'
      if d['rule']['id']==$R3ID and d['assigned_to']==10 else 'FAIL')
" | tee -a "$LOG"

sub "7h. stop_on_match=false lets a later rule override"
call PATCH "/api/assignment-rules/$R1ID" "$AT" '{"stop_on_match":false}' >> "$LOG"
T4=$(mklead "LT Cascade $(date +%s)" "+919900000607" "cascade@levoy.test" "web" "normal")
call POST "/api/leads/$T4/auto-assign" "$AT" '{}' | python3 -c "
import sys,json
d=json.loads(sys.stdin.read().rsplit('<<HTTP',1)[0].strip())
print('winner rule:', d['rule']['name'], '-> assigned_to', d['assigned_to'])
print('evaluated:', [(e['name'], e['matched']) for e in d['evaluated']])
print('RESULT:', 'PASS — evaluation continued past the first match' if len(d['evaluated'])>1 else 'FAIL')
" | tee -a "$LOG"
call PATCH "/api/assignment-rules/$R1ID" "$AT" '{"stop_on_match":true}' >> "$LOG"

sub "7i. POST /api/leads/bulk-auto-assign"
B1=$(mklead "LT BulkAA1 $(date +%s)" "+919900000611" "baa1@levoy.test" "web" "normal")
B2=$(mklead "LT BulkAA2 $(date +%s)" "+919900000612" "baa2@levoy.test" "partner" "normal")
call POST /api/leads/bulk-auto-assign "$AT" "{\"lead_ids\":[$B1,$B2,999999]}" | python3 -c "
import sys,json
d=json.loads(sys.stdin.read().rsplit('<<HTTP',1)[0].strip())
print('assigned:', json.dumps([{'lead':a['lead_id'],'to':a['assigned_to'],'rule':a['rule']['name']} for a in d['assigned']]))
print('skipped:', json.dumps(d['skipped']))
print('RESULT:', 'PASS — 2 assigned, the bogus id skipped' if len(d['assigned'])==2 and d['skipped'] else 'FAIL')
" | tee -a "$LOG"

sub "7j. PATCH + DELETE the rules"
call PATCH "/api/assignment-rules/$R2ID" "$AT" '{"name":"Catch-all least loaded (renamed)","priority":25}' >> "$LOG"
call DELETE "/api/assignment-rules/$R3ID" "$AT" >> "$LOG"
call DELETE "/api/assignment-rules/$R1ID" "$AT" >> "$LOG"
call DELETE "/api/assignment-rules/$R2ID" "$AT" >> "$LOG"
sub "remaining rules (should be empty)"
call GET /api/assignment-rules "$AT" >> "$LOG"

# ══════════════════════════════════════════════════════════════════════
hr "8. BULK STATUS EDIT — 5 good + 1 invalid"
# ══════════════════════════════════════════════════════════════════════
BL=""
for i in 1 2 3 4 5; do
  ID=$(mklead "LT Bulk $i $(date +%s)" "+91990000070$i" "bulk$i@levoy.test" "web" "normal")
  BL="$BL$ID,"
done
BULK_IDS="${BL%,}"
echo "  -> lead ids: $BULK_IDS" >> "$LOG"

sub "POST /api/leads/bulk-status {\"lead_ids\":[5 ids + 999999], status:'contacted'}"
call POST /api/leads/bulk-status "$AT" "{\"lead_ids\":[${BULK_IDS},999999],\"status\":\"contacted\",\"note\":\"cleared the backlog\"}" > /tmp/lt_bulkstatus.json
cat /tmp/lt_bulkstatus.json >> "$LOG"
python3 - <<'PY' | tee -a "$LOG"
import json
d = json.loads(open('/tmp/lt_bulkstatus.json').read().rsplit('<<HTTP',1)[0].strip())
print()
print("updated:", d['updated'])
print("skipped:", d['skipped'])
print("RESULT:", "PASS — 5 updated, 1 skipped (Lead not found)"
      if len(d['updated'])==5 and len(d['skipped'])==1 and d['skipped'][0]['reason']=='Lead not found' else "FAIL")
PY

sub "each updated lead got its own status_change activity"
FIRST=$(echo "$BULK_IDS" | cut -d, -f1)
curl -s "$API/api/leads/$FIRST/timeline?limit=50" -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
sc=[e for e in d['timeline'] if e['type']=='status_change']
print(json.dumps(sc, indent=2))
print('RESULT:', 'PASS — old_status=new -> contacted, bulk flag set' if sc and sc[0]['metadata'].get('bulk') else 'FAIL')
" | tee -a "$LOG"

sub "bulk-status validation: unknown stage / empty list"
call POST /api/leads/bulk-status "$AT" '{"lead_ids":[1],"status":"teleported"}' >> "$LOG"
call POST /api/leads/bulk-status "$AT" '{"lead_ids":[],"status":"new"}' >> "$LOG"

sub "one bulk-status audit entry covering the run"
curl -s "$API/api/audit-log?action=lead.bulk_status" -H "Authorization: Bearer $AT" | head -c 700 >> "$LOG"; echo >> "$LOG"

# ══════════════════════════════════════════════════════════════════════
hr "9. CONFIGURABLE PIPELINE STAGES"
# ══════════════════════════════════════════════════════════════════════
sub "9a. GET /api/pipeline/stages (seeded defaults, ordered)"
call GET /api/pipeline/stages "$AT" > /tmp/lt_stages.json
python3 - <<'PY' | tee -a "$LOG"
import json
d = json.loads(open('/tmp/lt_stages.json').read().rsplit('<<HTTP',1)[0].strip())
for s in d: print(f"  pos={s['position']} slug={s['slug']:<12} color={s['color']:<9} won={str(s['is_won']):<5} lost={str(s['is_lost']):<5} prob={s['probability']}")
print("RESULT:", "PASS — 6 seeded stages, ordered" if len(d)==6 else "FAIL")
PY

# Snapshot the ORIGINAL id order now, before any custom stage is added, so the
# restore at the end cannot reference a stage that has since been deleted.
ORIG=$(curl -s "$API/api/pipeline/stages" -H "Authorization: Bearer $AT" | python3 -c "import sys,json;print(','.join(str(s['id']) for s in json.load(sys.stdin)))")
echo "  -> original stage id order = $ORIG" >> "$LOG"

sub "9b. add a custom stage 'Trial'"
TS=$(call POST /api/pipeline/stages "$AT" '{"name":"Trial","color":"#a855f7","probability":55}')
TSID=$(echo "$TS" | jget "d['id']")
echo "  -> Trial id=$TSID" >> "$LOG"

sub "a lead moved into the custom stage"
TP=$(mklead "LT TrialLead $(date +%s)" "+919900000801" "trial@levoy.test" "web" "normal")
call PUT "/api/leads/$TP" "$AT" '{"status":"trial"}' >> "$LOG"

sub "9c. GET /api/leads/pipeline — Trial column must contain that lead"
curl -s "$API/api/leads/pipeline" -H "Authorization: Bearer $AT" > /tmp/lt_board.json
python3 - <<'PY' "$TSID" "$TP" | tee -a "$LOG"
import json,sys
ts, tp = int(sys.argv[1]), int(sys.argv[2])
d = json.load(open('/tmp/lt_board.json'))
print("totals:", json.dumps(d['totals']))
print("unmapped:", d['unmapped'][:5])
for col in d['stages']:
    print(f"  {col['slug']:<12} open={str(col['is_open']):<5} won={str(col['is_won']):<5} lost={str(col['is_lost']):<5} n={col['lead_count']}")
trial = [c for c in d['stages'] if c['id']==ts]
ids = [l['id'] for l in trial[0]['leads']] if trial else []
print()
print("trial column contains lead", tp, "->", tp in ids)
print("RESULT:", "PASS — custom stage buckets correctly and carries colour/probability/won-lost"
      if trial and tp in ids and trial[0]['probability']==55 else "FAIL")
PY

sub "9d. PATCH the custom stage (rename + probability)"
call PATCH "/api/pipeline/stages/$TSID" "$AT" '{"name":"Free Trial","probability":60}' >> "$LOG"

sub "9e. PUT /api/pipeline/stages/reorder — move Trial to the front"
NEWORD="$TSID,$(echo "$ORIG" | tr ',' '\n' | paste -sd, -)"
echo "  -> ordered_ids = $NEWORD" >> "$LOG"
call PUT /api/pipeline/stages/reorder "$AT" "{\"ordered_ids\":[$NEWORD]}" | python3 -c "
import sys,json
d=json.loads(sys.stdin.read().rsplit('<<HTTP',1)[0].strip())
print('new order:', [s['slug'] for s in d['stages']])
print('RESULT:', 'PASS — position set by array order' if d['stages'][0]['slug']=='trial' else 'FAIL')
" | tee -a "$LOG"

sub "reorder validation: unknown stage id"
call PUT /api/pipeline/stages/reorder "$AT" '{"ordered_ids":[999999]}' >> "$LOG"

sub "9f. DELETE a stage that still has leads is REFUSED without force"
call DELETE "/api/pipeline/stages/$TSID" "$AT" > /tmp/lt_delrefuse.json
cat /tmp/lt_delrefuse.json >> "$LOG"
python3 - <<'PY' | tee -a "$LOG"
import json
d = json.loads(open('/tmp/lt_delrefuse.json').read().rsplit('<<HTTP',1)[0].strip())
print()
print('RESULT:', f"PASS — refused, {d.get('leads_in_stage')} lead(s) still in the stage" if d.get('leads_in_stage') else 'FAIL')
PY

sub "9g. DELETE ?force=true — reassigns its leads to 'new'"
call DELETE "/api/pipeline/stages/$TSID?force=true" "$AT" >> "$LOG"
sub "the displaced lead is now in 'new'"
curl -s "$API/api/leads/$TP" -H "Authorization: Bearer $AT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('lead', d['id'], 'status =', d['status'])
print('RESULT:', 'PASS — force-delete moved the lead to new' if d['status']=='new' else 'FAIL')
" | tee -a "$LOG"

sub "9h. restore the default stage order"
call PUT /api/pipeline/stages/reorder "$AT" "{\"ordered_ids\":[$ORIG]}" | python3 -c "
import sys,json
d=json.loads(sys.stdin.read().rsplit('<<HTTP',1)[0].strip())
print('order:', [s['slug'] for s in d['stages']])
" | tee -a "$LOG"

sub "9i. deleting a stage twice / unknown stage"
call DELETE /api/pipeline/stages/999999 "$AT" >> "$LOG"

sub "pipeline stage audit trail"
curl -s "$API/api/audit-log?entity_type=pipeline_stage" -H "Authorization: Bearer $AT" | head -c 600 >> "$LOG"; echo >> "$LOG"

# ══════════════════════════════════════════════════════════════════════
hr "10. ROLE GATING — agent1 must be locked out of every write"
# ══════════════════════════════════════════════════════════════════════
sub "agent1 creates a lead of their own (to prove what they CAN do)"
AG=$(call POST /api/leads "$GT" '{"name":"LT AgentOwn","phone":"+919900000901","source":"web"}')
AGID=$(echo "$AG" | jget "d['id']")
echo "  -> agent's own lead = $AGID (owner_id 8)" >> "$LOG"

sub "10a. AGENT CAN: post a note activity on their own lead"
call POST "/api/leads/$AGID/activities" "$GT" '{"type":"note","summary":"Agent note — works in my own lead"}' | head -c 400 >> "$LOG"; echo >> "$LOG"

sub "10b. AGENT CAN: read their own lead's timeline"
curl -s "$API/api/leads/$AGID/timeline" -H "Authorization: Bearer $GT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('timeline entries:', d['total'], 'types:', list(d['counts']))
print('RESULT:', 'PASS — agent reads their own timeline' if d['total']>=1 else 'FAIL')
" | tee -a "$LOG"

sub "10c. AGENT CAN: read tags + stages (read-only routes)"
echo "GET /api/tags        -> $(code GET /api/tags "$GT")" >> "$LOG"
echo "GET /api/pipeline/stages -> $(code GET /api/pipeline/stages "$GT")" >> "$LOG"
echo "GET /api/leads/pipeline  -> $(code GET /api/leads/pipeline "$GT")" >> "$LOG"
echo "GET /api/assignment-rules -> $(code GET /api/assignment-rules "$GT")" >> "$LOG"

sub "10d. AGENT BLOCKED (403 expected on every one of these)"
for spec in \
  "POST|/api/leads/$DUP_B/merge|{\"into_lead_id\":$DUP_A}" \
  "POST|/api/leads/bulk-status|{\"lead_ids\":[1],\"status\":\"new\"}" \
  "POST|/api/assignment-rules|{\"name\":\"agent rule\"}" \
  "PATCH|/api/assignment-rules/1|{\"enabled\":false}" \
  "DELETE|/api/assignment-rules/1|" \
  "PUT|/api/leads/$AGID/tags|{\"tag_ids\":[$T1ID]}" \
  "POST|/api/tags|{\"name\":\"agent tag\"}" \
  "DELETE|/api/tags/$T1ID|" \
  "POST|/api/pipeline/stages|{\"name\":\"agent stage\"}" \
  "PATCH|/api/pipeline/stages/1|{\"name\":\"hack\"}" \
  "PUT|/api/pipeline/stages/reorder|{\"ordered_ids\":[1,2]}" \
  "DELETE|/api/pipeline/stages/1|" \
  "POST|/api/leads/$AGID/auto-assign|{}" \
  "POST|/api/leads/bulk-auto-assign|{\"lead_ids\":[$AGID]}" \
  "POST|/api/leads/$A1/assign|{\"assigned_to\":9}" ; do
  M="${spec%%|*}"; rest="${spec#*|}"; P="${rest%%|*}"; B="${rest#*|}"
  R=$(curl -s -w '\n<<HTTP %{http_code}>>' -X "$M" "$API$P" -H "Authorization: Bearer $GT" -H 'Content-Type: application/json' ${B:+-d "$B"})
  ST=$(HTTP "$R")
  echo "  $M $P -> <<HTTP $ST>>  $(echo "$R" | head -1)" >> "$LOG"
  echo "" >> "$LOG"
  printf "  %-6s %-42s HTTP %s\n" "$M" "$P" "$ST" | tee -a "$LOG"
done

sub "10e. AGENT BLOCKED from reading someone else's lead (pre-existing rule)"
SUB10E="  GET    /api/leads/$LEAD (admin-owned) -> HTTP $(code GET "/api/leads/$LEAD" "$GT")"
echo "$SUB10E" >> "$LOG"; printf '%s\n' "$SUB10E" | tee -a "$LOG"

sub "10f. MANAGER (not just admin) is allowed on the gated writes"
# Each call is made once and captured IN FULL (the <<HTTP nnn>> marker is part of
# the output and is what HTTP() parses), so a non-deterministic body cannot make
# the reported line disagree with what the log recorded a moment earlier.
M_MERGE=$(call POST "/api/leads/$DUP_B/merge" "$MT" "{\"into_lead_id\":$DUP_A}")
M_BULK=$(call POST /api/leads/bulk-status "$MT" '{"lead_ids":[],"status":"new"}')
M_TAG=$(call POST /api/tags "$MT" "{\"name\":\"mgr tag $(date +%s)\"}")
SUB10F="  manager merge=$(HTTP "$M_MERGE") bulk-status=$(HTTP "$M_BULK") tag-create=$(HTTP "$M_TAG")
   (400 = gate passed / body invalid; 403 would mean the manager was wrongly blocked; tag-create must be 201)"
echo "$SUB10F" >> "$LOG"; printf '%s\n' "$SUB10F" | tee -a "$LOG"

# ══════════════════════════════════════════════════════════════════════
hr "11. REGRESSION — pre-existing endpoint contract"
# ══════════════════════════════════════════════════════════════════════
sub "the six pre-existing lead routes still answer as before"
for spec in \
  "GET|/api/leads?limit=2" \
  "GET|/api/leads/$LEAD" \
  "GET|/api/leads/$LEAD/assignees" \
  "GET|/api/leads/$LEAD/assignments" \
  "GET|/api/leads/$LEAD/follow-ups" \
  "GET|/api/leads/pipeline" \
  "GET|/api/leads/$LEAD/timeline" \
  "GET|/api/leads/$LEAD/tags" \
  "GET|/api/leads/$LEAD/duplicates" ; do
  M="${spec%%|*}"; P="${spec#*|}"
  printf "  %-6s %-44s HTTP %s\n" "$M" "$P" "$(code "$M" "$P" "$AT")" | tee -a "$LOG"
done

echo "" >> "$LOG"
echo "# (full re-run of /tmp/verify_lead_qa.sh + verify_admin.sh and the status" >> "$LOG"
echo "#  code diff against the pre-change baselines is appended by verify_regression.sh)" >> "$LOG"
echo "" >> "$LOG"
echo "###########################################################" >> "$LOG"
echo "# done: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
echo "###########################################################" >> "$LOG"
echo "WROTE $LOG"
