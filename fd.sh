#!/usr/bin/env bash
#
# fd.sh — frontdoor ops CLI
#
# A thin curl-and-format wrapper over the production HTTP surface (and any
# local dev server). Defaults to hitting production; pass `--local` to target
# `http://localhost:3000` or `--url <url>` for a one-off override.
#
# To add a new subcommand:
#   1. Write a `cmd_<name>()` function below.
#   2. Add a `<name>) cmd_<name> "$@" ;;` case at the bottom.
#   3. Add a line in `usage()`.
# Subcommands should: validate inputs locally, print what they're about to do,
# show HTTP method+URL+status, and pretty-print bodies via `pretty_json`.
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

BASE_URL="${FD_BASE_URL:-$DEFAULT_BASE_URL}"

usage() {
  cat <<'EOF'
fd.sh — frontdoor ops CLI

Usage:
  ./fd.sh [global-opts] <command> [args]

Commands:
  signup <email>     POST /api/keys — request a signup link

Global options:
  --local            Target local dev (http://localhost:3000)
  --url <url>        Target a specific base URL
  -h, --help         Show this help

Environment:
  FD_BASE_URL        Override the default base URL.
                     Default: https://frontdoor.barooah.io

Examples:
  ./fd.sh signup you@example.com
  ./fd.sh --local signup you@example.com
  FD_BASE_URL=https://frontdoor-theta.vercel.app ./fd.sh signup you@example.com
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
  # shellcheck disable=SC2064  # we want $tmp expanded now
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
    202)
      echo "✓ Accepted. Check $email (inbox + spam) for a signup link."
      ;;
    400)
      echo "✗ Bad request — email rejected or body malformed." >&2
      exit 1
      ;;
    429)
      echo "✗ Rate-limited. Try again in a minute." >&2
      exit 1
      ;;
    000)
      echo "✗ Could not reach $BASE_URL — is the server up?" >&2
      exit 1
      ;;
    *)
      echo "✗ Unexpected response $code." >&2
      exit 1
      ;;
  esac
}

# --- Dispatch --------------------------------------------------------------
case "$cmd" in
  signup) cmd_signup "$@" ;;
  *) echo "fd: unknown command: $cmd" >&2; usage >&2; exit 64 ;;
esac
