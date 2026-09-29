/* ============================================================================================================
   Evidence edition core (view side). Vanilla JS, ES2019, no network, works from file://.
   Reads the JSON blob D (see edition/DATA_CONTRACT.md) from <script id="data"> and nothing else.

   EXTENSION API for per-project layers (their JS is concatenated AFTER this file, in the same <script>):
     window.EDITION = {
       D,                              the data blob (already normalised: every top-level key exists)
       route(regex, fn),               register an extra route. `regex` is tested against the hash path without the
                                       leading "#", e.g. /^\/units$/ for "#/units"; `fn(match, query)` renders into
                                       the #view element (EDITION.$("#view")). Core routes are matched first, so a layer
                                       can add routes but never override a core one. `query` is a plain object.
       rail(sectionTitle, label, href) append an entry to the left rail under `sectionTitle` (created if it does not exist)
       glyph(grade, title?)            grade glyph HTML (A solid, B half, C open, split for a mixed grade like "B–C")
       esc(text)                       HTML-escape
       openClaims(ids)                 open the evidence drawer on claim ids
       go(hash)                        navigate ("#/records"); re-renders when the hash is unchanged
       $, $$                           querySelector helpers
       hydrate(root)                   turn sup.cm markers under `root` into grade glyphs that open the drawer
       actor(idOrRecord)               {label, cls} for an actor id
       boot()                          rebuild rail/search index and re-render (used after D is mutated in tests)
     }
   Hydration: any element with [data-claim="id1,id2"] opens the drawer on click; sup.cm[data-c] are hydrated by hydrate().
   ============================================================================================================ */
