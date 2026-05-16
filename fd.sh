#!/usr/bin/env bash
#
# fd.sh — frontdoor ops CLI
#
# A thin curl-and-format wrapper over the frontdoor HTTP surface. Three
# command shapes today:
#
#   ./fd.sh signup <email>            — public signup; defaults to prod URL
#   ./fd.sh --local signup <email>    — same against http://localhost:3000
#   ./fd.sh prod <subcmd> [args]      — privileged prod ops (cron-exec,
#                                       page-refresh); requires PROD_CRON_SECRET
#                                       in .env.local
#
# The `prod` namespace is separate because those subcommands attach a bearer
# token and (a) only ever target the canonical production URL, (b) are
# state-mutating, and (c) require a local mirror of the Vercel-side
# CRON_SECRET. Public-surface commands (signup) follow the original pattern
# with --local/--url overrides.
#
# Adding a new top-level subcommand:
#   1. Write `cmd_<name>()`.
#   2. Add a dispatch case at the bottom.
#   3. Add a usage line.
# Adding a new prod-namespace subcommand:
#   1. Write `cmd_prod_<name>()`.
#   2. Add a case inside `cmd_prod`'s switch.
#   3. Add a usage line.
#
# Conventions:
#   → prefix for outbound requests, ← for responses.
#   Exit 0 on 2xx, 64 on usage error (per sysexits), 1 on other failure.
#
set -euo pipefail

# Canonical production domain (#26 — Vercel front-door + rewrite to GH Pages).
# The Vercel-assigned alias `https://frontdoor-theta.vercel.app` also still
# works and serves the same content if you ever need to bypass DNS.
DEFAULT_BASE_URL="https://frontdoor.barooah.io"
LOCAL_BASE_URL="http://localhost:3000"
# Prod ops always target the canonical domain — `--url` / `--local` / FD_BASE_URL
# do NOT apply to prod-namespace subcommands. Locking the URL prevents an
# accidental "I'll cron-exec against my dev server" mistake.
PROD_BASE_URL="https://frontdoor.barooah.io"

BASE_URL="${FD_BASE_URL:-$DEFAULT_BASE_URL}"

# Tries to source .env.local relative to the script (not cwd) so the CLI works
# from anywhere in the repo. Quiet on absence; commands that need a specific
# var error individually with actionable guidance.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env.local"
  set +a
fi

usage() {
  cat <<'EOF'
fd.sh — frontdoor ops CLI

Usage:
  ./fd.sh [global-opts] <command> [args]
  ./fd.sh prod <subcommand> [args]

Public commands:
  signup <email>          POST /api/keys — request a signup link

Prod ops (require PROD_CRON_SECRET in .env.local; always target prod):
  prod cron-exec          POST /api/refresh — manually trigger the daily
                          cron's source fan-out + revalidate-all
  prod page-refresh [id]  POST /api/revalidate — revalidate every user's
                          /fd/<slug> page; with a userId arg, just that one

Global options (apply to public commands only):
  --local                 Target local dev (http://localhost:3000)
  --url <url>             Target a specific base URL
  -h, --help              Show this help

Environment:
  FD_BASE_URL             Override the default base URL for public commands.
                          Default: https://frontdoor.barooah.io
  PROD_CRON_SECRET        Required by prod-namespace commands. Set in
                          .env.local (gitignored). Mirror of Vercel
                          Production CRON_SECRET.

Examples:
  ./fd.sh signup you@example.com
  ./fd.sh --local signup you@example.com
  ./fd.sh prod cron-exec
  ./fd.sh prod page-refresh
  ./fd.sh prod page-refresh u_dev_local
EOF
}

# --- Global option parsing -------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --local) BASE_URL="$LOCAL_BASE_URL"; shift ;;
    --url)
      [[ $# -ge 2 ]] || { echo "fd: --url requires a value" >&2; exit 64; }
      BASE_URL="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    --) shift; break ;;
    -*) echo "fd: unknown option: $1" >&2; usage >&2; exit 64 ;;
    *)  break ;;
  esac
done

cmd="${1:-}"
[[ -n "$cmd" ]] || { usage; exit 64; }
shift

# --- Helpers ---------------------------------------------------------------
have() { command -v "$1" >/dev/null 2>&1; }

# Pretty-prints stdin JSON via jq if present; otherwise passes through raw.
# Always returns 0 so a malformed body (e.g. an HTML error page from a dead
# dev server) doesn't kill the script before we've shown the user the body.
pretty_json() {
  if have jq; then
    jq . 2>/dev/null || cat
  else
    cat
  fi
}

