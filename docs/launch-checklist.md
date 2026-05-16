# Launch checklist

The MVP's launch criterion has two parts: the automated **E2E suite** (#27,
`e2e/*.spec.ts`) and this manual **visual + integration pass**. The suite
covers the contract — auth flow, dashboard structure, signup HTTP behavior.
This checklist covers what the suite can't assert: aesthetic fidelity,
real email delivery, real upstream behavior, and the things only a human can
judge.

Pair this with [`design/reference/index.html`](../design/reference/index.html)
open in a second tab — that's the visual bar.

---

## 1. Production environment (#26)

- [ ] Real domain pointed at the Vercel deployment (e.g. `frontdoor.app`)
- [ ] Resend sending domain verified — SPF + DKIM DNS records added
- [ ] `RESEND_FROM_EMAIL` set on Vercel (Production) to a verified-domain address (`noreply@frontdoor.app`)
- [ ] `NASA_API_KEY` set on Vercel (Production) — real key, not `DEMO_KEY` (DEMO_KEY rate-limits per IP and cron will exceed)
- [ ] `CRON_SECRET` set on Vercel (Production + Preview) — the same value Vercel cron will send
- [ ] `COOKIE_SECRET` set on Vercel (Production + Preview) — a fresh `openssl rand -hex 32`
- [ ] Upstash Redis (Vercel KV) provisioned and connected to Production
- [ ] Vercel Cron schedule visible in Project → Settings → Cron Jobs

## 2. Signup → email → bootstrap (the user's first impression)

- [ ] `curl -X POST https://<your-domain>/api/keys -H 'content-type: application/json' -d '{"email":"<your-real-email>"}'` → `202 { "status": "check your email" }`
- [ ] Email arrives within ~30s, from the verified domain address
- [ ] Email subject is "Your frontdoor key"; visible CTA "Open your dashboard"
- [ ] Click the link → lands at `/fd/{slug}` with the cookie set (no `?key=` in the URL — bootstrap stripped it)
- [ ] Reload the dashboard URL — still works without `?key=` (cookie persisted)
- [ ] Visit `/?key=<your-key>` again from a new browser → re-issues cookie; lands at same `/fd/{slug}`
- [ ] Repeat signup with the same email → same key returned in the email (idempotent)

## 3. Dashboard fidelity (side-by-side with `design/reference/index.html`)

Open the reference HTML in one tab and the live `/fd/{slug}` in another.

### Structural
- [ ] All 6 section dividers present, in order: **Arrive → Act → Reward → Read → Discover → Depart**
- [ ] Section titles match: Good Morning / Launch Pad / Today's View / The Feed / Rabbit Holes / Closing Thought
- [ ] Subtitles match the reference (dim mono text under each title)
- [ ] Header has the cyan-glow `FRONTDOOR ·` logo + tagline + ticking clock
- [ ] Search bar present above the grid; `/` from anywhere focuses it
- [ ] Status bar (uptime) is **NOT** present — cut from MVP per `docs/post-mvp.md` A3 (tracked as #30)

### Aesthetic
- [ ] Dark `#0a0e17` background; ambient radial gradients barely visible in corners
- [ ] Dot-grid texture present (fixed overlay, opacity 0.12)
- [ ] IBM Plex Sans + Mono loaded (self-hosted; no Google Fonts request in Network tab)
- [ ] Panel hover shows the gradient top-edge + soft border-lighten
- [ ] Panel icon chip color matches the panel's accent (cyan/blue/violet/rose/amber/green)
- [ ] No saturated reds, no notification badges, no autoplay

### Anti-goals (from `design/02-aesthetic-and-rendering.md`)
- [ ] **No spinners** on first paint
- [ ] **No layout shift** — opening DevTools → Performance tab → record a reload → CLS = 0 (or trivially close)
- [ ] **No client-side data fetch** in the Network tab during render — only the initial HTML
- [ ] Client JS bundle is single-digit KB (just Clock + SearchBar)
- [ ] No motion beyond clock tick + hover transitions

### Widgets render
- [ ] `text/stoic` shows a quote with `— Attribution`
- [ ] `text/quote` (ZenQuotes) renders body + attribution
- [ ] `text/onthisday` body has 2 events joined by `\n\n`; title has `· Month D` appended
- [ ] `weather` shows current temp + WMO icon + 3-day strip + sunrise/sunset
- [ ] `image/nasa-apod` shows today's APOD (or yesterday's, falling back on a video-day)
- [ ] `image/bing-daily` shows Bing's daily image with copyright text
- [ ] `headlines` shows interleaved rows with source labels + `via …` footer
- [ ] `links` rows have tag pills with the right colors; shortcut-key badges right-aligned
- [ ] `launcher` favicon grid renders; hovering shows tooltip `Name [key]`

## 4. Search behavior

- [ ] Press `/` from the header → search input focuses
- [ ] Type a real shortcut (e.g. `ny`, `cg`) + Enter → navigates to the matching URL
- [ ] Type `example.com` + Enter → navigates to `https://example.com`
- [ ] Type free text + Enter → opens Google search

## 5. Cron + revalidation (after at least one cron run)

- [ ] Vercel → Cron Jobs → most recent invocation succeeded (status 200)
- [ ] Inspect the response body — `warmed`, `failed`, `revalidated` populated
- [ ] `failed: []` (or only one or two flaky upstreams)
- [ ] Visit `/fd/{slug}` after cron — content updated to today's payload (NASA APOD, quote, etc.)
- [ ] PUT `/api/config` (via curl) for the test user → next visit shows the change ≤ a few seconds

## 6. Resilience (deliberate degradation)

These don't need to be reproduced precisely — knowing the failure modes degrade gracefully:

- [ ] If you wait long enough for an upstream to genuinely fail (or block one with hosts file): the widget shows "could not load" — the page still paints
- [ ] If KV is empty for a widget after cron: page does its lazy fetch; first paint may be slow but still renders
- [ ] If `RESEND_API_KEY` is unset on Vercel: `POST /api/keys` returns 500 with a clear error in logs

## 7. Privacy / safety smoke

- [ ] No API key appears in any HTTP response body, log line, or `Referer` header
- [ ] `/?key=...` URL is stripped immediately on bootstrap (302); browser history shows the clean `/fd/{slug}` afterward
- [ ] Session cookie is `httpOnly` + `Secure` (in prod) + `sameSite=lax`
- [ ] Random `/fd/<other-slug>` while authenticated → redirected to own slug (not 404, not allowed)

---

When every box is checked: **the MVP is done.**