(function () {
"use strict";

/* ================================================================ utilities */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const NS = "http://www.w3.org/2000/svg";
const fmtN = n => (typeof n === "number" && isFinite(n) ? n.toLocaleString("en-GB") : String(n == null ? "" : n));
const num = v => { const n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : null; };
const trunc = (s, n) => (s = String(s || ""), s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const slugify = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const NONLATIN = /[Ͱ-ϿЀ-ӿ֐-ࣿऀ-෿฀-໿က-႟぀-ヿ㐀-鿿가-힯]/;
const dirAttr = s => (NONLATIN.test(s || "") ? ' dir="auto"' : "");
const bdi = s => (NONLATIN.test(s || "") ? `<bdi dir="auto">${esc(s)}</bdi>` : esc(s));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY = 864e5;

let D = {};
try { D = JSON.parse(document.getElementById("data").textContent) || {}; } catch (e) { D = {}; }

/* Make sure every key the views touch exists, so a sparse D never throws. */
function normalise() {
  D.meta = D.meta || {}; D.config = D.config || {};
  const C = D.config;
  C.actors = C.actors || []; C.facets = C.facets || []; C.timeline = C.timeline || {}; C.regions = C.regions || [];
  C.cover = C.cover || []; C.grades = C.grades || {}; C.quantity = C.quantity || {};
  D.chapters = D.chapters || []; D.claims = D.claims || {}; D.sources = D.sources || [];
  if (Array.isArray(D.records)) { const o = {}; D.records.forEach(r => { o[r.id] = r; }); D.records = o; }
  D.records = D.records || {};
  if (Array.isArray(D.entities)) { const o = {}; D.entities.forEach(r => { o[r.slug] = r; }); D.entities = o; }
  D.entities = D.entities || {};
  D.glossary = D.glossary || [];
  D.an = D.an || {}; D.an.findings = D.an.findings || []; D.an.blocks = D.an.blocks || [];
  D.method = D.method || ""; D.cited = D.cited || {}; D.stats = D.stats || {}; D.layers = D.layers || {};
  Object.values(D.records).forEach(r => {
    r.categories = r.categories || []; r.figures = r.figures || []; r.links = r.links || []; r.children = r.children || [];
    r.related = r.related || []; r.counterclaims = r.counterclaims || []; r.victims = r.victims || []; r.notes = r.notes || [];
    r.actors_as_reported = r.actors_as_reported || []; r.claims = r.claims || {core: [], context: []};
    r.claims.core = r.claims.core || []; r.claims.context = r.claims.context || [];
  });
}
normalise();

/* ================================================================ derived state (rebuilt by boot) */
let REC = [], RECMAP = {}, ENT = [], CHAPS = [], LINKED = false, ANY_TOLL = false, GLOB = {};
const recNoun = () => { const n = D.meta.recordNoun; return Array.isArray(n) && n.length ? [n[0], n[1] || n[0] + "s"] : ["Record", "Records"]; };
const entNoun = () => { const n = D.meta.entityNoun; return Array.isArray(n) && n.length ? [n[0], n[1] || n[0] + "s"] : ["Entity", "Entities"]; };
const recWord = n => (n === 1 ? recNoun()[0] : recNoun()[1]).toLowerCase();
const entWord = n => (n === 1 ? entNoun()[0] : entNoun()[1]).toLowerCase();
const quantLabel = () => (D.config.quantity && D.config.quantity.label) || "reported figure";
const capFirst = s => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);

function index() {
  REC = Object.values(D.records);
  RECMAP = D.records;
  ENT = Object.values(D.entities);
  CHAPS = D.chapters;
  LINKED = REC.some(r => r.links && r.links.length);
  ANY_TOLL = REC.some(r => tollHigh(r) > 0);
  const st = REC.map(r => tms(r.start)).filter(isFinite);
  const en = REC.map(r => tms(r.end || r.start)).filter(isFinite);
  let t0 = st.length ? Math.min(...st) : NaN, t1 = en.length ? Math.max(...en, ...st) : NaN;
  if (isFinite(t0) && isFinite(t1)) {
    const per = String(D.meta.period || "").split(/\s+to\s+/), ps = tms(per[0]);
    const span = Math.max(t1 - t0, 30 * DAY);
    if (isFinite(ps) && ps > t0) t0 = ps;                       /* clamp: earlier marks get a left arrow */
    else t0 -= Math.max(span * 0.03, 10 * DAY);
    t1 += Math.max(span * 0.03, 10 * DAY);
  }
  const maxHigh = Math.max(0, ...REC.map(r => tollHigh(r) || 0));
  GLOB = {t0, t1, maxHigh};
}
const tms = d => {
  if (!d) return NaN;
  const s = String(d);
  const t = Date.parse(s.length === 10 ? s + "T00:00:00Z" : s.length === 7 ? s + "-01T00:00:00Z" : s.length === 4 ? s + "-01-01T00:00:00Z" : s);
  return t;
};
const tollHigh = r => (r && r.toll ? num(r.toll.high != null ? r.toll.high : r.toll.low) : null);
const tollLow = r => (r && r.toll ? num(r.toll.low != null ? r.toll.low : r.toll.high) : null);
function tollRange(r) {
  const lo = tollLow(r), hi = tollHigh(r);
  if (lo == null && hi == null) return "";
  return lo === hi || lo == null || hi == null ? fmtN(lo != null ? lo : hi) : `${fmtN(lo)}–${fmtN(hi)}`;
}
const isFigs = r => !!(r.toll && r.toll.kind === "figures");
/* dates: a record's date is shown as its own text; ISO strings are formatted only at their stated precision */
function fmtISO(d) {
  const m = /^(\d{4})(?:-(\d\d))?(?:-(\d\d))?$/.exec(String(d || ""));
  if (!m) return String(d || "");
  if (m[3]) return `${+m[3]} ${MON[+m[2] - 1] || ""} ${m[1]}`;
  if (m[2]) return `${MONL[+m[2] - 1] || ""} ${m[1]}`;
  return m[1];
}
const fmtWin = t => { const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

/* ---------------------------------------------------------------- grades and actors */
const gOrder = () => { const k = Object.keys(D.config.grades || {}); return k.length ? k : ["A", "B", "C"]; };
const gRank = x => { const i = gOrder().indexOf(x); return i < 0 ? 99 : i; };
function gParse(g) {
  const a = (String(g || "").match(/[A-Za-z]/g) || []).map(x => x.toUpperCase());
  return [...new Set(a)].sort((x, y) => gRank(x) - gRank(y));
}
const gLow = g => { const p = gParse(g); return p.length ? p[p.length - 1] : "C"; };
const gHigh = g => { const p = gParse(g); return p.length ? p[0] : "C"; };
const gFrac = gr => { const n = gOrder().length, r = gRank(gr); return r === 99 ? 0 : n > 1 ? 1 - r / (n - 1) : 1; };
const gText = g => (D.config.grades || {})[g] || "";
const gLabel = g => { const p = gParse(g); return p.length > 1 ? `${p[0]}–${p[p.length - 1]}` : p[0] || String(g || ""); };
function glyph(g, title) {
  const p = gParse(g), hi = p[0] || "C", lo = p[p.length - 1] || "C", y = 0.6, w = 8.8;
  const lvl = (gr, x0, ww) => { const f = gFrac(gr); return f > 0 ? `<rect class="f" x="${x0}" y="${(y + w * (1 - f)).toFixed(2)}" width="${ww}" height="${(w * f).toFixed(2)}"/>` : ""; };
  const body = p.length > 1 ? lvl(hi, 0.6, 4.4) + lvl(lo, 5, 4.4) + `<line class="d" x1="5" y1="${y}" x2="5" y2="${y + w}"/>` : lvl(lo, 0.6, 8.8);
  return `<svg class="gl" viewBox="0 0 10 10" aria-hidden="true" focusable="false">${title ? `<title>${esc(title)}</title>` : ""}${body}<rect class="o" x="0.6" y="0.6" width="8.8" height="8.8" rx="1"/></svg>`;
}
const gtag = g => `<span class="gtag">${glyph(g)}${esc(gLabel(g))}</span>`;
const LEVELS = {L1_direct: {s: "L1", t: "direct", f: 1}, L2_area_command: {s: "L2", t: "area command", f: 0.5}, L3_presence: {s: "L3", t: "presence", f: 0}};
function linkGlyph(level) {   /* link strength: L1 direct ●, L2 area command ◑, L3 presence ○ */
  const L = LEVELS[level] || {s: "", t: String(level || "").replace(/_/g, " "), f: 0};
  const sh = L.f === 1 ? `<circle class="f" cx="5" cy="5" r="4.2"/>` : L.f === 0.5 ? `<path class="f" d="M5 .8a4.2 4.2 0 0 1 0 8.4z"/>` : "";
  return `<span class="lk"><svg class="ls" viewBox="0 0 10 10" aria-hidden="true" style="fill:none"><circle cx="5" cy="5" r="4.2" fill="none" stroke="currentColor" stroke-width="1.2"/>${sh.replace('class="f"', 'fill="currentColor"')}</svg>${L.s}</span>`;
}
const linkText = level => (LEVELS[level] ? LEVELS[level].t : String(level || "").replace(/_/g, " "));
function actor(x) {
  const id = typeof x === "string" ? x : x && x.actor;
  const a = D.config.actors.find(z => z.id === id);
  return a ? {label: a.label || a.id, cls: a.cls || "grey"} : {label: id || "Not attributed", cls: "grey"};
}
/* a record's date is its own text; the ISO sort key is only ever shown truncated to its stated precision */
const startAtPrecision = r => (r.start ? String(r.start).slice(0, r.precision === "year" ? 4 : r.precision === "month" ? 7 : 10) : "");
const recWhen = r => r.when_text || (r.start ? fmtISO(startAtPrecision(r)) : "date not stated");
const isApprox = r => (r.precision && r.precision !== "day") ;

/* ================================================================ tooltip, router, shell */
const view = $("#view"), tip = $("#tip");
function showTip(html, ev) {
  tip.innerHTML = html; tip.classList.add("on");
  const r = tip.getBoundingClientRect();
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
  tip.style.left = Math.max(4, x) + "px"; tip.style.top = Math.max(4, y) + "px";
}
const hideTip = () => tip.classList.remove("on");
function recTip(r) {
  const a = actor(r), tr = tollRange(r);
  const tollLine = tr ? `<div class="r">${isFigs(r) ? "Figures reported, not reconciled" : esc(quantLabel())}: <b style="display:inline;font:600 13.5px var(--sans)">${esc(tr)}</b></div>` : (ANY_TOLL ? `<div class="r muted">No figure reported</div>` : "");
  return `<b>${esc(r.title)}</b>
    <div class="r">${esc(recWhen(r))}${r.place_text ? " · " + esc(r.place_text) : ""}</div>
    <div class="r"><span class="sw ${r.in_scope ? esc(a.cls) : "oos"}"></span>${esc(r.actor_line || a.label)}</div>
    <div class="r">${glyph(r.card_grade || r.best_grade)} Grade ${esc(gLabel(r.card_grade || r.best_grade))}${r.in_scope ? "" : " · out of scope"}${r.weak ? " · weakly sourced" : ""}</div>
    ${tollLine}<div class="hint">Click to open the ${esc(recWord(1))}</div>`;
}

/* ---------------------------------------------------------------- router */
const coreRoutes = [], extraRoutes = [];
const cr = (re, fn) => coreRoutes.push([re, fn]);
const route = (re, fn) => extraRoutes.push([re, fn]);
let cleanups = [], resizeFns = [], booted = false, currentPath = null;
function parseHash() {
  const h = location.hash.replace(/^#/, "") || "/";
  const i = h.indexOf("?"), path = i < 0 ? h : h.slice(0, i), qs = i < 0 ? "" : h.slice(i + 1);
  let p = path; try { p = decodeURIComponent(path); } catch (e) {}
  return {path: p, raw: path, q: Object.fromEntries(new URLSearchParams(qs))};
}
function go(hash) { if (location.hash !== hash) location.hash = hash; else render(); }
function setQuery(q) {
  const {raw} = parseHash();
  const s = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => { if (v != null && v !== "" && v !== false) s.set(k, v === true ? "1" : v); });
  const str = s.toString();
  history.replaceState(null, "", "#" + raw + (str ? "?" + str : ""));
}
function render() {
  const {path, q} = parseHash();
  closeDrawer(); hideTip(); document.body.classList.remove("nav-open"); $("#menu").setAttribute("aria-expanded", "false");
  closeKey();
  cleanups.forEach(f => { try { f(); } catch (e) {} }); cleanups = []; resizeFns = [];
  let hit = null;
  for (const [re, fn] of coreRoutes.concat(extraRoutes)) { const m = re.exec(path); if (m) { hit = [m, fn]; break; } }
  currentPath = path;
  if (!hit) view.innerHTML = `<div class="dossier"><p class="kicker">Not found</p><h1>There is nothing at this address</h1><p><a href="#/">Return to the cover</a></p></div>`;
  else {
    try { hit[1](hit[0], q); }
    catch (e) { console.error(e); view.innerHTML = `<div class="dossier"><p class="kicker">Something went wrong</p><h1>This view could not be drawn</h1><p class="muted">${esc(e && e.message)}</p><p><a href="#/">Return to the cover</a></p></div>`; }
  }
  markNav(path);
  if (q.at) requestAnimationFrame(() => setTimeout(() => {
    const el = document.getElementById(q.at);
    if (el) { el.scrollIntoView({block: "start"}); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
  }, 30));
  else scrollTo(0, 0);
  const h1 = $("h1,h2", view), tt = D.meta.title || "Edition"; document.title = h1 && h1.textContent !== tt ? h1.textContent + " · " + tt : tt;
  if (!q.at) { try { view.focus({preventScroll: true}); } catch (e) {} }
}
addEventListener("hashchange", render);
addEventListener("resize", (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => resizeFns.forEach(f => f()), 160); }; })());
const onResize = f => resizeFns.push(f);

/* ---------------------------------------------------------------- rail */
const railExtra = [];
function rail(section, label, href) { railExtra.push({section, label, href}); if (booted) buildRail(); }
function buildRail() {
  const secs = [];
  const sec = t => { let s = secs.find(x => x.t === t); if (!s) secs.push(s = {t, items: []}); return s; };
  sec("").items.push({l: "Cover", h: "#/"});
  CHAPS.forEach(ch => {
    let n = null;
    if (ch.region) n = REC.filter(r => r.in_scope && r.region === ch.region).length;
    const html = ch.html || "", c2 = (html.match(/data-rec="/g) || []).length;
    sec(ch.part || "Chapters").items.push({l: ch.title, h: "#/read/" + encodeURIComponent(ch.id), n: n != null ? n : (c2 || null), t: n != null ? `${n} in-scope ${recWord(n)} in ${ch.region}` : (c2 ? `${c2} ${recWord(c2)} described` : "")});
  });
  const ex = sec("Explore");
  ex.items.push({l: "Explorer", h: "#/records", n: REC.length, t: `Browse and filter all ${REC.length} ${recWord(REC.length)}`});
  if (ENT.length) ex.items.push({l: entNoun()[1], h: "#/entities", n: ENT.length});
  if (D.an.blocks.length) ex.items.push({l: "Analysis", h: "#/analysis"});
  ex.items.push({l: "Register", h: "#/evidence", n: Object.keys(D.claims).length, t: "Every usable claim"});
  ex.items.push({l: "Sources", h: "#/sources", n: D.sources.length});
  if (D.glossary.length) ex.items.push({l: "Glossary", h: "#/glossary", n: D.glossary.length});
  ex.items.push({l: "Method", h: "#/method"});
  railExtra.forEach(x => sec(x.section).items.push({l: x.label, h: x.href}));
  let h = "";
  secs.forEach(s => {
    if (!s.items.length) return;
    if (s.t) h += `<h6>${esc(s.t)}</h6>`;
    h += s.items.map(i => `<a href="${esc(i.h)}"${i.t ? ` title="${esc(i.t)}"` : ""}>${esc(i.l)}${i.n != null ? `<span class="c">${fmtN(i.n)}</span>` : ""}</a>`).join("");
  });
  const asof = D.meta.asof ? `Evidence as of ${esc(fmtISO(D.meta.asof))}.<br>` : "";
  h += `<div class="foot">${asof}Press <kbd>/</kbd> to search.</div>`;
  $("#rail").innerHTML = h;
  markNav(currentPath || parseHash().path);
}
function markNav(path) {
  $$("#rail a").forEach(a => {
    const h = decodeURIComponent(a.getAttribute("href").slice(1).split("?")[0]);
    let on = h === path || (h !== "/" && path.startsWith(h + "/"));
    if (h === "/records" && path.startsWith("/r/")) on = true;
    if (h === "/entities" && path.startsWith("/e/")) on = true;
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}
$("#menu").onclick = () => { const on = document.body.classList.toggle("nav-open"); $("#menu").setAttribute("aria-expanded", on); };
$("#scrim").onclick = () => { document.body.classList.remove("nav-open"); $("#menu").setAttribute("aria-expanded", "false"); };

/* ---------------------------------------------------------------- theme */
const THEME_COL = {light: "#f6f2ea", dark: "#16140f"};
function setTheme(t, save) {
  document.documentElement.dataset.theme = t;
  $$('meta[name="theme-color"]').forEach(m => { m.removeAttribute("media"); m.setAttribute("content", THEME_COL[t]); });
  if (save) { try { localStorage.setItem("edition-theme", t); } catch (e) {} }
  if (booted) resizeFns.forEach(f => f());
}
$("#theme").onclick = () => {
  const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  setTheme(cur === "dark" ? "light" : "dark", true);
};
try { const t = localStorage.getItem("edition-theme"); if (t === "light" || t === "dark") setTheme(t, false); } catch (e) {}

/* ---------------------------------------------------------------- the key (also shown on the cover) */
function markKey(kind) {  /* small SVG specimens for the key */
  const svg = inner => `<svg class="kmk mk grey" viewBox="0 0 28 18" aria-hidden="true">${inner}</svg>`;
  return svg(kind);
}
function keyHTML(wide) {
  const grades = gOrder().map(g => `<span class="it">${glyph(g)}<b>${esc(g)}</b> ${esc(gText(g))}</span>`).join("");
  const acts = D.config.actors.map(a => `<span class="it ${esc(a.cls || "grey")}"><span class="sw"></span>${esc(a.label || a.id)}</span>`).join("");
  const scopeMk = `<span class="it"><span class="sw oos"></span>Out of scope: shown greyed, dashed</span>`;
  const weakMk = `<span class="it"><span class="lbl w">weakly sourced</span>Best claim is grade C: dotted outline</span>`;
  const links = LINKED ? `<div class="grp"><b>Link to a named ${esc(entWord(1))}</b>${Object.keys(LEVELS).map(l => `<span class="it">${linkGlyph(l)} ${esc(LEVELS[l].t)}</span>`).join("")}<span class="note">How directly the evidence ties the ${esc(entWord(1))} to the ${esc(recWord(1))}. Grade shows how well that link is evidenced.</span></div>` : "";
  const sizes = ANY_TOLL ? `<div class="grp"><b>Size and outline</b><span class="it">Filled disc: lowest ${esc(quantLabel())}</span><span class="it">Ring: highest</span><span class="it">Dotted ring: figures reported, not reconciled</span><span class="it">Tick: no figure reported</span></div>` :
    `<div class="grp"><b>Marks</b><span class="it">Tick: one ${esc(recWord(1))}; none of them carries a reported figure</span></div>`;
  return `<div class="key${wide ? " wide" : ""}">
    <div class="grp"><b>Evidence grade (shape, lowest grade of the ${esc(recWord(1))})</b>${grades}<span class="note">A split square ${glyph("B–C")} means the ${esc(recWord(1))}'s claims span two grades (here B–C): the left half is the best grade, the right half the lowest. The tooltip gives the range.</span></div>
    ${acts ? `<div class="grp"><b>Colour: who the sources attribute it to</b>${acts}</div>` : ""}
    <div class="grp"><b>Status</b>${scopeMk}${weakMk}</div>
    ${sizes}${links}</div>`;
}
const keypop = $("#keypop");
function closeKey() { keypop.hidden = true; $("#keybtn").setAttribute("aria-expanded", "false"); }
$("#keybtn").onclick = e => {
  e.stopPropagation();
  if (keypop.hidden) { keypop.innerHTML = `<div class="kicker">Key to the marks</div>` + keyHTML(); keypop.hidden = false; $("#keybtn").setAttribute("aria-expanded", "true"); }
  else closeKey();
};
document.addEventListener("click", e => { if (!keypop.hidden && !e.target.closest("#keypop,#keybtn")) closeKey(); });

/* ================================================================ claim markers + evidence drawer */
function hydrate(root) {
  $$("sup.cm", root).forEach(s => {
    if (s.dataset.h) return;
    s.dataset.h = 1;
    const ids = (s.dataset.c || "").split(",").map(x => x.trim()).filter(Boolean);
    if (!ids.length) { s.remove(); return; }
    const gs = ids.map(id => (D.claims[id] || {}).g || "C");
    s.innerHTML = gs.slice(0, 3).map(g => glyph(g)).join("") + (gs.length > 3 ? `<span class="more">+${gs.length - 3}</span>` : "");
    s.tabIndex = 0; s.setAttribute("role", "button");
    s.setAttribute("aria-label", `Evidence: ${ids.length} claim${ids.length > 1 ? "s" : ""}, grade ${gs.slice(0, 3).join(", ")}${gs.length > 3 ? " and more" : ""}. Opens the evidence drawer.`);
  });
}
document.addEventListener("click", e => {
  const s = e.target.closest("sup.cm,[data-claim]");
  if (s && !(e.target.closest("a[href]") && !e.target.closest("a[data-claim]"))) {
    e.preventDefault(); e.stopPropagation();
    openClaims((s.dataset.c || s.dataset.claim || "").split(",").map(x => x.trim()).filter(Boolean), s);
  }
});
document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("sup.cm,[data-claim]:not(button):not(a):not(input)")) { e.preventDefault(); e.target.click(); } });
document.addEventListener("mouseover", e => {
  const s = e.target.closest("sup.cm");
  if (!s) return;
  const ids = (s.dataset.c || "").split(","), c = D.claims[ids[0]];
  if (!c) return;
  showTip(`<div class="r">${glyph(c.g)} Grade ${esc(c.g)}${ids.length > 1 ? ` · claim 1 of ${ids.length}` : ""}</div>
    <div class="tq">${esc(trunc(c.s, 260))}</div><div class="hint">${esc(srcNames(c).slice(0, 3).join(" · "))}${srcNames(c).length > 3 ? " …" : ""}<br>Click to open the evidence</div>`, e);
});
document.addEventListener("mouseout", e => { if (e.target.closest("sup.cm")) hideTip(); });
const srcNames = c => [...new Set((c.src || []).map(x => (D.sources[x[0]] || {}).p).filter(Boolean))];

const drawer = $("#drawer");
let drawerStack = [], lastFocus = null;
function openClaims(ids, from) {
  ids = (ids || []).filter(id => D.claims[id]);
  if (!ids.length) return;
  $$("sup.cm.on").forEach(x => x.classList.remove("on"));
  if (from && from.matches && from.matches("sup.cm")) from.classList.add("on");
  if (!drawer.classList.contains("on")) lastFocus = from && from.focus ? from : document.activeElement;
  drawerStack = ids;
  showClaim(ids[0]);
}
function citedChips(cid) {
  const out = [];
  (D.cited[cid] || []).forEach(k => {
    const t = k.slice(0, 1), v = k.slice(2);
    if (t === "r" && D.records[v]) out.push(`<a class="chip" href="#/r/${encodeURIComponent(v)}">${esc(trunc(D.records[v].title, 54))}</a>`);
    else if (t === "e" && D.entities[v]) out.push(`<a class="chip" href="#/e/${encodeURIComponent(v)}">${esc(D.entities[v].name)}</a>`);
    else if (t === "c") { const ch = D.chapters.find(x => x.id === v); if (ch) out.push(`<a class="chip" href="#/read/${encodeURIComponent(v)}">§ ${esc(ch.title)}</a>`); }
    else if (t === "a") { const b = D.an.blocks.find(x => x.id === v); out.push(`<a class="chip an-chip" href="#/analysis?at=q-${encodeURIComponent(v)}">Analysis: ${esc(trunc(b ? b.q : v, 50))}</a>`); }
  });
  return out.join("");
}
const entByName = (() => { let m = null, key = ""; return name => { const k = Object.keys(D.entities).join("|"); if (!m || key !== k) { m = {}; key = k; Object.values(D.entities).forEach(e => { m[String(e.name).toLowerCase()] = e; }); } return m[String(name).toLowerCase()]; }; })();
function showClaim(cid) {
  const c = D.claims[cid];
  if (!c) return;
  const wasOpen = drawer.classList.contains("on");
  const multi = drawerStack.length > 1 ? `<div class="multi" role="group" aria-label="Claims cited here">${drawerStack.map((id, k) =>
    `<button class="chip" type="button" aria-pressed="${id === cid}" data-go="${esc(id)}">${glyph((D.claims[id] || {}).g)} ${k + 1}</button>`).join("")}</div>` : "";
  const bySrc = [];
  (c.src || []).forEach(([si, ex, fs]) => { let g = bySrc.find(x => x.si === si); if (!g) bySrc.push(g = {si, ex: [], fs}); if (ex && !g.ex.includes(ex)) g.ex.push(ex); });
  const srcs = bySrc.map(({si, ex: exs, fs}) => {
    const s = D.sources[si] || {};
    const lang = s.l && s.l !== "en" ? s.l : "";
    const attr = t => (NONLATIN.test(t || "") ? ` lang="${esc(lang || "und")}" dir="auto"` : (lang && false ? "" : ""));
    const ext = s.u && !/^fixture:\/\//i.test(s.u);
    return `<div class="src"><div><span class="pub">${esc(s.p)}</span>${s.ty ? ` <span class="muted">· ${esc(String(s.ty).replace(/_/g, " "))}</span>` : ""}${s.d ? ` <span class="muted">· ${esc(s.d)}</span>` : ""}${s.partisan ? ` <span class="lbl w">partisan source</span>` : ""}${exs.length > 1 ? ` <span class="muted">· ${exs.length} excerpts</span>` : ""}</div>
      <div class="t"${attr(s.t)}>${esc(s.t)}</div>${s.te ? `<div class="t muted">${esc(s.te)}</div>` : ""}
      ${exs.map(x => `<blockquote${attr(x)}>${esc(x)}</blockquote>`).join("")}
      ${s.o && s.o !== s.p ? `<div class="u">Originating source: ${esc(s.o)}</div>` : ""}
      ${ext ? `<div class="u"><a href="${esc(s.u)}" target="_blank" rel="noopener noreferrer">${esc(trunc(s.u.replace(/^https?:\/\/(www\.)?/, ""), 90))}</a>${fs && fs !== "confirmed" ? ` · ${esc(String(fs).replace(/_/g, " "))}` : ""}</div>` : (fs && fs !== "confirmed" ? `<div class="u">${esc(String(fs).replace(/_/g, " "))}</div>` : "")}</div>`;
  }).join("");
  const ents = (c.ent || []).map(n => { const e = entByName(n); return e ? `<a class="chip" href="#/e/${encodeURIComponent(e.slug)}">${esc(e.name)}</a>` : `<span class="chip v">${esc(n)}</span>`; }).join("");
  const cited = citedChips(cid);
  $(".body", drawer).innerHTML = `${multi}
    <div class="kicker">Claim <span class="mono">${esc(cid)}</span></div>
    <p class="stmt">${esc(c.s)}</p>
    <div class="gradebox"><div class="big">${glyph(c.g)}${esc(c.g)}</div><div>${esc(gText(c.g))}${c.io != null ? `<br><b>${esc(c.io)}</b> independent origin${+c.io === 1 ? "" : "s"}.` : ""}</div></div>
    <dl>${c.d ? `<dt>Date</dt><dd>${esc(c.d)}</dd>` : ""}${c.l ? `<dt>Place</dt><dd>${esc(c.l)}</dd>` : ""}${c.a ? `<dt>Actor</dt><dd>${esc(c.a)} <span class="muted">(as the source names it)</span></dd>` : ""}
      ${c.k ? `<dt>Category</dt><dd>${esc(String(c.k).replace(/_/g, " "))}</dd>` : ""}${c.x ? `<dt>Figures</dt><dd>${esc(c.x)}</dd>` : ""}${c.n ? `<dt>Notes</dt><dd>${esc(c.n)}</dd>` : ""}
      ${c.vn || c.v ? `<dt>Verification</dt><dd>${esc(c.v)}${c.v && c.vn ? ". " : ""}${esc(c.vn || "")}</dd>` : ""}${c.os ? `<dt>Open-source status</dt><dd>${esc(c.os)}</dd>` : ""}</dl>
    ${ents ? `<h4>Named</h4><div class="chips" style="margin-bottom:1rem">${ents}</div>` : ""}
    ${cited ? `<h4>Cited in</h4><div class="chips" style="margin-bottom:1rem">${cited}</div>` : ""}
    <h4>Sources (${bySrc.length})</h4>${srcs || '<p class="muted">No fetched source is recorded for this claim.</p>'}`;
  $(".t", $("header", drawer)).textContent = drawerStack.length > 1 ? `Evidence · claim ${drawerStack.indexOf(cid) + 1} of ${drawerStack.length}` : "Evidence";
  drawer.classList.add("on"); drawer.setAttribute("aria-hidden", "false");
  $(".body", drawer).scrollTop = 0;
  if (!wasOpen) { try { $(".close", drawer).focus({preventScroll: true}); } catch (e) {} }
}
drawer.addEventListener("click", e => {
  const b = e.target.closest("[data-go]"); if (b) showClaim(b.dataset.go);
  if (e.target.closest("a[href^='#']")) closeDrawer(true);
});
function closeDrawer(noFocus) {
  if (!drawer.classList.contains("on")) return;
  drawer.classList.remove("on"); drawer.setAttribute("aria-hidden", "true");
  $$("sup.cm.on").forEach(x => x.classList.remove("on"));
  if (!noFocus && lastFocus && document.contains(lastFocus)) { try { lastFocus.focus({preventScroll: true}); } catch (e) {} }
}
$(".close", drawer).onclick = () => closeDrawer();

/* ================================================================ search palette */
let SEARCH = [];
function buildSearch() {
  SEARCH = [];
  REC.forEach(r => SEARCH.push({g: recNoun()[1], t: r.title, s: [r.when_text, r.place].filter(Boolean).join(" · "), h: "#/r/" + encodeURIComponent(r.id), k: [r.id, r.title, r.when_text, r.place_text, r.place, r.actor_line, r.region].join(" ").toLowerCase()}));
  ENT.forEach(e => SEARCH.push({g: entNoun()[1], t: e.name, s: e.role || e.type || "", h: "#/e/" + encodeURIComponent(e.slug), k: [e.name, e.native, (e.latin || []).join(" "), e.role, e.group, e.slug].join(" ").toLowerCase()}));
  CHAPS.forEach(c => SEARCH.push({g: "Chapters", t: c.title, s: c.part || "", h: "#/read/" + encodeURIComponent(c.id), k: (c.title + " " + (c.part || "")).toLowerCase()}));
  D.glossary.forEach(g => SEARCH.push({g: "Glossary", t: g.term, s: g.native || g.type || "", h: "#/glossary?q=" + encodeURIComponent(g.term), k: [g.term, g.native, (g.variants || []).join(" "), g.def].join(" ").toLowerCase()}));
  Object.entries(D.claims).forEach(([id, c]) => SEARCH.push({g: "Claims", t: trunc(c.s, 120), s: id, id, k: (id + " " + c.s).toLowerCase()}));
}
const pal = $("#pal"), palBg = $("#pal-bg"), palIn = $("#pal-in"), palRes = $("#pal-res");
let palSel = 0, palN = 0, palFrom = null;
function openPal() { palFrom = document.activeElement; pal.classList.add("on"); palBg.classList.add("on"); palIn.value = ""; palSearch(); palIn.focus(); }
function closePal() { if (!pal.classList.contains("on")) return; pal.classList.remove("on"); palBg.classList.remove("on"); if (palFrom && palFrom.focus && document.contains(palFrom)) { try { palFrom.focus({preventScroll: true}); } catch (e) {} } }
function palSearch() {
  const q = palIn.value.trim().toLowerCase();
  if (!q) { palRes.innerHTML = `<div class="empty">Search ${esc(recWord(2))}, ${esc(entWord(2))}, chapters, glossary terms, and claim text or ids.</div>`; palN = 0; return; }
  const terms = q.split(/\s+/), groups = {};
  const rank = it => { const t = (it.t || "").toLowerCase(); return t === q ? 0 : t.startsWith(q) ? 1 : terms.every(x => t.includes(x)) ? 2 : 3; };
  for (const it of SEARCH) { if (!terms.every(t => it.k.includes(t))) continue; (groups[it.g] = groups[it.g] || []).push(it); }
  for (const g in groups) groups[g] = groups[g].map((it, i) => [rank(it), i, it]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, g === "Claims" ? 6 : 8).map(x => x[2]);
  let h = "", n = 0;
  for (const g of [recNoun()[1], entNoun()[1], "Chapters", "Glossary", "Claims"]) {
    if (!groups[g]) continue;
    h += `<div class="grp">${esc(g)}</div>` + groups[g].map(it => `<a role="option" id="pal-o${n}" href="${esc(it.h || "#")}" data-i="${n++}"${it.id ? ` data-claim="${esc(it.id)}"` : ""}>${esc(it.t)}<small${dirAttr(it.s)}>${esc(it.s || "")}</small></a>`).join("");
  }
  palN = n;
  palRes.innerHTML = h || `<div class="empty">Nothing matches “${esc(q)}”.</div>`;
  palSel = 0; palMark();
}
function palMark() {
  const items = $$("a", palRes);
  items.forEach((a, i) => { a.classList.toggle("sel", i === palSel); a.setAttribute("aria-selected", i === palSel); });
  const a = items[palSel];
  if (a) { a.scrollIntoView({block: "nearest"}); palIn.setAttribute("aria-activedescendant", a.id); } else palIn.removeAttribute("aria-activedescendant");
}
palIn.addEventListener("input", palSearch);
palIn.addEventListener("keydown", e => {
  if (e.key === "ArrowDown") { palSel = Math.min(palSel + 1, palN - 1); palMark(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { palSel = Math.max(palSel - 1, 0); palMark(); e.preventDefault(); }
  else if (e.key === "Enter") { const a = $$("a", palRes)[palSel]; if (a) { e.preventDefault(); a.click(); } }
});
palRes.addEventListener("click", e => {
  const a = e.target.closest("a"); if (!a) return;
  if (a.dataset.claim) { e.preventDefault(); e.stopPropagation(); pal.classList.remove("on"); palBg.classList.remove("on"); lastFocus = palFrom; openClaims([a.dataset.claim]); return; }
  closePal();
});
palBg.onclick = closePal;
$("#searchbtn").onclick = openPal;
document.addEventListener("keydown", e => {
  if ((e.key === "/" && !(e.target.matches && e.target.matches("input,textarea,select,[contenteditable]"))) || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); openPal(); }
  else if (e.key === "Escape") { if (pal.classList.contains("on")) closePal(); else if (drawer.classList.contains("on")) closeDrawer(); else closeKey(); }
});

/* ================================================================ SVG helpers and the marks */
function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in (attrs || {})) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const txt = (parent, x, y, s, attrs) => { const t = el("text", Object.assign({x, y}, attrs || {}), parent); t.textContent = s; return t; };
let clipN = 0;
/* fill LEVEL by grade: A full, B half, C empty; a mixed grade splits the mark, best on the left, lowest on the right */
function levelDisc(parent, cx, cy, r, gs) {
  const p = gParse(gs), hi = p[0] || "C", lo = p[p.length - 1] || "C";
  el("circle", {cx, cy, r, class: "bgc"}, parent);
  const id = "clp" + (++clipN), cp = el("clipPath", {id}, parent); el("circle", {cx, cy, r}, cp);
  const g = el("g", {"clip-path": `url(#${id})`}, parent);
  const part = (gr, x0, x1) => { const f = gFrac(gr); if (f > 0) el("rect", {class: "lv", x: x0, y: cy + r - 2 * r * f, width: x1 - x0, height: 2 * r * f}, g); };
  if (p.length > 1) { part(hi, cx - r, cx); part(lo, cx, cx + r); el("line", {class: "divl", x1: cx, x2: cx, y1: cy - r, y2: cy + r}, g); } else part(lo, cx - r, cx + r);
  el("circle", {cx, cy, r, class: "out"}, parent);
}
function levelTick(parent, cx, cy, gs, hgt) {
  const p = gParse(gs), hi = p[0] || "C", lo = p[p.length - 1] || "C", w = 6, h = hgt || 14, x = cx - w / 2, y = cy - h / 2;
  el("rect", {x, y, width: w, height: h, class: "bgc"}, parent);
  const part = (gr, x0, x1) => { const f = gFrac(gr); if (f > 0) el("rect", {class: "lv", x: x0, y: y + h - h * f, width: x1 - x0, height: h * f}, parent); };
  if (p.length > 1) { part(hi, x, cx); part(lo, cx, x + w); } else part(lo, x, x + w);
  el("rect", {x, y, width: w, height: h, class: "out"}, parent);
}
/* One mark per record. Disc area is proportional to the lowest reported figure, a hairline ring to the highest (pure sqrt, no base size);
   a tick when nothing was reported; a dotted ring when figures were reported but not reconciled. Returns the radius drawn. */
function recMark(parent, cx, cy, r, k, o) {
  const gs = r.card_grade || r.best_grade || "C";
  const hi = tollHigh(r), lo = tollLow(r);
  const rad = v => k * Math.sqrt(v);
  if (!(hi > 0)) { levelTick(parent, cx, cy, gs, o.tick || 13); el("circle", {cx, cy, r: 7, class: "hitc"}, parent); return 6; }
  const rHi = rad(hi), rLo = lo > 0 ? rad(lo) : 0;
  if (isFigs(r)) {
    if (rHi - rad(lo > 0 ? lo : hi) > 1) el("circle", {cx, cy, r: rHi, class: "hi"}, parent);
    el("circle", {cx, cy, r: Math.max(rad(lo > 0 ? lo : hi), 0.4), class: "fig-ring"}, parent);
    levelDisc(parent, cx, cy, 2.3, gs);
  } else {
    if (rHi - rLo > 0.6 || !(lo > 0)) el("circle", {cx, cy, r: rHi, class: "hi"}, parent);
    if (lo > 0) levelDisc(parent, cx, cy, Math.max(rLo, 0.35), gs); else levelDisc(parent, cx, cy, 2.3, gs);
  }
  el("circle", {cx, cy, r: Math.max(7, rHi), class: "hitc"}, parent);
  return Math.max(rHi, 3);
}
const mkClass = r => `mk ${esc(r.in_scope ? actor(r).cls : "grey")}${r.in_scope ? "" : " oos"}${r.weak ? " weak" : ""}${isApprox(r) && r.start !== r.end ? " approx" : ""}`;
function bindRec(g, r) {
  g.setAttribute("tabindex", "0"); g.setAttribute("role", "link");
  g.setAttribute("aria-label", `${r.title}, ${recWhen(r)}, grade ${gLabel(r.card_grade || r.best_grade)}${r.in_scope ? "" : ", out of scope"}${r.weak ? ", weakly sourced" : ""}`);
  g.addEventListener("mousemove", e => { showTip(recTip(r), e); hotRec(r); });
  g.addEventListener("mouseleave", () => { hideTip(); hotRec(null); });
  g.addEventListener("focus", () => { const b = g.getBoundingClientRect(); showTip(recTip(r), {clientX: b.left + b.width / 2, clientY: b.top}); });
  g.addEventListener("blur", hideTip);
  g.addEventListener("click", () => go("#/r/" + encodeURIComponent(r.id)));
  g.addEventListener("keydown", e => { if (e.key === "Enter") go("#/r/" + encodeURIComponent(r.id)); });
}
let hotHooks = [];
function hotRec(r) { hotHooks.forEach(f => f(r)); }

/* ================================================================ THE CHRONICLE (place × time, after Marey) */
function timeAxis(svg, x, T0, T1, y0, y1, labelY) {
  const months = (T1 - T0) / (30.44 * DAY);
  const step = [1, 2, 3, 6, 12, 24, 60, 120].find(s => months / s <= 12) || 120;
  const d0 = new Date(T0);
  let yy = d0.getUTCFullYear(), mm = Math.floor(d0.getUTCMonth() / step) * step, first = true;
  for (let guard = 0; guard < 400; guard++) {
    const t = Date.UTC(yy, mm, 1);
    if (t > T1) break;
    if (t >= T0 - 1) {
      const xx = x(t);
      el("line", {x1: xx, x2: xx, y1: y0, y2: y1, class: "grid", "stroke-dasharray": mm === 0 ? null : "1 3"}, svg);
      const lab = mm === 0 || first ? (step >= 12 ? String(yy) : (mm === 0 ? String(yy) : MON[mm] + " " + yy)) : MON[mm];
      if (xx + 3 + lab.length * 6.6 <= x(T1) + 2) txt(svg, xx + 3, labelY, lab, {class: mm === 0 ? "yr" : "tick"});
      first = false;
    }
    mm += step; while (mm > 11) { mm -= 12; yy++; }
  }
}
function chronRows(list) {
  const tl = D.config.timeline || {}, rk = tl.row, gk = tl.group;
  const bands = new Map();
  list.forEach(r => {
    const b = (gk && r[gk]) || "", row = (rk && r[rk]) || "";
    if (!bands.has(b)) bands.set(b, new Map());
    const rows = bands.get(b);
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row).push(r);
  });
  const order = [];
  D.config.regions.forEach(b => { if (bands.has(b)) order.push(b); });
  [...bands.keys()].filter(b => b && !order.includes(b)).forEach(b => order.push(b));
  if (bands.has("")) order.push("");
  const named = order.filter(b => b).length;
  return order.map(b => {
    const rows = [...bands.get(b).entries()];
    const own = rows.filter(([k]) => k).sort((p, q) => q[1].length - p[1].length || String(p[0]).localeCompare(String(q[0])));
    const el2 = rows.find(([k]) => !k);
    const out = own.map(([k, items]) => ({label: k, items}));
    if (el2) out.push({label: b ? "elsewhere in " + b : "elsewhere", items: el2[1], other: true});
    return {band: b, label: b || (named ? "Other" : ""), rows: out};
  });
}
/* opts: list (records), win {t0,t1}, maxHigh, compact, minW */
function chronicle(host, opts) {
  opts = opts || {};
  host.innerHTML = "";
  const all = opts.list || [];
  const dated = all.filter(r => isFinite(tms(r.start)));
  const undated = all.length - dated.length;
  host.dataset.undated = undated;
  if (!dated.length) { host.innerHTML = `<p class="empty">${all.length ? "None of these " + esc(recWord(2)) + " has a start date, so none can be placed on the chronicle." : "Nothing to show yet."}</p>`; return; }
  const {t0: T0, t1: T1} = opts.win || GLOB;
  const maxHigh = opts.maxHigh != null ? opts.maxHigh : GLOB.maxHigh;
  const bands = chronRows(dated);
  const width = Math.max(host.clientWidth || 760, opts.minW || 600);
  const maxLab = Math.max(...bands.flatMap(b => b.rows.map(r => r.label.length)), 6);
  const L = Math.min(opts.compact ? 130 : 170, Math.max(84, Math.round(maxLab * 6.4 + 18))), R = 16, TOP = 26, BG = 26;
  const rmax = opts.compact ? 11 : 15, k = maxHigh > 0 ? rmax / Math.sqrt(maxHigh) : 0;
  const rowH = r => Math.max(opts.compact ? 22 : 26, Math.ceil(2 * Math.max(0, ...r.items.map(i => (tollHigh(i) > 0 ? k * Math.sqrt(tollHigh(i)) : 0))) + 8));
  let height = TOP + 8;
  bands.forEach(b => { if (b.label) height += BG; b.rows.forEach(r => { height += rowH(r); }); });
  const svg = el("svg", {viewBox: `0 0 ${width} ${height}`, width, height, class: "chron", role: "group", "aria-label": `Chronicle: ${dated.length} ${recWord(dated.length)} by place and start date`}, host);
  svg.style.maxWidth = "none"; svg.style.display = "block";
  const x = t => L + (Math.max(T0, Math.min(T1, t)) - T0) / (T1 - T0) * (width - L - R);
  timeAxis(svg, x, T0, T1, TOP - 6, height - 4, TOP - 10);
  const back = el("g", {}, svg), marks = el("g", {}, svg);
  let y = TOP;
  const items = [];
  bands.forEach(b => {
    if (b.label) { y += BG; txt(back, 0, y - 9, b.label, {class: "band-lab"}); el("line", {x1: 0, x2: width - R, y1: y - 4, y2: y - 4, class: "band-line", opacity: .35}, back); }
    b.rows.forEach(r => {
      const h = rowH(r), cy = y + h / 2;
      el("line", {x1: L, x2: width - R, y1: y + h, y2: y + h, class: "row-line"}, back);
      const lab = txt(back, L - 10, cy + 4, trunc(r.label, Math.floor((L - 14) / 6.2)), {class: "row-lab" + (r.other ? " other" : ""), "text-anchor": "end"});
      if (r.label.length > (L - 14) / 6.2) { const t = el("title", {}, lab); t.textContent = r.label; }
      r.items.forEach(rec => items.push({rec, cy, rowKey: b.band + "|" + r.label}));
      y += h;
    });
  });
  /* larger marks first so small ones stay on top and clickable */
  items.sort((a, b) => (tollHigh(b.rec) || 0) - (tollHigh(a.rec) || 0)).forEach(({rec, cy}) => {
    const s = tms(rec.start), e = tms(rec.end);
    const g = el("g", {class: mkClass(rec), "data-rec": rec.id}, marks);
    const body = el("g", {class: "body"}, g);
    const xs = x(s);
    if (isFinite(e) && e - s > 0.5 * DAY) el("line", {x1: xs, x2: Math.max(xs, x(e)), y1: cy, y2: cy, class: "spanl" + (isApprox(rec) ? " approx" : "")}, g);
    if (s < T0) txt(g, L + 2, cy - 9, "← from " + recWhen(rec), {class: "early"});
    recMark(body, xs, cy, rec, k, {tick: opts.compact ? 11 : 14});
    bindRec(g, rec);
  });
  host._svg = svg; host._marks = marks; host._x = x; host._geom = {L, R, width, T0, T1, height};
  return {n: dated.length, undated};
}
function dimBy(host, pred) {
  if (!host || !host._marks) return;
  host._svg.classList.toggle("dim", !!pred);
  $$(".mk", host._marks).forEach(m => m.classList.toggle("inwin", !!pred && pred(RECMAP[m.dataset.rec])));
}
function sizeKey(maxHigh, k) {
  if (!(maxHigh > 0)) return "";
  const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 1e6];
  const top = [...nice].reverse().find(v => v <= maxHigh) || 1;
  let vals = [top]; let mid = [...nice].reverse().find(v => v <= top / 8); if (mid && mid < top) vals.unshift(mid);
  if (vals.length === 2) { const lo = [...nice].reverse().find(v => v <= vals[0] / 8); if (lo && lo < vals[0]) vals.unshift(lo); }
  const rmax = k * Math.sqrt(top), W = 44 + vals.reduce((a, v) => a + 2 * k * Math.sqrt(v) + 34, 0), H = Math.max(2 * rmax + 6, 26);
  let cx = 8, out = "";
  vals.forEach(v => { const r = k * Math.sqrt(v); cx += r; out += `<circle cx="${cx}" cy="${H - r - 2}" r="${Math.max(r, .4)}" fill="none" stroke="currentColor" stroke-width="1"/><text class="keylab" x="${cx + r + 4}" y="${H - 4}">${fmtN(v)}</text>`; cx += r + 8 + String(fmtN(v)).length * 6.4 + 8; });
  return `<svg width="${cx}" height="${H}" viewBox="0 0 ${cx} ${H}" role="img" aria-label="Size key: circle area is proportional to the number of ${esc(quantLabel())}" style="color:var(--ink-2)">${out}</svg>`;
}
function chronCaption(list, extra) {
  const dated = list.filter(r => isFinite(tms(r.start))), nOut = dated.filter(r => !r.in_scope).length, nW = dated.filter(r => r.weak).length;
  const und = list.length - dated.length, ntick = dated.filter(r => !(tollHigh(r) > 0)).length, nfig = dated.filter(r => tollHigh(r) > 0 && isFigs(r)).length;
  const parts = [`Each mark is one ${esc(recWord(1))}, placed at the start of its stated date or period (a dotted line marks a period stated only to the month or year); a line runs to its end date when it lasts longer than a day. Colour is who the sources attribute it to. Fill level is its lowest evidence grade; a mark split down the middle has claims of two grades, the best on the left and the lowest on the right.`];
  if (dated.some(r => tollHigh(r) > 0)) parts.push(`Disc area is the lowest ${esc(quantLabel())}; the hairline ring is the highest. ${nfig ? "A dotted ring marks figures that were reported but not reconciled. " : ""}${ntick ? `A tick means no figure was reported (${ntick} ${recWord(ntick)}).` : ""}`);
  else parts.push(`No ${esc(recWord(2))} here carries a reported figure, so every mark is a tick.`);
  if (nOut) parts.push(`${nOut} out-of-scope ${recWord(nOut)} ${nOut === 1 ? "is" : "are"} shown greyed and dashed.`);
  if (nW) parts.push(`${nW} weakly sourced ${recWord(nW)} ${nW === 1 ? "has" : "have"} a dotted outline.`);
  if (und) parts.push(`${und} ${recWord(und)} without a start date ${und === 1 ? "is" : "are"} not on this chart.`);
  return parts.join(" ") + (extra || "");
}
function chronFigure(list, o) {
  o = o || {};
  const fig = document.createElement("figure"); fig.className = "fig";
  fig.innerHTML = `<div class="chwrap"></div><div class="skey"></div><figcaption>${chronCaption(list)}</figcaption>`;
  const host = $(".chwrap", fig);
  fig._draw = () => {
    const r = chronicle(host, {list, compact: o.compact, minW: o.minW});
    $(".skey", fig).innerHTML = r && GLOB.maxHigh > 0 && list.some(x => tollHigh(x) > 0) ? `<div class="cap" style="display:flex;gap:.8rem;align-items:flex-end;flex-wrap:wrap"><span>Size key, ${esc(quantLabel())}:</span>${sizeKey(GLOB.maxHigh, (o.compact ? 11 : 15) / Math.sqrt(GLOB.maxHigh))}</div>` : "";
  };
  fig._host = host;
  return fig;
}

