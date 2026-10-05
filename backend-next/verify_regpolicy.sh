#!/bin/bash
# ============================================================================
# Companion to verify_gaps.sh — proves the registration POLICY flags.
#
# Kept in a separate file on purpose: these checks boot extra instances of
# server.js (to exercise BOOTSTRAP_ADMIN_* and ALLOW_SELF_REGISTER against a
# scratch database), and an inlined version made the whole suite one very large
# script that tooling would refuse to scan.
#
# Output: /tmp/verify_gaps.log (appended)
# ============================================================================
set -uo pipefail
API=http://localhost:3001
LOG=/tmp/verify_gaps.log
STAMP=$(date +%s)
mkdir -p /tmp/gaps

hr()   { echo "" >> "$LOG"; echo "==================================================================" >> "$LOG"; echo "$1" >> "$LOG"; echo "==================================================================" >> "$LOG"; }
sub()  { echo "" >> "$LOG"; echo "-- $1 --" >> "$LOG"; }
note() { echo "  $1" >> "$LOG"; }
run()  { echo "\$ $1" >> "$LOG"; eval "$1" >> "$LOG" 2>&1; }

sub "1.5 BOOTSTRAP ADMIN: driven only by env vars, only when no admin exists"
note "(demonstrated on a scratch database so the live one is untouched —"
note " same initDB() code path, just an empty users table)"
su postgres -c "psql -q -d postgres -c 'DROP DATABASE IF EXISTS levoy_bootstrap_probe'" >> "$LOG" 2>&1
su postgres -c "psql -q -d postgres -c 'CREATE DATABASE levoy_bootstrap_probe'" >> "$LOG" 2>&1
cat > /tmp/gaps/bootstrap.js <<'JS'
// Boots a second instance of the SAME server.js against the scratch DB, with
// no BOOTSTRAP_ADMIN_* set, to show that an admin-less database fails closed
// and logs a loud warning instead of inventing an account.
process.env.PG_DB = 'levoy_bootstrap_probe';
process.env.PORT = '3999';
delete process.env.BOOTSTRAP_ADMIN_EMAIL;
delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
const orig = require('fs').createWriteStream;
require('/root/callyzer-clone/backend-next/server.js');
setTimeout(() => process.exit(0), 3000);
JS
sub "1.5.1 with no bootstrap env vars and an empty users table"
run "cd /root/callyzer-clone/backend-next && timeout 12 node /tmp/gaps/bootstrap.js 2>&1 | grep -iE 'bootstrap|warning|registration is closed|NOBODY' | head -8"
run "su postgres -c \"psql -d levoy_bootstrap_probe -t -A -c 'SELECT count(*) FROM users'\""
note "-> expect 0 users: the install fails CLOSED, it does not guess a credential"

sub "1.5.2 with BOOTSTRAP_ADMIN_* set, exactly one admin is created and logged loudly"
cat > /tmp/gaps/bootstrap2.js <<'JS'
// Same server.js, BOOTSTRAP_ADMIN_* set, on the scratch DB. Stays up long
// enough for the script to query it, then exits on its own.
process.env.PG_DB = 'levoy_bootstrap_probe';
process.env.PORT = '3998';
process.env.BOOTSTRAP_ADMIN_EMAIL = 'root.ops@levoy.co';
process.env.BOOTSTRAP_ADMIN_PASSWORD = 'bootstrap-pw-123';
require('/root/callyzer-clone/backend-next/server.js');
setTimeout(() => process.exit(0), 30000);
JS
run "cd /root/callyzer-clone/backend-next && timeout 12 node /tmp/gaps/bootstrap2.js 2>&1 | grep -iE 'BOOTSTRAP|admin' | head -6"

sub "1.5.3 that account exists, is an admin, and can log in with the env password"
run "su postgres -c \"psql -d levoy_bootstrap_probe -c \\\"SELECT email, role, is_active FROM users\\\"\""
# The probe instance exits on its own after 3s, so it has to be started in the
# background and queried while it is still up.
( cd /root/callyzer-clone/backend-next && timeout 20 node /tmp/gaps/bootstrap2.js > /tmp/gaps/boot2.log 2>&1 ) &
BOOTPID=$!
sleep 5
BOOTSTRAP_LOGIN=$(curl -s -X POST http://localhost:3998/api/auth/login -H 'Content-Type: application/json' -d '{"email":"root.ops@levoy.co","password":"bootstrap-pw-123"}')
{
  echo "  login against the bootstrap instance (port 3998):"
  echo "  ${BOOTSTRAP_LOGIN:0:200}"
  echo "  registration-status on that instance: $(curl -s http://localhost:3998/api/auth/registration-status)"
} >> "$LOG"
note "-> expect a token back: the bootstrapped admin is a working login"
sub "1.5.4 restarting again does NOT create a second admin (idempotent)"
wait $BOOTPID 2>/dev/null
sed 's/3998/3996/' /tmp/gaps/bootstrap2.js > /tmp/gaps/bootstrap3.js
run "cd /root/callyzer-clone/backend-next && timeout 12 node /tmp/gaps/bootstrap3.js >/dev/null 2>&1; su postgres -c \"psql -d levoy_bootstrap_probe -t -A -c \\\"SELECT count(*) FROM users WHERE role='admin'\\\"\"""
note "-> expect 1: a second boot with the same env vars creates nothing new"
su postgres -c "psql -q -d postgres -c 'DROP DATABASE IF EXISTS levoy_bootstrap_probe'" >> "$LOG" 2>&1

sub "1.6 the opt-in flag still opens signup for dev installs, as a plain AGENT"
cat > /tmp/gaps/openreg.js <<'JS'
// Same server.js, ALLOW_SELF_REGISTER=true, on the live DB read/write path.
process.env.ALLOW_SELF_REGISTER = 'true';
process.env.PORT = '3997';
require('/root/callyzer-clone/backend-next/server.js');
setTimeout(() => process.exit(0), 12000);
JS
( cd /root/callyzer-clone/backend-next && timeout 20 node /tmp/gaps/openreg.js > /tmp/gaps/openreg.log 2>&1 ) &
OPID=$!
sleep 5
echo "  registration-status: $(curl -s http://localhost:3997/api/auth/registration-status)" >> "$LOG"
OPENREG=$(curl -s -X POST http://localhost:3997/api/auth/register -H 'Content-Type: application/json' \
  -d "{\"email\":\"devsignup.$STAMP@example.com\",\"password\":\"demo1234\",\"name\":\"Dev Signup\"}")
echo "  register response: $OPENREG" >> "$LOG"
echo "  -> role must be 'agent' even though the users table was NOT empty" >> "$LOG"
wait $OPID 2>/dev/null
run "su postgres -c \"psql -d levoy -t -A -F'|' -c \\\"SELECT email, role FROM users WHERE email='devsignup.$STAMP@example.com'\\\"\""

# ══════════════════════════════════════════════════════════════════════════

echo "" >> "$LOG"
echo "  (registration-policy probes complete)" >> "$LOG"
