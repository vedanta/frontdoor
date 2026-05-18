#!/usr/bin/env bash
#
# fd.sh — frontdoor ops CLI
#
# Top-level layout (#89 moved `user` to its own section):
#
#   ./fd.sh <env> <subgroup> <action> [args]    (prod / local)
#   ./fd.sh user <action> [args]                (prod-implicit)
#
#     env       prod | local            (cache + server live under each env)
#     subgroup  cache | server          (feature area)
#                 - `cache`  cache-warming + ISR invalidation; auth via
#                            CRON_SECRET (PROD_CRON_SECRET for prod env)
#                 - `server` dev-server lifecycle — LOCAL ONLY (prod is
#                            managed by Vercel, not by this CLI)
#
#     user      a top-level section, NOT under prod/local — user-lifecycle
#               operations only ever target prod (local uses the seeded
#               static user). The env-prefix would be empty information.
#               Actions: signup / get / update / delete / list / help
#               Auth: looks up apiKey via KV REST, sends Bearer header.
#
# The env split mirrors operational reality: every env action exists in both
# environments and does the same thing — only the URL and secret change.
# Putting env in the command path (rather than a --local flag) makes the
# target explicit at the call site and prevents the "oh I meant local"
# mistake on state-mutating ops.
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
  _action "status"                    "Health check — GET / + report code/time"
  _action "cache refresh"             "Warm data + revalidate pages (= /api/refresh)"
  _action "cache revalidate [userId]" "Revalidate page ISR only"
  _action "cache purge <source>..."   "DEL today's cache keys for sources (or --all)"
}

show_help_local() {
  _section "Local" "($FD_LOCAL_BASE_URL · no schedule)"
  _action "status"                    "Health check — GET / + report code/time"
  _action "server start"              "Start \`pnpm dev\` (background, PID tracked)"
  _action "server stop"               "Stop gracefully (SIGTERM)"
  _action "server restart"            "Stop + start"
  _action "server kill"               "Force-kill (SIGKILL + clear port)"
  _action "server status"             "PID, uptime, URL, log path"
  _action "server logs"               "tail -f the dev log"
  _action "cache refresh"             "Warm data + revalidate pages (against dev)"
  _action "cache revalidate [userId]" "Revalidate page ISR only (against dev)"
  _action "cache purge <source>..."   "DEL today's cache keys (against prod KV)"
}

show_help_user() {
  _section "User management" "(prod-only · auth via Bearer apiKey looked up from KV)"
  _action "user signup <email>"   "Email a signup link (POST /api/keys)"
  _action "user get <email>"      "Fetch the user record (GET /api/user)"
  _action "user update <email>"   "Update name/timezone (PUT /api/user) — flags below"
  _action "user delete <email>"   "Delete + wipe KV (DELETE /api/user) — needs --confirm"
  _action "user list"             "Enumerate all users (SMEMBERS users)"
}

show_help_inspection() {
  _section "Inspection" "(prod KV + NASA API · read-only diagnostics)"
  _action "apod"                  "Ping NASA APOD — verify key + see today's image"
  _action "kv keys [prefix]"      "List KV keys (default: all; e.g. \`kv keys user:\`)"
  _action "kv get <key>"          "Print KV value (pretty-printed if JSON)"
}

