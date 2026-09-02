import * as fs from "fs";
import * as path from "path";
import { VirloSlideshow } from "../../types/virlo";
import { libraryDir, loadAllPanels } from "./imageLibrary";
import { ensureDir } from "./paths";

/**
 * Before/After mini-library from the EXISTING Virlo agents.
 *
 * Unlike the panel library (which classifies individual panels), this groups
 * whole slideshows so the before→after progression is visible as a set. A
 * slideshow qualifies when Virlo's intelligence flags it (`is_before_after`)
 * or when the panel classifier tagged one of its panels `before_after`.
 */

const FACE = /skin|eye|face|wrinkle|collagen|derm|retinol|aging|glow|under.?eye|puffy|dark circle|serum|acne|pore|complexion|glass skin|jaw|lip/;

export interface BeforeAfterSet {
  slideshowUrl: string;
  niche: string;
  platform: string;
  views: number;
  hook: string;
  panelText: string;
  faceRelated: boolean;
  source: "intelligence" | "classified";
  images: { url: string; position: number }[];
}

function faceRelated(s: VirloSlideshow): boolean {
  const i = (s.intelligence || {}) as Record<string, any>;
  const txt = [i.primary_topic, (i.secondary_topics || []).join(" "), (i.keywords || []).join(" "), s.description]
    .join(" ")
    .toLowerCase();
  return FACE.test(txt);
}

/**
 * Collect before/after slideshow sets from stored agent JSON dumps.
 * `classifiedBaUrls` (from the panel library) widens the net beyond Virlo's flag.
 */
export function collectBeforeAfterSets(
  agentJsonDir: string,
  opts: { faceOnly?: boolean; minViews?: number } = {}
): BeforeAfterSet[] {
  if (!fs.existsSync(agentJsonDir)) return [];
  const classifiedBa = new Set(
    loadAllPanels()
      .filter((p) => p.category === "before_after")
      .map((p) => p.slideshowUrl)
  );

  const out: BeforeAfterSet[] = [];
  const seen = new Set<string>();
  for (const file of fs.readdirSync(agentJsonDir).filter((f) => f.endsWith(".json"))) {
    const niche = file.replace(/\.json$/, "");
    const slideshows = JSON.parse(fs.readFileSync(path.join(agentJsonDir, file), "utf-8")) as VirloSlideshow[];
    for (const s of slideshows) {
      if (!s.url || seen.has(s.url)) continue;
      const i = (s.intelligence || {}) as Record<string, any>;
      const flagged = i.is_before_after === true;
      const classified = classifiedBa.has(s.url);
      if (!flagged && !classified) continue;
      const images = (s.images || [])
        .filter((im) => im?.image_url)
        .map((im, idx) => ({ url: im.image_url, position: typeof im.position === "number" ? im.position : idx }))
        .sort((a, b) => a.position - b.position);
      if (images.length < 2) continue; // a before/after needs at least two panels
      const face = faceRelated(s);
      if (opts.faceOnly && !face) continue;
      if (opts.minViews && (s.views || 0) < opts.minViews) continue;
      seen.add(s.url);
      out.push({
        slideshowUrl: s.url,
        niche,
        platform: (s.platform || "tiktok").toLowerCase(),
        views: s.views || 0,
        hook: (i.hook_text || (s.description || "").split("\n")[0] || "").replace(/\s+/g, " ").trim().slice(0, 160),
        panelText: (i.panel_text_full || "").slice(0, 800),
        faceRelated: face,
        source: flagged ? "intelligence" : "classified",
        images
      });
    }
  }
  out.sort((a, b) => b.views - a.views);
  return out;
}

const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** Write before-after.json + before-after.html (one row per slideshow, panels in order). */
export function buildBeforeAfterOutputs(sets: BeforeAfterSet[]): { jsonFile: string; htmlFile: string } {
  ensureDir(libraryDir());
  const jsonFile = path.join(libraryDir(), "before-after.json");
  fs.writeFileSync(
    jsonFile,
    JSON.stringify({ generatedAt: new Date().toISOString(), count: sets.length, sets }, null, 2),
    "utf-8"
  );
  const htmlFile = path.join(libraryDir(), "before-after.html");
  fs.writeFileSync(htmlFile, renderBeforeAfter(sets), "utf-8");
  return { jsonFile, htmlFile };
}

