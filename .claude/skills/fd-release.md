---
name: fd-release
description: Walk the release cycle for `vedanta/frontdoor` end-to-end — survey → confirm version → draft notes → bump + tag + push → deploy to prod → smoke → GitHub Release page. Sequential, in-chat, gated by 2 HITL confirms. Invoke as `/fd-release`, `/fd-release status`, `/fd-release vX.Y.Z`, `/fd-release patch|minor|major`, or `/fd-release smoke vX.Y.Z`.
---

# /fd-release — the frontdoor release orchestrator

You are walking a single release cycle for `vedanta/frontdoor` end-to-end:
**bump → tag → deploy → smoke → release page.** This skill is the playbook.

The pipeline architecture (tag-gated Vercel builds via `ops/vercel-ignore-build.sh`)
is in [`docs/release-pipeline.md`](../../docs/release-pipeline.md); read it once if
you need context. The mechanics are codified below.

Complementary to `/fd-build` (ships code) and `/fd-groom` (keeps backlog navigable).
This skill answers "should users see this now?" — the second of the two decoupled
decisions in the pipeline.

## Invocation shapes

- **`/fd-release`** — full cycle with default patch bump
- **`/fd-release status`** — read-only survey; latest tag, time since, unreleased commits, suggested bump
- **`/fd-release vX.Y.Z`** — explicit version (overrides the bump suggestion)
- **`/fd-release patch|minor|major`** — explicit semver bump (skips the bump-choice gate)
- **`/fd-release smoke vX.Y.Z`** — re-run smoke against a past tag; no tagging, no deploy

## The cycle (forward path)

### 1. Survey

```bash
# Latest tag + when
git fetch --tags origin
git tag --sort=-v:refname | head -1
git log -1 --format=%cd <latest-tag>

# Commits + PRs since the latest tag
git log <latest-tag>..main --oneline
gh pr list --repo vedanta/frontdoor --state merged \
  --search "merged:>=<latest-tag-date>" \
  --json number,title,mergedAt \
  --jq '.[] | "\(.number) \(.title)"'

# Suggest bump per the conventions below — default `patch` unless an issue
# tagged `release-minor` is in the merged set (rare; user can override)
```

Pre-flight (halt with actionable error on any failure):
- `git status -sb` clean
- On `main` and in sync with `origin/main`
- `gh auth status` OK
- `vercel whoami` OK (CLI auth required for the deploy step)

### 2. Decide

Print a survey card:

```
Latest tag:     vX.Y.Z (N days ago)
Unreleased:     M commits, K PRs
Suggested:      vX.Y.(Z+1)  (patch — default)

PRs since vX.Y.Z:
  #88  #69 User workflow: CRUD API
  #90  #72 fd_ prefix
  ...
```

**HITL gate 1** — version: confirm `vX.Y.(Z+1)` or pick another via
`AskUserQuestion` (options: suggested patch, minor bump, custom).

Auto-draft release notes from PR titles:

```markdown
## What shipped

### <theme — derive from PR labels / batch names if any cluster>

- [#88](URL) #69 User CRUD API
- [#90](URL) #72 fd_ prefix for API keys
- ...

## Verification

- N unit tests (was M)
- E2E green
- format / typecheck / lint / build all clean
```

Show notes. **HITL gate 2** — notes: accept or hand over to user for edits
via `AskUserQuestion` (options: accept, edit-then-accept, abort).

### 3. Bump + tag

```bash
# Edit package.json version → new version
# (Use Edit tool; replace "version": "OLD" → "version": "NEW")

git add package.json
git -c commit.gpgsign=false commit -m "chore: bump version to X.Y.Z for release

Patch cadence per memory release-cadence-patch.md (or 'Minor bump
for <reason>' / 'Major bump for <reason>')."

git push

# Annotated tag with the curated notes from gate 2
git tag -a vX.Y.Z -m "<notes>"
git push origin vX.Y.Z
```

### 4. Deploy

**Critical:** tag-only push does NOT trigger Vercel — Vercel webhooks fire on
branch pushes, not tag pushes. You MUST manually trigger via the CLI:

```bash
vercel --prod --yes
```

