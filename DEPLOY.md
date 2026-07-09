# Deploying Demand River

Two pieces: a **static frontend** (already live on GitHub Pages in demo mode) and
a **Cloudflare Worker** that holds your DataForSEO key and makes the live calls.

## 1. Deploy the Worker (live data)

**Prereqs:** a [Cloudflare account](https://dash.cloudflare.com/sign-up) (free) and a
[DataForSEO account](https://dataforseo.com/) (paid per call — see cost table in the README).

```bash
npm install -g wrangler        # Cloudflare's CLI
cd worker
wrangler login                 # opens a browser to authorise

# store your DataForSEO Basic-auth credentials as secrets (never committed)
wrangler secret put DATAFORSEO_LOGIN       # paste your login/email
wrangler secret put DATAFORSEO_PASSWORD    # paste your password/API key

wrangler deploy
```

`wrangler deploy` prints a URL like:
`https://demand-river.<your-subdomain>.workers.dev`

Test it:
```bash
curl -X POST https://demand-river.<your-subdomain>.workers.dev/api/river \
  -H 'content-type: application/json' \
  -d '{"seed":"hubspot","country":2840}'
```

## 2. Point the frontend at your Worker

In [`app.js`](app.js), set:
```js
const API_BASE = "https://demand-river.<your-subdomain>.workers.dev";
```
Commit + push. GitHub Pages redeploys automatically, and the site now makes **live**
searches instead of showing the demo river.

> Leave `API_BASE = ""` to keep the public site in safe **demo mode** (sample data,
> zero API cost) and only run live locally.

## 3. (Optional) Run the frontend locally
It's plain static files — any static server works:
```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

## Cost & safety knobs (all in `worker/worker.js`)
- `LIMIT` — `1000` (≤ $0.132/search) or `500` (≈ $0.072/search).
- `RATE` — per-IP limit (default 5 searches / 10 min). *Note:* it's best-effort
  in-memory; for strict global limits, back it with a Durable Object or KV.
- The Worker never returns raw DataForSEO errors to the browser.
