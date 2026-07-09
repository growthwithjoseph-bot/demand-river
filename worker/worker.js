/* Demand River — Cloudflare Worker (stateless proxy to DataForSEO).
 *
 * Holds DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD as secrets so the key never
 * reaches the browser. POST /api/river { seed, country } -> compact JSON grouped
 * by question word. See ../README.md and ../DEPLOY.md.
 */

const MODIFIERS = ["how", "what", "is", "are", "can", "should", "which", "who", "why", "when", "where"];
const REGEX = "^(are|is|can|should|how|where|what|when|which|who|why)\\b";
const DFS_URL = "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live";
const LIMIT = 1000;                 // set to 500 to halve variable cost (see README §cost)
const RATE = { max: 5, windowMs: 10 * 60 * 1000 }; // 5 searches / 10 min per IP (best-effort)
const TIMEOUT_MS = 25000;

// Best-effort in-memory rate limiter (per isolate). For strict limits across all
// edges, back this with a Durable Object / KV — see README.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < RATE.windowMs);
  if (arr.length >= RATE.max) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear(); // cheap memory cap
  return false;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...CORS } });

function growthPct(monthly) {
  if (!Array.isArray(monthly) || monthly.length < 6) return 0;
  const v = monthly.map(m => m.search_volume || 0);
  const first = v.slice(0, 3), last = v.slice(-3);
  const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
  const f = avg(first);
  if (!f) return 0;
  return Math.round(((avg(last) - f) / f) * 1000) / 10;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true });
    if (url.pathname !== "/api/river" || request.method !== "POST")
      return json({ error: "not found" }, 404);

    const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
    if (rateLimited(ip)) return json({ error: "rate_limited" }, 429);

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad_request" }, 400); }
    const seed = String(body.seed || "").trim().slice(0, 80);
    const location_code = Number(body.country) || 2840;
    if (!seed) return json({ error: "seed_required" }, 400);

    if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD)
      return json({ error: "server_not_configured" }, 500);
    const auth = "Basic " + btoa(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`);

    const payload = [{
      keyword: seed,
      location_code,
      language_code: "en",
      limit: LIMIT,
      include_seed_keyword: false,
      include_serp_info: false,
      include_clickstream_data: false,
      order_by: ["keyword_info.search_volume,desc"],
      filters: [["keyword", "regex", REGEX]],
    }];

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let dfs;
    try {
      const resp = await fetch(DFS_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: auth },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      dfs = await resp.json();
    } catch {
      return json({ error: "upstream_timeout" }, 504);
    } finally { clearTimeout(timer); }

    const items = dfs?.tasks?.[0]?.result?.[0]?.items || [];

    // group by first word; always include all 11 modifiers (empty allowed)
    const groups = Object.fromEntries(MODIFIERS.map(m => [m, { modifier: m, count: 0, volume: 0, keywords: [] }]));
    for (const it of items) {
      const kw = it.keyword || "";
      const mod = kw.split(/\s+/)[0].toLowerCase();
      if (!groups[mod]) continue;
      const info = it.keyword_info || {};
      const v = info.search_volume || 0;
      groups[mod].count += 1;
      groups[mod].volume += v;
      groups[mod].keywords.push({
        k: kw, v,
        g: growthPct(info.monthly_searches),
        cpc: Math.round((info.cpc || 0) * 100) / 100,
        comp: (info.competition_level || "").toUpperCase() || null,
      });
    }
    const groupList = MODIFIERS.map(m => {
      const g = groups[m];
      g.keywords.sort((a, b) => b.v - a.v);
      return g;
    }).sort((a, b) => b.volume - a.volume);

    return json({
      seed,
      country: location_code,
      totalKeywords: items.length,
      totalVolume: groupList.reduce((s, g) => s + g.volume, 0),
      groups: groupList,
    });
  },
};