The deploy then runs through `ops/vercel-ignore-build.sh`:
- `git describe --tags --exact-match HEAD` succeeds (because we just tagged HEAD) → exits 1 → BUILD
- Non-tagged commits → exits 0 → SKIP (you'll see them as "Canceled" in `vercel ls`)

Poll for Ready:

```bash
# Up to ~5 minutes; expected ~30-45s for our build
for i in {1..30}; do
  state=$(vercel ls frontdoor --prod 2>&1 | grep -m1 "● Ready\|Canceled\|Error\|Building")
  echo "[$i/30] $state"
  echo "$state" | grep -q "● Ready" && break
  sleep 10
done
```

Surface canceled deploys (= tag-gate working correctly for the latest few
main pushes). Halt if the new deploy isn't Ready after ~5 min — likely a
build error or stuck queue.

### 5. Smoke

Default smoke is read-only and fast (~2s):

```bash
# Marketing route (proxies to GH Pages)
curl -sSo /dev/null -w "  marketing: HTTP %{http_code} (%{size_download} bytes)\n" \
  https://frontdoor.barooah.io/

# /api/keys with bad input → 400 sanity (proves the route handler is alive)
curl -sS -X POST https://frontdoor.barooah.io/api/keys \
  -H 'content-type: application/json' \
  -d '{"email":"not-an-email"}' \
  -w "\n  /api/keys: HTTP %{http_code}\n" | tail -3
```

Optional extras (skip on smoke-only mode; ask user during full cycle):
- `./fd.sh prod cache refresh` — warm caches; verifies cron auth path
- `./fd.sh user list` — proves KV connectivity end-to-end (reads only)

Surface any non-2xx (or non-400 on the bad-input check) as smoke failure.

### 6. Release page

```bash
gh release create vX.Y.Z \
  --repo vedanta/frontdoor \
  --title "vX.Y.Z — <theme>" \
  --notes "<curated notes from gate 2>"
```

Print the release URL on success.

### 7. Report

End-of-pass summary:

```
🏷️  vX.Y.Z — live

  release page:   https://github.com/vedanta/frontdoor/releases/tag/vX.Y.Z
  production:     https://frontdoor.barooah.io/
  time-to-deploy: 38s

  tag history:
    v0.0.5 status bar redesign
    v0.0.6 auth-hardening sweep
    v0.0.7 fd.sh CLI ops surface complete
    vX.Y.Z <theme> ← just shipped
```

Plus a one-line cadence reflection: "this was the Nth release; M days since
previous tag" — helps user develop intuition about pace.

## `/fd-release status` (read-only)

Same survey card as step 1, then stop. No HITL, no mutations. Useful as a
"where are we?" check before deciding whether to actually release.

## `/fd-release smoke vX.Y.Z` (smoke re-run)

Same as step 5 but without any of the prior mutations. Useful when you
suspect prod broke since the last release and want to confirm. If smoke
fails, the skill prints the failing assertion + suggests `git log vX.Y.Z..main`
to see what changed.

## Conventions

### Semver in 0.0.x

| Bump  | When                                                                      |
|-------|---------------------------------------------------------------------------|
| Patch | Default — tooling, bug fixes, doc, small features (the vast majority)    |
| Minor | Real product milestones; e.g. a `batch:*` completing with user-facing value |
| Major | Skip until the 1.0 cut itself                                            |

Pre-1.0 semver is loose by design. Stay on patch cadence unless there's a
clear reason; see memory `release-cadence-patch.md` for the discipline.

### Tag-message shape (annotated)

```
vX.Y.Z — <theme>

<1-2 sentence summary of what this release does>

What shipped:

  #<issue> / PR #<num> — <title>
    - <bullet on the change>
    - <bullet>

  #<issue> / PR #<num> — <title>
    - ...

<optional: design principles captured, issue grooming, batch state>

Verification:
  - N unit tests (was M before)
  - E2E green
  - format / typecheck / lint / build all clean
```

Real examples to model from: any of v0.0.4 through v0.0.7's tag messages
(`git show v0.0.7` for the most recent).

### Release-page shape (Markdown)

```markdown
This release <one-line theme>.

## What shipped

### [#<issue>](URL) / [PR #<num>](URL) — <title>

<short prose explaining what + why>

[code/diff example if useful]

### ...

## <other section, e.g. "Repo hygiene", "Design principles captured">

...

## Verification

- N unit tests
- E2E green
- format / typecheck / lint / build all clean

**Full diff:** [vX.Y.(Z-1)...vX.Y.Z](compare URL)
```

Same examples; v0.0.7's release page is the most recent and richest.

### Cadence

Ad-hoc; no fixed schedule. The skill makes release cheap so cadence stays
organic. Reasonable triggers:
- A `batch:*` completing
- A bundle of 2-4 small commits hanging together
- A user-visible fix that warrants getting out promptly

Releasing per-commit is fine but noisy; releasing per-batch is the sweet
spot.

## Failure policy

| Failure                     | What to do                                                            |
|-----------------------------|-----------------------------------------------------------------------|
| Pre-flight (dirty git, missing CLI auth) | Halt with actionable error; don't tag                       |
| Bump-confirm aborted        | No state changes made; clean exit                                     |
| Notes-confirm aborted       | No state changes made; clean exit                                     |
| `git push` fails            | Halt; surface git error                                               |
| `vercel --prod --yes` fails | Halt; surface vercel error; tag is already pushed so re-running `vercel --prod --yes` is the recovery |
| Deploy stuck > 5 min        | Halt; print `vercel logs <deployment>` hint                          |
| Smoke fails                 | Halt; print which assertion failed; suggest `vercel logs` + don't make a release page (a failed release shouldn't be visible on GitHub) |
| `gh release create` fails   | Print error; deploy is already live — re-run just step 6 manually     |

## Known failure modes (historical context)

- **Tag-only push doesn't trigger Vercel.** Vercel webhooks fire on branch pushes, not tags. Always run `vercel --prod --yes` after pushing the tag. This is the most-forgotten step.
- **`vercel env pull` returns empty for CLI-pushed secrets.** Plaintext can't be retrieved after `vercel env add`. Workaround: save the secret locally when you push it (e.g., `.env.local`).
- **Squash-merge breaks `git branch --merged` detection.** Branch tips have different SHAs after squash. Use `gh pr list --head <branch> --state all` to confirm merge state instead.
- **package.json version drift.** The statusbar reads `package.json#version` and links to the matching GitHub Release. If you tag `vX.Y.Z` without bumping package.json to match, the link will 404 until the release page is created. Hence step 3 always bumps before tagging.

## What this skill DOES NOT do (v0.1)

- **Rollback** (promote a past Vercel deployment to current) — own follow-up; tracked in #79
- **Auto-detect bump from conventional-commit prefixes** — manual is fine for solo dev
- **Multi-deployment-target chains** (preview → staging → prod promotion) — single-env app
- **Slack / external notifications** on release — out of scope
- **Auto-edit release notes** — drafts them, user accepts/edits/aborts; never publishes without consent

## HITL gates summary

Exactly **2** confirm points in the full cycle:
1. **Version** — confirm `vX.Y.(Z+1)` or pick another (after survey)
2. **Notes** — accept the auto-draft or edit (after notes draft)

Everything else flows. The two gates protect the **public artifacts** (the
tag, the release page) — those are the things that are hard to undo.