show_help() {
  echo ""
  echo -e "  ${C_BOLD}fd CLI${C_RESET}  —  ./fd.sh ${C_CYAN}<env|user|kv|apod>${C_RESET} ${C_CYAN}<subgroup>${C_RESET} <action> [args]"
  echo ""
  show_help_prod
  echo ""
  show_help_local
  echo ""
  show_help_user
  echo ""
  show_help_inspection
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

# Required by all `./fd.sh user *` actions: the prod Upstash KV REST credentials
# (used to look up apiKey from email so we can Bearer-authenticate against
# /api/user, plus for `user list` SMEMBERS). Same vars the prod app reads.
require_prod_kv_creds() {
  if [[ -z "${KV_REST_API_URL:-}" || -z "${KV_REST_API_TOKEN:-}" ]]; then
    err "KV_REST_API_URL or KV_REST_API_TOKEN missing from .env.local."
    cat >&2 <<EOF

User-management actions need direct KV access (to resolve email → apiKey
before Bearer-authenticating against /api/user). Pull from Vercel:

  vercel env pull .env.local --environment=production --yes

Or set manually:
  KV_REST_API_URL=https://<your-upstash>.upstash.io
  KV_REST_API_TOKEN=<your-token>
EOF
    exit 1
  fi
}

require_jq() {
  if ! have jq; then
    err "jq is required for KV-backed actions (JSON parsing)."
    echo "    Install with: brew install jq" >&2
    exit 1
  fi
}

# Required by `./fd.sh apod` — direct NASA APOD ping for key verification.
require_nasa_api_key() {
  if [[ -z "${NASA_API_KEY:-}" ]]; then
    err "NASA_API_KEY is not set in .env.local."
    cat >&2 <<EOF

Sign up at https://api.nasa.gov/ — it's free, instant, and the key arrives
in your inbox. Add to .env.local as:
  NASA_API_KEY=<your-key>

(DEMO_KEY also works but is rate-limited globally; the dashboard uses
it as a fallback. Sign up for your own to avoid the shared cap.)
EOF
    exit 1
  fi
}

# ── KV REST helpers (Upstash) ──────────────────────────────────────────────
# Simple GET-by-key against the prod Upstash REST API. The TypeScript client
# stores objects as JSON strings; this returns that raw string for the caller
# to parse. Empty string on miss (consistent with the existing get → null
# semantics in the codebase).
kv_get() {
  local key="$1"
  local response
  response=$(curl -sS --max-time 10 \
    -H "Authorization: Bearer $KV_REST_API_TOKEN" \
    "$KV_REST_API_URL/get/$key") || return 1
  echo "$response" | jq -r '.result // empty'
}

# SMEMBERS — returns each set member on its own line (or empty for missing/empty).
kv_smembers() {
  local set_key="$1"
  curl -sS --max-time 10 \
    -H "Authorization: Bearer $KV_REST_API_TOKEN" \
    "$KV_REST_API_URL/smembers/$set_key" | jq -r '.result[]? // empty'
}

# KEYS — list keys matching a pattern. Pattern is a Redis glob (e.g. `*:2026-05-18`).
# Returns each matching key on its own line. Note: Redis KEYS is O(N); fine at
# our scale (low hundreds of keys total) but use SCAN if this grows.
kv_keys() {
  local pattern="${1:-*}"
  # Upstash REST: /keys/{pattern}. URL-encode the pattern minimally (the only
  # likely problematic char is `*` which is safe in URLs).
  curl -sS --max-time 10 \
    -H "Authorization: Bearer $KV_REST_API_TOKEN" \
    "$KV_REST_API_URL/keys/$pattern" | jq -r '.result[]? // empty'
}

# DEL — delete a single key. Returns the count actually removed (0 if missing).
kv_del() {
  local key="$1"
  curl -sS --max-time 10 \
    -H "Authorization: Bearer $KV_REST_API_TOKEN" \
    "$KV_REST_API_URL/del/$key" | jq -r '.result // 0'
}

# Resolve a user's apiKey by their email. Two KV reads (`email:{email}` →
# userId, then `user:{userId}` → record).  Echoes the apiKey on stdout; exits
# with a clear error on miss or corruption.
_resolve_apikey_for_email() {
  local email="$1"
  local email_lc
  email_lc=$(echo "$email" | tr '[:upper:]' '[:lower:]')

  local user_id
  user_id=$(kv_get "email:$email_lc")
  if [[ -z "$user_id" ]]; then
    err "no user found for email: $email"
    echo "    (signup first: ./fd.sh user signup $email)" >&2
    exit 1
  fi

  local user_json
  user_json=$(kv_get "user:$user_id")
  if [[ -z "$user_json" ]]; then
    err "user record missing for $email (userId=$user_id) — KV inconsistency"
    exit 1
  fi

  local api_key
  # `fromjson?` parses if the result is a JSON string (Upstash's typical
  # storage form for objects); falls through to direct lookup if already
  # parsed.
  api_key=$(echo "$user_json" | jq -r 'if type == "string" then fromjson else . end | .apiKey // empty')
  if [[ -z "$api_key" ]]; then
    err "apiKey missing on user record for $email"
    exit 1
  fi
  echo "$api_key"
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

# Captures the response body too (for tests / chaining). Stores body in
# global LAST_RESPONSE_BODY alongside LAST_HTTP_CODE. Quieter than
# post_with_bearer — caller is responsible for any pretty-printing.
LAST_RESPONSE_BODY=""
_request_with_bearer() {
  local method="$1" url="$2" bearer="$3"
  local body="${4:-}"
  local tmp
  tmp=$(mktemp)
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" EXIT

  if [[ -n "$body" ]]; then
    LAST_HTTP_CODE=$(curl -sS --max-time 30 -o "$tmp" -w "%{http_code}" \
      -X "$method" "$url" \
      -H "Authorization: Bearer $bearer" \
      -H 'content-type: application/json' \
      --data "$body") || {
        err "curl failed (network error or timeout)"
        exit 1
      }
  else
    LAST_HTTP_CODE=$(curl -sS --max-time 30 -o "$tmp" -w "%{http_code}" \
      -X "$method" "$url" \
      -H "Authorization: Bearer $bearer") || {
        err "curl failed (network error or timeout)"
        exit 1
      }
  fi
  LAST_RESPONSE_BODY=$(cat "$tmp")
}

# ── Shared action implementations ──────────────────────────────────────────
# Each `_impl_*` carries the logic; per-env wrappers below set the right URL
# + secret + display label and delegate here.

# _impl_user_signup <base_url> <email>
_impl_user_signup() {
  local base_url="$1" email="$2"
  if [[ -z "$email" ]]; then
    err "missing email"
    echo "    usage: ./fd.sh user signup <email>" >&2
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

# ── v0.3 inspection + cache-debugging implementations (#58) ───────────────

# _impl_status <base_url> <env_label>
# Discovery action — quick "is this env up?" check. Times a request to the
# root path (which redirects to /fd/* logic via the proxy, or to GH Pages
# marketing for prod). Reports HTTP code, total time, target URL.
_impl_status() {
  local base_url="$1" env_label="$2"
  local url="${base_url%/}/"
  log "Checking $env_label health"
  echo "  $(dim "GET $url")"
  echo

  local out
  out=$(curl -sS --max-time 10 -o /dev/null \
    -w '%{http_code} %{time_total}\n' "$url" 2>&1) || {
      err "Could not reach $url"
      echo "    $(if [[ "$env_label" == "local" ]]; then echo "Dev server not running? ./fd.sh local server start"; else echo "Network or DNS issue? Try in a browser."; fi)" >&2
      exit 1
    }

  local code time
  code=$(echo "$out" | awk '{print $1}')
  time=$(echo "$out" | awk '{print $2}')
  # Format time as ms with 0 decimals (curl reports seconds with microsecond precision).
  local ms
  ms=$(awk "BEGIN { printf \"%d\", $time * 1000 }")

  case "$code" in
    2??)            ok  "$env_label up · HTTP $code · ${ms}ms" ;;
    3??)            ok  "$env_label up · HTTP $code · ${ms}ms (redirect — expected for prod marketing rewrite)" ;;
    4??|5??)        err "$env_label responded HTTP $code in ${ms}ms (unexpected)" ; exit 1 ;;
    000)            err "No response from $url" ; exit 1 ;;
    *)              err "Unexpected response $code" ; exit 1 ;;
  esac
}

