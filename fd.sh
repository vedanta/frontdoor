#!/usr/bin/env bash
#
# fd.sh — frontdoor ops CLI
#
# Three-level command space (liway-pattern, #64):
#
#   ./fd.sh <env> <subgroup> <action> [args]
#
#     env       prod | local         (which environment to hit)
#     subgroup  user | cache | server  (feature area)
#                 - `user`   account-related (signup)
#                 - `cache`  cache-warming + ISR invalidation; auth via
#                            CRON_SECRET (PROD_CRON_SECRET for prod env)
#                 - `server` dev-server lifecycle — LOCAL ONLY (prod is
#                            managed by Vercel, not by this CLI)
#     action    signup / refresh / revalidate / start / stop / restart / kill /
#               status / logs
#                 - signup, refresh, revalidate are the HTTP-poke actions
#                 - start, stop, restart, kill, status, logs are server-lifecycle
#                   actions (local server only)
#
# The split mirrors the operational reality: every action exists in both
# environments and does the same thing — only the URL and secret change.
# Putting env in the command path (rather than a --local flag) makes the
# target explicit at the call site and prevents the "oh I meant local"
# mistake on state-mutating ops.
#
# Implementation pattern:
#   - One shared `_impl_<action>()` carries the logic (curl + display +
#     status classification).
#   - Per-env wrappers (`prod_<sub>_<action>`, `local_<sub>_<action>`)
#     load the right base URL + secret and delegate to `_impl_*`.
#   - Three router layers: env → subgroup → action. Each layer prints
#     "available: …" on bad input.
#
# Output (liway style):
#   - log()  cyan [fd] prefix at col 0       — announces action
#   - ok()   2-space indent + green ✓        — successful outcome
#   - warn() 2-space indent + yellow !       — non-fatal anomaly (stderr)
#   - err()  2-space indent + red ✗          — fatal failure (stderr)
#   - Hint lines under err / warn use 4-space indent (nest under msg text).
#   - Hint lines under log use 2-space indent (nest under [fd]).
#
# Exit codes:
#   0   on 2xx outcomes
#   64  on usage error (sysexits EX_USAGE)
#   1   on other failure
#
set -euo pipefail

# ── Globals ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Env-specific base URLs. Defaults match the deployed canonical surface;
# override via env var if you need to (e.g. preview deploys, remote dev).
FD_PROD_BASE_URL="${FD_PROD_BASE_URL:-https://frontdoor.barooah.io}"
FD_LOCAL_BASE_URL="${FD_LOCAL_BASE_URL:-http://localhost:3000}"

# Local server lifecycle state — kept in .cache/ (gitignored per CLAUDE.md).
CACHE_DIR="$SCRIPT_DIR/.cache"
DEV_PID_FILE="$CACHE_DIR/dev.pid"
DEV_LOG_FILE="$CACHE_DIR/dev.log"
DEV_PORT="3000"
DEV_READY_TIMEOUT="30"   # seconds to wait for server to respond after start
DEV_STOP_TIMEOUT="5"     # seconds to wait for graceful shutdown

