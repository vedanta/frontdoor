---
name: fd-build
description: Walk the next ready MVP issue from `MVP` milestone end-to-end (branch → implement + tests → PR `Fixes #N` → HITL → merge → cleanup → loop). Sequential, in-chat, PR-per-issue. Invoke as `/fd-build`, `/fd-build status`, `/fd-build #N`, or `/fd-build resume`.
---

# /fd-build — the frontdoor MVP orchestrator

You are walking GitHub issues on the `MVP` milestone of `vedanta/frontdoor` to
completion, one at a time. This skill is the playbook. The design behind it is in
[`docs/build-skill.md`](../../docs/build-skill.md); read it once if you need context,
then operate from this file.

## Invocation shapes

- **`/fd-build`** — pick the next ready issue and run the cycle below.
- **`/fd-build status`** — print a summary of closed / in-flight / blocked / ready issues; do nothing else.
- **`/fd-build #N`** — work issue `N` explicitly, even if deps aren't satisfied (treat with caution; ask for confirmation).
- **`/fd-build resume`** — if a previous run was interrupted, find any branch matching `feat/<N>-*` with an open `in-progress` issue and resume the cycle for it.

## The cycle (one issue end-to-end)

### 1. Survey

- `gh issue list --repo vedanta/frontdoor --milestone MVP --state open --limit 40 --json number,title,labels,body`
- For each open issue, parse the `**Depends on:**` line in its body and record the dep set.
- A **ready** issue is: open, NOT `in-progress`, NOT `blocked`, and every dep is closed (`gh issue view N --json state`).
- Pick the lowest-numbered ready issue (deterministic ordering).

If there's an open issue with `in-progress` already (i.e., a previous run is mid-flight), surface it and ask whether to resume that one before starting a new one.

### 2. Confirm before starting

Print a short header:

```
Next ready: #N — <title>
Deliverable: <first line of deliverable>
Depends on: #X (closed), #Y (closed)
Branch will be: feat/N-<slug>
```

Ask: **"Proceed?"** Wait for yes/no.

### 3. Apply `in-progress` label, branch

- `gh issue edit N --repo vedanta/frontdoor --add-label in-progress`
- `git checkout main && git pull --ff-only`
- `git checkout -b feat/N-<slug>` where slug = lowercased issue title, alphanumerics + hyphens only, truncated to ~40 chars.

### 4. Load context for the implementer

Read into your working context (don't re-read what's already loaded):

