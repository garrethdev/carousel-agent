import * as fs from "fs";
import * as path from "path";
import { libraryDir, LibraryPanel, loadAllPanels, panelId } from "./imageLibrary";
import { ensureDir } from "./paths";

/**
 * Curated "carousel picks" from the classified panel library — the reusable
 * clusters that go beyond the five requested buckets. Skincare-usable panels
 * only (eyes/face_skin subject, or the skin niches), quality >= 4, deduped,
 * grouped by a hand-tuned set of high-value clusters and sorted by views.
 */

const SKIN_NICHES = new Set(["eye-care", "eye-masks", "anti-aging", "peptides"]);

function skincareUsable(p: LibraryPanel): boolean {
  return (p.subject === "eyes" || p.subject === "face_skin" || SKIN_NICHES.has(p.niche)) && p.quality >= 4;
}

export interface PickCluster {
  key: string;
  label: string;
  blurb: string;
  match: (p: LibraryPanel) => boolean;
}

/** Ordered so the highest-value carousel roles come first. */
export const PICK_CLUSTERS: PickCluster[] = [
  {
    key: "timeline",
    label: "Timeline / results-by-week cards",
    blurb: "“How long to see results”, day/week grids, N-day progress — the save-and-send asset for anti-aging.",
    match: (p) => p.tags.includes("timeline")
  },
  {
    key: "rating",
    label: "Rating / scoreboard cards",
    blurb: "Honest-rating line-ups and scored comparisons — the format engine of the eye-care niche.",
    match: (p) => p.tags.includes("rating")
  },
  {
    key: "ingredient",
    label: "Ingredient-decoded fact cards",
    blurb: "Retinol / collagen / peptide explainers — one hero ingredient per card.",
    match: (p) => p.category === "fact_card" && (p.tags.includes("retinol") || p.tags.includes("collagen") || /peptide|niacinamide|hyaluronic|vitamin c|salicylic/i.test(p.ocrText))
  },
  {
    key: "howto",
    label: "Numbered list / how-to cards",
    blurb: "“N reasons”, step lists, routines — clean body-slide templates.",
    match: (p) => p.category === "fact_card" && /\b(step|how to|\d+\s+(reasons?|ways?|tips?|mistakes?)|^\s*[1-5][\.\)])/im.test(p.ocrText)
  },
  {
    key: "problem",
    label: "Problem close-ups (hook slides)",
    blurb: "Dark circles, wrinkles, puffiness shown raw — slide-1 scroll-stoppers.",
    match: (p) => p.category === "problem_closeup" || (p.category === "before_after" && (p.tags.includes("wrinkles") || p.tags.includes("dark_circles") || p.tags.includes("puffiness")))
  },
  {
    key: "testimonial",
    label: "Testimonial / social-proof quotes",
    blurb: "Creator quotes and reaction text over a face — social-proof slides.",
    match: (p) => p.category === "testimonial"
  }
];

const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const clean = (s: string) => (s || "").replace(/\s+/g, " ").trim();

export interface PicksResult {
  jsonFile: string;
  htmlFile: string;
  counts: Record<string, number>;
}

export function buildCarouselPicks(perCluster = 40): PicksResult {
  ensureDir(libraryDir());
  const panels = loadAllPanels().filter(skincareUsable);
  const counts: Record<string, number> = {};
  const grouped: { cluster: PickCluster; items: LibraryPanel[] }[] = [];
  const usedThisCluster = () => new Set<string>();

  for (const cluster of PICK_CLUSTERS) {
    const seen = usedThisCluster();
    const items = panels
      .filter(cluster.match)
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
      .sort((a, b) => b.quality - a.quality || b.views - a.views)
      .slice(0, perCluster);
    counts[cluster.key] = items.length;
    grouped.push({ cluster, items });
  }

  const jsonFile = path.join(libraryDir(), "carousel-picks.json");
  fs.writeFileSync(
    jsonFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        clusters: grouped.map((g) => ({
          key: g.cluster.key,
          label: g.cluster.label,
          blurb: g.cluster.blurb,
          count: g.items.length,
          panels: g.items.map((p) => ({
            imageUrl: p.imageUrl,
            ocrText: p.ocrText,
            scene: p.scene,
            quality: p.quality,
            views: p.views,
            niche: p.niche,
            slideshowUrl: p.slideshowUrl,
            tags: p.tags
          }))
        }))
      },
      null,
      2
    ),
    "utf-8"
  );

  const htmlFile = path.join(libraryDir(), "carousel-picks.html");
  fs.writeFileSync(htmlFile, renderPicks(grouped), "utf-8");
  return { jsonFile, htmlFile, counts };
}

