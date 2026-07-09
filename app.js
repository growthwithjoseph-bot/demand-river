/* Demand River — client renderer.
 *
 * Live mode: set API_BASE to your deployed Cloudflare Worker origin; the app
 * POSTs {seed, country} to `${API_BASE}/api/river`.
 * Demo mode (default, and what GitHub Pages serves): API_BASE is empty, so it
 * loads the bundled public/sample-river.json and shows a "demo" banner.
 */
const API_BASE = ""; // e.g. "https://demand-river.your-subdomain.workers.dev"

const MODIFIERS = ["how", "what", "is", "are", "can", "should", "which", "who", "why", "when", "where"];
const COLORS = {
  how: "#01cdfe", what: "#05ffa1", is: "#fffb96", are: "#ffd86b", can: "#b967ff",
  should: "#ff71ce", which: "#7df9ff", who: "#c1ff72", why: "#ff2079",
  when: "#ff9e64", where: "#8b9dff",
};
const MIN_T = 6, MAX_T = 72;
const W = 1200;

const $ = (id) => document.getElementById(id);
const river = $("river"), hero = $("hero"), tooltip = $("tooltip");
let CURRENT = null; // last dataset

// ---------- helpers ----------
function fmt(n) {
  n = n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "k";
  return String(n);
}
function esc(s) { return String(s == null ? "" : s).replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
function growth(g) {
  if (g == null) return "";
  const cls = g >= 0 ? "up" : "down";
  return `<span class="${cls}">${g >= 0 ? "▲" : "▼"} ${Math.abs(g).toFixed(0)}%</span>`;
}

// center-out ordering: widest in the middle, alternating above/below
function centerOut(groups) {
  const out = [];
  groups.forEach((g, i) => (i % 2 === 0 ? out.unshift(g) : out.push(g)));
  return out;
}

// ---------- fetch ----------
async function getRiver(seed, country) {
  if (API_BASE) {
    const r = await fetch(`${API_BASE}/api/river`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seed, country }),
    });
    if (!r.ok) {
      const msg = r.status === 429 ? "You've hit the rate limit — try again in a few minutes."
        : `Something went wrong (${r.status}). Try again.`;
      throw new Error(msg);
    }
    return r.json();
  }
  // demo
  const data = await (await fetch("public/sample-river.json")).json();
  data.demo = true;
  return data;
}