- The full issue body (you already have it from step 1).
- `docs/mvp.md`, `docs/architecture.md`, the **Testing** section of `docs/implementation-plan.md`.
- Conditionally based on what the issue touches:
  - **Widget issues (#11–#15):** `design/03-widget-specs.md`, `design/theme.css`, `design/reference/index.html` (the visual fidelity target — open it via Read and locate the matching panel).
  - **Data layer (#5–#9):** `design/04-data-sources.md`.
  - **Auth / signup (#19, #20):** `docs/architecture.md` §3 + §4 in detail.
  - **Config (#3, #22):** `design/05-config-schema.md`.
  - **Page / ISR (#23, #25):** `docs/architecture.md` §3.

### 5. Implement

Write the code that delivers the issue. Follow the conventions below — they are not negotiable.

### 6. Tests for this issue

Per `docs/implementation-plan.md` → Testing, add tests appropriate to the issue type:

- **Data fetchers:** Vitest + MSW handler in `src/mocks/handlers.ts`; cover parsing, fallbacks, cache-key shape.
- **Schema:** Vitest — accept the default, reject malformed shapes, detect key collisions.
- **Auth / signup / config endpoints:** Vitest — cookie sign/verify, slug-mismatch reject, signup idempotency, Zod-rejected PUTs.
- **Widgets:** light render tests only. No snapshots.
- **E2E (#27 specifically):** Playwright.

### 7. Local verification (all must pass)

```
pnpm format          # auto-format; should be idempotent on subsequent runs
pnpm format:check    # must be clean
pnpm typecheck       # silent
pnpm lint            # silent
pnpm test            # all green
pnpm build           # ok
```

If anything fails, **stop**. Surface the error. Ask for guidance — don't push broken code.

For issues touching anything visible at runtime, also run `pnpm test:e2e` if applicable.

**Re-run `pnpm format` after *any* edit, no matter how small.** Every `Edit`/`Write`
between verification and `git push` invalidates the previous check. PRs #50 and #56 both
failed CI on `format:check` because a small follow-up edit (one paragraph reflow, one path
correction) was made after step 7 and the format gate was skipped on the assumption that
"the real work was already verified." Treat any modification — including ones that look
like they couldn't possibly affect formatting (HTML attribute change, comment tweak,
prettier-irrelevant file) — as resetting the gate. The cost is one shell command; the cost
of skipping it is a red CI run and a follow-up commit. Same applies in step 10b.

### 8. Commit, push, open PR

Commit message:

```
#N <issue title>

<short bullet list of what changed and why>

<one line on verification — what passes locally>

Fixes #N

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

(Use `git -c commit.gpgsign=false commit -m "$(cat <<'EOF' ... EOF)"` to avoid GPG prompts.)

Push: `git push -u origin feat/N-<slug>`

Open PR via `gh pr create --repo vedanta/frontdoor --base main --head feat/N-<slug> --title "#N <title>" --body-file - <<'EOF' ... EOF`.

PR body shape:

```
Fixes #N

## What
<short description>

## Notes for reviewers
<anything non-obvious — convention shifts, native install scripts, etc.>

## Local verification
<copy the relevant pnpm output lines>
```

### 9. HITL — pause

Print:

```
PR #M opened: <url>
Awaiting your review/merge.
```

Stop. Wait for the user signal.

### 10. On "merged"

- `git checkout main && git pull --ff-only`
- `git branch -d feat/N-<slug>`
- Verify the issue is closed (`gh issue view N --json state`).
- If this was the last issue of a phase, post a one-paragraph phase summary (how many issues closed, anything noteworthy) before looping.
- Loop back to step 1 — pick the next ready issue.

### 10b. On "changes: <description>"

- Apply the changes on the same branch.
- Re-run local verification (step 7) — **including `pnpm format`**, even for a
  one-character edit. See the note in step 7.
- Push to the same branch (CI re-runs, PR updates).
- Re-pause at step 9.

## Conventions (non-negotiable)

- **Branch:** `feat/N-<slug>` only.
- **Commit subject:** `#N <exact issue title>`.
- **PR body:** ends with `Fixes #N`.
- **Never reformat `design/`** — it's in `.prettierignore`; do not remove that rule.
- **pnpm 11 + native install scripts:** when adding a dep with postinstall (e.g. `sharp`, `msw`, `unrs-resolver`), also add it to `pnpm-workspace.yaml`:

  ```yaml
  allowBuilds:
    <name>: true
  ```

  Without this, every later `pnpm <script>` aborts because the pre-run check re-invokes `pnpm install` which fails on ignored builds.
- **Test files:** co-located `foo.test.ts` next to `foo.ts`; E2E in `e2e/*.spec.ts`.
- **MSW:** every upstream HTTP call gets a handler in `src/mocks/handlers.ts`. `onUnhandledRequest: 'error'` is enforced — real network in tests will fail.
- **Folder layout** (from #1):
  ```
  src/app/                # routes
  src/components/         # shared UI
  src/components/widgets/ # 7 widget types
  src/lib/                # utilities
  src/lib/data/           # fetchers
  src/lib/auth/           # signed cookie, slug routing
  src/lib/kv/             # typed KV client
  src/styles/             # theme.css lands here
  ```
- **Secrets:** never commit `.env.local`. Add new secrets to `.env.example` with a provenance comment.

## Failure policy

- **Local check fails (step 7):** halt and ask.
- **CI fails on PR:** pull the failing job log (`gh pr checks <PR>` + `gh run view`), propose a fix, push on approval.
- **Two consecutive cycles on the same issue fail:** add `blocked` label, post a failure-summary comment, halt the whole run. Resuming requires either an issue-body update or the `blocked` label removed manually.

Halt > skip. A failure is a signal that a convention or spec needs work; don't paper over it by moving on.

## What this skill DOES NOT do

- Spawn parallel agents (v0.2)
- Auto-merge on green CI (v0.3)
- Edit issue bodies (only adds/removes labels)
- Work non-MVP-milestone issues
- Run unattended for long stretches — every issue has its HITL gate