function card(p: LibraryPanel, clusterKey: string): string {
  const id = panelId(p.imageUrl);
  return `<div class="card" data-id="${id}" data-cluster="${esc(clusterKey)}" data-url="${esc(p.imageUrl)}" data-src="${esc(p.slideshowUrl)}" data-niche="${esc(p.niche)}" data-ocr="${esc(clean(p.ocrText).slice(0, 160))}" data-views="${p.views}">
  <div class="imgwrap"><img loading="lazy" src="${esc(p.imageUrl)}" alt="${esc(p.scene)}">
    <button class="vote" title="Upvote to keep">♥</button>
    <div class="q">${p.quality}★</div>
    <a class="open" href="${esc(p.slideshowUrl)}" target="_blank" rel="noopener" title="Open source post">↗</a>
  </div>
  <div class="meta">
    ${p.ocrText ? `<div class="ocr">${esc(clean(p.ocrText).slice(0, 120))}</div>` : ""}
    <div class="src">${esc(p.niche)} · ${fmt(p.views)} views</div>
  </div>
</div>`;
}

function renderPicks(grouped: { cluster: PickCluster; items: LibraryPanel[] }[]): string {
  const total = grouped.reduce((a, g) => a + g.items.length, 0);
  const sections = grouped
    .filter((g) => g.items.length > 0)
    .map(
      (g) =>
        `<section data-cluster="${esc(g.cluster.key)}"><h2>${esc(g.cluster.label)} <span class="n">${g.items.length}</span></h2><p class="blurb">${esc(g.cluster.blurb)}</p><div class="grid">${g.items.map((p) => card(p, g.cluster.key)).join("")}</div></section>`
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Virlo carousel picks</title>
<style>
  :root{color-scheme:light;--ink:#1a1a1a;--muted:#6b6b6b;--line:#e6e6e6;--bg:#fafaf8;--card:#fff;--keep:#0a7a3c}
  body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  main{max-width:1300px;margin:0 auto;padding:12px 20px 100px}
  h1{font-size:22px;margin:0 0 4px}
  h2{font-size:17px;margin:28px 0 4px;border-bottom:1px solid var(--line);padding-bottom:6px}
  h2 .n{color:var(--muted);font-weight:400}
  .blurb{color:var(--muted);margin:4px 0 12px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
  .card{position:relative;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
  .card.keep{border-color:var(--keep);box-shadow:0 0 0 2px var(--keep) inset}
  .imgwrap{position:relative}
  .card img{width:100%;aspect-ratio:3/4;object-fit:cover;background:#eee;display:block}
  .card .q{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.6);color:#fff;border-radius:6px;padding:1px 6px;font-size:11px}
  .card .open{position:absolute;top:6px;left:6px;background:rgba(0,0,0,.6);color:#fff;border-radius:6px;padding:0 7px;font-size:13px;text-decoration:none;line-height:20px}
  .vote{position:absolute;bottom:8px;right:8px;width:38px;height:38px;border-radius:50%;border:none;cursor:pointer;font-size:19px;line-height:1;background:rgba(0,0,0,.55);color:#fff;transition:transform .08s}
  .vote:hover{transform:scale(1.08)}
  .card.keep .vote{background:var(--keep);color:#fff}
  .meta{padding:7px 9px 9px}.ocr{font-size:11px;color:#333;margin-bottom:4px;max-height:3.4em;overflow:hidden}.src{font-size:10px;color:var(--muted)}
  .card.hidden{display:none}section.hidden{display:none}
  header{position:sticky;top:0;z-index:10;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 20px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
  header h1{margin:0;font-size:18px}
  .count{font-weight:700;color:var(--keep)}
  header button,header label{border:1px solid var(--line);background:var(--card);border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer}
  header button.primary{background:var(--keep);color:#fff;border-color:var(--keep)}
  .modal{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:50;padding:20px}
  .modal.on{display:flex}
  .sheet{background:#fff;border-radius:12px;max-width:760px;width:100%;max-height:85vh;overflow:auto;padding:18px}
  .sheet h3{margin:0 0 6px}.sheet p{color:var(--muted);margin:0 0 10px}
  .sheet textarea{width:100%;height:260px;font:12px/1.4 ui-monospace,Menlo,monospace;border:1px solid var(--line);border-radius:8px;padding:10px;box-sizing:border-box}
  .sheet .row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
</style></head><body>
<header>
  <h1>Carousel picks</h1>
  <span><span class="count" id="keepN">0</span> kept · <span id="dropN">${total}</span> to remove of ${total}</span>
  <label><input type="checkbox" id="only" style="vertical-align:middle"> show kept only</label>
  <button id="export" class="primary">Export kept ▸</button>
  <button id="clear">Clear votes</button>
  <span style="color:var(--muted);font-size:12px">Upvote (♥) what to keep. Anything not upvoted gets removed. Votes save in this browser.</span>
</header>
<main>
<p class="blurb">High-value clusters beyond the five buckets — skincare-usable panels (face/eye), quality 4-5. ${total} panels. Reference, not clip-art.</p>
${sections}
</main>
<div class="modal" id="modal"><div class="sheet">
  <h3>Kept panels (<span id="mKeepN">0</span>)</h3>
  <p>Copy this and paste it back to Claude — it'll prune carousel-picks to just these and drop the rest.</p>
  <textarea id="out" readonly></textarea>
  <div class="row">
    <button id="copy" class="primary">Copy to clipboard</button>
    <button id="closeM">Close</button>
    <span id="copied" style="color:var(--keep);font-size:12px;align-self:center"></span>
  </div>
</div></div>
<script>
  var KEY='virlo_picks_kept_v1';
  function load(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){return {}}}
  function save(s){try{localStorage.setItem(KEY,JSON.stringify(s))}catch(e){}}
  var kept=load();
  var cards=[].slice.call(document.querySelectorAll('.card'));
  var total=cards.length;
  function refresh(){
    var n=0;
    cards.forEach(function(c){
      var on=!!kept[c.dataset.id];
      c.classList.toggle('keep',on);
      c.querySelector('.vote').textContent=on?'♥':'♡';
      if(on)n++;
    });
    document.getElementById('keepN').textContent=n;
    document.getElementById('dropN').textContent=total-n;
    applyFilter();
  }
  function applyFilter(){
    var only=document.getElementById('only').checked;
    cards.forEach(function(c){c.classList.toggle('hidden',only&&!kept[c.dataset.id])});
    document.querySelectorAll('section').forEach(function(s){
      var any=[].some.call(s.querySelectorAll('.card'),function(c){return !c.classList.contains('hidden')});
      s.classList.toggle('hidden',!any);
    });
  }
  cards.forEach(function(c){
    c.querySelector('.vote').addEventListener('click',function(e){
      e.preventDefault();
      if(kept[c.dataset.id])delete kept[c.dataset.id];else kept[c.dataset.id]=1;
      save(kept);refresh();
    });
  });
  document.getElementById('only').addEventListener('change',applyFilter);
  document.getElementById('clear').addEventListener('click',function(){
    if(confirm('Clear all upvotes?')){kept={};save(kept);refresh();}
  });
  document.getElementById('export').addEventListener('click',function(){
    var out=cards.filter(function(c){return kept[c.dataset.id]}).map(function(c){
      return {id:c.dataset.id,cluster:c.dataset.cluster,imageUrl:c.dataset.url,slideshowUrl:c.dataset.src,niche:c.dataset.niche,views:+c.dataset.views,ocr:c.dataset.ocr};
    });
    document.getElementById('out').value=JSON.stringify({keptCount:out.length,totalShown:total,kept:out},null,2);
    document.getElementById('mKeepN').textContent=out.length;
    document.getElementById('copied').textContent='';
    document.getElementById('modal').classList.add('on');
  });
  document.getElementById('copy').addEventListener('click',function(){
    var t=document.getElementById('out');t.select();
    var done=function(){document.getElementById('copied').textContent='Copied — paste it back to Claude'};
    if(navigator.clipboard){navigator.clipboard.writeText(t.value).then(done,function(){try{document.execCommand('copy');done()}catch(e){}})}
    else{try{document.execCommand('copy');done()}catch(e){}}
  });
  document.getElementById('closeM').addEventListener('click',function(){document.getElementById('modal').classList.remove('on')});
  refresh();
</script>
</body></html>`;
}