# _impl_apod — direct NASA APOD ping to verify the key + see today's image.
# Reports title/date/media_type/url plus the rate-limit-remaining header.
_impl_apod() {
  log "GET https://api.nasa.gov/planetary/apod"
  echo "  $(dim "key: <NASA_API_KEY>")"
  echo

  local tmp_body tmp_headers
  tmp_body=$(mktemp); tmp_headers=$(mktemp)
  # shellcheck disable=SC2064
  trap "rm -f '$tmp_body' '$tmp_headers'" EXIT

  local code
  code=$(curl -sS --max-time 15 -o "$tmp_body" -D "$tmp_headers" -w "%{http_code}" \
    "https://api.nasa.gov/planetary/apod?api_key=$NASA_API_KEY") || {
      err "curl failed (network error or timeout)"
      exit 1
    }

  echo "$(dim "← HTTP $code")"

  case "$code" in
    200)
      # Pretty-print key fields then dump rate-limit headers.
      jq -r '"  title       : \(.title)
  date        : \(.date)
  media_type  : \(.media_type)
  url         : \(.url)"' < "$tmp_body" 2>/dev/null || pretty_json < "$tmp_body"
      echo
      local remaining limit
      remaining=$(grep -i '^x-ratelimit-remaining:' "$tmp_headers" | awk '{print $2}' | tr -d '\r')
      limit=$(grep -i '^x-ratelimit-limit:' "$tmp_headers" | awk '{print $2}' | tr -d '\r')
      if [[ -n "$remaining" || -n "$limit" ]]; then
        echo "  $(dim "rate-limit  : ${remaining:-?} / ${limit:-?} remaining")"
        echo
      fi
      ok "NASA APOD key is valid"
      ;;
    403) err "Forbidden — NASA_API_KEY likely invalid or rate-limited"
         pretty_json < "$tmp_body" ; exit 1 ;;
    429) err "Rate-limited by NASA" ; exit 1 ;;
    *)   err "Unexpected response $code"
         pretty_json < "$tmp_body" ; exit 1 ;;
  esac
}