# A loose check — the server does the real Zod validation. We're just
# catching obvious typos at the shell level so we don't burn a rate-limit
# slot on something like `./fd.sh signup oops`.
looks_like_email() {
  [[ "$1" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]
}

# Verifies PROD_CRON_SECRET is set; fails with setup guidance otherwise.
require_prod_secret() {
  if [[ -z "${PROD_CRON_SECRET:-}" ]]; then
    cat >&2 <<EOF
fd: PROD_CRON_SECRET is not set.

Prod-namespace commands need it to authenticate against /api/refresh and
/api/revalidate. To set up:

  1. Generate a fresh secret:    openssl rand -hex 32
  2. Set it as the Vercel Production CRON_SECRET:
       vercel env rm CRON_SECRET production --yes
       printf "%s" "<secret>" | vercel env add CRON_SECRET production
  3. Save the same value in .env.local as PROD_CRON_SECRET=<secret>
  4. Trigger a redeploy so Vercel runtime picks up the new value:
       git commit --allow-empty -m "redeploy"; git push

Or — if you've already done step 1-3 — verify PROD_CRON_SECRET is in
$SCRIPT_DIR/.env.local and that file is being sourced.
EOF
    exit 1
  fi
}

# Issue a POST with a bearer token; print → / ←, status, and pretty body.
# Sets the global `LAST_HTTP_CODE` so the caller can classify — we can't
# use stdout because stdout is already the display channel.
LAST_HTTP_CODE=""
post_with_bearer() {
  local url="$1" bearer="$2"
  echo "→ POST $url"
  echo "  bearer: <PROD_CRON_SECRET>"
  echo

  local tmp
  tmp=$(mktemp)
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" EXIT

  LAST_HTTP_CODE=$(curl -sS --max-time 120 -o "$tmp" -w "%{http_code}" \
    -X POST "$url" \
    -H "Authorization: Bearer $bearer") || {
      echo "fd: curl failed (network error or timeout)" >&2
      exit 1
    }

  echo "← HTTP $LAST_HTTP_CODE"
  [[ -s "$tmp" ]] && pretty_json < "$tmp"
  echo
}

# --- Subcommands -----------------------------------------------------------

# signup <email>
#   POST /api/keys → always 202 on success (the key never appears in the
#   response — it's only emailed). 400 on invalid email, 429 if rate-limited.
cmd_signup() {
  local email="${1:-}"
  if [[ -z "$email" ]]; then
    echo "fd signup: missing email" >&2
    echo "usage: ./fd.sh signup <email>" >&2
    exit 64
  fi
  if ! looks_like_email "$email"; then
    echo "fd signup: '$email' doesn't look like a valid email" >&2
    exit 64
  fi

  local url="${BASE_URL%/}/api/keys"
  local body="{\"email\":\"$email\"}"

  echo "→ POST $url"
  echo "  body: $body"
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
      echo "fd signup: curl failed (network error?)" >&2
      exit 1
    }

  echo "← HTTP $code"
  [[ -s "$tmp" ]] && pretty_json < "$tmp"
  echo

  case "$code" in
    202) echo "✓ Accepted. Check $email (inbox + spam) for a signup link." ;;
    400) echo "✗ Bad request — email rejected or body malformed." >&2; exit 1 ;;
    429) echo "✗ Rate-limited. Try again in a minute." >&2; exit 1 ;;
    000) echo "✗ Could not reach $BASE_URL — is the server up?" >&2; exit 1 ;;
    *)   echo "✗ Unexpected response $code." >&2; exit 1 ;;
  esac
}

# prod cron-exec
#   Manually triggers the same code Vercel cron fires at 03:00 UTC daily:
#   POST /api/refresh → fans out to every global data source via
#   Promise.allSettled, then revalidates every user's /fd/<slug> ISR page.
#   Returns {ok, warmed, failed[], revalidated, revalidate_failed[]}.
cmd_prod_cron_exec() {
  require_prod_secret
  local url="${PROD_BASE_URL%/}/api/refresh"

  echo "  (manually triggering the daily 03:00 UTC cron)"
  echo
  post_with_bearer "$url" "$PROD_CRON_SECRET"

  case "$LAST_HTTP_CODE" in
    200) echo "✓ Cron run accepted." ;;
    401) echo "✗ Unauthorized — PROD_CRON_SECRET doesn't match Vercel's runtime value." >&2
         echo "  (rotation in-flight? wait for the deploy to be ready and retry)" >&2; exit 1 ;;
    *)   echo "✗ Unexpected response $LAST_HTTP_CODE." >&2; exit 1 ;;
  esac
}

# prod page-refresh [userId]
#   POST /api/revalidate → revalidates ISR cache for all users (no arg) or
#   a single user (with arg). The /api/refresh cron does the same thing
#   in-process at the end; this is the standalone, faster (~ms not seconds)
#   variant for post-config-change cache busts.
cmd_prod_page_refresh() {
  require_prod_secret
  local user_id="${1:-}"
  local url="${PROD_BASE_URL%/}/api/revalidate"
  if [[ -n "$user_id" ]]; then
    url="$url?userId=$user_id"
    echo "  (revalidating one user: $user_id)"
  else
    echo "  (revalidating all users' /fd/<slug> pages)"
  fi
  echo
  post_with_bearer "$url" "$PROD_CRON_SECRET"

  case "$LAST_HTTP_CODE" in
    200) echo "✓ Revalidation request accepted." ;;
    401) echo "✗ Unauthorized — PROD_CRON_SECRET doesn't match Vercel's runtime value." >&2; exit 1 ;;
    *)   echo "✗ Unexpected response $LAST_HTTP_CODE." >&2; exit 1 ;;
  esac
}

# prod <subcmd>
#   Namespace dispatcher for the prod ops group.
cmd_prod() {
  local sub="${1:-}"
  if [[ -z "$sub" ]]; then
    echo "fd prod: missing subcommand" >&2
    echo "usage: ./fd.sh prod {cron-exec|page-refresh [userId]}" >&2
    exit 64
  fi
  shift
  case "$sub" in
    cron-exec)    cmd_prod_cron_exec "$@" ;;
    page-refresh) cmd_prod_page_refresh "$@" ;;
    *) echo "fd: unknown prod subcommand: $sub" >&2; exit 64 ;;
  esac
}

# --- Dispatch --------------------------------------------------------------
case "$cmd" in
  signup) cmd_signup "$@" ;;
  prod)   cmd_prod "$@" ;;
  *) echo "fd: unknown command: $cmd" >&2; usage >&2; exit 64 ;;
esac
