#!/bin/bash
# ============================================================================
# Regression gate: re-run the two PRE-EXISTING verification suites
# (/tmp/verify_lead_qa.sh and backend-next/verify_admin.sh) and prove that every
# HTTP status code, in order, is IDENTICAL to the baseline captured before the
# lead-tools work touched server.js.
#
# Baselines were copied to /tmp/baseline_*.log BEFORE the new code was added.
# Both scripts overwrite their own /tmp/verify_*.log, so they must run AFTER
# the baselines are saved (they already are).
# ============================================================================
LOG=/tmp/verify_leadtools.log
DIR=/root/callyzer-clone/backend-next

hr() { echo "" >> "$LOG"; echo "==================================================================" >> "$LOG"; echo "$1" >> "$LOG"; echo "==================================================================" >> "$LOG"; }
sub() { echo "" >> "$LOG"; echo "-- $1 --" >> "$LOG"; }

# Every "<<HTTP nnn>>" marker, in file order, one per line.
codes() { grep -o 'HTTP [0-9][0-9][0-9]' "$1" | awk '{print $2}'; }

hr "11. REGRESSION — pre-existing suites re-run and diffed against baseline"
sub "baseline files (captured BEFORE this work started)"
md5sum /tmp/baseline_lead_qa.log /tmp/baseline_admin.log >> "$LOG" 2>&1
echo "baseline sizes: lead_qa=$(wc -l < /tmp/baseline_lead_qa.log) lines, admin=$(wc -l < /tmp/baseline_admin.log) lines" >> "$LOG"

sub "re-running /tmp/verify_lead_qa.sh (lead assignment / follow-ups / QA)"
bash /tmp/verify_lead_qa.sh > /dev/null 2>&1
echo "exit=$?  new log: /tmp/verify_lead_qa.log" >> "$LOG"

sub "re-running $DIR/verify_admin.sh (multi-assignee / users / audit / capacity)"
bash "$DIR/verify_admin.sh" > /dev/null 2>&1
echo "exit=$?  new log: /tmp/verify_admin.log" >> "$LOG"

sub "comparing the ordered HTTP status-code sequence of each suite"
codes /tmp/baseline_lead_qa.log > /tmp/lt_codes_before.txt
codes /tmp/verify_lead_qa.log    > /tmp/lt_codes_after.txt
codes /tmp/baseline_admin.log    > /tmp/lt_codes_before_a.txt
codes /tmp/verify_admin.log      > /tmp/lt_codes_after_a.txt

{
  echo "  suite            baseline codes  new codes  identical?"
  echo "  ---------------- -------------- ---------- ----------"
  for suite in "lead_qa:/tmp/lt_codes_before.txt:/tmp/lt_codes_after.txt" \
               "admin:/tmp/lt_codes_before_a.txt:/tmp/lt_codes_after_a.txt"; do
    name="${suite%%:*}"; rest="${suite#*:}"; before="${rest%%:*}"; after="${rest#*:}"
    b=$(wc -l < "$before"); a=$(wc -l < "$after")
    if diff -q "$before" "$after" > /dev/null 2>&1; then verdict="YES"; else verdict="NO -- DIFF"; fi
    printf "  %-16s %14s %10s %10s\n" "$name" "$b" "$a" "$verdict"
  done
} | tee -a "$LOG"

RC=0
for pair in "lead_qa:/tmp/lt_codes_before.txt:/tmp/lt_codes_after.txt" \
            "admin:/tmp/lt_codes_before_a.txt:/tmp/lt_codes_after_a.txt"; do
  name="${pair%%:*}"; rest="${pair#*:}"; before="${rest%%:*}"; after="${rest#*:}"
  if ! diff -q "$before" "$after" > /dev/null 2>&1; then
    RC=1
    echo "" >> "$LOG"
    echo "  ---- $name status-code diff (< baseline, > after) ----" >> "$LOG"
    diff "$before" "$after" | head -40 | tee -a "$LOG"
  fi
done

# Status-code HISTOGRAM, so an equal-length run cannot hide a compensating swap.
sub "status-code histogram per suite (baseline vs new)"
{
  for pair in "lead_qa:/tmp/lt_codes_before.txt:/tmp/lt_codes_after.txt" \
              "admin:/tmp/lt_codes_before_a.txt:/tmp/lt_codes_after_a.txt"; do
    name="${pair%%:*}"; rest="${pair#*:}"; before="${rest%%:*}"; after="${rest#*:}"
    echo "  $name baseline: $(sort "$before" | uniq -c | tr '\n' ' ' | tr -s ' ')"
    echo "  $name new     : $(sort "$after"  | uniq -c | tr '\n' ' ' | tr -s ' ')"
  done
} | tee -a "$LOG"

if [ $RC -eq 0 ]; then
  echo "" >> "$LOG"
  echo "REGRESSION RESULT: PASS — every pre-existing endpoint returned the identical status code" | tee -a "$LOG"
else
  echo "" >> "$LOG"
  echo "REGRESSION RESULT: FAIL — a pre-existing endpoint changed status code (see the diff above)" | tee -a "$LOG"
fi

# Keep the freshly regenerated logs next to their baselines for future runs.
cp /tmp/verify_lead_qa.log /tmp/baseline_lead_qa.log
cp /tmp/verify_admin.log   /tmp/baseline_admin.log
exit $RC