# _impl_kv_keys [prefix]
_impl_kv_keys() {
  local prefix="${1:-}"
  local pattern="${prefix}*"
  log "Listing KV keys matching: $pattern"
  echo

  local keys count=0
  keys=$(kv_keys "$pattern")
  if [[ -z "$keys" ]]; then
    warn "No keys match $pattern"
    return 0
  fi
  # Print sorted for readable scanning.
  echo "$keys" | sort | while IFS= read -r k; do
    [[ -z "$k" ]] && continue
    echo "  $k"
    ((count++)) || true
  done
  count=$(echo "$keys" | grep -c .)
  echo
  ok "$count key(s)"
}

# _impl_kv_get <key>
_impl_kv_get() {
  local key="${1:-}"
  if [[ -z "$key" ]]; then
    err "missing key"
    echo "    usage: ./fd.sh kv get <key>" >&2
    exit 64
  fi
  log "GET kv: $key"
  echo

  local val
  val=$(kv_get "$key")
  if [[ -z "$val" ]]; then
    warn "no value (key missing or empty)"
    return 0
  fi

  # Try to parse + pretty-print as JSON (most stored values are JSON-encoded
  # objects via the Upstash TS client). Fall through to raw if not JSON.
  if echo "$val" | jq . >/dev/null 2>&1; then
    echo "$val" | jq .
  elif echo "$val" | jq 'fromjson' >/dev/null 2>&1; then
    # Value is a JSON-encoded string holding another JSON object — common
    # for our user/config records when stored via the TS client.
    echo "$val" | jq 'fromjson'
  else
    echo "  $val"
  fi
  echo
  ok "Got $key"
}