function row(s: BeforeAfterSet): string {
  const panels = s.images
    .map(
      (im, idx) =>
        `<div class="panel"><img loading="lazy" src="${esc(im.url)}" alt=""><span class="pi">${idx === 0 ? "before" : idx === s.images.length - 1 ? "after" : idx + 1}</span></div>`
    )
    .join("");
  return `<div class="set" data-niche="${esc(s.niche)}" data-face="${s.faceRelated ? "1" : "0"}">
  <div class="head"><b>${fmt(s.views)}</b> views · ${esc(s.niche)} · ${s.images.length} panels · <span class="src">${s.source}</span> · <a href="${esc(s.slideshowUrl)}" target="_blank" rel="noopener">open ↗</a></div>
  ${s.hook ? `<div class="hook">${esc(s.hook)}</div>` : ""}
  <div class="strip">${panels}</div>
</div>`;
}

function renderBeforeAfter(sets: BeforeAfterSet[]): string {
  const niches = [...new Set(sets.map((s) => s.niche))].sort();
  const faceN = sets.filter((s) => s.faceRelated).length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Virlo before/after mini-library</title>
<style>
  :root{color-scheme:light;--ink:#1a1a1a;--muted:#6b6b6b;--line:#e6e6e6;--bg:#fafaf8;--card:#fff;--accent:#0a7a3c}
  body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:14px 20px;z-index:5}
  h1{font-size:20px;margin:0 0 8px}
  .bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .chip{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:4px 12px;font-size:12px;cursor:pointer}
  .chip.on{background:var(--accent);color:#fff;border-color:var(--accent)}
  main{padding:12px 20px 80px;max-width:1200px;margin:0 auto}
  .set{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:14px 0}
  .head{font-size:13px;color:var(--muted)}.head b{color:var(--ink)}
  .src{background:#f1f1ee;border-radius:4px;padding:0 6px;font-size:11px}
  .hook{font-weight:600;margin:6px 0 8px}
  .strip{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}
  .panel{position:relative;flex:0 0 auto}
  .panel img{height:240px;width:auto;border-radius:8px;background:#eee;display:block}
  .panel .pi{position:absolute;left:6px;top:6px;background:rgba(0,0,0,.7);color:#fff;border-radius:5px;padding:1px 7px;font-size:11px;text-transform:uppercase;letter-spacing:.03em}
  .set.hidden{display:none}
</style></head><body>
<header>
  <h1>Virlo before/after mini-library <span style="font-weight:400;color:var(--muted)">· ${sets.length} slideshows (${faceN} face/skin) from existing agents · reference, not clip-art</span></h1>
  <div class="bar">
    <button class="chip" data-attr="face" data-val="1">face / skin only (${faceN})</button>
    <strong style="font-size:12px;margin-left:8px">Niche:</strong>
    ${niches.map((n) => `<button class="chip" data-attr="niche" data-val="${esc(n)}">${esc(n)} (${sets.filter((s) => s.niche === n).length})</button>`).join("")}
    <button class="chip" id="reset">reset</button>
  </div>
</header>
<main>${sets.map(row).join("")}</main>
<script>
  const state={face:null,niche:null};
  const chips=[...document.querySelectorAll('.chip[data-attr]')];
  function apply(){
    for(const set of document.querySelectorAll('.set')){
      const okFace=!state.face||set.dataset.face==='1';
      const okNiche=!state.niche||set.dataset.niche===state.niche;
      set.classList.toggle('hidden',!(okFace&&okNiche));
    }
  }
  chips.forEach(ch=>ch.addEventListener('click',()=>{
    const a=ch.dataset.attr,v=ch.dataset.val;
    state[a]=state[a]===v?null:v;
    chips.forEach(c=>{if(c.dataset.attr===a)c.classList.toggle('on',c.dataset.val===state[a])});
    apply();
  }));
  document.getElementById('reset').addEventListener('click',()=>{state.face=null;state.niche=null;chips.forEach(c=>c.classList.remove('on'));apply();});
</script>
</body></html>`;
}