// ---------- render ----------
function renderRiver(data) {
  CURRENT = data;
  hero.hidden = true;
  const live = data.groups.filter(g => g.volume > 0).sort((a, b) => b.volume - a.volume);
  const dry = data.groups.filter(g => !g.volume || g.volume === 0);

  // summary
  $("summary").hidden = false;
  $("sSeed").textContent = "“" + (data.seed || "") + "”";
  $("sKw").textContent = fmt(data.totalKeywords || live.reduce((s, g) => s + g.count, 0));
  $("sVol").textContent = fmt(data.totalVolume || live.reduce((s, g) => s + g.volume, 0));
  $("sGroups").textContent = live.length;
  $("pngBtn").hidden = false;

  if (!live.length) { return renderEmpty(data); }

  const maxVol = live[0].volume;
  const secondVol = live[1] ? live[1].volume : 0;
  const useSqrt = live.length > 1 && secondVol / maxVol < 0.15; // one group crushes the rest
  const thick = (v) => {
    const ratio = useSqrt ? Math.sqrt(v / maxVol) : v / maxVol;
    return Math.max(MIN_T, Math.min(MAX_T, MAX_T * ratio));
  };
  const maxKwVol = Math.max(1, ...live.flatMap(g => g.keywords.map(k => k.v || 0)));

  // geometry: ribbons on the left/centre, a dedicated LABEL LANE on the right so
  // labels never sit on top of pearls or other streams.
  const seedX = 70, seedR = 34, x0 = seedX + seedR;
  const LABEL_LANE = 220;
  const xRun = 0.40 * W, xEnd = W - LABEL_LANE, labelX = xEnd + 16;

  // vertical stacking (center-out). Each stream gets a generous slot so its pearl
  // labels (above/below) can't collide with the neighbouring stream.
  const ordered = centerOut(live);
  const GAP = 16;
  let cursor = 48;
  const placed = [];
  ordered.forEach(g => {
    const T = thick(g.volume);
    const slot = Math.max(T + 48, 82);
    placed.push({ g, T, yc: cursor + slot / 2, dry: false });
    cursor += slot + GAP;
  });
  const liveBottom = cursor;
  dry.forEach(g => { placed.push({ g, T: 2, yc: cursor + 2, dry: true }); cursor += 32; });
  const H = Math.round(cursor + 28);
  const seedY = (48 + liveBottom - GAP) / 2;

  let defs = `<filter id="glow" x="-30%" y="-80%" width="160%" height="260%">
      <feGaussianBlur stdDeviation="5" result="b"/><feMerge>
      <feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  let streams = "";

  placed.forEach((s, idx) => {
    const color = COLORS[s.g.modifier] || "#8b9dff";
    if (s.dry) {
      streams += `<g class="stream" data-mod="${s.g.modifier}">
        <line x1="${x0}" y1="${seedY.toFixed(1)}" x2="${xEnd}" y2="${s.yc.toFixed(1)}" stroke="#6a5da3"
              stroke-opacity=".45" stroke-width="1.5" stroke-dasharray="3 7"/>
        <text x="${labelX}" y="${(s.yc + 4).toFixed(1)}" text-anchor="start" font-size="12"
              fill="#6a5da3" letter-spacing=".5">${s.g.modifier.toUpperCase()} · dry</text></g>`;
      return;
    }
    const T = s.T, yc = s.yc, tStart = Math.min(T, 16) * 0.9; // modest fan so the seed isn't a blob
    const cxa = x0 + (xRun - x0) * 0.5;
    const path = `M ${x0} ${(seedY - tStart / 2).toFixed(1)}
      C ${cxa} ${(seedY - tStart / 2).toFixed(1)}, ${cxa} ${(yc - T / 2).toFixed(1)}, ${xRun} ${(yc - T / 2).toFixed(1)}
      L ${xEnd} ${(yc - T / 2).toFixed(1)} L ${xEnd} ${(yc + T / 2).toFixed(1)} L ${xRun} ${(yc + T / 2).toFixed(1)}
      C ${cxa} ${(yc + T / 2).toFixed(1)}, ${cxa} ${(seedY + tStart / 2).toFixed(1)}, ${x0} ${(seedY + tStart / 2).toFixed(1)} Z`;
    defs += `<linearGradient id="g${idx}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${color}" stop-opacity=".07"/>
      <stop offset="0.5" stop-color="${color}" stop-opacity=".45"/>
      <stop offset="1" stop-color="${color}" stop-opacity=".8"/></linearGradient>
      <radialGradient id="p${idx}"><stop offset="0" stop-color="#fff" stop-opacity=".95"/>
      <stop offset="0.5" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".6"/></radialGradient>`;

    // pearls along the run; label fewer of them on thin streams to avoid clutter
    const kws = (s.g.keywords || []).slice(0, 5);
    const runL = xRun + 36, runR = xEnd - 34;
    const nLabels = T >= 28 ? 5 : (T >= 13 ? 3 : 2);
    let pearls = "";
    kws.forEach((k, i) => {
      const px = kws.length > 1 ? runL + (runR - runL) * (i / (kws.length - 1)) : (runL + runR) / 2;
      const r = 4 + 9 * Math.sqrt((k.v || 0) / maxKwVol);
      const above = i % 2 === 0;
      const py = yc + (above ? -1 : 1) * Math.min(Math.max(T / 2 - r - 2, 0), 5);
      pearls += `<circle class="pearl" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r.toFixed(1)}"
        fill="url(#p${idx})" stroke="${color}" stroke-opacity=".9" stroke-width="1"
        data-kw="${esc(k.k)}" data-v="${k.v}" data-g="${k.g}" data-cpc="${k.cpc}" data-comp="${esc(k.comp)}"/>`;
      if (i < nLabels) {
        const ly = above ? py - r - 6 : py + r + 13;
        const short = (k.k || "").length > 15 ? k.k.slice(0, 14) + "…" : k.k;
        pearls += `<text x="${px.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="9.5"
          fill="#cbc3f0" style="pointer-events:none">${esc(short)}</text>`;
      }
    });

    streams += `<g class="stream" data-mod="${s.g.modifier}">
      <path class="stream-path" d="${path}" fill="url(#g${idx})" filter="url(#glow)"
        role="button" tabindex="0" aria-label="${esc(s.g.modifier)} questions, ${fmt(s.g.volume)} volume"/>
      ${pearls}
      <text class="stream-label" x="${labelX}" y="${(yc - 2).toFixed(1)}" text-anchor="start"
        font-size="13" font-weight="800" fill="${color}">${s.g.modifier.toUpperCase()} · ${fmt(s.g.volume)}</text>
      <text x="${labelX}" y="${(yc + 14).toFixed(1)}" text-anchor="start" font-size="10.5"
        fill="#a99fd6" style="pointer-events:none">${fmt(s.g.count)} questions</text></g>`;
  });

  const seed = esc(data.seed || "seed");
  const seedSvg = `<circle cx="${seedX}" cy="${seedY.toFixed(1)}" r="${seedR}" fill="#1b1147"
      stroke="${COLORS.what}" stroke-width="1.5" filter="url(#glow)"/>
    <text x="${seedX}" y="${(seedY + 4).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="800"
      fill="#fff">${seed.length > 8 ? seed.slice(0, 7) + "…" : seed}</text>`;

  river.innerHTML = `<svg id="riverSvg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>${defs}</defs>${streams}${seedSvg}</svg>`;

  wireInteractions();
  if (useSqrt) banner("One question type dominates — widths scaled for readability (√), so smaller streams stay visible.");
  else if (data.demo) banner("📸 A real snapshot from DataForSEO for “hubspot” (US). Deploy the Worker (see README) to run live searches on any keyword.");
  else hideBanner();
}