# _impl_cache_purge <base_url_unused> <date> <env_label> [source...] | --all
# Purges today's date-stamped cache keys so the next /api/refresh re-fetches
# upstream. The base_url is unused (this is a direct KV op) but kept for
# symmetry with other _impl_* signatures.
_impl_cache_purge() {
  local _base_url="$1"; shift  # unused; KV ops bypass the app
  local date="$1"; shift
  local env_label="$1"; shift

  if [[ $# -eq 0 ]]; then
    err "missing sources"
    cat >&2 <<EOF
    usage: ./fd.sh $env_label cache purge <source>...   (one or more)
           ./fd.sh $env_label cache purge --all          (every key dated $date)

    Known sources (single-segment keys): nasa-apod, bing-daily, wikimedia-potd,
                                         quote, poem, onthisday, wikipedia, word
    Parameterized keys (caught by --all): headlines:{hash}:$date, weather:{lat,lon}:$date
EOF
    exit 64
  fi

  local keys=()
  if [[ "$1" == "--all" ]]; then
    log "Purging ALL date-stamped cache keys for $date ($env_label)"
    echo "  $(dim "KV pattern: *:$date")"
    # Pull all keys matching *:{date}. This catches both single-segment
    # source keys (nasa-apod:DATE) and parameterized ones (headlines:HASH:DATE,
    # weather:LAT,LON:DATE).
    while IFS= read -r k; do
      [[ -n "$k" ]] && keys+=("$k")
    done < <(kv_keys "*:$date")
  else
    log "Purging cache keys for sources: $* ($env_label)"
    for source in "$@"; do
      keys+=("$source:$date")
    done
  fi

  if (( ${#keys[@]} == 0 )); then
    warn "No keys to purge"
    return 0
  fi

  echo
  local purged=0 missing=0
  for k in "${keys[@]}"; do
    local removed
    removed=$(kv_del "$k")
    if [[ "$removed" == "1" ]]; then
      echo "  $(dim "DEL")  $k"
      ((purged++)) || true
    else
      echo "  $(dim "—  ")  $k  $(dim "(missing)")"
      ((missing++)) || true
    fi
  done
  echo
  ok "$purged purged, $missing missing"
  if (( purged > 0 )); then
    echo "  $(dim "next cache refresh will re-fetch upstream for these.")"
  fi
}

# ── User management implementations (#89, prod-only) ──────────────────────
# All `_impl_user_*` actions hit prod and authenticate via Bearer apiKey
# (resolved from KV). They share the same "resolve email → apiKey → request"
# preamble, so each impl owns just its request + response handling.

# _impl_user_get <email>
_impl_user_get() {
  local email="${1:-}"
  if [[ -z "$email" ]]; then
    err "missing email"
    echo "    usage: ./fd.sh user get <email>" >&2
    exit 64
  fi
  if ! looks_like_email "$email"; then
    err "'$email' doesn't look like a valid email"
    exit 64
  fi

  local api_key
  api_key=$(_resolve_apikey_for_email "$email")

  log "GET ${FD_PROD_BASE_URL}/api/user"
  echo "  $(dim "as: $email")"
  echo

  _request_with_bearer "GET" "${FD_PROD_BASE_URL%/}/api/user" "$api_key"

  echo "$(dim "← HTTP $LAST_HTTP_CODE")"
  echo "$LAST_RESPONSE_BODY" | pretty_json
  echo

  case "$LAST_HTTP_CODE" in
    200) ok "Fetched user record for $email" ;;
    401) err "Unauthorized — apiKey rejected (KV inconsistency? rotate?)" ; exit 1 ;;
    404) err "User record missing server-side (KV inconsistency)" ; exit 1 ;;
    *)   err "Unexpected response $LAST_HTTP_CODE" ; exit 1 ;;
  esac
}

# _impl_user_update <email> [--name X] [--timezone Y]
_impl_user_update() {
  local email="${1:-}"
  if [[ -z "$email" ]]; then
    err "missing email"
    echo "    usage: ./fd.sh user update <email> [--name X] [--timezone Y]" >&2
    exit 64
  fi
  if ! looks_like_email "$email"; then
    err "'$email' doesn't look like a valid email"
    exit 64
  fi
  shift

  local new_name="" new_tz=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --name)     [[ -n "${2:-}" ]] || { err "--name requires a value"; exit 64; }
                  new_name="$2"; shift 2 ;;
      --timezone) [[ -n "${2:-}" ]] || { err "--timezone requires a value"; exit 64; }
                  new_tz="$2"; shift 2 ;;
      *) err "unknown flag: $1"
         echo "    usage: ./fd.sh user update <email> [--name X] [--timezone Y]" >&2
         exit 64 ;;
    esac
  done

  if [[ -z "$new_name" && -z "$new_tz" ]]; then
    err "specify at least one of --name or --timezone"
    exit 64
  fi

  # Build body manually (jq -n is required + slightly more verbose for this).
  local body parts=()
  [[ -n "$new_name" ]] && parts+=("\"name\":\"$new_name\"")
  [[ -n "$new_tz"   ]] && parts+=("\"timezone\":\"$new_tz\"")
  local IFS=,
  body="{${parts[*]}}"

  local api_key
  api_key=$(_resolve_apikey_for_email "$email")

  log "PUT ${FD_PROD_BASE_URL}/api/user"
  echo "  $(dim "as:   $email")"
  echo "  $(dim "body: $body")"
  echo

  _request_with_bearer "PUT" "${FD_PROD_BASE_URL%/}/api/user" "$api_key" "$body"

  echo "$(dim "← HTTP $LAST_HTTP_CODE")"
  echo "$LAST_RESPONSE_BODY" | pretty_json
  echo

  case "$LAST_HTTP_CODE" in
    200) ok "Updated user record for $email" ;;
    400) err "Validation rejected — see body above (strict Zod: name 1-80 chars, timezone 1-64)"
         exit 1 ;;
    401) err "Unauthorized — apiKey rejected" ; exit 1 ;;
    *)   err "Unexpected response $LAST_HTTP_CODE" ; exit 1 ;;
  esac
}