# Auto-source .env.local relative to the script (not cwd) so fd.sh works from
# any subdir. Quiet on absence; per-action `require_*` helpers error specifically.
if [[ -f "$SCRIPT_DIR/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env.local"
  set +a
fi

# ── Colour tokens ──────────────────────────────────────────────────────────
# Disabled when stdout isn't a TTY (piped to file or another process) so logs
# stay clean. Override with FD_NO_COLOR=1 to force-disable.
if [[ -t 1 ]] && [[ -z "${FD_NO_COLOR:-}" ]]; then
  C_RESET=$'\033[0m'
  C_CYAN=$'\033[36m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'
  C_DIM=$'\033[2m'
  C_BOLD=$'\033[1m'
else
  C_RESET="" C_CYAN="" C_GREEN="" C_YELLOW="" C_RED="" C_DIM="" C_BOLD=""
fi

# ── Output helpers ─────────────────────────────────────────────────────────
log()  { printf "%s[fd]%s %s\n"   "$C_CYAN"   "$C_RESET" "$*"; }
ok()   { printf "  %s✓%s %s\n"    "$C_GREEN"  "$C_RESET" "$*"; }
warn() { printf "  %s!%s %s\n"    "$C_YELLOW" "$C_RESET" "$*" >&2; }
err()  { printf "  %s✗%s %s\n"    "$C_RED"    "$C_RESET" "$*" >&2; }
dim()  { printf "%s%s%s"          "$C_DIM"    "$*"       "$C_RESET"; }

# ── Help renderer ──────────────────────────────────────────────────────────
# Two-level layout: env section (bold name + dim context) → action rows
# (cyan command + description). Subgroup is part of the command string
# (`cache refresh`, `server start`), not a separate header — keeps the
# help dense without losing path-discoverability.
_section() { printf "  %s%s%s  %s%s%s\n" "$C_BOLD" "$1" "$C_RESET" "$C_DIM" "$2" "$C_RESET"; }
_action()  { printf "    %s%-32s%s%s\n"  "$C_CYAN" "$1" "$C_RESET" "$2"; }

# show_help_prod / show_help_local print one env section each (no overall
# header). Used by both the top-level show_help (which wraps them in the
# `fd CLI — ...` banner) AND by per-env dispatchers handling the `help`
# action (./fd.sh prod help, ./fd.sh local help).
show_help_prod() {
  _section "Production" "($FD_PROD_BASE_URL · cache refresh runs daily 03:00 UTC)"
  _action "user signup <email>"       "Email yourself a signup link"
  _action "cache refresh"             "Warm data + revalidate pages (= /api/refresh)"
  _action "cache revalidate [userId]" "Revalidate page ISR only"
}

show_help_local() {
  _section "Local" "($FD_LOCAL_BASE_URL · no schedule)"
  _action "server start"              "Start \`pnpm dev\` (background, PID tracked)"
  _action "server stop"               "Stop gracefully (SIGTERM)"
  _action "server restart"            "Stop + start"
  _action "server kill"               "Force-kill (SIGKILL + clear port)"
  _action "server status"             "PID, uptime, URL, log path"
  _action "server logs"               "tail -f the dev log"
  _action "user signup <email>"       "Email yourself a signup link (against dev)"
  _action "cache refresh"             "Warm data + revalidate pages (against dev)"
  _action "cache revalidate [userId]" "Revalidate page ISR only (against dev)"
}

show_help() {
  echo ""
  echo -e "  ${C_BOLD}fd CLI${C_RESET}  —  ./fd.sh ${C_CYAN}<env>${C_RESET} ${C_CYAN}<subgroup>${C_RESET} <action> [args]"
  echo ""
  show_help_prod
  echo ""
  show_help_local
  echo ""
}

# ── Validation / preflight ─────────────────────────────────────────────────
have() { command -v "$1" >/dev/null 2>&1; }

# Pretty-prints stdin JSON via jq if present; otherwise raw passthrough.
# Returns 0 even on non-JSON so a malformed body doesn't kill the script.
pretty_json() {
  if have jq; then
    jq . 2>/dev/null || cat
  else
    cat
  fi
}

looks_like_email() {
  [[ "$1" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]
}

require_curl() {
  if ! have curl; then
    err "curl is required but not on PATH"
    exit 1
  fi
}

require_prod_secret() {
  if [[ -z "${PROD_CRON_SECRET:-}" ]]; then
    err "PROD_CRON_SECRET is not set."
    cat >&2 <<EOF

Prod cache actions need it to authenticate against /api/refresh and
/api/revalidate. To set up:

  1. Generate a fresh secret:    openssl rand -hex 32
  2. Set as the Vercel Production CRON_SECRET:
       vercel env rm CRON_SECRET production --yes
       printf "%s" "<secret>" | vercel env add CRON_SECRET production
  3. Save the same value in .env.local as PROD_CRON_SECRET=<secret>
  4. Trigger a redeploy so Vercel runtime picks up the new value:
       git commit --allow-empty -m "redeploy"; git push

If you've already done 1-3, verify PROD_CRON_SECRET is present in
$SCRIPT_DIR/.env.local and that the file is being sourced.
EOF
    exit 1
  fi
}

require_local_cron_secret() {
  if [[ -z "${CRON_SECRET:-}" ]]; then
    err "CRON_SECRET is not set in .env.local."
    cat >&2 <<EOF

Local cache actions need the local CRON_SECRET (the one your dev
server loads). Generate with: openssl rand -hex 32
Add to .env.local as:        CRON_SECRET=<value>

This is the LOCAL secret — different from PROD_CRON_SECRET.
Restart \`pnpm dev\` so the dev server picks up the new value.
EOF
    exit 1
  fi
}

# ── Dev-server lifecycle helpers ───────────────────────────────────────────

_ensure_cache_dir() { mkdir -p "$CACHE_DIR"; }

# Echo the live PID and return 0 if a tracked dev server is running.
# Return 1 (with no output) if no PID file, file is garbage, or process dead.
_dev_pid() {
  [[ -f "$DEV_PID_FILE" ]] || return 1
  local pid
  pid=$(cat "$DEV_PID_FILE" 2>/dev/null)
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  echo "$pid"
}

_port_in_use() {
  lsof -nP -iTCP:"$DEV_PORT" -sTCP:LISTEN >/dev/null 2>&1
}

# True if $1 is $2 or a descendant of $2 (walks the parent chain up to 10
# levels). Used so `next-server` workers spawned by our tracked `pnpm dev`
# don't get flagged as rogue processes by `_rogue_pids_on_port`.
_is_descendant_of() {
  local pid="$1" ancestor="$2" current="$1" depth=0
  while [[ -n "$current" ]] && (( depth < 10 )); do
    [[ "$current" == "$ancestor" ]] && return 0
    current=$(ps -p "$current" -o ppid= 2>/dev/null | tr -d ' ')
    [[ -z "$current" || "$current" == "0" || "$current" == "1" ]] && return 1
    ((depth++))
  done
  return 1
}

# Recursively echo descendant PIDs of $1 (children, grandchildren, ...).
# Used by stop/kill to clean up the whole process tree — pnpm dev spawns a
# next-server worker that survives SIGTERM to the parent if not also killed.
_descendant_pids() {
  local parent="$1" child
  for child in $(pgrep -P "$parent" 2>/dev/null); do
    echo "$child"
    _descendant_pids "$child"
  done
}

# Print PIDs holding $DEV_PORT that are NOT our tracked dev server (or any
# of its descendants). Useful to detect a Vercel CLI, a leftover dev server
# from another checkout, or a port-binding misconfiguration.
_rogue_pids_on_port() {
  local tracked
  tracked=$(_dev_pid 2>/dev/null || true)
  local all_pids
  all_pids=$(lsof -nP -iTCP:"$DEV_PORT" -sTCP:LISTEN -t 2>/dev/null || true)
  local pid
  for pid in $all_pids; do
    if [[ -n "$tracked" ]] && _is_descendant_of "$pid" "$tracked"; then
      continue  # ours (or a child of ours) — not rogue
    fi
    echo "$pid"
  done
}

# Issue a POST with a bearer token; print → / status / pretty body. Sets the
# global LAST_HTTP_CODE so the caller can classify (stdout is the display
# channel, so we can't return-via-stdout).
LAST_HTTP_CODE=""
post_with_bearer() {
  local url="$1" bearer="$2" secret_name="${3:-bearer}"
  log "POST $url"
  echo "  $(dim "bearer: <$secret_name>")"
  echo

  local tmp
  tmp=$(mktemp)
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" EXIT

  LAST_HTTP_CODE=$(curl -sS --max-time 120 -o "$tmp" -w "%{http_code}" \
    -X POST "$url" \
    -H "Authorization: Bearer $bearer") || {
      err "curl failed (network error or timeout)"
      exit 1
    }

  echo "$(dim "← HTTP $LAST_HTTP_CODE")"
  [[ -s "$tmp" ]] && pretty_json < "$tmp"
  echo
}

# ── Shared action implementations ──────────────────────────────────────────
# Each `_impl_*` carries the logic; per-env wrappers below set the right URL
# + secret + display label and delegate here.

# _impl_user_signup <base_url> <email>
_impl_user_signup() {
  local base_url="$1" email="$2"
  if [[ -z "$email" ]]; then
    err "missing email"
    echo "    usage: ./fd.sh {prod|local} user signup <email>" >&2
    exit 64
  fi
  if ! looks_like_email "$email"; then
    err "'$email' doesn't look like a valid email"
    exit 64
  fi

  local url="${base_url%/}/api/keys"
  local body="{\"email\":\"$email\"}"

  log "POST $url"
  echo "  $(dim "body: $body")"
  echo

  local tmp
  tmp=$(mktemp)
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" EXIT

  local code
  code=$(curl -sS -o "$tmp" -w "%{http_code}" \
    -X POST "$url" \
    -H 'content-type: application/json' \
    --data "$body") || {
      err "curl failed (network error?)"
      echo "    Is the target server up? Tried: $base_url" >&2
      exit 1
    }

  echo "$(dim "← HTTP $code")"
  [[ -s "$tmp" ]] && pretty_json < "$tmp"
  echo

  case "$code" in
    202) ok "Accepted. Check $email (inbox + spam) for a signup link." ;;
    400) err "Bad request — email rejected or body malformed."
         echo "    Server is the source of truth on email validity; check the body above." >&2
         exit 1 ;;
    429) err "Rate-limited."
         echo "    Try again in a minute." >&2
         exit 1 ;;
    000) err "Could not reach $base_url — is the server up?"
         exit 1 ;;
    *)   err "Unexpected response $code."
         exit 1 ;;
  esac
}

# _impl_cache_refresh <base_url> <secret> <secret_name> <env_label>
_impl_cache_refresh() {
  local base_url="$1" secret="$2" secret_name="$3" env_label="$4"
  log "Refreshing $env_label cache (POST /api/refresh)"
  # The schedule note is only true for prod — local has no Vercel Cron;
  # every `local cache refresh` is a manual invocation.
  if [[ "$env_label" == "prod" ]]; then
    echo "  $(dim "(this is what Vercel Cron fires daily at 03:00 UTC)")"
  fi
  echo

  post_with_bearer "${base_url%/}/api/refresh" "$secret" "$secret_name"

  case "$LAST_HTTP_CODE" in
    200) ok "Cache refresh accepted." ;;
    401) err "Unauthorized — $secret_name doesn't match $env_label runtime value."
         if [[ "$env_label" == "prod" ]]; then
           echo "    (rotation in-flight? wait for the deploy to be Ready and retry)" >&2
         else
           echo "    (dev server may have loaded an older CRON_SECRET — restart \`pnpm dev\`)" >&2
         fi
         exit 1 ;;
    *)   err "Unexpected response $LAST_HTTP_CODE."
         exit 1 ;;
  esac
}

# _impl_cache_revalidate <base_url> <secret> <secret_name> <env_label> [user_id]
_impl_cache_revalidate() {
  local base_url="$1" secret="$2" secret_name="$3" env_label="$4"
  local user_id="${5:-}"
  local url="${base_url%/}/api/revalidate"
  if [[ -n "$user_id" ]]; then
    url="$url?userId=$user_id"
    log "Revalidating one user on $env_label: $user_id"
  else
    log "Revalidating all users' /fd/<slug> pages on $env_label"
  fi
  echo

  post_with_bearer "$url" "$secret" "$secret_name"

  case "$LAST_HTTP_CODE" in
    200) ok "Revalidation request accepted." ;;
    401) err "Unauthorized — $secret_name doesn't match $env_label runtime value."
         exit 1 ;;
    *)   err "Unexpected response $LAST_HTTP_CODE."
         exit 1 ;;
  esac
}

# ── Per-env wrappers (thin) ────────────────────────────────────────────────

prod_user_signup()        { require_curl; _impl_user_signup "$FD_PROD_BASE_URL" "${1:-}"; }
prod_cache_refresh()          { require_curl; require_prod_secret; _impl_cache_refresh "$FD_PROD_BASE_URL" "$PROD_CRON_SECRET" "PROD_CRON_SECRET" "prod"; }
prod_cache_revalidate()  { require_curl; require_prod_secret; _impl_cache_revalidate "$FD_PROD_BASE_URL" "$PROD_CRON_SECRET" "PROD_CRON_SECRET" "prod" "${1:-}"; }

local_user_signup()       { require_curl; _impl_user_signup "$FD_LOCAL_BASE_URL" "${1:-}"; }
local_cache_refresh()         { require_curl; require_local_cron_secret; _impl_cache_refresh "$FD_LOCAL_BASE_URL" "$CRON_SECRET" "CRON_SECRET" "local"; }
local_cache_revalidate() { require_curl; require_local_cron_secret; _impl_cache_revalidate "$FD_LOCAL_BASE_URL" "$CRON_SECRET" "CRON_SECRET" "local" "${1:-}"; }

# ── Local server lifecycle actions (local-only; prod is Vercel) ────────────

# local server start
#   Spawn `pnpm dev` in the background, track its PID, redirect output to
#   .cache/dev.log, and poll the port until it responds (up to
#   DEV_READY_TIMEOUT seconds). Refuses to start if a tracked server is
#   already running OR if the port is held by an untracked process.
local_server_start() {
  _ensure_cache_dir
  local pid
  if pid=$(_dev_pid); then
    warn "Dev server already running (PID $pid)"
    echo "    URL: $FD_LOCAL_BASE_URL" >&2
    echo "    log: $DEV_LOG_FILE" >&2
    return 0
  fi
  if _port_in_use; then
    err "Port $DEV_PORT is held by something not tracked by fd:"
    lsof -nP -iTCP:"$DEV_PORT" -sTCP:LISTEN 2>&1 | tail -n +1 | head -3 | sed 's/^/    /' >&2
    echo "    Kill it manually, or: ./fd.sh local server kill" >&2
    exit 1
  fi

  log "Starting dev server on port $DEV_PORT"
  echo "  $(dim "log → $DEV_LOG_FILE")"
  # Background pnpm dev with full output capture. nohup so it survives our
  # shell exit; redirect both streams so the log captures Next's startup.
  ( cd "$SCRIPT_DIR" && nohup pnpm dev >"$DEV_LOG_FILE" 2>&1 & echo $! >"$DEV_PID_FILE" )

  local pid_started
  pid_started=$(cat "$DEV_PID_FILE")
  local i
  for ((i=1; i<=DEV_READY_TIMEOUT; i++)); do
    if ! kill -0 "$pid_started" 2>/dev/null; then
      err "Dev server PID $pid_started died during startup"
      echo "    Check the log: $DEV_LOG_FILE" >&2
      rm -f "$DEV_PID_FILE"
      exit 1
    fi
    if curl -sS -o /dev/null --max-time 1 "http://localhost:$DEV_PORT/" 2>/dev/null; then
      ok "Dev server ready: $FD_LOCAL_BASE_URL (PID $pid_started, took ${i}s)"
      return 0
    fi
    sleep 1
  done
  err "Dev server started (PID $pid_started) but didn't respond within ${DEV_READY_TIMEOUT}s"
  echo "    Check the log: $DEV_LOG_FILE" >&2
  echo "    Force-kill:    ./fd.sh local server kill" >&2
  exit 1
}

# local server stop
#   SIGTERM the tracked PID and all its descendants (collected BEFORE
#   killing the parent — once parent dies the kids are orphaned and we
#   can't enumerate them via pgrep -P anymore). Wait DEV_STOP_TIMEOUT for
#   graceful exit; clean up the PID file. Falls through with guidance to
#   `kill` if anything doesn't exit gracefully.
local_server_stop() {
  local pid
  if ! pid=$(_dev_pid); then
    log "Dev server is not running"
    [[ -f "$DEV_PID_FILE" ]] && rm -f "$DEV_PID_FILE"
    return 0
  fi
  # Collect descendants FIRST — if we kill parent first, kids are orphaned
  # to PID 1 and we can no longer enumerate them via pgrep -P <parent>.
  local descendants
  descendants=$(_descendant_pids "$pid" | tr '\n' ' ')
  log "Stopping dev server (PID $pid + descendants: ${descendants:-none}, SIGTERM)"
  local p
  for p in $pid $descendants; do
    kill "$p" 2>/dev/null || true
  done

  local i
  for ((i=1; i<=DEV_STOP_TIMEOUT; i++)); do
    local any_alive=0
    for p in $pid $descendants; do
      kill -0 "$p" 2>/dev/null && { any_alive=1; break; }
    done
    if (( any_alive == 0 )); then
      ok "Dev server stopped"
      rm -f "$DEV_PID_FILE"
      return 0
    fi
    sleep 1
  done
  warn "Dev server didn't stop within ${DEV_STOP_TIMEOUT}s"
  echo "    Force-kill: ./fd.sh local server kill" >&2
  exit 1
}

# local server kill
#   SIGKILL the tracked PID + all descendants immediately. Also opportunistic:
#   if anything still holds $DEV_PORT after that (rogue / orphaned from a
#   previous bad stop), SIGKILL those too. The goal of `kill` is "make it
#   stop, now" — be aggressive.
local_server_kill() {
  local pid descendants
  if pid=$(_dev_pid); then
    descendants=$(_descendant_pids "$pid" | tr '\n' ' ')
    log "Force-killing dev server (PID $pid + descendants: ${descendants:-none}, SIGKILL)"
    local p
    for p in $pid $descendants; do
      kill -9 "$p" 2>/dev/null || true
    done
    sleep 1
    ok "Dev server killed"
  else
    log "No tracked dev server"
  fi
  rm -f "$DEV_PID_FILE"

  # Mop up anything still on the port (orphans from a previous bad stop,
  # or processes started outside fd.sh).
  local rogue
  rogue=$(_rogue_pids_on_port)
  if [[ -n "$rogue" ]]; then
    local rogue_pids
    rogue_pids=$(echo "$rogue" | tr '\n' ' ')
    warn "Killing untracked process(es) on port $DEV_PORT: $rogue_pids"
    for p in $rogue; do
      kill -9 "$p" 2>/dev/null || true
    done
    sleep 1
    if _port_in_use; then
      err "Port $DEV_PORT is still in use after kill"
      lsof -nP -iTCP:"$DEV_PORT" -sTCP:LISTEN 2>&1 | head -3 | sed 's/^/    /' >&2
      exit 1
    fi
    ok "Port $DEV_PORT cleared"
  fi
}

# local server restart
#   stop + start. Wraps both; if stop fails (process won't exit), surface
#   that and bail rather than fighting through.
local_server_restart() {
  local_server_stop
  sleep 1
  local_server_start
}

# local server status
#   Multi-fact summary: PID, uptime, port state, log path, plus a warning
#   about any rogue process holding the port without our tracking.
local_server_status() {
  local pid
  if pid=$(_dev_pid); then
    log "Dev server: running"
    local etime
    etime=$(ps -p "$pid" -o etime= 2>/dev/null | tr -d ' ')
    echo "    PID:    $pid"
    [[ -n "$etime" ]] && echo "    uptime: $etime"
    echo "    URL:    $FD_LOCAL_BASE_URL"
    echo "    log:    $DEV_LOG_FILE"
  else
    log "Dev server: not running"
    if [[ -f "$DEV_PID_FILE" ]]; then
      warn "Found stale PID file at $DEV_PID_FILE — cleaning up"
      rm -f "$DEV_PID_FILE"
    fi
  fi

  # Always check for rogue listeners on port — useful even when our tracked
  # state is empty (someone started dev outside fd.sh).
  local rogue
  rogue=$(_rogue_pids_on_port)
  if [[ -n "$rogue" ]]; then
    warn "Port $DEV_PORT is also held by untracked process(es): $(echo "$rogue" | tr '\n' ' ')"
    echo "    Inspect: lsof -nP -iTCP:$DEV_PORT -sTCP:LISTEN" >&2
  fi
}

# local server logs
#   tail -f on the dev log. Errors clearly if the log doesn't exist (no
#   server has ever started under fd.sh).
local_server_logs() {
  if [[ ! -f "$DEV_LOG_FILE" ]]; then
    err "No log file at $DEV_LOG_FILE"
    echo "    Start the server first: ./fd.sh local server start" >&2
    exit 1
  fi
  log "Tailing $DEV_LOG_FILE ($(dim "Ctrl-C to stop"))"
  echo
  tail -f "$DEV_LOG_FILE"
}

# ── Sub-dispatchers (subgroup → action) ────────────────────────────────────
# One per (env, subgroup) — list available actions on bad input.

# _subgroup_help <env+subgroup label> <action> <description> [more action/desc pairs...]
# Print the focused "./fd.sh prod user help" / "./fd.sh local server help"
# style help — a small section header + the action list. Used by
# sub-dispatchers below.
_subgroup_help() {
  local label="$1"; shift
  echo ""
  echo -e "  ${C_BOLD}${label}${C_RESET}"
  while [[ $# -ge 2 ]]; do
    _action "$1" "$2"
    shift 2
  done
  echo ""
}

prod_user_dispatch() {
  local action="${1:-}"
  if [[ -z "$action" ]]; then
    err "prod user: missing action"
    echo "    available: signup, help" >&2
    exit 64
  fi
  shift
  case "$action" in
    signup) prod_user_signup "$@" ;;
    help)   _subgroup_help "prod user" \
              "signup <email>" "Email yourself a signup link" ;;
    *) err "unknown prod user action: $action"
       echo "    available: signup, help" >&2
       exit 64 ;;
  esac
}

prod_cache_dispatch() {
  local action="${1:-}"
  if [[ -z "$action" ]]; then
    err "prod cache: missing action"
    echo "    available: refresh, revalidate, help" >&2
    exit 64
  fi
  shift
  case "$action" in
    refresh)      prod_cache_refresh "$@" ;;
    revalidate)   prod_cache_revalidate "$@" ;;
    help)         _subgroup_help "prod cache" \
                    "refresh"             "Warm data + revalidate pages (= /api/refresh)" \
                    "revalidate [userId]" "Revalidate page ISR only" ;;
    *) err "unknown prod cache action: $action"
       echo "    available: refresh, revalidate, help" >&2
       exit 64 ;;
  esac
}

local_user_dispatch() {
  local action="${1:-}"
  if [[ -z "$action" ]]; then
    err "local user: missing action"
    echo "    available: signup, help" >&2
    exit 64
  fi
  shift
  case "$action" in
    signup) local_user_signup "$@" ;;
    help)   _subgroup_help "local user" \
              "signup <email>" "Email yourself a signup link (against dev)" ;;
    *) err "unknown local user action: $action"
       echo "    available: signup, help" >&2
       exit 64 ;;
  esac
}

local_cache_dispatch() {
  local action="${1:-}"
  if [[ -z "$action" ]]; then
    err "local cache: missing action"
    echo "    available: refresh, revalidate, help" >&2
    exit 64
  fi
  shift
  case "$action" in
    refresh)      local_cache_refresh "$@" ;;
    revalidate)   local_cache_revalidate "$@" ;;
    help)         _subgroup_help "local cache" \
                    "refresh"             "Warm data + revalidate pages (against dev)" \
                    "revalidate [userId]" "Revalidate page ISR only (against dev)" ;;
    *) err "unknown local cache action: $action"
       echo "    available: refresh, revalidate, help" >&2
       exit 64 ;;
  esac
}

local_server_dispatch() {
  local action="${1:-}"
  if [[ -z "$action" ]]; then
    err "local server: missing action"
    echo "    available: start, stop, restart, kill, status, logs, help" >&2
    exit 64
  fi
  shift
  case "$action" in
    start)   local_server_start "$@" ;;
    stop)    local_server_stop "$@" ;;
    restart) local_server_restart "$@" ;;
    kill)    local_server_kill "$@" ;;
    status)  local_server_status "$@" ;;
    logs)    local_server_logs "$@" ;;
    help)    _subgroup_help "local server" \
               "start"   "Start \`pnpm dev\` (background, PID tracked)" \
               "stop"    "Stop gracefully (SIGTERM)" \
               "restart" "Stop + start" \
               "kill"    "Force-kill (SIGKILL + clear port)" \
               "status"  "PID, uptime, URL, log path" \
               "logs"    "tail -f the dev log" ;;
    *) err "unknown local server action: $action"
       echo "    available: start, stop, restart, kill, status, logs, help" >&2
       exit 64 ;;
  esac
}

# ── Env dispatchers (env → subgroup) ───────────────────────────────────────

prod_dispatch() {
  local sub="${1:-}"
  if [[ -z "$sub" ]]; then
    err "prod: missing subgroup"
    echo "    available: user, cache, help" >&2
    exit 64
  fi
  shift
  case "$sub" in
    user)  prod_user_dispatch "$@" ;;
    cache) prod_cache_dispatch "$@" ;;
    help)  echo ""; show_help_prod; echo "" ;;
    *) err "unknown prod subgroup: $sub"
       echo "    available: user, cache, help" >&2
       exit 64 ;;
  esac
}

local_dispatch() {
  local sub="${1:-}"
  if [[ -z "$sub" ]]; then
    err "local: missing subgroup"
    echo "    available: server, user, cache, help" >&2
    exit 64
  fi
  shift
  case "$sub" in
    server) local_server_dispatch "$@" ;;
    user)   local_user_dispatch "$@" ;;
    cache)  local_cache_dispatch "$@" ;;
    help)   echo ""; show_help_local; echo "" ;;
    *) err "unknown local subgroup: $sub"
       echo "    available: server, user, cache, help" >&2
       exit 64 ;;
  esac
}

# ── Global option parsing ──────────────────────────────────────────────────
# Only --help; env is now in the command path (`prod` / `local`).
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help|help) show_help; exit 0 ;;
    --) shift; break ;;
    -*) err "unknown option: $1"
        echo "    run ./fd.sh --help for the command surface" >&2
        exit 64 ;;
    *)  break ;;
  esac
done

# ── Main router (env-level dispatch) ───────────────────────────────────────
env="${1:-}"
if [[ -z "$env" ]]; then
  show_help
  exit 64
fi
shift

case "$env" in
  prod)  prod_dispatch "$@" ;;
  local) local_dispatch "$@" ;;
  *) err "unknown env: $env"
     echo "    available: prod, local" >&2
     echo "    run ./fd.sh --help for the full surface" >&2
     exit 64 ;;
esac