function renderEmpty(data) {
  river.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--muted)">
    <div style="font-size:44px">🏜️</div>
    <h2 style="color:var(--ink);margin:10px 0 6px">A dry riverbed</h2>
    <p>No question demand found for “${esc(data.seed || "")}” in ${esc(data.country || "")}.<br>Try a broader term.</p></div>`;
}

// ---------- interactions ----------
function wireInteractions() {
  const svg = $("riverSvg");
  const groups = [...svg.querySelectorAll(".stream")];

  // hover-dim + pearl tooltips
  groups.forEach(gEl => {
    const mod = gEl.getAttribute("data-mod");
    gEl.addEventListener("mouseenter", () => groups.forEach(o => { if (o !== gEl) o.classList.add("dim"); }));
    gEl.addEventListener("mouseleave", () => groups.forEach(o => o.classList.remove("dim")));
    const openIt = () => openPanel(mod);
    gEl.querySelector(".stream-path")?.addEventListener("click", openIt);
    gEl.querySelector(".stream-label")?.addEventListener("click", openIt);
    gEl.querySelector(".stream-path")?.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openIt(); } });
  });

  svg.querySelectorAll(".pearl").forEach(p => {
    p.addEventListener("mousemove", e => showTip(e, p));
    p.addEventListener("mouseleave", hideTip);
  });
}

function showTip(e, p) {
  const d = p.dataset;
  tooltip.innerHTML = `<div class="t-kw">${esc(d.kw)}</div>
    <div class="t-row"><b>${fmt(+d.v)}</b> searches/mo</div>
    <div class="t-row">growth ${growth(+d.g)}</div>
    <div class="t-row">CPC <b>$${(+d.cpc || 0).toFixed(2)}</b> · comp <b>${esc(d.comp || "—")}</b></div>`;
  tooltip.hidden = false;
  tooltip.style.left = Math.min(e.clientX + 14, window.innerWidth - 270) + "px";
  tooltip.style.top = (e.clientY + 14) + "px";
}
function hideTip() { tooltip.hidden = true; }

function openPanel(mod) {
  const g = CURRENT.groups.find(x => x.modifier === mod);
  if (!g) return;
  $("panelTitle").innerHTML = `<span style="color:${COLORS[mod]}">${mod.toUpperCase()}</span> · ${fmt(g.count)} questions · ${fmt(g.volume)} vol`;
  const rows = (g.keywords || []).map(k =>
    `<div class="kwrow"><span class="kw">${esc(k.k)}</span>
      <span class="vol">${fmt(k.v)}</span>
      <span class="grw ${k.g >= 0 ? "up" : "down"}">${k.g >= 0 ? "+" : ""}${(k.g || 0).toFixed(0)}%</span></div>`).join("");
  $("panelBody").innerHTML = `<div class="kwrow kwhead"><span>keyword</span><span>vol</span><span>growth</span></div>`
    + (rows || `<p style="color:var(--muted);padding:16px 6px">This stream is dry — no questions found.</p>`);
  $("panel").hidden = false;
  $("csvBtn").onclick = () => {
    const csv = "keyword,volume,growth_pct,cpc,competition\n" +
      (g.keywords || []).map(k => `"${(k.k || "").replace(/"/g, '""')}",${k.v},${k.g},${k.cpc},${k.comp}`).join("\n");
    navigator.clipboard.writeText(csv).then(() => { $("csvBtn").textContent = "✓ Copied!"; setTimeout(() => $("csvBtn").textContent = "⧉ Copy as CSV", 1500); });
  };
}