# _impl_user_delete <email> --confirm <email>
_impl_user_delete() {
  local email="${1:-}"
  if [[ -z "$email" ]]; then
    err "missing email"
    echo "    usage: ./fd.sh user delete <email> --confirm <email>" >&2
    exit 64
  fi
  if ! looks_like_email "$email"; then
    err "'$email' doesn't look like a valid email"
    exit 64
  fi
  shift

  # Require `--confirm <email>` matching the target — mirrors /api/user
  # DELETE's `confirmEmail` body requirement; same friction, same protection.
  local confirm=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --confirm) [[ -n "${2:-}" ]] || { err "--confirm requires the email to confirm"; exit 64; }
                 confirm="$2"; shift 2 ;;
      *) err "unknown flag: $1"
         echo "    usage: ./fd.sh user delete <email> --confirm <email>" >&2
         exit 64 ;;
    esac
  done

  if [[ -z "$confirm" ]]; then
    err "destructive — must pass --confirm <email> matching the target"
    echo "    usage: ./fd.sh user delete <email> --confirm $email" >&2
    exit 64
  fi
  if [[ "$confirm" != "$email" ]]; then
    err "--confirm value doesn't match target email"
    echo "    got:    $confirm" >&2
    echo "    target: $email" >&2
    exit 64
  fi

  local api_key
  api_key=$(_resolve_apikey_for_email "$email")

  local body
  body="{\"confirmEmail\":\"$email\"}"

  log "DELETE ${FD_PROD_BASE_URL}/api/user"
  echo "  $(dim "as:   $email")"
  echo "  $(dim "body: $body")"
  echo

  _request_with_bearer "DELETE" "${FD_PROD_BASE_URL%/}/api/user" "$api_key" "$body"

  echo "$(dim "← HTTP $LAST_HTTP_CODE")"
  [[ -n "$LAST_RESPONSE_BODY" ]] && echo "$LAST_RESPONSE_BODY" | pretty_json
  echo

  case "$LAST_HTTP_CODE" in
    204) ok "Deleted user $email + all KV state (user/email/slug/key/config + users-set)" ;;
    400) err "Confirmation mismatch (server-side check failed)" ; exit 1 ;;
    401) err "Unauthorized — apiKey rejected" ; exit 1 ;;
    404) err "User already missing server-side" ; exit 1 ;;
    *)   err "Unexpected response $LAST_HTTP_CODE" ; exit 1 ;;
  esac
}

# _impl_user_list — SMEMBERS users + per-user GET. No pagination yet (we have
# a few users; if this grows past ~50 we'll add --limit and chunked GET).
_impl_user_list() {
  log "Listing all users (SMEMBERS users)"
  echo

  local user_ids
  user_ids=$(kv_smembers "users")
  if [[ -z "$user_ids" ]]; then
    warn "No users found in the 'users' set"
    return 0
  fi

  local count=0
  # Header + ASCII separator. Unicode em-dashes break `printf %-30s` padding
  # because printf counts bytes, not characters (em-dash = 3 bytes UTF-8).
  printf "  %-30s  %-10s  %s\n" "email" "slug" "created"
  printf "  %-30s  %-10s  %s\n" "------------------------------" "----------" "----------"
  while IFS= read -r uid; do
    [[ -z "$uid" ]] && continue
    local rec
    rec=$(kv_get "user:$uid")
    if [[ -z "$rec" ]]; then
      printf "  %-30s  %-10s  %s\n" "$(dim "(missing user:$uid)")" "" ""
      continue
    fi
    # Parse: handle both string-wrapped JSON (Upstash client default) and raw.
    local email slug created
    email=$(echo "$rec"   | jq -r 'if type == "string" then fromjson else . end | .email     // "?"')
    slug=$(echo "$rec"    | jq -r 'if type == "string" then fromjson else . end | .slug      // "?"')
    created=$(echo "$rec" | jq -r 'if type == "string" then fromjson else . end | .createdAt // "?"')
    printf "  %-30s  %-10s  %s\n" "$email" "$slug" "${created:0:10}"
    ((count++))
  done <<< "$user_ids"

  echo
  ok "$count user(s)"
}

