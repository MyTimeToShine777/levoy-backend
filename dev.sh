#!/usr/bin/env bash
#
# Callio dev runner.
#
# Starts the three stack processes (backend, frontend, marketing) without
# systemd, for local development. Dependency-ordered: the frontend is not
# started until the backend answers /health, so the UI never boots against a
# dead API.
#
# Usage:
#   ./dev.sh start [dev|prod]   start everything (default: prod)
#   ./dev.sh stop               stop everything started by this script
#   ./dev.sh restart [dev|prod] stop then start
#   ./dev.sh status             show pid / port / health for each service
#   ./dev.sh logs <name>        tail a service log
#
# Only bash, curl and node are required.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT/.run"
LOG_DIR="$RUN_DIR/logs"

BACKEND_DIR="$ROOT/backend-next"
FRONTEND_DIR="$ROOT/frontend"
MARKETING_DIR="$ROOT/marketing-site"

BACKEND_PORT=3001
FRONTEND_PORT=3000
MARKETING_PORT=3002

SERVICES=(backend frontend marketing)

# Node lives outside the default PATH on this box (installed under
# ~/.hermes/tools); resolve it rather than assuming /usr/bin/node exists.
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
elif [ -x "$HOME/.hermes/tools/node-26.7.0-linux-x64/bin/node" ]; then
  NODE_BIN="$HOME/.hermes/tools/node-26.7.0-linux-x64/bin/node"
else
  echo "FATAL: node not found on PATH" >&2
  exit 1
fi
export PATH="$(dirname "$NODE_BIN"):$PATH"

c_dim=$'\033[2m'; c_ok=$'\033[32m'; c_bad=$'\033[31m'; c_warn=$'\033[33m'; c_off=$'\033[0m'
[ -t 1 ] || { c_dim=""; c_ok=""; c_bad=""; c_warn=""; c_off=""; }

log()  { printf '%s[dev.sh]%s %s\n' "$c_dim" "$c_off" "$*"; }
ok()   { printf '%s[dev.sh]%s %s %s\n' "$c_dim" "$c_off" "$c_ok" "$*"; }
bad()  { printf '%s[dev.sh]%s %s %s\n' "$c_dim" "$c_off" "$c_bad" "$*"; }
warn() { printf '%s[dev.sh]%s %s %s\n' "$c_dim" "$c_off" "$c_warn" "$*"; }

# pidfile / logfile helpers -----------------------------------------------
pidfile() { echo "$RUN_DIR/$1.pid"; }
logfile() { echo "$LOG_DIR/$1.log"; }

# Resolve the PID actually listening on a port. `setsid` forks, so the shell's
# $! is a short-lived wrapper -- the real server is a grandchild. Track the
# process that owns the port instead, which is what we actually need to stop.
pid_on_port() {
  ss -ltnpH "sport = :$1" 2>/dev/null \
    | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2
}

port_of() {
  case "$1" in
    backend)   echo "$BACKEND_PORT" ;;
    frontend)  echo "$FRONTEND_PORT" ;;
    marketing) echo "$MARKETING_PORT" ;;
  esac
}

# Service name -> project directory. NOTE: the marketing service runs out of
# marketing-site/, not marketing/; do not assume name == dir.
dir_of() {
  case "$1" in
    backend)   echo "$BACKEND_DIR" ;;
    frontend)  echo "$FRONTEND_DIR" ;;
    marketing) echo "$MARKETING_DIR" ;;
    *)         echo "" ;;
  esac
}

# A service is up if something we recorded is alive AND the port answers.
is_running() {
  local name="$1" pf pid
  pf="$(pidfile "$name")"
  [ -f "$pf" ] || return 1
  pid="$(cat "$pf" 2>/dev/null)"
  [ -n "${pid:-}" ] || return 1
  kill -0 "$pid" 2>/dev/null
}

# Re-point the pidfile at the process that really owns the port, so stop and
# status act on the server rather than on the setsid wrapper.
reconcile_pid() {
  local name="$1" pf real
  pf="$(pidfile "$name")"
  real="$(pid_on_port "$(port_of "$name")")"
  [ -n "$real" ] && printf '%s\n' "$real" >"$pf" && log "$name -> real pid $real"
  return 0
}

# Wait until an HTTP endpoint returns 2xx/3xx, else give up.
wait_http() {
  local name="$1" url="$2" tries="${3:-60}" i code
  for ((i = 1; i <= tries; i++)); do
    code="$(curl -s -o /dev/null -m 2 -w '%{http_code}' "$url" 2>/dev/null)"
    case "$code" in
      2*|3*) return 0 ;;
    esac
    if ! is_running "$name"; then
      bad "$name exited before becoming healthy (see $(logfile "$name"))"
      return 1
    fi
    sleep 1
  done
  return 1
}

# start_one <name> <dir> <command...>
start_one() {
  local name="$1" dir="$2"; shift 2
  if is_running "$name"; then
    ok "$name already running (pid $(cat "$(pidfile "$name")"))"
    return 0
  fi
  mkdir -p "$RUN_DIR" "$LOG_DIR"
  # setsid puts the child in its own session/process group, so stop can kill
  # the whole `npx` -> `next-server` tree without touching this script.
  ( cd "$dir" && setsid nohup "$@" >>"$(logfile "$name")" 2>&1 < /dev/null & echo $! >"$(pidfile "$name")" )
  log "$name started (pid $(cat "$(pidfile "$name")"), log $(logfile "$name"))"
}