/* ================================================================ locator map (optional: only records with coordinates) */
function locMap(host, list) {
  host.innerHTML = "";
  const pts = list.filter(r => num(r.lat) != null && num(r.lon) != null);
  if (!pts.length) return false;
  let la0 = Math.min(...pts.map(r => +r.lat)), la1 = Math.max(...pts.map(r => +r.lat)), lo0 = Math.min(...pts.map(r => +r.lon)), lo1 = Math.max(...pts.map(r => +r.lon));
  const padA = Math.max((la1 - la0) * .12, .05), padO = Math.max((lo1 - lo0) * .12, .05);
  la0 -= padA; la1 += padA; lo0 -= padO; lo1 += padO;
  const kx = Math.cos(((la0 + la1) / 2) * Math.PI / 180);
  const width = Math.max(Math.min(host.clientWidth || 420, 620), 280);
  const wdeg = (lo1 - lo0) * kx, hdeg = la1 - la0;
  const height = Math.max(220, Math.min(460, Math.round(width * hdeg / wdeg)));
  const sx = width / (lo1 - lo0), sy = height / (la1 - la0);
  const X = lo => (lo - lo0) * sx, Y = la => height - (la - la0) * sy;
  const svg = el("svg", {viewBox: `0 0 ${width} ${height}`, width: "100%", class: "kmap", role: "group", "aria-label": `Locator map of ${pts.length} ${recWord(pts.length)} with coordinates`}, host);
  svg.style.maxWidth = width + "px"; svg.style.display = "block";
  el("rect", {x: 0, y: 0, width, height, class: "land", rx: 3}, svg);
  const gstep = (lo1 - lo0) > 8 ? 2 : (lo1 - lo0) > 3 ? 1 : (lo1 - lo0) > 1 ? .5 : .1;
  for (let v = Math.ceil(lo0 / gstep) * gstep; v < lo1; v += gstep) { el("line", {x1: X(v), x2: X(v), y1: 0, y2: height, class: "grid"}, svg); txt(svg, X(v) + 2, height - 3, v.toFixed(gstep < 1 ? 1 : 0) + "°E", {class: "tick"}); }
  for (let v = Math.ceil(la0 / gstep) * gstep; v < la1; v += gstep) { el("line", {x1: 0, x2: width, y1: Y(v), y2: Y(v), class: "grid"}, svg); txt(svg, 3, Y(v) - 3, v.toFixed(gstep < 1 ? 1 : 0) + "°N", {class: "tick"}); }
  const rmax = 15, k = GLOB.maxHigh > 0 ? rmax / Math.sqrt(GLOB.maxHigh) : 0;
  const seen = new Map(), placed = [], labels = [];
  const g = el("g", {}, svg);
  pts.slice().sort((a, b) => (tollHigh(b) || 0) - (tollHigh(a) || 0)).forEach(r => {
    let px = X(+r.lon), py = Y(+r.lat);
    const key = px.toFixed(0) + "," + py.toFixed(0), n = seen.get(key) || 0; seen.set(key, n + 1);
    if (n) { const a = n * 2.4, d = 9 * Math.sqrt(n); px += Math.cos(a) * d; py += Math.sin(a) * d; }   /* spiral apart identical coordinates */
    const m = el("g", {class: mkClass(r) + ((r.geo_precision && r.geo_precision !== "site") ? " approx" : ""), "data-rec": r.id}, g);
    const b = el("g", {class: "body"}, m);
    const rr = recMark(b, px, py, r, k, {tick: 12});
    bindRec(m, r);
    placed.push([px, py, rr, r]);
  });
  const done = new Set();
  placed.forEach(([px, py, rr, r]) => {
    const name = r.place; if (!name || done.has(name)) return; done.add(name);
    const w = name.length * 5.6 + 4, bx = px + rr + 4, by = py - rr - 2, box = [bx, by - 10, bx + w, by + 2];
    if (box[2] > width - 2 || box[1] < 2) return;
    if (labels.some(l => l[0] < box[2] && l[2] > box[0] && l[1] < box[3] && l[3] > box[1])) return;
    labels.push(box); const t = txt(svg, bx, by, name, {class: "pl"}); t.style.pointerEvents = "none";
  });
  host._svg = svg;
  return {n: pts.length, approx: pts.filter(r => r.geo_precision && r.geo_precision !== "site").length};
}
function mapFigure(list) {
  const pts = list.filter(r => num(r.lat) != null && num(r.lon) != null);
  if (!pts.length) return null;
  const fig = document.createElement("figure"); fig.className = "fig";
  fig.innerHTML = `<div class="mapwrap"></div><figcaption></figcaption>`;
  fig._draw = () => {
    const r = locMap($(".mapwrap", fig), list);
    if (r) $("figcaption", fig).innerHTML = `Locator map, no basemap: each mark is one ${esc(recWord(1))} at the coordinates its record gives (${r.n} of ${list.length} have coordinates${r.approx ? `; ${r.approx} are approximate and drawn fainter` : ""}). Marks use the same encoding and size scale as the chronicle. Marks at identical coordinates are spread slightly apart.`;
  };
  return fig;
}

