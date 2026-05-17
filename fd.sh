#!/usr/bin/env bash
#
# fd.sh — frontdoor ops CLI
#
# Three-level command space (liway-pattern, #64):
#
#   ./fd.sh <env> <subgroup> <action> [args]
#
#     env       prod | local         (which environment to hit)
#     subgroup  user | cache         (feature area — `cache` covers cache-warming
#                                     and ISR cache invalidation; both auth via
#                                     CRON_SECRET in their respective envs)
#     action    signup / refresh / revalidate   (verb; refresh = /api/refresh,
#                                                revalidate = /api/revalidate)
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
# Three-level layout, matching the command space:
#   _section  — env header (col 2, bold + dim paren context)
#   _subgroup — subgroup name (col 4, plain)
#   _action   — full command + description (col 6, cyan command, 40-col pad)
_section()  { printf "  %s%s%s  %s%s%s\n" "$C_BOLD" "$1" "$C_RESET" "$C_DIM" "$2" "$C_RESET"; }
_subgroup() { printf "    %s\n" "$1"; }
_action()   { printf "      %s%-40s%s%s\n" "$C_CYAN" "$1" "$C_RESET" "$2"; }

show_help() {
  echo ""
  echo -e "  ${C_BOLD}fd CLI${C_RESET}  —  ./fd.sh ${C_CYAN}<env>${C_RESET} ${C_CYAN}<subgroup>${C_RESET} <action> [args]"
  echo ""
  _section "Production" "($FD_PROD_BASE_URL — \`cache refresh\` also auto-fires at 03:00 UTC)"
  _subgroup "user"
  _action   "prod user signup <email>"        "Email yourself a signup link"
  _subgroup "cache"
  _action   "prod cache refresh"              "Refresh data + pages (= /api/refresh)"
  _action   "prod cache revalidate [userId]"  "Revalidate page ISR only (= /api/revalidate)"
  echo ""
  _section "Local" "($FD_LOCAL_BASE_URL — needs \`pnpm dev\` running; no schedule)"
  _subgroup "user"
  _action   "local user signup <email>"        "...against dev"
  _subgroup "cache"
  _action   "local cache refresh"              "...against dev"
  _action   "local cache revalidate [userId]"  "...against dev"
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

# ── Sub-dispatchers (subgroup → action) ────────────────────────────────────
# One per (env, subgroup) — list available actions on bad input.

prod_user_dispatch() {
  local action="${1:-}"
  if [[ -z "$action" ]]; then
    err "prod user: missing action"
    echo "    available: signup" >&2
    exit 64
  fi
  shift
  case "$action" in
    signup) prod_user_signup "$@" ;;
    *) err "unknown prod user action: $action"
       echo "    available: signup" >&2
       exit 64 ;;
  esac
}

prod_cache_dispatch() {
  local action="${1:-}"
  if [[ -z "$action" ]]; then
    err "prod cache: missing action"
    echo "    available: refresh, revalidate" >&2
    exit 64
  fi
  shift
  case "$action" in
    refresh)      prod_cache_refresh "$@" ;;
    revalidate)   prod_cache_revalidate "$@" ;;
    *) err "unknown prod cache action: $action"
       echo "    available: refresh, revalidate" >&2
       exit 64 ;;
  esac
}

local_user_dispatch() {
  local action="${1:-}"
  if [[ -z "$action" ]]; then
    err "local user: missing action"
    echo "    available: signup" >&2
    exit 64
  fi
  shift
  case "$action" in
    signup) local_user_signup "$@" ;;
    *) err "unknown local user action: $action"
       echo "    available: signup" >&2
       exit 64 ;;
  esac
}

local_cache_dispatch() {
  local action="${1:-}"
  if [[ -z "$action" ]]; then
    err "local cache: missing action"
    echo "    available: refresh, revalidate" >&2
    exit 64
  fi
  shift
  case "$action" in
    refresh)      local_cache_refresh "$@" ;;
    revalidate)   local_cache_revalidate "$@" ;;
    *) err "unknown local cache action: $action"
       echo "    available: refresh, revalidate" >&2
       exit 64 ;;
  esac
}

# ── Env dispatchers (env → subgroup) ───────────────────────────────────────

prod_dispatch() {
  local sub="${1:-}"
  if [[ -z "$sub" ]]; then
    err "prod: missing subgroup"
    echo "    available: user, cache" >&2
    exit 64
  fi
  shift
  case "$sub" in
    user) prod_user_dispatch "$@" ;;
    cache) prod_cache_dispatch "$@" ;;
    *) err "unknown prod subgroup: $sub"
       echo "    available: user, cache" >&2
       exit 64 ;;
  esac
}

local_dispatch() {
  local sub="${1:-}"
  if [[ -z "$sub" ]]; then
    err "local: missing subgroup"
    echo "    available: user, cache" >&2
    exit 64
  fi
  shift
  case "$sub" in
    user) local_user_dispatch "$@" ;;
    cache) local_cache_dispatch "$@" ;;
    *) err "unknown local subgroup: $sub"
       echo "    available: user, cache" >&2
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
