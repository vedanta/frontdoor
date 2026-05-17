---
name: fd-groom
description: Issue grooming pass on the frontdoor backlog — survey open issues, triage (priority + batch + milestone + body staleness + split decisions), apply labels/milestones/body rewrites, verify final grouped state. Invoke as `/fd-groom`, `/fd-groom status`, or `/fd-groom #N [#M...]`. Complements `/fd-build` (which ships code).
---

# /fd-groom — the frontdoor backlog grooming playbook

You are tidying GitHub issues on `vedanta/frontdoor` — applying priorities, batching, splitting umbrella issues, rewriting stale bodies, and surfacing label hygiene. This skill is the playbook; judgment (priority assignment, batch grouping, split-vs-keep) stays live per pass.

Complementary to `/fd-build`: build ships code; groom keeps the backlog navigable. Use `/fd-groom` periodically (or before a `/fd-build` cycle to pick the right next batch).

## Invocation shapes

- **`/fd-groom`** — full sweep: survey → triage → apply → verify.
- **`/fd-groom status`** — survey only, no changes (read-only). Useful as a "where are we?" check before deciding to do real work.
- **`/fd-groom #N [#M...]`** — focused pass on specific issues. Skips the full survey; goes straight to per-issue triage + apply for the named ones.

## The pass (one full cycle)

### 1. Survey

```bash
gh issue list --repo vedanta/frontdoor --state open --json number,title,milestone,labels,createdAt,updatedAt \
  --jq 'sort_by(.milestone.title // "zzz_no_milestone") | .[] | "
#\(.number) [\(.milestone.title // "NO-MILESTONE")] \(.title)
  labels:  \(.labels | map(.name) | join(", "))
  created: \(.createdAt[0:10])
  updated: \(.updatedAt[0:10])"'
```

Spot-check:
- **Unlabeled / unmilestoned issues** — usually idea-logs typed mid-session; need triage attention.
- **Missing priority** (no `P0`/`P1`/`P2`/`P3`) — needs one.
- **Missing batch** (no `batch:*`) — needs one if it groups with other work; one-issue batches OK for epics.
- **Title vs scope drift** — if the title still says "v0.2" but v0.2 shipped, the body needs rewriting.
- **Stale labels** — note any labels with zero open issues; offer to delete at end of pass.

### 2. Triage per issue

For each open issue (or filtered set), decide:

#### Priority — apply exactly one of P0/P1/P2/P3

| Label | When |
|-------|------|
| `P0` | Blocking — drop everything (production down, security, critical regression) |
| `P1` | Urgent — next up (key feature gap, customer-blocking) |
| `P2` | Normal — schedule in (useful improvement, scoped epic) |
| `P3` | Idea / watch — no commitment (UI polish, deprecation tracking, "what if") |

If priority not set, propose one based on impact/urgency. Don't downgrade something already at P0/P1 without surfacing why.

#### Batch — does this naturally execute with other issues?

- If a `batch:*` label already covers its area, apply it.
- If 2+ issues form a logical execution unit (related work, shared scope, dependency chain), propose a new `batch:NAME` label.
- Single-issue batches are OK for epics with internal multi-action checklists (e.g. `batch:fd-cli` covers the v0.3 multi-command issue).
- All batch labels use color `#1D76DB` (medium blue) — the name distinguishes.

#### Milestone

- `MVP` — only for items that must ship for the MVP launch (rarely added post-launch).
- `Post-MVP` — default for new ideas / improvements / watch issues.
- `Production 1.0` — items needed for the "v1 polish" pass; usually externally-blocked or polish-tier.

If unsure, default to `Post-MVP`.

#### Body staleness — needs rewrite?

Yes if:
- Work has shipped partially since body was written (checklist items are now done).
- Title scope has moved (e.g., the issue tracked v0.2 but v0.2 shipped — title should reflect v0.3 now).
- Original body was an idea-log dump, not a properly scoped issue.

If yes: rewrite using the **body-rewrite shape** (see Conventions).

