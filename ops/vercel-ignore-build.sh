#!/usr/bin/env bash
#
# Vercel Ignored Build Step — tag-gates production deployments.
# Per #77: production builds only run when HEAD is on a git tag.
# Preview builds (PRs, branch pushes) are unaffected.
#
# Contract (Vercel docs):
#   exit 1  → BUILD  (the deployment proceeds)
#   exit 0  → SKIP   (Vercel marks this deployment as "Canceled")
#
# How it gets invoked:
#   Vercel runs this on every webhook-triggered deploy attempt, BEFORE
#   the build container is allocated. The repo is shallowly cloned at
#   the target commit; full git history isn't available but the working
#   tree IS, and `git describe --tags --exact-match HEAD` works because
#   Vercel fetches tags during the clone.
#
# Env vars available here (set by Vercel):
#   VERCEL_ENV                = "production" | "preview" | "development"
#   VERCEL_GIT_COMMIT_SHA     = the commit being deployed
#   VERCEL_GIT_COMMIT_REF     = the branch or tag name (NOT reliable for
#                                  tag detection — it's "main" on a tag
#                                  push too because Vercel resolves the
#                                  tag to the branch it's on)
#
# We use git directly rather than VERCEL_GIT_* because the exact-tag check
# is more reliable: we want to know "is this commit pointed at by a tag?",
# not "what ref triggered this build?".
#
# Emergency bypass: comment out the `ignoreCommand` line in vercel.json
# and push; Vercel will fall back to its default "always build" behavior.
# Restore the line after the emergency deploy.
#
set -eu

# Preview / development builds: always allow.
# (Per-PR previews are essential for HITL review; we only gate production.)
if [ "${VERCEL_ENV:-}" != "production" ]; then
  echo "→ ${VERCEL_ENV:-unknown} build → BUILD"
  exit 1
fi

# Production build: allow only when HEAD is on a git tag.
if git describe --tags --exact-match HEAD >/dev/null 2>&1; then
  tag=$(git describe --tags --exact-match HEAD)
  echo "→ production: HEAD is tagged ($tag) → BUILD"
  exit 1
fi

echo "→ production: HEAD ($(git rev-parse --short HEAD)) is NOT tagged → SKIP"
echo "  (deploy production by tagging a commit and pushing the tag;"
echo "   see docs/release-pipeline.md or /fd-release skill)"
exit 0
