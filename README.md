# 🌊 Demand River

### Type a keyword. See the questions the market is actually asking — as glowing rivers of demand.

![Live demo](https://img.shields.io/badge/▶%20Live-Demo-05ffa1?style=for-the-badge)
![Cloudflare Worker](https://img.shields.io/badge/edge-Cloudflare%20Worker-F38020?logo=cloudflare&logoColor=white)
![DataForSEO](https://img.shields.io/badge/data-DataForSEO-1a73e8)
![No accounts](https://img.shields.io/badge/no%20login-no%20storage-64748b)

Enter a seed keyword. Demand River pulls up to **1,000 real question keywords**
from DataForSEO, groups them by question word — *how, what, is, can, should, why,
which, who, when, where, are* — and renders each group as a **glowing stream whose
width is its total monthly search volume**. The widest stream shows where demand
runs deepest.

### 👉 **[Open the live demo →](https://growthwithjoseph-bot.github.io/demand-river/)**

---

## 💡 Why it matters (the business value)

Keyword tools hand you a **spreadsheet of 1,000 rows**. Nobody reads row 400.
Demand River turns that same data into **one glance** that answers the question
marketers and founders actually have:

> *"When people think about my topic — what are they trying to figure out, and where is the demand biggest?"*

| The problem 😵‍💫 | What Demand River gives you ✅ |
|---|---|
| A 1,000-row keyword export nobody reads | One picture — the shape of demand in seconds |
| "What content should we make?" — guesswork | The widest streams = the questions worth answering first |
| Question research scattered across tools | Every *how/what/is/can/why…* grouped and sized by real volume |
| Hard to share insight with the team/client | A shareable image — export the river as a PNG |

**Read it like this:**
- 🌊 **A wide stream** → huge search demand for that *type* of question → a content goldmine.
- 🏜️ **A dry stream** → nobody asks that way → a gap, or a signal your topic isn't debated there.
- 🔵 **Pearls inside a stream** → the top individual keywords, sized by volume — your headlines.

**Who it's for:** ✍️ content & SEO teams · 🚀 founders validating demand · 📣
marketers hunting content angles · 🏢 agencies pitching a keyword strategy that
*looks* like insight, not a CSV.

---

## ✨ What you get

- 🌊 **The demand river** — question groups as proportional, glowing streams.
- 🫧 **Pearls & tooltips** — top keywords per stream with volume, growth %, CPC, competition.
- 📋 **Click a stream** → a side panel with the full keyword list + one-click **CSV copy**.
- 📈 **Growth signal** — 12-month trend baked into every keyword (▲/▼ %).
- 🖼️ **Export to PNG** — share the river as an image (the viral loop).
- 🔒 **No accounts, no database** — live API calls only; your key stays server-side.

---

## ⚙️ How it works

```
Browser (this SPA)  ──POST /api/river──▶  Cloudflare Worker  ──▶  DataForSEO Labs
   renders the river        (holds the API key, rate-limits, shapes JSON)     (live)
```

- **Frontend:** one static HTML/JS page — no build, no framework. Renders the river as inline SVG.
- **Worker:** a stateless Cloudflare Worker that keeps your DataForSEO credentials **off the browser**, rate-limits by IP, and returns compact JSON grouped by question word.
- **Data:** DataForSEO Labs `keyword_suggestions` (one live call, regex-filtered to questions).

> **Demo mode** (what the public site runs): no key, no cost — it renders a bundled
> sample river for "hubspot" so you can see the whole experience instantly.

---

## 🚀 Run / deploy

The live demo works with zero setup. To make it fetch **real** data, deploy the
Worker with your DataForSEO key and point the frontend at it — full steps in
**[DEPLOY.md](DEPLOY.md)**. TL;DR:

```bash
cd worker
wrangler login
wrangler secret put DATAFORSEO_LOGIN
wrangler secret put DATAFORSEO_PASSWORD
wrangler deploy                     # -> copy the URL into app.js (API_BASE)
```

Run the frontend locally: `python3 -m http.server 8080` → http://localhost:8080

---

## 💰 Cost (there's no free lunch on live SEO data)

| Item | Value |
|---|---|
| Per search (1 call, ≤ 1,000 keywords) | **≤ $0.132** |
| 1,000 searches / month | ≤ $132 |
| Halve it (set `LIMIT = 500`) | ≈ $0.072 / search |

Controls live in `worker/worker.js`: per-IP **rate limit**, the **`LIMIT`** knob,
and a 25s timeout. No storage by design (a 24h edge cache can be added later as a
5–10× cost lever).

---

## 🧩 Part of a small toolkit for understanding markets

- 🌊 **Demand River** *(this repo)* — what questions the market asks, sized by real volume
- 🕸️ **[Topic Coverage](https://github.com/growthwithjoseph-bot/topic-coverage)** — who covers which topics across a site, and who covers them more
- 🔤 **[Homepage Language Match](https://github.com/growthwithjoseph-bot/homepage-language-match)** — is your messaging differentiated, or an echo?
- 💬 **[Anatomy of a Brand Conversation](https://growthwithjoseph-bot.github.io/hubspot-brand-conversation/)** — how real people talk about a brand

---

<sub>Made with Trendible · powered by DataForSEO. Demo data is illustrative.</sub>