start_all() {
  local mode="${1:-prod}"
  mkdir -p "$RUN_DIR" "$LOG_DIR"
  log "mode=$mode  node=$NODE_BIN"

  # 1. backend first
  if [ "$mode" = "dev" ]; then
    start_one backend "$BACKEND_DIR" "$NODE_BIN" --watch server.js
  else
    start_one backend "$BACKEND_DIR" "$NODE_BIN" server.js
  fi

  if wait_http backend "http://127.0.0.1:$BACKEND_PORT/health" 60; then
    reconcile_pid backend
    ok "backend healthy on :$BACKEND_PORT"
  else
    bad "backend did not become healthy; not starting frontends"
    return 1
  fi

  # 2. Next apps
  if [ "$mode" = "dev" ]; then
    start_one frontend  "$FRONTEND_DIR"  npx next dev -p "$FRONTEND_PORT"
    start_one marketing "$MARKETING_DIR" npx next dev -p "$MARKETING_PORT"
  else
    for s in frontend marketing; do
      sdir="$(dir_of "$s")"
      if [ ! -f "$sdir/.next/BUILD_ID" ]; then
        warn "$s has no production build in $sdir; building (one-off, this takes a few minutes)"
        ( cd "$sdir" && npx next build ) >>"$LOG_DIR/$s-build.log" 2>&1 \
          || { bad "$s build failed; see $LOG_DIR/$s-build.log"; return 1; }
      fi
    done
    start_one frontend  "$FRONTEND_DIR"  npx next start -p "$FRONTEND_PORT"
    start_one marketing "$MARKETING_DIR" npx next start -p "$MARKETING_PORT"
  fi

  if wait_http frontend "http://127.0.0.1:$FRONTEND_PORT/" 90; then
    reconcile_pid frontend
    ok "frontend healthy on :$FRONTEND_PORT"
  fi
  if wait_http marketing "http://127.0.0.1:$MARKETING_PORT/" 90; then
    reconcile_pid marketing
    ok "marketing healthy on :$MARKETING_PORT"
  fi
  return 0
}

stop_all() {
  local s stopped=0 pf pid port
  # reverse order: frontends first, backend last
  for s in marketing frontend backend; do
    pf="$(pidfile "$s")"
    port="$(port_of "$s")"
    # Prefer the recorded pid; fall back to whatever owns the port so we can
    # still reclaim a server whose pidfile went stale (e.g. after a crash).
    pid=""
    if is_running "$s"; then
      pid="$(cat "$pf" 2>/dev/null)"
    else
      pid="$(pid_on_port "$port")"
    fi

    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      # Kill the whole process group: `npx` -> `next-server` are a tree.
      # setsid gave each service its own group, so this cannot hit this script.
      kill -TERM "-$(ps -o pgid= "$pid" 2>/dev/null | tr -d ' ')" 2>/dev/null \
        || kill -TERM "$pid" 2>/dev/null
      for _ in 1 2 3 4 5 6 7 8 9 10; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.5
      done
      if kill -0 "$pid" 2>/dev/null; then
        bad "$s (pid $pid) ignored SIGTERM; sending SIGKILL"
        kill -KILL "-$(ps -o pgid= "$pid" 2>/dev/null | tr -d ' ')" 2>/dev/null \
          || kill -KILL "$pid" 2>/dev/null
        sleep 0.5
      fi
      stopped=1
      log "stopped $s (pid $pid)"
    else
      log "$s not running"
    fi
    rm -f "$pf"
  done
  [ "$stopped" -eq 1 ] && ok "all stopped" || log "nothing was running"
  return 0
}

status_all() {
  local s pid code state
  printf '%-10s %-8s %-6s %-22s %s\n' SERVICE STATE PID PORT HEALTH
  for s in "${SERVICES[@]}"; do
    if is_running "$s"; then
      pid="$(cat "$(pidfile "$s")")"
      state="running"
    else
      pid="$(pid_on_port "$(port_of "$s")")"
      [ -n "$pid" ] && state="untracked" || { pid="-"; state="stopped"; }
    fi
    if [ "$s" = "backend" ]; then
      code="$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:$BACKEND_PORT/health" 2>/dev/null)"
    else
      code="$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:$(port_of "$s")/" 2>/dev/null)"
    fi
    case "$code" in
      2*|3*) printf '%-10s %-8s %-6s %-22s %s\n' "$s" "$state" "$pid" "$(port_of "$s")" "${c_ok}HTTP $code${c_off}" ;;
      "")     printf '%-10s %-8s %-6s %-22s %s\n' "$s" "$state" "$pid" "$(port_of "$s")" "${c_warn}no response${c_off}" ;;
      *)      printf '%-10s %-8s %-6s %-22s %s\n' "$s" "$state" "$pid" "$(port_of "$s")" "${c_bad}HTTP $code${c_off}" ;;
    esac
  done
}

case "${1:-start}" in
  start)   start_all "${2:-prod}" ;;
  stop)    stop_all ;;
  restart) stop_all; sleep 1; start_all "${2:-prod}" ;;
  status)  status_all ;;
  logs)
    [ -n "${2:-}" ] || { echo "usage: $0 logs <backend|frontend|marketing>" >&2; exit 2; }
    tail -f "$(logfile "$2")" ;;
  *) sed -n '3,20p' "$0"; exit 2 ;;
esac
