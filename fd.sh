#!/usr/bin/env bash
#
# fd.sh — frontdoor ops CLI
#
# Follows the "liway pattern" (#64): every command is `<group> <action> [args]`;
# coloured `log`/`ok`/`warn`/`err` output; centralised `show_help` with
# `_h`-aligned columns; `<group>_<action>` feature-function naming; main router
# is one top-level case on group, nested case on action.
#
# Adding a new action to an existing group:
#   1. Write `<group>_<action>()`.
#   2. Add a case in that group's router.
#   3. Add an `_h` line in `show_help`.
# Adding a new group:
#   1. Implement actions per above.
#   2. Add a top-level `case` arm for the group.
#   3. Add a group header + `_h` lines in `show_help`.
#   4. (Per liway rule 3) Provide at least one discovery action
#      (e.g. `<group> status` / `<group> list`).
#
# Conventions (liway style, #64):
#   - log()  actions about to happen        (cyan [fd] prefix, col 0)
#   - ok()   successful outcomes            (green ✓, 2-space indent)
#   - warn() non-fatal anomalies            (yellow !, 2-space indent, stderr)
#   - err()  fatal failures                 (red ✗, 2-space indent, stderr)
#   - Manual hint lines under err / warn use 4-space indent so they
#     nest under the message text (which starts at col 4).
#   - Manual hint lines under log use 2-space indent so they nest
#     under the [fd] prefix (which is at col 0, message at col 5).
#   - Exit 0 on 2xx outcomes, 64 on usage error (sysexits EX_USAGE),
#     1 on other failure.
#
# Conventions enforced for `prod` group:
#   - Always target the canonical production URL (--url/--local ignored).
#   - Always require PROD_CRON_SECRET in .env.local. Fail with setup
#     guidance otherwise.
#
set -euo pipefail

# ── Globals ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_BASE_URL="https://frontdoor.barooah.io"
LOCAL_BASE_URL="http://localhost:3000"
# Prod ops always hit the canonical domain — see "Conventions for `prod`" above.
PROD_BASE_URL="https://frontdoor.barooah.io"
BASE_URL="${FD_BASE_URL:-$DEFAULT_BASE_URL}"

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
# Liway-pattern (#64): branded `[fd]` prefix for log lines (announces action
# at column 0); ok / warn / err nest under with 2-space indent + coloured
# glyph (✓ green, ! yellow, ✗ red). Manual hint lines under err / warn use
# 4-space indent to nest under the message text (which starts at col 4).
# warn + err go to stderr so they survive stdout redirection. `dim` is for
# inline annotation within a larger printed line, not standalone messages.
log()  { printf "%s[fd]%s %s\n"   "$C_CYAN"   "$C_RESET" "$*"; }
ok()   { printf "  %s✓%s %s\n"    "$C_GREEN"  "$C_RESET" "$*"; }
warn() { printf "  %s!%s %s\n"    "$C_YELLOW" "$C_RESET" "$*" >&2; }
err()  { printf "  %s✗%s %s\n"    "$C_RED"    "$C_RESET" "$*" >&2; }
dim()  { printf "%s%s%s"          "$C_DIM"    "$*"       "$C_RESET"; }

# ── Help renderer ──────────────────────────────────────────────────────────
# _h "<command>" "<description>" — column-aligned help row in the liway
# style (#64): 4-space indent + cyan command in a 36-char column + plain
# description. ANSI escapes are 0-visible-width so alignment is preserved.
_h() { printf "    %s%-36s%s%s\n" "$C_CYAN" "$1" "$C_RESET" "$2"; }

show_help() {
  echo ""
  echo -e "  ${C_BOLD}fd CLI${C_RESET}  —  ./fd.sh ${C_CYAN}<group>${C_RESET} <action> [args]"
  echo ""
  _h "user signup <email>"        "Email yourself a signup link"
  _h "prod cron-exec"             "Trigger the daily cron"
  _h "prod page-refresh [userId]" "Force dashboards to re-render"
  echo -e "    ${C_DIM}Use --local to target http://localhost:3000 (default is prod).${C_RESET}"
  echo ""
}

# ── Validation / preflight ─────────────────────────────────────────────────
have() { command -v "$1" >/dev/null 2>&1; }

# Pretty-prints stdin JSON via jq if present; otherwise raw passthrough.
# Always returns 0 so a non-JSON body doesn't kill the script before we've
# shown the user the body.
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

Prod-group actions need it to authenticate against /api/refresh and
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