# ── Per-env wrappers (thin) ────────────────────────────────────────────────

prod_cache_refresh()      { require_curl; require_prod_secret; _impl_cache_refresh "$FD_PROD_BASE_URL" "$PROD_CRON_SECRET" "PROD_CRON_SECRET" "prod"; }
prod_cache_revalidate()   { require_curl; require_prod_secret; _impl_cache_revalidate "$FD_PROD_BASE_URL" "$PROD_CRON_SECRET" "PROD_CRON_SECRET" "prod" "${1:-}"; }
prod_cache_purge()        { require_curl; require_jq; require_prod_kv_creds; _impl_cache_purge "$FD_PROD_BASE_URL" "$(date -u +%Y-%m-%d)" "prod" "$@"; }
prod_status()             { require_curl; _impl_status "$FD_PROD_BASE_URL" "prod"; }

local_cache_refresh()     { require_curl; require_local_cron_secret; _impl_cache_refresh "$FD_LOCAL_BASE_URL" "$CRON_SECRET" "CRON_SECRET" "local"; }
local_cache_revalidate()  { require_curl; require_local_cron_secret; _impl_cache_revalidate "$FD_LOCAL_BASE_URL" "$CRON_SECRET" "CRON_SECRET" "local" "${1:-}"; }
local_cache_purge()       { require_curl; require_jq; require_prod_kv_creds; _impl_cache_purge "$FD_LOCAL_BASE_URL" "$(date -u +%Y-%m-%d)" "local" "$@"; }
local_status()            { require_curl; _impl_status "$FD_LOCAL_BASE_URL" "local"; }

# Top-level inspection sections (#58). Both target prod artifacts (NASA key,
# prod KV), so they're prod-implicit like `user`.
apod()    { require_curl; require_jq; require_nasa_api_key; _impl_apod; }
kv_keys_action() { require_curl; require_jq; require_prod_kv_creds; _impl_kv_keys "$@"; }
kv_get_action()  { require_curl; require_jq; require_prod_kv_creds; _impl_kv_get  "$@"; }

# Top-level `user` section (prod-only; #89). All require jq + KV creds for
# the apiKey lookup. Signup is the lone exception (only needs curl).
user_signup() { require_curl; _impl_user_signup "$FD_PROD_BASE_URL" "${1:-}"; }
user_get()    { require_curl; require_jq; require_prod_kv_creds; _impl_user_get    "$@"; }
user_update() { require_curl; require_jq; require_prod_kv_creds; _impl_user_update "$@"; }
user_delete() { require_curl; require_jq; require_prod_kv_creds; _impl_user_delete "$@"; }
user_list()   { require_curl; require_jq; require_prod_kv_creds; _impl_user_list   "$@"; }

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

prod_cache_dispatch() {
  local action="${1:-}"
  if [[ -z "$action" ]]; then
    err "prod cache: missing action"
    echo "    available: refresh, revalidate, purge, help" >&2
    exit 64
  fi
  shift
  case "$action" in
    refresh)      prod_cache_refresh "$@" ;;
    revalidate)   prod_cache_revalidate "$@" ;;
    purge)        prod_cache_purge "$@" ;;
    help)         _subgroup_help "prod cache" \
                    "refresh"             "Warm data + revalidate pages (= /api/refresh)" \
                    "revalidate [userId]" "Revalidate page ISR only" \
                    "purge <source>..."   "DEL today's cache keys for sources (or --all)" ;;
    *) err "unknown prod cache action: $action"
       echo "    available: refresh, revalidate, purge, help" >&2
       exit 64 ;;
  esac
}

