# Release pipeline

How code gets from a merged PR to a production deployment users see.

## Two decisions, two mechanisms

Frontdoor separates **shipping code** from **releasing it to users**:

| Decision | Trigger | Mechanism |
|----------|---------|-----------|
| _"Is this code OK to ship?"_ | PR review + CI green + merge to `main` | GitHub PR workflow |
| _"Should users see this now?"_ | A maintainer decides to release | `git tag` + push |

Before #77 these were coupled — every push to `main` deployed to production automatically. Now they're decoupled: pushes to `main` are observed but not deployed; only **tagged commits** trigger a production deploy.

## What's gated, what's not

| Surface | Gated by tag? | Notes |
|---------|---------------|-------|
| Production deployment (`frontdoor.barooah.io`) | **YES** | Only deploys on tag pushes |
| Preview deployment (per-PR URL) | NO | Every PR continues to get a preview URL — needed for HITL review |
| Vercel Cron (`/api/refresh` daily at 03:00 UTC) | NO | Runs against whatever's currently deployed; tag-gating affects deploys, not running infrastructure |
| GitHub Actions CI (unit + E2E) | NO | Runs on every push and PR, as before |
| Marketing site (GitHub Pages) | NO | Its own path-scoped workflow on `marketing/**`, unrelated |

## The mechanism

Vercel exposes an [Ignored Build Step](https://vercel.com/docs/deployments/ignored-build-step) — a script run before each build that decides whether to proceed.

**Contract:**
- Exit `1` → BUILD (the deployment proceeds normally)
- Exit `0` → SKIP (Vercel marks the deployment as "Canceled")

**Our script:** [`ops/vercel-ignore-build.sh`](../ops/vercel-ignore-build.sh)

- Preview / development builds: always allow (`exit 1`)
- Production builds: allow only if `git describe --tags --exact-match HEAD` succeeds

**Wiring:** [`vercel.json`](../vercel.json) → `"ignoreCommand": "bash ops/vercel-ignore-build.sh"`

## What a release looks like

```bash
# 1. Decide a version (semver — see "Versioning" below)
VERSION=v0.0.3

# 2. Create an annotated tag with release notes
git tag -a "$VERSION" -m "<release notes>"

# 3. Push the tag — this is what triggers the prod deploy
git push origin "$VERSION"

# 4. Watch Vercel build + deploy (~30s typically)
vercel ls --prod | head -3

# 5. Smoke check
curl -sSI "https://frontdoor.barooah.io/" | head -1   # 200 OK
./fd.sh prod cache refresh                            # cron path works
./fd.sh user signup test+release@example.com          # signup live (optional)

# 6. Make a GitHub Release page
gh release create "$VERSION" --generate-notes --title "$VERSION — <theme>"
```

**This is automated by [`/fd-release`](../.claude/skills/fd-release.md)** — playbook-style skill, judgment stays live. Two HITL gates (version + notes); everything else flows.

## Versioning (semver in the 0.0.x phase)

Pre-1.0 semver is conventionally loose. Frontdoor's convention:

| Bump | When |
|------|------|
| **Patch** (`v0.0.x` → `v0.0.x+1`) | Default — tooling, bug fixes, doc, small features |
| **Minor** (`v0.0.x` → `v0.1.0`) | Real product milestones (e.g., a `batch:*` completes with user-facing value) |
| **Major** | Skip until 1.0 itself |

So: v0.0.3, v0.0.4, … then `batch:auth-identity` finishing might trigger v0.1.0; next big batch v0.2.0; etc.

## Cadence

**Ad-hoc / on-demand.** Release when there's something worth shipping, not on a schedule. `/fd-release status` surfaces "X commits unreleased, Y days since last release" as a nudge if drift accumulates.

## Emergency bypass

If the `ignoreCommand` script is broken or you need to deploy a non-tagged commit urgently:

1. **Edit `vercel.json`** — comment out or remove the `"ignoreCommand"` line:
   ```json
   {
     "$schema": "...",
     // "ignoreCommand": "bash ops/vercel-ignore-build.sh",
     "crons": [ ... ]
   }
   ```
2. **Commit and push** — Vercel falls back to its default "always build" behavior; the push deploys to production.
3. **After the emergency**, restore the line and push again.

This bypass leaves a clear audit trail in git history. Don't undo via Vercel dashboard hotfixes — `vercel.json` is the source of truth.

## Rollback

**Forward-only rollback for now.** To revert a bad deployment:

1. Identify a known-good past tag (e.g., `v0.0.2`).
2. Use Vercel dashboard → Deployments → find the past tag's deployment → **Promote to Production**.

This points production at the past build instantly — no rebuild needed (Vercel keeps every deployment forever).

`/fd-release rollback <tag>` (issue #79) will automate this. Until then, the manual path above works.

## Why tag-gate at all

Without tag-gating, every merge is a release. That conflates:

- **Code-quality decisions** (PR review, CI) with
- **Release timing decisions** (do we want users to see this now?)

Coupling them means:
- Reviewing a PR has the implicit weight of "this ships immediately" — adds caution friction
- Releasing happens by default, not by intent — easy to ship un-checked combinations of changes
- No natural batching of release-note-worthy changes — every commit is its own micro-release

Decoupling them:
- Merging stays cheap and frequent (the cost of being wrong is "rolled back at next release", not "live in production")
- Releasing becomes an intentional act with its own checks (smoke, release notes)
- Multiple merges can hang together as a coherent release with proper notes

This is the standard CI/CD discipline; just making it explicit for a project that started without it.

## Related

- Issue [#77](https://github.com/vedanta/frontdoor/issues/77) — this work (Vercel gate)
- [`.claude/skills/fd-release.md`](../.claude/skills/fd-release.md) — `/fd-release` skill (issue [#78](https://github.com/vedanta/frontdoor/issues/78))
- Issue [#79](https://github.com/vedanta/frontdoor/issues/79) — `/fd-release` v0.2: rollback support
- [`ops/vercel-ignore-build.sh`](../ops/vercel-ignore-build.sh) — the script itself
- [`vercel.json`](../vercel.json) — the wiring
