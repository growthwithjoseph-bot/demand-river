/* Demand River — Cloudflare Worker (stateless proxy to DataForSEO).
 *
 * Holds DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD as secrets so the key never
 * reaches the browser. POST /api/river { seed, country } -> compact JSON grouped
 * by question word. Language-aware: each country maps to its language + that
 * language's question words. See ../README.md and ../DEPLOY.md.
 */

const DFS_URL = "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live";
const LIMIT = 1000;                 // set to 500 to halve variable cost
const RATE = { max: 5, windowMs: 10 * 60 * 1000 };
const TIMEOUT_MS = 25000;

// canonical question types (colours in the frontend key off these)
const CANON = ["how", "what", "is", "are", "can", "should", "which", "who", "why", "when", "where"];

// location_code -> language_code
const LANG_BY_LOC = {
  2840: "en", 2826: "en", 2124: "en", 2036: "en", // US, UK, CA, AU
  2276: "de", 2250: "fr", 2724: "es", 2380: "it", // DE, FR, ES, IT
};

// per-language question words, canonical type -> [localised words] (first = display label)
const QWORDS = {
  en: { how: ["how"], what: ["what"], is: ["is"], are: ["are"], can: ["can"], should: ["should"], which: ["which"], who: ["who"], why: ["why"], when: ["when"], where: ["where"] },
  it: { how: ["come", "quanto"], what: ["cosa", "che"], is: ["è", "e'"], are: ["sono"], can: ["può", "puo", "posso"], should: ["dovrei", "devo"], which: ["quale", "quali"], who: ["chi"], why: ["perché", "perche"], when: ["quando"], where: ["dove"] },
  de: { how: ["wie"], what: ["was"], is: ["ist"], are: ["sind"], can: ["kann"], should: ["soll", "sollte"], which: ["welche", "welcher", "welches"], who: ["wer"], why: ["warum", "wieso", "weshalb"], when: ["wann"], where: ["wo"] },
  fr: { how: ["comment"], what: ["que", "quoi", "qu'est"], is: ["est"], are: ["sont"], can: ["peut", "peux"], should: ["devrait", "dois"], which: ["quel", "quelle", "quels", "quelles"], who: ["qui"], why: ["pourquoi"], when: ["quand"], where: ["où", "ou"] },
  es: { how: ["cómo", "como"], what: ["qué", "que"], is: ["es"], are: ["son"], can: ["puede", "puedo"], should: ["debería", "deberia", "debo"], which: ["cuál", "cual", "cuáles"], who: ["quién", "quien"], why: ["por qué", "porqué", "porque"], when: ["cuándo", "cuando"], where: ["dónde", "donde"] },
};

function langConfig(location_code) {
  const lang = LANG_BY_LOC[location_code] || "en";
  const qmap = QWORDS[lang] || QWORDS.en;
  const words = [];
  for (const c of CANON) for (const w of (qmap[c] || [])) words.push(w);
  const regex = "^(" + words.join("|") + ")\\b";
  // flat lookup sorted longest-first so "por qué" wins over "que"
  const flat = [];
  for (const c of CANON) for (const w of (qmap[c] || [])) flat.push({ w, c });
  flat.sort((a, b) => b.w.length - a.w.length);
  return { lang, qmap, regex, flat };
}

function classify(kw, flat) {
  const s = kw.toLowerCase();
  for (const { w, c } of flat) {
    if (s === w || s.startsWith(w + " ") || s.startsWith(w + "'") || s.startsWith(w + "-")) return c;
  }
  return null;
}

// best-effort in-memory rate limiter (per isolate)
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < RATE.windowMs);
  if (arr.length >= RATE.max) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
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
  const ms = [...monthly].sort((a, b) => (a.year - b.year) || (a.month - b.month));
  const v = ms.map(m => m.search_volume || 0);
  const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
  const f = avg(v.slice(0, 3));
  if (!f) return 0;
  return Math.round(((avg(v.slice(-3)) - f) / f) * 1000) / 10;
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

    const { lang, qmap, regex, flat } = langConfig(location_code);

    const payload = [{
      keyword: seed,
      location_code,
      language_code: lang,
      limit: LIMIT,
      include_seed_keyword: false,
      include_serp_info: false,
      include_clickstream_data: false,
      order_by: ["keyword_info.search_volume,desc"],
      filters: [["keyword", "regex", regex]],
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

    // all canonical groups always present (empty allowed); label = localised word
    const groups = Object.fromEntries(CANON.map(c => [c, {
      modifier: c, label: (qmap[c] && qmap[c][0] ? qmap[c][0] : c).toUpperCase(),
      count: 0, volume: 0, keywords: [],
    }]));
    let matched = 0;
    for (const it of items) {
      const kw = it.keyword || "";
      const c = classify(kw, flat);
      if (!c) continue;
      matched += 1;
      const info = it.keyword_info || {};
      const v = info.search_volume || 0;
      groups[c].count += 1;
      groups[c].volume += v;
      groups[c].keywords.push({
        k: kw, v,
        g: growthPct(info.monthly_searches),
        cpc: Math.round((info.cpc || 0) * 100) / 100,
        comp: (info.competition_level || "").toUpperCase() || null,
      });
    }
    const groupList = CANON.map(c => { groups[c].keywords.sort((a, b) => b.v - a.v); return groups[c]; })
      .sort((a, b) => b.volume - a.volume);

    return json({
      seed,
      country: location_code,
      language: lang,
      totalKeywords: matched,
      totalVolume: groupList.reduce((s, g) => s + g.volume, 0),
      groups: groupList,
    });
  },
};