local_cache_dispatch() {
  local action="${1:-}"
  if [[ -z "$action" ]]; then
    err "local cache: missing action"
    echo "    available: refresh, revalidate, purge, help" >&2
    exit 64
  fi
  shift
  case "$action" in
    refresh)      local_cache_refresh "$@" ;;
    revalidate)   local_cache_revalidate "$@" ;;
    purge)        local_cache_purge "$@" ;;
    help)         _subgroup_help "local cache" \
                    "refresh"             "Warm data + revalidate pages (against dev)" \
                    "revalidate [userId]" "Revalidate page ISR only (against dev)" \
                    "purge <source>..."   "DEL today's cache keys for sources (or --all)" ;;
    *) err "unknown local cache action: $action"
       echo "    available: refresh, revalidate, purge, help" >&2
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
    echo "    available: cache, status, help" >&2
    echo "    (user management moved to top-level: ./fd.sh user help)" >&2
    exit 64
  fi
  shift
  case "$sub" in
    cache)  prod_cache_dispatch "$@" ;;
    status) prod_status "$@" ;;
    help)   echo ""; show_help_prod; echo "" ;;
    user)   err "user is no longer under prod (#89) — use: ./fd.sh user $*"
            exit 64 ;;
    *) err "unknown prod subgroup: $sub"
       echo "    available: cache, status, help" >&2
       exit 64 ;;
  esac
}

local_dispatch() {
  local sub="${1:-}"
  if [[ -z "$sub" ]]; then
    err "local: missing subgroup"
    echo "    available: server, cache, status, help" >&2
    exit 64
  fi
  shift
  case "$sub" in
    server) local_server_dispatch "$@" ;;
    cache)  local_cache_dispatch "$@" ;;
    status) local_status "$@" ;;
    help)   echo ""; show_help_local; echo "" ;;
    user)   err "user is no longer under local (#89) — local has no user management (uses seeded static key)."
            echo "    For prod user ops: ./fd.sh user help" >&2
            exit 64 ;;
    *) err "unknown local subgroup: $sub"
       echo "    available: server, cache, status, help" >&2
       exit 64 ;;
  esac
}

# Top-level `kv` dispatcher (#58). Prod-implicit — targets the prod Upstash KV.
kv_dispatch() {
  local action="${1:-}"
  if [[ -z "$action" ]]; then
    err "kv: missing action"
    echo "    available: keys, get, help" >&2
    exit 64
  fi
  shift
  case "$action" in
    keys) kv_keys_action "$@" ;;
    get)  kv_get_action "$@" ;;
    help) _subgroup_help "kv  (prod-only · read-only)" \
            "keys [prefix]"  "List KV keys matching prefix* (default: all)" \
            "get <key>"      "Print KV value (jq-pretty if JSON)" ;;
    *) err "unknown kv action: $action"
       echo "    available: keys, get, help" >&2
       exit 64 ;;
  esac
}

# Top-level `user` dispatcher (#89). Prod-implicit — no env prefix.
user_dispatch() {
  local action="${1:-}"
  if [[ -z "$action" ]]; then
    err "user: missing action"
    echo "    available: signup, get, update, delete, list, help" >&2
    exit 64
  fi
  shift
  case "$action" in
    signup) user_signup "$@" ;;
    get)    user_get    "$@" ;;
    update) user_update "$@" ;;
    delete) user_delete "$@" ;;
    list)   user_list   "$@" ;;
    help)   _subgroup_help "user  (prod-only)" \
              "signup <email>"  "Email a signup link" \
              "get <email>"     "Fetch the user record" \
              "update <email>"  "Update fields: --name X / --timezone Y" \
              "delete <email>"  "Delete + wipe KV: --confirm <email>" \
              "list"            "Enumerate all users" ;;
    *) err "unknown user action: $action"
       echo "    available: signup, get, update, delete, list, help" >&2
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
  user)  user_dispatch "$@" ;;
  kv)    kv_dispatch "$@" ;;
  apod)  apod "$@" ;;
  *) err "unknown env: $env"
     echo "    available: prod, local, user, kv, apod" >&2
     echo "    run ./fd.sh --help for the full surface" >&2
     exit 64 ;;
esac