# Issue a POST with a bearer token; print → / status / pretty body. Sets the
# global LAST_HTTP_CODE so the caller can classify (stdout is the display
# channel, so we can't return-via-stdout).
LAST_HTTP_CODE=""
post_with_bearer() {
  local url="$1" bearer="$2"
  log "POST $url"
  echo "  $(dim "bearer: <PROD_CRON_SECRET>")"
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

# ── user group ─────────────────────────────────────────────────────────────

# user signup <email>
#   POST /api/keys → always 202 on success (the key is only emailed).
#   400 on invalid email, 429 if rate-limited.
user_signup() {
  require_curl
  local email="${1:-}"
  if [[ -z "$email" ]]; then
    err "missing email"
    echo "    usage: ./fd.sh user signup <email>" >&2
    exit 64
  fi
  if ! looks_like_email "$email"; then
    err "'$email' doesn't look like a valid email"
    exit 64
  fi

  local url="${BASE_URL%/}/api/keys"
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
    000) err "Could not reach $BASE_URL — is the server up?"
         echo "    Try ./fd.sh --local user signup $email if testing locally." >&2
         exit 1 ;;
    *)   err "Unexpected response $code."
         exit 1 ;;
  esac
}

user_router() {
  local action="${1:-}"
  if [[ -z "$action" ]]; then
    err "user: missing action"
    echo "    available: signup" >&2
    exit 64
  fi
  shift
  case "$action" in
    signup) user_signup "$@" ;;
    *) err "unknown user action: $action"
       echo "    available: signup" >&2
       exit 64 ;;
  esac
}

# ── prod group ─────────────────────────────────────────────────────────────

# prod cron-exec
#   Same code path Vercel cron fires at 03:00 UTC daily: POST /api/refresh,
#   fans out to every global source via Promise.allSettled, then revalidates
#   every user's /fd/<slug> ISR page.
prod_cron_exec() {
  require_curl
  require_prod_secret
  log "Triggering daily cron manually"
  echo "  $(dim "(normally fires at 03:00 UTC; this runs it now)")"
  echo

  local url="${PROD_BASE_URL%/}/api/refresh"
  post_with_bearer "$url" "$PROD_CRON_SECRET"

  case "$LAST_HTTP_CODE" in
    200) ok "Cron run accepted." ;;
    401) err "Unauthorized — PROD_CRON_SECRET doesn't match Vercel's runtime value."
         echo "    (rotation in-flight? wait for the deploy to be Ready and retry)" >&2
         exit 1 ;;
    *)   err "Unexpected response $LAST_HTTP_CODE."
         exit 1 ;;
  esac
}

# prod page-refresh [userId]
#   POST /api/revalidate. No arg → revalidate every user. With userId → just
#   that one. Standalone variant of the chain-revalidate that `cron-exec`
#   does at the end; useful for post-config-change cache busts (~ms vs
#   seconds).
prod_page_refresh() {
  require_curl
  require_prod_secret
  local user_id="${1:-}"
  local url="${PROD_BASE_URL%/}/api/revalidate"
  if [[ -n "$user_id" ]]; then
    url="$url?userId=$user_id"
    log "Revalidating one user: $user_id"
  else
    log "Revalidating all users' /fd/<slug> pages"
  fi
  echo

  post_with_bearer "$url" "$PROD_CRON_SECRET"

  case "$LAST_HTTP_CODE" in
    200) ok "Revalidation request accepted." ;;
    401) err "Unauthorized — PROD_CRON_SECRET doesn't match Vercel's runtime value."
         exit 1 ;;
    *)   err "Unexpected response $LAST_HTTP_CODE."
         exit 1 ;;
  esac
}

prod_router() {
  local action="${1:-}"
  if [[ -z "$action" ]]; then
    err "prod: missing action"
    echo "    available: cron-exec, page-refresh" >&2
    exit 64
  fi
  shift
  case "$action" in
    cron-exec)    prod_cron_exec "$@" ;;
    page-refresh) prod_page_refresh "$@" ;;
    *) err "unknown prod action: $action"
       echo "    available: cron-exec, page-refresh" >&2
       exit 64 ;;
  esac
}

# ── Global option parsing ──────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --local) BASE_URL="$LOCAL_BASE_URL"; shift ;;
    --url)
      [[ $# -ge 2 ]] || { err "--url requires a value"; exit 64; }
      BASE_URL="$2"; shift 2 ;;
    -h|--help|help) show_help; exit 0 ;;
    --) shift; break ;;
    -*) err "unknown option: $1"; show_help >&2; exit 64 ;;
    *)  break ;;
  esac
done

# ── Main router ────────────────────────────────────────────────────────────
group="${1:-}"
if [[ -z "$group" ]]; then
  show_help
  exit 64
fi
shift

case "$group" in
  user) user_router "$@" ;;
  prod) prod_router "$@" ;;
  *) err "unknown group: $group"
     echo "    available: user, prod" >&2
     echo "    run ./fd.sh --help for the full surface" >&2
     exit 64 ;;
esac