// ---------- PNG export ----------
function exportPNG() {
  const svg = $("riverSvg"); if (!svg) return;
  const clone = svg.cloneNode(true);
  const vb = svg.viewBox.baseVal;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = vb.width * scale; canvas.height = vb.height * scale;
  const ctx = canvas.getContext("2d");
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.onload = () => {
    ctx.fillStyle = "#0b0620"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(236,233,255,.5)"; ctx.font = `${13 * scale}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText("made with Trendible · Demand River", canvas.width - 20 * scale, canvas.height - 16 * scale);
    const a = document.createElement("a");
    a.download = `demand-river-${(CURRENT?.seed || "seed").replace(/\s+/g, "-")}.png`;
    a.href = canvas.toDataURL("image/png"); a.click();
  };
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
}

// ---------- states ----------
function banner(msg, isError) {
  const b = $("banner"); b.textContent = msg; b.hidden = false;
  b.classList.toggle("error", !!isError);
}
function hideBanner() { $("banner").hidden = true; }
function showLoading() {
  hero.hidden = true; hideBanner();
  river.innerHTML = `<div class="loading-wrap">${Array.from({ length: 6 }, (_, i) =>
    `<div class="load-stream" style="width:${90 - i * 12}%;animation-delay:${i * .12}s"></div>`).join("")}</div>`;
}

// ---------- boot ----------
async function run(seed, country) {
  showLoading();
  $("go").disabled = true;
  try {
    const data = await getRiver(seed, country);
    if (!data.seed) data.seed = seed;
    renderRiver(data);
  } catch (e) {
    river.innerHTML = "";
    banner(e.message || "Something went wrong. Try again.", true);
  } finally {
    $("go").disabled = false;
  }
}

$("seedForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const seed = $("seed").value.trim();
  if (!seed && !API_BASE) return run("hubspot", $("country").value); // demo: any submit shows the sample
  if (!seed) return;
  run(seed, $("country").value);
});
$("tryDemo").addEventListener("click", () => { $("seed").value = "hubspot"; run("hubspot", $("country").value); });
$("panelClose").addEventListener("click", () => $("panel").hidden = true);
$("pngBtn").addEventListener("click", exportPNG);
document.addEventListener("keydown", e => { if (e.key === "Escape") { $("panel").hidden = true; hideTip(); } });
