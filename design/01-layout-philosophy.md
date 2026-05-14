# Layout philosophy — the real IP

frontdoor's layout is **not** organized by widget type. It is organized by the
**psychology of how a person consumes information at the start of a session.**

The page is read top to bottom as a short arc: you arrive, you act, you get a small
reward, you read, you discover, you depart. Each section has an emotional job. Widgets
are slotted into sections by *what they do to the reader*, not by what kind of widget
they are.

## The arc — 6 sections

| # | Section | Emotional job | Why it's here |
|---|---------|---------------|---------------|
| 1 | **Arrive** | Grounding, inspiration, temporal anchor | Calm the nervous system before the firehose. Stoicism, a quote, a historical anchor, a word — slow, human, no urgency. |
| 2 | **Act** | Tools & time-sensitive briefings | Now that you're grounded, *do*. Morning news links, weather, top headlines, your app launcher. This is the highest-utility band. |
| 3 | **Visual Reward** | A beauty break after action | A deliberate exhale. NASA APOD, Bing's daily photo. Big, quiet, no text to parse. Rewards getting through the action band. |
| 4 | **Read** | Daily & weekly depth | Slower reading — curated daily/weekly link lists, business & economics headlines. You've earned the depth. |
| 5 | **Discover** | Exploration & knowledge | The rabbit-hole band — monthly link lists, Wikipedia featured article, science & research feeds. Lowest urgency, highest curiosity. |
| 6 | **Depart** | Leave with calm & beauty | Close the loop the way it opened. A poem, a Wikimedia photo of the day. The page should end softly, not on a list. |

## Ordering rules (encode these in the rewrite)

1. **Sections are ordered and fixed.** Arrive → Act → Reward → Read → Discover →
   Depart. This order is the product. Don't let users reorder sections; let them
   reorder *widgets within* a section.
2. **Urgency decreases down the page.** The top is time-sensitive (weather, news);
   the bottom is timeless (poem, photo). Never put a breaking-news widget below the
   fold.
3. **Text and image alternate as texture.** Heavy-text sections (Arrive, Read,
   Discover) are broken up by image-only sections (Reward, Depart). Don't stack two
   image sections or three text-heavy sections without relief.
4. **The launcher is the anchor of Act.** It's the single most-used widget; it lives
   in the action band and spans full width.
5. **Open and close rhyme.** Arrive and Depart are both slow, human, low-information.
   The page is a round trip.

## Current section → widget mapping (reference layout)

This is the v1 dashboard. In the rewrite it becomes the **default config** a new user
gets, but the section structure itself is the fixed frame.

```
ARRIVE   (subtitle: "pause before you begin")
  Stoic              text/stoic        violet
  Quote of the Day   text/quote        amber
  On This Day        text/onthisday    cyan
  Word of the Day    text/word         green

ACT      (subtitle: tools & time-sensitive briefings)
  Morning            links             amber   (news/digest/markets bookmarks)
  Weather            weather           blue
  Top Stories        headlines         amber   (NYT, BBC, NPR)
  Tech & AI          headlines         violet  (Ars, Verge, TC, Google AI, OpenAI, HF)
  Apps               launcher          cyan    span:4, 12-col icon grid

REWARD   (beauty break after action)
  NASA APOD          image/nasa-apod   blue    span:2
  Bing Daily         image/bing-daily  cyan    span:2

READ     (daily & weekly depth)
  Daily              links             cyan    (tech/AI/finance bookmarks)
  Weekly             links             blue    (long reads, newsletters)
  Economics          headlines         ...     (econ RSS)
  Business           headlines         ...     (biz RSS)

DISCOVER (monthly exploration & knowledge)
  Monthly            links             ...     (deep-dive bookmarks)
  Wikipedia Featured text/wikipedia    blue
  Science            headlines         ...     (science RSS)
  Research           headlines         ...     (research RSS)

DEPART   (leave with calm & beauty)
  Poem               text/poem         rose    span:2
  Wikimedia Photo    image/wikimedia   green   span:2
```

## Grid

- 4-column grid. Widgets default to `span: 1`.
- `span: 2/3/4` widens a widget. Images and the poem typically span 2; the launcher
  spans 4.
- Section dividers always span the full width (4).
- Responsive: collapse to 2 columns under 1100px, 1 column under 600px. `span` values
  clamp down accordingly (see `theme.css` media queries).