#### Split decision — umbrella → N issues?

Yes if:
- Body lists multiple semi-independent concerns ("these are probably three issues").
- Scope spans unrelated areas (UI + data layer + ops in one issue).
- Closing the issue would require N independent PRs.

If yes: see **splitting umbrella issues** in Conventions.

#### Close decision

Close (with a pointer comment) if:
- Superseded by a more recent issue or PR.
- All split children have landed.
- Idea is no longer relevant.
- Done but never closed (audit catch).

### 3. Apply (the mechanical layer)

Standard `gh` ceremony.

**Add labels:**
```bash
gh issue edit N --repo vedanta/frontdoor --add-label "P2" --add-label "batch:foo"
```

**Move milestone:**
```bash
gh issue edit N --repo vedanta/frontdoor --milestone "Post-MVP"
```

**Body rewrite (multi-line heredoc):**
```bash
gh issue edit N --repo vedanta/frontdoor --title "New title" --body "$(cat <<'EOF'
**What:** ...
...
EOF
)"
```

**Close with pointer:**
```bash
gh issue close N --repo vedanta/frontdoor \
  --comment "Superseded by #M. See $URL for the new scope."
```

**Split umbrella → N issues:**
```bash
NEW1=$(gh issue create --repo vedanta/frontdoor --title "..." --milestone "Post-MVP" \
  --label "post-mvp" --label "enhancement" --label "P3" --body "..." 2>&1 | tail -1)
NEW2=$(gh issue create ... 2>&1 | tail -1)
NEW3=$(gh issue create ... 2>&1 | tail -1)
gh issue comment N --repo vedanta/frontdoor --body "Split into 3 individually-scopable issues:
- $NEW1 — ...
- $NEW2 — ...
- $NEW3 — ...
Closing as superseded."
gh issue close N --repo vedanta/frontdoor
```

**Label creation (one-time setup; idempotent — `gh label create` errors if exists, which is fine):**
```bash
# Priority labels — colors are conventional
gh label create "P0" --color "B60205" --description "Blocking — drop everything"
gh label create "P1" --color "D93F0B" --description "Urgent — next up"
gh label create "P2" --color "FBCA04" --description "Normal — schedule in"
gh label create "P3" --color "C5DEF5" --description "Idea / watch — no commitment"

# Batch labels — all same color, name distinguishes
gh label create "batch:NAME" --color "1D76DB" --description "What's in this batch"
```

### 4. Verify

```bash
# Final state grouped by batch + priority
for batch in $(gh label list --repo vedanta/frontdoor --json name --jq '.[].name | select(startswith("batch:"))'); do
  echo ""
  echo "── $batch ──"
  gh issue list --repo vedanta/frontdoor --state open --label "$batch" \
    --json number,title,labels \
    --jq '.[] | "  #\(.number) [\(.labels | map(select(.name | test("^P[0-3]"))) | map(.name) | first // "—")] \(.title)"'
done

# Surface orphans (no batch label)
echo ""
echo "── ORPHANS (no batch) ──"
gh issue list --repo vedanta/frontdoor --state open --json number,title,labels \
  --jq '.[] | select((.labels | map(.name) | any(. | startswith("batch:"))) | not) | "  #\(.number) [\(.labels | map(select(.name | test("^P[0-3]"))) | map(.name) | first // "—")] \(.title)"'
```

The GitHub search index has a brief lag (1-3s) after label changes; if the by-label query shows fewer issues than you expect, `sleep 3` and re-query.

## Conventions

### Priority labels

| Label | Color | Description |
|-------|-------|-------------|
| `P0` | `#B60205` (red) | Blocking — drop everything |
| `P1` | `#D93F0B` (orange) | Urgent — next up |
| `P2` | `#FBCA04` (yellow) | Normal — schedule in |
| `P3` | `#C5DEF5` (light blue) | Idea / watch — no commitment |

Exactly one per issue. Add at triage; only escalate/downgrade with stated reason.

### Batch labels