/* ================================================================ COVER */
function cover() {
  const m = D.meta, C = D.config;
  const sum = CHAPS.find(c => c.kind === "summary");
  const scopeN = REC.filter(r => r.in_scope).length;
  const cn = C.cover.map(c => { const inner = `<b>${esc(c.text != null ? c.text : c.value)}</b><span>${esc(c.label)}</span>${c.sub ? `<small>${esc(c.sub)}</small>` : ""}`; return c.href ? `<a href="${esc(c.href)}">${inner}</a>` : `<div>${inner}</div>`; }).join("");
  view.innerHTML = `<div class="cover-head reveal">
      <p class="kicker">${esc(m.tagline || "Evidence edition")}</p>
      <h1>${esc(m.title)}</h1>
      ${m.subtitle ? `<p class="dek">${esc(m.subtitle)}</p>` : ""}
      ${m.dek ? `<p class="dek" style="font-size:1.1rem">${esc(m.dek)}</p>` : ""}
      ${m.contentWarning ? `<div class="warn" role="note"><b>Content warning</b>${esc(m.contentWarning)}</div>` : ""}
      ${m.disclaimer ? `<div class="warn" role="note"><b>Please note</b>${esc(m.disclaimer)}</div>` : ""}
      <p class="meta" style="margin-top:1rem">${[m.period ? "Period covered: " + esc(m.period) : "", m.asof ? "evidence as of " + esc(fmtISO(m.asof)) : "", m.built ? "built " + esc(fmtISO(m.built)) : ""].filter(Boolean).join(" · ")}</p>
    </div>
    ${cn ? `<div class="figures" style="margin-top:0">${cn}</div>` : `<div style="height:1.6rem"></div>`}
    <section class="sec" aria-labelledby="key-h"><div class="head"><h2 id="key-h">Key to the marks</h2></div><div id="cover-key">${keyHTML(true)}</div></section>
    <section class="sec" aria-labelledby="chron-h"><div class="head"><h2 id="chron-h">Chronicle: when and where</h2><span class="grow"></span><a href="#/records" class="chip">Explore all ${esc(recWord(2))}</a></div><div class="twin" id="chron-twin"></div></section>
    ${sum ? `<section class="sec" aria-labelledby="find-h" id="findings"><div class="head"><h2 id="find-h">Key findings</h2><span class="grow"></span><a class="chip" href="#/read/${encodeURIComponent(sum.id)}">Open as a chapter</a></div><div class="prose" id="findings-body">${sum.html}</div></section>` : ""}`;
  const twin = $("#chron-twin");
  const list = REC;
  if (!REC.length) twin.innerHTML = `<p class="empty">No ${esc(recWord(2))} have been recorded yet.</p>`;
  else {
    const cf = chronFigure(list), mf = mapFigure(list);
    twin.appendChild(cf); if (mf) { twin.appendChild(mf); twin.classList.add("has-map"); }
    const draw = () => { cf._draw(); if (mf) mf._draw(); };
    draw(); onResize(draw);
  }
  hydrate(view);
  $$("#findings-body [id]").forEach(e => e.removeAttribute("id"));
}
cr(/^\/$/, cover);