- Always prefixed `batch:` (queryable via `label:batch:NAME`).
- Color: `#1D76DB` (medium blue) — uniform across all batch labels.
- Description tells the reader what's in the batch.
- Created on-demand during grooming; existing batches reused before creating new ones.
- Single-issue batches OK when the issue is an epic with internal multi-action scope.

### Body-rewrite shape

Use this template when updating a stale body where work has shipped or scope has moved:

```markdown
**What:** <current focus>

> _Original scope of this issue was wider: <X> and <Y> and <Z>. The <X> and <Y> halves shipped under <milestone or PRs>. This issue now tracks the <Z> half, deferred to <milestone> because <reason>._

## What shipped (no longer in scope here)

- [x] **<thing>** — <one-line>. Commit `<sha>` / PR `#<N>`.
- [x] ...

## What's left

- [ ] **<thing>** — <what it should do>
- [ ] ...

## Conventions / Out of scope / Notes
(as appropriate — usually reuse from the original body)

---
_Body updated <DATE> — original framing was <old title or scope>; current state above._
```

### Splitting umbrella issues

When body lists multiple semi-independent things:

1. **Create N child issues**, each with proper body (What/Why/Scope/Out-of-scope/Notes).
2. **Each child gets**: milestone, labels (post-mvp + enhancement + priority + batch if applicable).
3. **Cross-link**: each child includes a "Split from #N. See sibling issues: …" note.
4. **Dependencies between children** noted in their bodies (e.g. "Depends on #66 landing first").
5. **Comment on the umbrella** with all child URLs.
6. **Close umbrella** as superseded.

### Label hygiene (periodic audit)

```bash
# Find labels with zero open AND zero closed issues
for lbl in $(gh label list --repo vedanta/frontdoor --json name --jq '.[].name'); do
  count=$(gh issue list --repo vedanta/frontdoor --state all --label "$lbl" --json number --jq 'length')
  [[ "$count" == "0" ]] && echo "  $lbl — unused"
done
```

Known MVP-era artifacts that may be unused now: `phase-0`, `track-a`, `track-b`, `track-c`, `launch`. Offer to delete at end of pass:

```bash
gh label delete phase-0 track-a track-b track-c launch --repo vedanta/frontdoor --yes
```

Don't delete `wontfix` / `duplicate` / `invalid` / `enhancement` / `bug` / `documentation` / `question` / `help` / `good` — GitHub-default labels, low cost to keep.

## Output format

End of a grooming pass should print a clean grouped summary like:

```
batch:ui-freshness  →  #65 scroll progress                  [P3]
                      #66 per-widget refresh time            [P3]
                      #67 status-bar oldest-refresh          [P3]  ← depends on #66

batch:fd-cli        →  #58 fd.sh v0.3                        [P2]

batch:infra-hygiene →  #61 CI guard: GH Pages cname          [P3]
                      #62 Next 16 middleware → proxy watch   [P3]

batch:resend        →  #26 verified custom sender            [P2]  ⚠ blocked
```

Plus a short "what changed in this pass" section: labels added, milestones moved, issues split, issues closed.

## Out of scope (for this skill)

- Bulk operations across many issues (do case-by-case to preserve judgment).
- Cross-repo grooming — frontdoor only.
- Creating issues outside grooming context (use `/fd-build`-style workflows or normal `gh issue create` for new work that emerges from coding).
- Comment moderation, locking, hiding — out of scope.

## Failure policy

- **`gh` rate-limit**: pause briefly, retry. If sustained, surface to user.
- **Label create on existing**: idempotent — error is fine, continue.
- **Issue edit permission error**: surface to user; don't retry silently.
- **Search index lag** after label changes: `sleep 3` before re-querying by label.

## What this skill DOES NOT do

- Decide priorities or batch groupings without surfacing reasoning — judgment stays live per pass.
- Auto-close issues without a pointer comment.
- Bulk-rewrite bodies without user confirmation on the new shape.
- Delete labels without confirming first.
- Touch closed issues (read-only on them).