/* ================================================================ CHAPTERS */
function chapterHead(ch) { return ch.part ? `<p class="kicker">${esc(ch.part)}</p>` : ""; }
function enhanceCards(root) {
  $$(".incident[data-rec]", root).forEach(card => {
    const r = RECMAP[card.dataset.rec];
    if (!r || card.dataset.enh) return;
    card.dataset.enh = 1;
    const a = actor(r);
    card.classList.add(r.in_scope ? a.cls : "grey"); if (!r.in_scope) card.classList.add("oos");
    const tr = tollRange(r);
    const strip = document.createElement("div"); strip.className = "cstrip";
    strip.innerHTML = `<span>${esc(recWhen(r))}</span>${r.place_text ? `<span>${esc(r.place_text)}</span>` : ""}
      <span class="who"><span class="sw ${r.in_scope ? "" : "oos"}"></span>${esc(a.label)}</span>
      <span class="gtag" title="${esc(gText(gHigh(r.card_grade || r.best_grade)))}">${glyph(r.card_grade || r.best_grade)}Grade ${esc(gLabel(r.card_grade || r.best_grade))}</span>
      ${tr ? `<span class="tl">${isFigs(r) ? "Figures reported, not reconciled: " : esc(quantLabel()) + ": "}<b>${esc(tr)}</b></span>` : ""}
      ${r.in_scope ? "" : `<span class="lbl o">out of scope</span>`}${r.weak ? `<span class="lbl w">weakly sourced</span>` : ""}`;
    card.insertBefore(strip, card.firstChild);
    const links = r.links.filter(l => l.slug || l.name);
    const foot = document.createElement("div"); foot.className = "cfoot";
    foot.innerHTML = links.map(l => { const e = l.slug && D.entities[l.slug]; const nm = esc(l.name || (e && e.name) || l.slug);
      return e ? `<a href="#/e/${encodeURIComponent(l.slug)}" title="${esc(linkText(l.level))}, grade ${esc(l.grade || "")}${l.partisan_only ? ", partisan sources only" : ""}">${linkGlyph(l.level)} ${nm}</a>` : `<span title="${esc(linkText(l.level))}">${linkGlyph(l.level)} ${nm}</span>`; }).join("") +
      `<a class="dos" href="#/r/${encodeURIComponent(r.id)}">Open dossier →</a>`;
    card.appendChild(foot);
  });
}
function chapter(m, q) {
  const ch = CHAPS.find(c => c.id === m[1]);
  if (!ch) { view.innerHTML = `<div class="dossier"><p class="kicker">Not found</p><h1>No chapter “${esc(m[1])}”</h1><p><a href="#/">Return to the cover</a></p></div>`; return; }
  const i = CHAPS.indexOf(ch), prev = CHAPS[i - 1], next = CHAPS[i + 1];
  const regionList = ch.region ? REC.filter(r => r.region === ch.region) : null;
  view.innerHTML = `<article class="read"><h1 class="sr">${esc(ch.title)}</h1>${chapterHead(ch)}
    ${regionList && regionList.length ? `<div class="fig-wide" id="ch-fig"></div>` : ""}
    <div class="prose" id="ch-body">${ch.html || ""}</div>
    <nav class="pager" aria-label="Chapters">${prev ? `<a class="pv" href="#/read/${encodeURIComponent(prev.id)}"><span>← Previous</span><b>${esc(prev.title)}</b></a>` : ""}${next ? `<a class="nx" href="#/read/${encodeURIComponent(next.id)}"><span>Next →</span><b>${esc(next.title)}</b></a>` : ""}</nav></article>`;
  if (regionList && regionList.length) {
    const fig = chronFigure(regionList, {compact: true, minW: 480});
    const cap = $("figcaption", fig);
    cap.innerHTML = `${regionList.length} ${esc(recWord(regionList.length))} in ${esc(ch.region)}, on the same time scale as the cover chronicle. ` + cap.innerHTML;
    $("#ch-fig").appendChild(fig); fig._draw(); onResize(fig._draw);
  }
  const body = $("#ch-body");
  hydrate(body); enhanceCards(body);
}
cr(/^\/read\/([^/]+)$/, chapter);

/* ================================================================ EXPLORER */
function facetDefs() {
  const out = [];
  D.config.facets.forEach(f => {
    const key = f.key; let vals = new Map();   // value -> label
    if (key === "region") REC.forEach(r => r.region && vals.set(r.region, r.region));
    else if (key === "actor") REC.forEach(r => r.actor && vals.set(r.actor, actor(r.actor).label));
    else if (key === "category") REC.forEach(r => r.categories.forEach(c => c.type && vals.set(c.type, c.label || c.type)));
    else if (key === "grade") REC.forEach(r => gParse(r.card_grade || r.best_grade).forEach(g => vals.set(g, g)));
    else if (key === "place") REC.forEach(r => r.place && vals.set(r.place, r.place));
    else if (key === "kind") REC.forEach(r => r.kind && vals.set(r.kind, r.kind));
    else REC.forEach(r => r[key] != null && typeof r[key] !== "object" && r[key] !== "" && vals.set(String(r[key]), String(r[key])));
    let arr = [...vals.entries()];
    if (key === "region") arr.sort((a, b) => { const ia = D.config.regions.indexOf(a[0]), ib = D.config.regions.indexOf(b[0]); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[1].localeCompare(b[1]); });
    else if (key === "grade") arr.sort((a, b) => gRank(a[0]) - gRank(b[0]));
    else arr.sort((a, b) => a[1].localeCompare(b[1]));
    if (arr.length) out.push({key, label: f.label || key, vals: arr});
  });
  return out;
}
const facetMatch = (r, key, sel) => {
  if (key === "region") return sel.includes(r.region);
  if (key === "actor") return sel.includes(r.actor);
  if (key === "category") return r.categories.some(c => sel.includes(c.type));
  if (key === "grade") return gParse(r.card_grade || r.best_grade).some(g => sel.includes(g));   /* contains, never starts-with */
  if (key === "place") return sel.includes(r.place);
  return sel.includes(String(r[key]));
};
function explorer(m, q) {
  const F = facetDefs();
  const st = {q: q.q || "", oos: q.oos === "1", nw: q.nw === "1", sort: q.sort || "date", dir: q.dir || "asc", t0: q.t0 || "", t1: q.t1 || "", n: +q.n || 150};
  F.forEach(f => { st["f_" + f.key] = q[f.key] ? q[f.key].split("|").filter(Boolean) : []; });
  const pushQ = () => { const o = {q: st.q, oos: st.oos, nw: st.nw, sort: st.sort === "date" ? "" : st.sort, dir: st.dir === "asc" ? "" : st.dir, t0: st.t0, t1: st.t1, n: st.n > 150 ? st.n : ""}; F.forEach(f => { o[f.key] = st["f_" + f.key].join("|"); }); setQuery(o); };
  view.innerHTML = `<div class="dossier" style="max-width:none"><p class="kicker">Explorer</p><h1>${esc(recNoun()[1])}</h1>
    <div class="stripwrap" id="ex-strip"></div>
    <div class="facets" id="facets">
      <div class="facet"><span class="lab">Search</span><input class="q" id="ex-q" type="search" placeholder="Filter by title, place, party…" aria-label="Filter ${esc(recWord(2))} by text" value="${esc(st.q)}"></div>
      ${F.map(f => `<div class="facet" data-f="${esc(f.key)}"><span class="lab" id="fl-${esc(f.key)}">${esc(f.label)}</span><div class="chips" role="group" aria-labelledby="fl-${esc(f.key)}">${f.vals.map(([v, l]) => `<button class="chip" type="button" aria-pressed="${st["f_" + f.key].includes(v)}" data-v="${esc(v)}">${f.key === "grade" ? glyph(v) : ""}${f.key === "actor" ? `<span class="sw ${esc(actor(v).cls)}"></span>` : ""}${esc(f.key === "grade" ? "Grade " + l : l)}</button>`).join("")}</div></div>`).join("")}
      <div class="facet"><span class="lab">Show</span><div class="chips">
        <label class="tog"><input type="checkbox" id="ex-scope" ${st.oos ? "" : "checked"}> In scope only</label>
        <label class="tog"><input type="checkbox" id="ex-weak" ${st.nw ? "" : "checked"}> Include weakly sourced</label></div></div>
    </div>
    <div class="count-line" id="ex-count" role="status"></div>
    <div class="sortbar" id="ex-sort"></div>
    <ul class="ilist" id="ex-list"></ul><div class="pg" id="ex-more"></div></div>`;
  const list = $("#ex-list");
  const stripHost = $("#ex-strip");
  const dated = REC.filter(r => isFinite(tms(r.start)));
  let strip = null;
  if (dated.length) strip = miniStrip(stripHost, dated, w => { st.t0 = w ? String(w[0]) : ""; st.t1 = w ? String(w[1]) : ""; apply(); }, st);
  function filtered() {
    const terms = st.q.toLowerCase().split(/\s+/).filter(Boolean);
    const t0 = st.t0 ? +st.t0 : null, t1 = st.t1 ? +st.t1 : null;
    return REC.filter(r => {
      if (!st.oos && !r.in_scope) return false;
      if (st.nw && r.weak) return false;
      for (const f of F) { const sel = st["f_" + f.key]; if (sel.length && !facetMatch(r, f.key, sel)) return false; }
      if (terms.length) { const k = [r.id, r.title, r.place_text, r.place, r.when_text, r.actor_line, r.region, r.categories.map(c => c.label).join(" ")].join(" ").toLowerCase(); if (!terms.every(t => k.includes(t))) return false; }
      if (t0 != null) { const a = tms(r.start), b = tms(r.end || r.start); if (!isFinite(a) || b < t0 || a > t1) return false; }
      return true;
    });
  }
  function sorted(a) {
    const d = st.dir === "desc" ? -1 : 1;
    const key = st.sort;
    return a.slice().sort((x, y) => {
      let c;
      if (key === "title") c = x.title.localeCompare(y.title);
      else if (key === "toll") { const p = tollLow(x), s = tollLow(y); if (p == null && s == null) c = 0; else if (p == null) return 1; else if (s == null) return -1; else c = p - s; }
      else { const p = tms(x.start), s = tms(y.start); if (!isFinite(p) && !isFinite(s)) c = 0; else if (!isFinite(p)) return 1; else if (!isFinite(s)) return -1; else c = p - s; }
      return (c || x.id.localeCompare(y.id)) * d;
    });
  }
  function apply(keep) {
    const res = sorted(filtered());
    const hiddenOos = st.oos ? 0 : REC.filter(r => !r.in_scope && (!st.nw || !r.weak)).length;
    const active = st.q || st.t0 || st.oos || st.nw || F.some(f => st["f_" + f.key].length);
    $("#ex-count").innerHTML = `<span><b>${fmtN(res.length)}</b> of ${fmtN(REC.length)} ${esc(recWord(REC.length))}</span>${!st.oos && REC.some(r => !r.in_scope) ? `<span class="muted">· out-of-scope ${esc(recWord(2))} are hidden by “in scope only” <button class="linkbtn" type="button" id="ex-showoos">show them</button></span>` : ""}${st.t0 ? `<span>· window ${esc(fmtWin(+st.t0))} to ${esc(fmtWin(+st.t1))} <button class="linkbtn" type="button" id="ex-clrwin">clear</button></span>` : ""}${active ? `<button class="linkbtn" type="button" id="ex-clear">Reset filters</button>` : ""}`;
    $("#ex-sort").innerHTML = `Sort by ${[["date", "Date"], ["title", "Title"], ["toll", "Figure (low)"]].map(([k, l]) => `<button class="chip" type="button" data-s="${k}" aria-pressed="${st.sort === k}">${l}${st.sort === k ? (st.dir === "asc" ? " ↑" : " ↓") : ""}</button>`).join("")}`;
    const shown = res.slice(0, st.n);
    list.innerHTML = shown.map(r => { const a = actor(r), tr = tollRange(r);
      return `<li><a class="irow${r.in_scope ? "" : " oos"}" href="#/r/${encodeURIComponent(r.id)}"><span class="d">${esc(recWhen(r))}</span>
        <span class="t"><span class="sw ${r.in_scope ? esc(a.cls) : "oos"}"></span> ${esc(r.title)}<span class="lbls">${r.in_scope ? "" : `<span class="lbl o">out of scope</span>`}${r.weak ? `<span class="lbl w">weakly sourced</span>` : ""}</span><small>${esc([r.place_text, r.actor_line].filter(Boolean).join(" · "))}</small></span>
        <span class="tl">${tr ? esc(tr) + (isFigs(r) ? `<small class="muted" style="display:block;font-size:11px">not reconciled</small>` : "") : `<span class="muted">${ANY_TOLL ? "none reported" : ""}</span>`}</span><span class="g">${glyph(r.card_grade || r.best_grade, "Grade " + gLabel(r.card_grade || r.best_grade))}</span></a></li>`; }).join("") || `<li class="empty">No ${esc(recWord(2))} match these filters.</li>`;
    $("#ex-more").innerHTML = res.length > shown.length ? `<button class="btn" type="button" id="ex-moreb">Show ${Math.min(150, res.length - shown.length)} more</button>` : "";
    if (strip) strip.set(st.t0 ? [+st.t0, +st.t1] : null, res);
    if (!keep) pushQ(); else pushQ();
    $$("#facets .chip[data-v]").forEach(b => { const f = b.closest(".facet").dataset.f; b.setAttribute("aria-pressed", st["f_" + f].includes(b.dataset.v)); });
  }
  $("#ex-q").addEventListener("input", e => { st.q = e.target.value; st.n = 150; apply(); });
  $("#facets").addEventListener("click", e => {
    const b = e.target.closest(".chip[data-v]"); if (!b) return;
    const f = b.closest(".facet").dataset.f, arr = st["f_" + f], i = arr.indexOf(b.dataset.v);
    if (i < 0) arr.push(b.dataset.v); else arr.splice(i, 1);
    st.n = 150; apply();
  });
  $("#ex-scope").addEventListener("change", e => { st.oos = !e.target.checked; apply(); });
  $("#ex-weak").addEventListener("change", e => { st.nw = !e.target.checked; apply(); });
  $("#ex-sort").addEventListener("click", e => { const b = e.target.closest("[data-s]"); if (!b) return; if (st.sort === b.dataset.s) st.dir = st.dir === "asc" ? "desc" : "asc"; else { st.sort = b.dataset.s; st.dir = "asc"; } apply(); });
  $("#ex-count").addEventListener("click", e => {
    if (e.target.id === "ex-showoos") { st.oos = true; $("#ex-scope").checked = false; apply(); }
    if (e.target.id === "ex-clrwin") { st.t0 = st.t1 = ""; apply(); }
    if (e.target.id === "ex-clear") { st.q = ""; st.oos = false; st.nw = false; st.t0 = st.t1 = ""; F.forEach(f => { st["f_" + f.key] = []; }); $("#ex-q").value = ""; $("#ex-scope").checked = true; $("#ex-weak").checked = true; apply(); }
  });
  $("#ex-more").addEventListener("click", e => { if (e.target.id === "ex-moreb") { st.n += 150; apply(); } });
  apply(true);
}
cr(/^\/records$/, explorer);

/* A brushed timeline strip: one row of marks; drag to choose a window (kept in the query string as t0/t1, in ms). */
function miniStrip(host, list, onWin, st) {
  const T0 = GLOB.t0, T1 = GLOB.t1;
  let win = null, brushEl = null, marksG = null;
  function draw() {
    host.innerHTML = "";
    const width = Math.max(host.clientWidth || 700, 280), L = 8, R = 8, H = 70;
    const svg = el("svg", {viewBox: `0 0 ${width} ${H}`, width, height: H, role: "group", "aria-label": `Timeline of ${list.length} ${recWord(list.length)}. Drag across it to choose a period.`}, host);
    svg.style.display = "block"; svg.style.touchAction = "pan-y";
    const x = t => L + (Math.max(T0, Math.min(T1, t)) - T0) / (T1 - T0) * (width - L - R);
    timeAxis(svg, x, T0, T1, 16, H - 4, 11);
    marksG = el("g", {}, svg);
    const lanes = [];
    list.slice().sort((a, b) => tms(a.start) - tms(b.start)).forEach(r => {
      const xs = x(tms(r.start)); let lane = 0;
      while (lanes[lane] != null && xs - lanes[lane] < 7) lane++;
      lanes[lane] = xs; if (lane > 3) lane = 3;
      const g = el("g", {class: mkClass(r), "data-rec": r.id}, marksG), b = el("g", {class: "body"}, g);
      levelTick(b, xs, 28 + lane * 8, r.card_grade || r.best_grade, 8);
      g.addEventListener("mousemove", e => showTip(recTip(r), e)); g.addEventListener("mouseleave", hideTip);
      g.addEventListener("click", ev => { if (!moved) go("#/r/" + encodeURIComponent(r.id)); });
    });
    brushEl = el("rect", {class: "brush", y: 14, height: H - 18, x: 0, width: 0, visibility: "hidden"}, svg);
    const inv = px => T0 + (Math.max(L, Math.min(width - R, px)) - L) / (width - L - R) * (T1 - T0);
    const pt = e => { const r = svg.getBoundingClientRect(); return (e.clientX - r.left) * width / r.width; };
    let start = null, moved = false;
    svg.addEventListener("pointerdown", e => { start = pt(e); moved = false; try { svg.setPointerCapture(e.pointerId); } catch (er) {} });
    svg.addEventListener("pointermove", e => { if (start == null) return; const a = Math.min(start, pt(e)), b = Math.max(start, pt(e)); if (b - a < 4) return; moved = true; brushEl.setAttribute("x", a); brushEl.setAttribute("width", b - a); brushEl.setAttribute("visibility", "visible"); });
    svg.addEventListener("pointerup", e => { if (start == null) return; const a = Math.min(start, pt(e)), b = Math.max(start, pt(e)); start = null; if (b - a < 4) { setTimeout(() => { moved = false; }, 0); return; } onWin([Math.round(inv(a)), Math.round(inv(b))]); setTimeout(() => { moved = false; }, 0); });
    svg.addEventListener("dblclick", () => onWin(null));
    host._x = x;
    if (win) show();
    function show() { if (!win || !brushEl) return; brushEl.setAttribute("x", x(win[0])); brushEl.setAttribute("width", Math.max(2, x(win[1]) - x(win[0]))); brushEl.setAttribute("visibility", "visible"); }
  }
  draw(); onResize(draw);
  const cap = document.createElement("p"); cap.className = "cap"; cap.style.marginTop = "0";
  cap.textContent = "Each tick is one " + recWord(1) + " at its start date. Drag across the strip to choose a period; double-click to clear.";
  host.parentNode.insertBefore(cap, host.nextSibling);
  const stt = {
    set(w, res) {
      win = w;
      const ids = new Set(res.map(r => r.id));
      if (marksG) { marksG.closest("svg").classList.add("dim"); $$(".mk", marksG).forEach(g => g.classList.toggle("inwin", ids.has(g.dataset.rec))); }
      if (brushEl) { if (!w) brushEl.setAttribute("visibility", "hidden"); else if (host._x) { brushEl.setAttribute("x", host._x(w[0])); brushEl.setAttribute("width", Math.max(2, host._x(w[1]) - host._x(w[0]))); brushEl.setAttribute("visibility", "visible"); } }
    }
  };
  if (st && st.t0) win = [+st.t0, +st.t1];
  return stt;
}

/* ================================================================ RECORD DOSSIER */
const cbtn = (ids, label) => `<button class="cbtn" type="button" data-claim="${esc([].concat(ids).join(","))}" aria-label="Open the evidence for ${esc(label || "this claim")}">${[].concat(ids).slice(0, 3).map(i => glyph((D.claims[i] || {}).g)).join("")}${label ? esc(label) : "evidence"}</button>`;
function cardProse(r) {
  if (!r.card) return "";
  const ch = CHAPS.find(c => c.id === r.card.chapter); if (!ch || !ch.html) return "";
  const tmp = document.createElement("div"); tmp.innerHTML = ch.html;
  let card = null;
  $$(".incident[data-rec]", tmp).forEach(c => { if (c.dataset.rec === r.id) card = c; });
  if (!card && r.card.anchor) { const a = tmp.querySelector("#" + CSS.escape(r.card.anchor)); if (a) card = a; }
  if (!card) return "";
  const h3 = card.querySelector("h3"); if (h3) h3.remove();
  $$("[id]", card).forEach(e => e.removeAttribute("id"));
  return `<h2>The card in the text</h2><div class="card-prose ${r.in_scope ? esc(actor(r).cls) : "grey oos"} prose">${card.innerHTML}</div><p style="margin-top:.8rem"><a class="chip" href="#/read/${encodeURIComponent(ch.id)}?at=${encodeURIComponent(r.card.anchor || "")}">Read it in “${esc(ch.title)}” →</a></p>`;
}
function dossier(m) {
  const r = RECMAP[m[1]];
  if (!r) { view.innerHTML = `<div class="dossier"><p class="kicker">Not found</p><h1>No ${esc(recWord(1))} “${esc(m[1])}”</h1><p><a href="#/records">Back to the explorer</a></p></div>`; return; }
  const a = actor(r), g = r.card_grade || r.best_grade, tr = tollRange(r);
  const lk = r.links.map(l => { const e = l.slug && D.entities[l.slug]; const nm = esc(l.name || (e && e.name) || l.slug);
    return `<tr><td>${e ? `<a href="#/e/${encodeURIComponent(l.slug)}">${nm}</a>` : nm}${l.unit ? `<br><span class="muted">${esc(l.unit)}</span>` : ""}</td><td>${linkGlyph(l.level)} ${esc(linkText(l.level))}</td><td>${gtag(l.grade)}</td><td>${l.partisan_only ? `<span class="lbl w">partisan sources only</span>` : ""}</td><td>${(l.claims || []).length ? cbtn(l.claims, "") : ""}</td></tr>`; }).join("");
  const rel = id => { const x = RECMAP[id]; return x ? `<a class="chip" href="#/r/${encodeURIComponent(id)}">${esc(trunc(x.title, 64))}</a>` : `<span class="chip v">${esc(id)}</span>`; };
  const claimRows = ids => ids.map(id => { const c = D.claims[id]; return c ? `<li>${gtag(c.g)}<span>${esc(c.s)}</span><button class="cbtn" type="button" data-claim="${esc(id)}" aria-label="Open evidence for claim ${esc(id)}"><span class="id">${esc(id)}</span></button></li>` : ""; }).join("");
  view.innerHTML = `<div class="dossier">
    <p class="kicker">${esc(r.kind === "event" || !r.kind ? recNoun()[0] : r.kind)} · <span class="mono">${esc(r.id)}</span></p>
    <h1>${esc(r.title)}</h1>
    <div class="hstrip"><span class="who ${r.in_scope ? esc(a.cls) : "grey"}"><span class="sw ${r.in_scope ? "" : "oos"}"></span>${esc(a.label)}</span>
      <span class="gtag" title="${esc(gText(gHigh(g)))}">${glyph(g)}Grade ${esc(gLabel(g))}</span>
      ${r.origins != null ? `<span>${esc(r.origins)} independent origin${+r.origins === 1 ? "" : "s"}</span>` : ""}
      ${r.in_scope ? "" : `<span class="lbl o">out of scope</span>`}${r.weak ? `<span class="lbl w">weakly sourced</span>` : ""}</div>
    ${r.weak ? `<div class="box"><b>Weakly sourced.</b> ${esc(r.weak_note || `The best claim for this ${recWord(1)} is grade ${gLabel(r.best_grade)}.`)}</div>` : ""}
    ${r.in_scope ? "" : `<div class="box"><b>Out of scope.</b> Kept in the database and shown here, but not counted in the edition's headline numbers.</div>`}
    <h2>When and where</h2>
    <dl class="kv"><dt>When</dt><dd>${esc(recWhen(r))}${r.precision ? ` <span class="muted">(${esc(r.precision)} precision)</span>` : ""}</dd>
      <dt>Where</dt><dd>${esc(r.place_text || "not stated")}${r.region || r.place ? `<br><span class="muted">${esc([r.place, r.region].filter(Boolean).join(", "))}</span>` : ""}${num(r.lat) != null && num(r.lon) != null ? `<br><span class="muted num">${esc(r.lat)}, ${esc(r.lon)} · ${esc(r.geo_precision && r.geo_precision !== "none" ? r.geo_precision : "approximate")} location</span>` : ""}</dd>
      <dt>Attributed to</dt><dd>${esc(r.actor_line || a.label)}${r.attribution ? ` <span class="muted">(${esc(String(r.attribution).replace(/_/g, " "))})</span>` : ""}</dd></dl>
    ${r.categories.length ? `<h2>Categories</h2><div class="chips">${r.categories.map(c => `<button class="chip" type="button" data-claim="${esc((c.claims || []).join(","))}">${esc(c.label || c.type)}${(c.claims || []).length ? ` <span class="muted">${c.claims.length}</span>` : ""}</button>`).join("")}</div>` : ""}
    ${r.figures.length ? `<h2>Figures, source by source</h2><p class="muted sans" style="font-size:13.5px;margin-top:0">Each source's figure is shown as it reported it. They are never added together or averaged.</p><ul class="clist">${r.figures.map(f => `<li>${gtag(f.grade)}<span>${esc(f.text)}</span>${cbtn(f.claim, "")}</li>`).join("")}</ul>` : ""}
    ${r.toll ? `<h2>${esc(capFirst(quantLabel()))}</h2><div class="tollbox"><span class="big">${esc(tr)}<small>${isFigs(r) ? "range of figures" : (tollLow(r) === tollHigh(r) ? "" : "low to high")}</small></span><span>${isFigs(r) ? `<b>Figures reported, not reconciled.</b> ` : ""}${esc(r.toll.note || (isFigs(r) ? "" : ""))}${r.toll.cover === false ? ` <span class="muted">Not counted in the headline total.</span>` : ""}</span>${(r.toll.claims || []).length ? cbtn(r.toll.claims, "") : ""}</div>` : (ANY_TOLL ? `<h2>${esc(capFirst(quantLabel()))}</h2><p class="muted sans">No figure was reported for this ${esc(recWord(1))}.</p>` : "")}
    ${r.actors_as_reported.length ? `<h2>Actors, as reported</h2><ul class="clist">${r.actors_as_reported.map(x => `<li><span>${esc(x.text)}</span>${cbtn(x.claim, "")}</li>`).join("")}</ul>` : ""}
    ${r.links.length ? `<h2>Linked ${esc(entWord(2))}</h2><div class="tbl"><table><thead><tr><th>${esc(entNoun()[0])}</th><th>Link</th><th>Grade</th><th></th><th></th></tr></thead><tbody>${lk}</tbody></table></div><p class="muted sans" style="font-size:13px;margin-top:-.8rem">Being linked is not a finding of responsibility.</p>` : ""}
    ${r.counterclaims.length ? `<h2>Counter-claims</h2><ul class="clist">${r.counterclaims.map(x => `<li><span>${esc(x.text)}</span>${cbtn(x.claim, "")}</li>`).join("")}</ul>` : ""}
    ${r.victims.length ? `<h2>Named in the sources</h2><ul class="clist">${r.victims.map(v => `<li><span>${esc(v.name)}${v.status ? ` <span class="muted">(${esc(v.status)})</span>` : ""}</span>${v.claim ? cbtn(v.claim, "") : ""}</li>`).join("")}</ul>` : ""}
    ${r.parent || r.children.length || r.related.length ? `<h2>Related ${esc(recWord(2))}</h2><div class="chips">${r.parent ? `<span class="lab">Part of</span>${rel(r.parent)}` : ""}${r.children.length ? `<span class="lab">Includes</span>${r.children.map(rel).join("")}` : ""}${r.related.length ? `<span class="lab">See also</span>${r.related.map(rel).join("")}` : ""}</div>` : ""}
    ${r.claims.core.length ? `<h2>The claims behind it</h2><ul class="clist">${claimRows(r.claims.core)}</ul>` : ""}
    ${r.claims.context.length ? `<h2>Context claims</h2><ul class="clist">${claimRows(r.claims.context)}</ul>` : ""}
    ${r.notes.length ? `<h2>Research notes</h2><ul>${r.notes.map(n => `<li>${esc(typeof n === "string" ? n : n.text || JSON.stringify(n))}</li>`).join("")}</ul>` : ""}
    ${cardProse(r)}
    <p style="margin-top:2.4rem"><a href="#/records">← All ${esc(recWord(2))}</a></p></div>`;
  hydrate(view);
}
cr(/^\/r\/([^/]+)$/, dossier);

/* ================================================================ ENTITIES */
function entities(m, q) {
  const list = ENT.slice().sort((a, b) => (b.records || []).length - (a.records || []).length || a.name.localeCompare(b.name));
  view.innerHTML = `<div class="dossier" style="max-width:none"><p class="kicker">${esc(entNoun()[1])}</p><h1>Named ${esc(entWord(2))}</h1>
    <p class="dek" style="font-size:1.05rem">${list.length} ${esc(entWord(list.length))}. The count is the number of ${esc(recWord(2))} each is linked to. Being named is not a finding of responsibility.</p>
    <div class="facets" style="margin-top:0"><div class="facet"><span class="lab">Filter</span><input class="q" id="en-q" type="search" placeholder="Name, role…" aria-label="Filter ${esc(entWord(2))}" value="${esc(q.q || "")}"></div></div>
    <div class="roster" id="roster"></div></div>`;
  if (!list.length) { $("#roster").innerHTML = `<p class="empty">No ${esc(entWord(2))} have been named in this edition.</p>`; return; }
  const draw = () => {
    const t = ($("#en-q").value || "").toLowerCase().trim();
    $("#roster").innerHTML = list.filter(e => !t || [e.name, e.native, (e.latin || []).join(" "), e.role, e.group, e.type].join(" ").toLowerCase().includes(t)).map(e => {
      const lv = {}; (e.records || []).forEach(x => { lv[x[1]] = (lv[x[1]] || 0) + 1; });
      return `<a class="rrow" href="#/e/${encodeURIComponent(e.slug)}"><b>${esc(e.name)}${e.native ? ` <span class="muted" style="font-size:.95rem">${bdi(e.native)}</span>` : ""}</b><small><span>${esc(e.role || e.type || "")}</span><span>${(e.records || []).length} ${esc(recWord((e.records || []).length))}</span>${Object.keys(LEVELS).filter(l => lv[l]).map(l => `<span title="${esc(linkText(l))}">${linkGlyph(l)}&nbsp;${lv[l]}</span>`).join("")}</small></a>`; }).join("") || `<p class="empty">No ${esc(entWord(2))} match.</p>`;
    setQuery({q: t});
  };
  $("#en-q").addEventListener("input", draw); draw();
}
cr(/^\/entities$/, entities);
function entityView(m) {
  const e = D.entities[m[1]];
  if (!e) { view.innerHTML = `<div class="dossier"><p class="kicker">Not found</p><h1>No ${esc(entWord(1))} “${esc(m[1])}”</h1><p><a href="#/entities">Back to the list</a></p></div>`; return; }
  const gl = D.glossary.find(g => g.slug && g.slug === e.slug);
  const recs = (e.records || []).map(([id, lv, gr]) => ({r: RECMAP[id], id, lv, gr})).sort((a, b) => (a.r ? tms(a.r.start) : 0) - (b.r ? tms(b.r.start) : 0));
  view.innerHTML = `<div class="dossier">
    <p class="kicker">${esc(entNoun()[0])}${e.type ? " · " + esc(e.type) : ""}${e.group && e.group !== e.name ? " · " + esc(e.group) : ""}</p>
    <h1>${esc(e.name)}</h1>
    ${e.native || (e.latin && e.latin.length) ? `<p class="dek" style="font-size:1.1rem">${e.native ? bdi(e.native) : ""}${e.native && e.latin && e.latin.length ? " · " : ""}${e.latin && e.latin.length ? `<span class="muted">also spelled ${esc(e.latin.join(", "))}</span>` : ""}</p>` : ""}
    ${e.role ? `<p class="dek">${esc(e.role)}</p>` : ""}
    <div class="hstrip">${(e.flags || []).map(f => `<span class="chip flag">${esc(f)}</span>`).join("")}${gl ? `<a class="chip" href="#/glossary?q=${encodeURIComponent(gl.term)}">Glossary entry</a>` : ""}<span>${recs.length} linked ${esc(recWord(recs.length))}</span></div>
    ${e.namesake_risk ? `<div class="box" role="note"><b>Namesake risk.</b> ${esc(e.namesake_risk)}</div>` : ""}
    <div class="box" role="note">Being named here is not a finding of responsibility. Each link shows how directly the sources tie this ${esc(entWord(1))} to ${esc(recWord(2))}, and how well that is evidenced.</div>
    ${e.summary ? `<h2>Summary</h2><div class="prose">${e.summary}</div>` : ""}
    ${(e.identifiers || []).length ? `<h2>Identifiers</h2><div class="tbl"><table><tbody>${e.identifiers.map(i => `<tr><th style="width:9rem;text-transform:none;letter-spacing:0;font-size:13px">${esc(i.field)}</th><td>${bdi(i.value)}${(i.claims || []).length ? " " + `<sup class="cm" data-c="${esc(i.claims.join(","))}"></sup>` : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}
    ${(e.bio || []).map(b => `<h2>${esc(b.h)}</h2><div class="prose">${b.html}</div>`).join("")}
    ${(e.timeline || []).length ? `<h2>Timeline</h2><ul class="tl-list">${e.timeline.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map(t => `<li><span class="dt">${esc(fmtISO(t.date))}</span>${esc(t.text)}${(t.claims || []).length ? `<sup class="cm" data-c="${esc(t.claims.join(","))}"></sup>` : ""}</li>`).join("")}</ul>` : ""}
    ${recs.length ? `<h2>Linked ${esc(recWord(2))}</h2><ul class="ilist">${recs.map(x => x.r ? `<li><a class="irow lnk${x.r.in_scope ? "" : " oos"}" href="#/r/${encodeURIComponent(x.id)}"><span class="d">${esc(recWhen(x.r))}</span><span class="t">${esc(x.r.title)}<span class="lbls">${x.r.in_scope ? "" : `<span class="lbl o">out of scope</span>`}${x.r.weak ? `<span class="lbl w">weakly sourced</span>` : ""}</span></span><span class="tl">${linkGlyph(x.lv)} ${esc(LEVELS[x.lv] ? LEVELS[x.lv].t : x.lv)}</span><span class="g" title="Grade of the link">${glyph(x.gr, "Link grade " + x.gr)}</span></a></li>` : "").join("")}</ul><p class="cap">The glyph on the right is the grade of the link itself, not of the ${esc(recWord(1))}.</p>` : ""}
    <p style="margin-top:2.4rem"><a href="#/entities">← All ${esc(entWord(2))}</a></p></div>`;
  hydrate(view);
}
cr(/^\/e\/([^/]+)$/, entityView);

/* ================================================================ ANALYSIS (labelled: an inference, not a finding) */
const facetHref = label => {
  const s = String(label);
  for (const f of ["region", "actor", "category"]) {
    const F = facetDefs().find(x => x.key === f);
    const hit = F && F.vals.find(([v, l]) => v === s || l === s);
    if (hit) return `#/records?${f}=${encodeURIComponent(hit[0])}`;
  }
  return `#/records?q=${encodeURIComponent(s)}`;
};
function vizHTML(b) {
  const v = b.viz; if (!v || !(v.rows || []).length) return "";
  const rows = v.rows.map(r => ({label: r.label, value: num(r.value), grade: r.grade, raw: r.value}));
  const head = v.title ? `<h4 style="margin-top:1.2rem">${esc(v.title)}</h4>` : "";
  const cap = v.caption ? `<figcaption>${esc(v.caption)}</figcaption>` : "";
  if (v.type === "bars") {
    const mx = Math.max(1e-9, ...rows.map(r => r.value || 0));
    return `<figure class="fig">${head}<div class="bars" role="list">${rows.map(r => {
      const inner = `<span class="lb">${esc(r.label)}</span><span class="track" aria-hidden="true"><span class="fill" style="display:block;width:${r.value == null ? 0 : Math.max(0, r.value / mx * 100).toFixed(2)}%"></span></span><span class="val">${esc(r.value == null ? r.raw : fmtN(r.value))}${r.grade ? glyph(r.grade, "Lowest grade " + r.grade) : ""}</span>`;
      return `<a class="bar" role="listitem" href="${facetHref(r.label)}" aria-label="${esc(r.label)}: ${esc(r.raw)}. Open the matching ${esc(recWord(2))}.">${inner}</a>`; }).join("")}</div>${cap}</figure>`;
  }
  return `<figure class="fig">${head}<div class="tbl"><table><thead><tr><th>Item</th><th class="r">Value</th><th>Grade</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.label)}</td><td class="r">${esc(r.raw)}</td><td>${r.grade ? gtag(r.grade) : ""}</td></tr>`).join("")}</tbody></table></div>${cap}</figure>`;
}
function analysis() {
  const A = D.an;
  view.innerHTML = `<div class="dossier" style="max-width:56rem"><p class="kicker an">Inference</p><h1>Analysis</h1>
    <div class="an-banner" role="note"><b>Analysis: an inference from the claims, not a finding</b><span>Everything on this page is drawn from the evidence in this edition, but the step from claims to pattern is interpretation. Read each “short answer” with the “read with care” notes beside it.</span></div>
    ${A.findings.length ? `<h2 style="border:0;padding:0;margin-top:.5rem">Key findings</h2><ol class="an-find">${A.findings.map(f => `<li><a href="#/analysis?at=q-${encodeURIComponent(f.block || f.id)}">${esc(f.a)}</a></li>`).join("")}</ol>` : ""}
    ${A.blocks.length ? "" : `<p class="empty">This edition has no analysis blocks.</p>`}
    ${A.blocks.map(b => `<section class="an-block" id="q-${esc(b.id)}" aria-labelledby="qh-${esc(b.id)}">
      <p class="kicker an" id="qh-${esc(b.id)}" style="font-variant:small-caps;letter-spacing:.06em;text-transform:none;font-size:14px">${esc(b.q)}</p>
      <p class="lead">${esc(b.a)}</p>
      ${vizHTML(b)}
      ${(b.care || []).length ? `<div class="care"><h4>Read with care</h4><ul>${b.care.map(c => `<li>${esc(c)}</li>`).join("")}</ul></div>` : ""}
      ${b.detail ? `<div class="prose">${b.detail}</div>` : ""}
      ${(b.tables || []).map(t => `<details><summary>Data: ${esc(t.title || "table")}</summary><div class="tbl"><table><thead><tr>${(t.cols || []).map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${(t.rows || []).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`).join("")}
    </section>`).join("")}</div>`;
  hydrate(view);
}
cr(/^\/analysis$/, analysis);

/* ================================================================ EVIDENCE REGISTER */
function evidence(m, q) {
  const grades = gOrder(), cats = [...new Set(Object.values(D.claims).map(c => c.k).filter(Boolean))].sort();
  const st = {g: q.g ? q.g.split("|").filter(Boolean) : [], k: q.k || "", q: q.q || "", p: Math.max(1, +q.p || 1)};
  const ids = Object.keys(D.claims);
  const idx = ids.map(id => { const c = D.claims[id]; return (id + " " + c.s + " " + (c.l || "") + " " + (c.a || "") + " " + (c.d || "")).toLowerCase(); });
  view.innerHTML = `<div class="dossier" style="max-width:64rem"><p class="kicker">Register</p><h1>Every usable claim</h1>
    <div class="facets"><div class="facet"><span class="lab">Search</span><input class="q" id="ev-q" type="search" placeholder="Text or claim id…" aria-label="Filter claims" value="${esc(st.q)}"></div>
      <div class="facet"><span class="lab" id="ev-gl">Grade</span><div class="chips" role="group" aria-labelledby="ev-gl">${grades.map(g => `<button class="chip" type="button" data-g="${esc(g)}" aria-pressed="${st.g.includes(g)}">${glyph(g)}Grade ${esc(g)}</button>`).join("")}</div></div>
      ${cats.length ? `<div class="facet"><label class="lab" for="ev-k">Category</label><select class="q" id="ev-k"><option value="">All categories</option>${cats.map(c => `<option value="${esc(c)}"${c === st.k ? " selected" : ""}>${esc(c.replace(/_/g, " "))}</option>`).join("")}</select></div>` : ""}</div>
    <div class="count-line" id="ev-count" role="status"></div><ul class="reg" id="ev-list"></ul><div class="pg" id="ev-pg"></div></div>`;
  function apply() {
    const terms = st.q.toLowerCase().split(/\s+/).filter(Boolean), out = [];
    ids.forEach((id, i) => { const c = D.claims[id];
      if (st.g.length && !gParse(c.g).some(x => st.g.includes(x))) return;
      if (st.k && c.k !== st.k) return;
      if (terms.length && !terms.every(t => idx[i].includes(t))) return;
      out.push(id); });
    const pages = Math.max(1, Math.ceil(out.length / 100)); if (st.p > pages) st.p = pages;
    const slice = out.slice((st.p - 1) * 100, st.p * 100);
    $("#ev-count").innerHTML = `<span><b>${fmtN(out.length)}</b> of ${fmtN(ids.length)} claims</span>${pages > 1 ? `<span class="muted">· page ${st.p} of ${pages}</span>` : ""}`;
    $("#ev-list").innerHTML = slice.map(id => { const c = D.claims[id];
      return `<li><button type="button" data-claim="${esc(id)}" aria-label="Open evidence for claim ${esc(id)}">${glyph(c.g, "Grade " + c.g)}<span class="s">${esc(trunc(c.s, 320))}<small>${esc([c.d, c.l, c.a].filter(Boolean).join(" · "))}</small></span><span class="m"><span class="mono">${esc(id)}</span>${c.io != null ? esc(c.io) + " origin" + (+c.io === 1 ? "" : "s") : ""}${c.k ? "<br>" + esc(String(c.k).replace(/_/g, " ")) : ""}</span></button></li>`; }).join("") || `<li class="empty">No claims match.</li>`;
    $("#ev-pg").innerHTML = pages > 1 ? `<button class="btn" type="button" data-p="-1" ${st.p <= 1 ? "disabled" : ""}>← Previous 100</button><span>${(st.p - 1) * 100 + 1}–${Math.min(st.p * 100, out.length)}</span><button class="btn" type="button" data-p="1" ${st.p >= pages ? "disabled" : ""}>Next 100 →</button>` : "";
    $$("#ev-pg .btn[disabled]").forEach(b => { b.style.opacity = .4; b.style.cursor = "default"; });
    setQuery({g: st.g.join("|"), k: st.k, q: st.q, p: st.p > 1 ? st.p : ""});
    $$(".chip[data-g]").forEach(b => b.setAttribute("aria-pressed", st.g.includes(b.dataset.g)));
  }
  $("#ev-q").addEventListener("input", e => { st.q = e.target.value; st.p = 1; apply(); });
  const k = $("#ev-k"); if (k) k.addEventListener("change", e => { st.k = e.target.value; st.p = 1; apply(); });
  $$(".chip[data-g]").forEach(b => b.addEventListener("click", () => { const i = st.g.indexOf(b.dataset.g); if (i < 0) st.g.push(b.dataset.g); else st.g.splice(i, 1); st.p = 1; apply(); }));
  $("#ev-pg").addEventListener("click", e => { const b = e.target.closest("[data-p]"); if (!b || b.disabled) return; st.p += +b.dataset.p; apply(); scrollTo(0, 0); });
  apply();
}
cr(/^\/evidence$/, evidence);

/* ================================================================ SOURCES */
function sources() {
  const pubs = new Map();
  Object.values(D.claims).forEach(c => { const seen = new Set(); (c.src || []).forEach(x => seen.add(x[0])); seen.forEach(si => { const s = D.sources[si]; if (!s) return; const p = pubs.get(s.p) || {p: s.p, claims: 0, docs: new Set(), orig: new Set(), part: 0}; p.claims++; pubs.set(s.p, p); }); });
  D.sources.forEach((s, i) => { const p = pubs.get(s.p) || (pubs.set(s.p, {p: s.p, claims: 0, docs: new Set(), orig: new Set(), part: 0}), pubs.get(s.p)); p.docs.add(i); p.orig.add(s.o || s.p); if (s.partisan) p.part++; });
  const list = [...pubs.values()].sort((a, b) => b.claims - a.claims || String(a.p).localeCompare(String(b.p)));
  view.innerHTML = `<div class="dossier" style="max-width:64rem"><p class="kicker">Sources</p><h1>Publishers, ranked by the claims they support</h1>
    <p class="dek" style="font-size:1.05rem">${list.length} publishers, ${D.sources.length} documents. “Originating sources” counts how many distinct primary sources sit behind a publisher's documents: many articles can repeat one origin. A partisan flag marks a party to the matter.</p>
    <div class="tbl" style="margin:0"><div class="sans" style="display:grid;grid-template-columns:minmax(0,1fr) 5.5rem 6.5rem 8rem;gap:.5rem 1rem;padding:.4rem .3rem;border-bottom:1px solid var(--ink-2);font:600 11px var(--sans);text-transform:uppercase;letter-spacing:.06em;color:var(--muted)"><span>Publisher</span><span>Claims</span><span>Documents</span><span>Originating sources</span></div></div>
    ${list.map(p => `<details class="pub"><summary><span><b>${esc(p.p)}</b>${p.part ? ` <span class="lbl w">${p.part === p.docs.size ? "partisan" : "some documents partisan"}</span>` : ""}</span><span class="num">${fmtN(p.claims)}</span><span class="num">${p.docs.size}</span><span class="num">${p.orig.size}</span></summary><div class="docs">${[...p.docs].map(i => { const s = D.sources[i], ext = s.u && !/^fixture:\/\//i.test(s.u); return `<div><span${dirAttr(s.t)}>${esc(s.t || "(untitled)")}</span>${s.d ? ` · ${esc(s.d)}` : ""}${s.ty ? ` · ${esc(String(s.ty).replace(/_/g, " "))}` : ""}${s.o && s.o !== s.p ? `<br><span class="muted">Originating source: ${esc(s.o)}</span>` : ""}${ext ? `<br><a href="${esc(s.u)}" target="_blank" rel="noopener noreferrer">${esc(trunc(s.u.replace(/^https?:\/\/(www\.)?/, ""), 80))}</a>` : ""}</div>`; }).join("")}</div></details>`).join("") || `<p class="empty">No sources.</p>`}</div>`;
}
cr(/^\/sources$/, sources);

/* ================================================================ GLOSSARY */
function glossary(m, q) {
  const list = D.glossary.slice().sort((a, b) => String(a.term).localeCompare(String(b.term), undefined, {sensitivity: "base"}));
  const types = [...new Set(list.map(g => g.type).filter(Boolean))];
  let ty = q.t || "";
  if (!list.length) { view.innerHTML = `<div class="dossier"><p class="kicker">Glossary</p><h1>Terms, names and places</h1><p class="empty">This edition has no glossary entries.</p></div>`; return; }
  view.innerHTML = `<div class="dossier"><p class="kicker">Glossary</p><h1>Terms, names and places</h1>
    <div class="facets"><div class="facet"><span class="lab">Filter</span><input class="q" id="gl-q" type="search" placeholder="Term, native script, definition…" aria-label="Filter glossary" value="${esc(q.q || "")}"></div>
    ${types.length > 1 ? `<div class="facet"><span class="lab" id="gl-tl">Type</span><div class="chips" role="group" aria-labelledby="gl-tl">${types.map(t => `<button class="chip" type="button" data-t="${esc(t)}" aria-pressed="${ty === t}">${esc(t)}</button>`).join("")}</div></div>` : ""}</div>
    <div class="az" id="gl-az" aria-label="Jump to letter"></div><div id="gl-list"></div></div>`;
  function apply() {
    const t = $("#gl-q").value.toLowerCase().trim();
    const res = list.filter(g => (!ty || g.type === ty) && (!t || [g.term, g.native, (g.variants || []).join(" "), g.def].join(" ").toLowerCase().includes(t)));
    const groups = new Map(); res.forEach(g => { const L = (String(g.term).normalize("NFD").replace(/[̀-ͯ]/g, "")[0] || "#").toUpperCase(); const k = /[A-Z]/.test(L) ? L : "#"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(g); });
    $("#gl-az").innerHTML = [...groups.keys()].map(k => `<a href="#/glossary" data-l="${k}">${k}</a>`).join("");
    $("#gl-list").innerHTML = [...groups.entries()].map(([k, arr]) => `<div class="gl-letter" id="gl-${k === "#" ? "num" : k}">${k}</div>` + arr.map(g => `<div class="gl-item"><b>${esc(g.term)}</b>${g.native ? `<span class="nat">${bdi(g.native)}</span>` : ""}
      <div class="sub">${esc(g.type || "")}${(g.variants || []).length ? " · also: " + esc(g.variants.join(", ")) : ""}${g.slug && D.entities[g.slug] ? ` · <a href="#/e/${encodeURIComponent(g.slug)}">${esc(entNoun()[0])} profile →</a>` : ""}</div><p>${esc(g.def)}</p></div>`).join("")).join("") || `<p class="empty">No entries match.</p>`;
    setQuery({q: t, t: ty});
    $$(".chip[data-t]").forEach(b => b.setAttribute("aria-pressed", ty === b.dataset.t));
  }
  $("#gl-q").addEventListener("input", apply);
  $$(".chip[data-t]").forEach(b => b.addEventListener("click", () => { ty = ty === b.dataset.t ? "" : b.dataset.t; apply(); }));
  $("#gl-az").addEventListener("click", e => { const a = e.target.closest("[data-l]"); if (!a) return; e.preventDefault(); const t = document.getElementById("gl-" + (a.dataset.l === "#" ? "num" : a.dataset.l)); if (t) t.scrollIntoView(); });
  apply();
}
cr(/^\/glossary$/, glossary);

/* ================================================================ METHOD AND DATA */
function download(name, mime, text) {
  const url = URL.createObjectURL(new Blob([text], {type: mime}));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const csvCell = v => { const s = String(v == null ? "" : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function claimsCSV() {
  const cols = ["id", "grade", "date", "location", "actor", "category", "figures", "independent_origins", "verification", "statement", "publishers"];
  const rows = Object.entries(D.claims).map(([id, c]) => [id, c.g, c.d, c.l, c.a, c.k, c.x, c.io, c.v, c.s, srcNames(c).join("; ")].map(csvCell).join(","));
  return "﻿" + cols.join(",") + "\r\n" + rows.join("\r\n") + "\r\n";
}
const DL = [
  ["claims.json", "application/json", () => JSON.stringify(D.claims, null, 1), "All claims"],
  ["records.json", "application/json", () => JSON.stringify(D.records, null, 1), "All " + "records"],
  ["entities.json", "application/json", () => JSON.stringify(D.entities, null, 1), "All named entities"],
  ["glossary.json", "application/json", () => JSON.stringify(D.glossary, null, 1), "Glossary"],
  ["claims.csv", "text/csv", claimsCSV, "Claims as a spreadsheet"]
];
function method() {
  const st = D.stats || {};
  view.innerHTML = `<div class="dossier" style="max-width:56rem"><p class="kicker">Method and data</p><h1>How this edition was made</h1>
    ${D.method ? `<div class="prose" id="m-body">${D.method}</div>` : `<p class="empty">No method note was supplied.</p>`}
    <h2>The evidence grades</h2>
    <dl class="kv" style="grid-template-columns:5rem 1fr">${gOrder().map(g => `<dt>${glyph(g)} <b style="color:var(--ink)">${esc(g)}</b></dt><dd>${esc(gText(g))}</dd>`).join("")}<dt>${glyph("B–C")} <b style="color:var(--ink)">B–C</b></dt><dd>A split square: the ${esc(recWord(1))}'s claims span two grades. Marks show the lowest; the range is in the tooltip and dossier.</dd></dl>
    ${Object.keys(st).length ? `<h2>Counts</h2><p class="sans" style="font-size:14px;color:var(--ink-2)">${Object.entries(st).filter(([k]) => /^(TOTAL|USABLE|REJECTED|GA|GB|GC|URLS|CORRECTED|PARTISAN)$/.test(k)).map(([k, v]) => `<span style="margin-right:1.2rem"><b>${fmtN(v)}</b> ${esc({TOTAL: "claims recorded", USABLE: "usable", REJECTED: "rejected", GA: "grade A", GB: "grade B", GC: "grade C", URLS: "distinct pages", CORRECTED: "corrected", PARTISAN: "partisan citations"}[k])}</span>`).join("")}</p>` : ""}
    <h2>Download the data</h2><p class="muted sans" style="font-size:14px;margin-top:0">Built in your browser when you click; nothing is sent anywhere.</p>
    <div class="dl-list">${DL.map(([n, , , d], i) => `<button class="btn" type="button" data-dl="${i}" title="${esc(d)}">↓ ${esc(n)}</button>`).join("")}</div></div>`;
  hydrate(view);
  $$("[data-dl]").forEach(b => b.addEventListener("click", () => { const d = DL[+b.dataset.dl]; download(d[0], d[1], d[2]()); }));
}
cr(/^\/method$/, method);

/* ================================================================ boot */
function boot() {
  normalise(); index(); buildSearch();
  $("#brand-t").textContent = D.meta.brand || D.meta.title || "Evidence edition";
  $("#brand-s").textContent = D.meta.tagline || "";
  $("#searchbtn .stxt").textContent = `Search ${recWord(2)}, ${entWord(2)}, claims…`;
  palIn.placeholder = `Search ${recWord(2)}, ${entWord(2)}, chapters, terms, claims…`;
  booted = true;
  buildRail();
  if (!location.hash) history.replaceState(null, "", "#/");
  render();
}
window.EDITION = {D, route, rail, glyph, esc, openClaims, go, $, $$, hydrate, actor, boot, render};
/* boot after every layer appended to this script has registered its routes */
Promise.resolve().then(boot);
})();
