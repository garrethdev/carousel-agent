import * as fs from "fs";
import * as path from "path";
import { libraryDir, LibraryCategory, LibraryPanel, TARGET_CATEGORIES } from "./imageLibrary";
import { ensureDir } from "./paths";

/** Build the curated index + browsable gallery from the classified panels. */

const CATEGORY_LABEL: Record<string, string> = {
  doctor_quote: "Doctor / expert quote",
  two_person_quote: "Two people (quote between)",
  applying_cream: "Applying cream to eyes",
  fact_card: "Fact card",
  before_after: "Before / after",
  problem_closeup: "Problem close-up",
  testimonial: "Testimonial",
  other: "Other"
};

const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export interface LibraryIndex {
  generatedAt: string;
  total: number;
  byCategory: Record<string, number>;
  bySubject: Record<string, number>;
  byNiche: Record<string, number>;
  panels: LibraryPanel[];
}

/**
 * Curate: keep the target categories, sort by (quality desc, views desc),
 * and write library-index.json (target categories only) + gallery.html (all).
 */
export function buildLibraryOutputs(panels: LibraryPanel[]): { indexFile: string; galleryFile: string; index: LibraryIndex } {
  ensureDir(libraryDir());
  const count = (key: (p: LibraryPanel) => string) => {
    const m: Record<string, number> = {};
    for (const p of panels) m[key(p)] = (m[key(p)] ?? 0) + 1;
    return m;
  };

  const sorted = [...panels].sort((a, b) => b.quality - a.quality || b.views - a.views);
  const target = sorted.filter((p) => TARGET_CATEGORIES.includes(p.category));

  const index: LibraryIndex = {
    generatedAt: new Date().toISOString(),
    total: panels.length,
    byCategory: count((p) => p.category),
    bySubject: count((p) => p.subject),
    byNiche: count((p) => p.niche),
    panels: target
  };

  const indexFile = path.join(libraryDir(), "library-index.json");
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2), "utf-8");

  const galleryFile = path.join(libraryDir(), "gallery.html");
  fs.writeFileSync(galleryFile, renderGallery(sorted, index), "utf-8");
  return { indexFile, galleryFile, index };
}

function card(p: LibraryPanel): string {
  return `<a class="card" data-cat="${esc(p.category)}" data-subj="${esc(p.subject)}" data-niche="${esc(p.niche)}" href="${esc(p.slideshowUrl)}" target="_blank" rel="noopener" title="${esc(p.scene)}">
  <img loading="lazy" src="${esc(p.imageUrl)}" alt="${esc(p.scene)}">
  <div class="q">${p.quality}★</div>
  <div class="meta">
    <div class="tags">${p.tags.slice(0, 5).map((t) => `<span>${esc(t)}</span>`).join("")}</div>
    ${p.ocrText ? `<div class="ocr">${esc(p.ocrText.replace(/\n+/g, " · ").slice(0, 120))}</div>` : ""}
    <div class="src">${esc(p.niche)} · ${fmt(p.views)} views · panel ${p.panelIndex}</div>
  </div>
</a>`;
}

function renderGallery(all: LibraryPanel[], index: LibraryIndex): string {
  const cats = [...TARGET_CATEGORIES, "problem_closeup", "testimonial", "other"] as LibraryCategory[];
  const niches = Object.keys(index.byNiche).sort();
  const sections = cats
    .filter((c) => all.some((p) => p.category === c))
    .map((c) => {
      const items = all.filter((p) => p.category === c);
      return `<section data-section="${c}"><h2>${esc(CATEGORY_LABEL[c] || c)} <span class="n">${items.length}</span></h2><div class="grid">${items.map(card).join("")}</div></section>`;
    })
    .join("");

  const chip = (label: string, attr: string, val: string) =>
    `<button class="chip" data-attr="${attr}" data-val="${esc(val)}">${esc(label)}</button>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Virlo eye-care image library</title>
<style>
  :root{color-scheme:light;--ink:#1a1a1a;--muted:#6b6b6b;--line:#e6e6e6;--bg:#fafaf8;--card:#fff;--accent:#0a7a3c}
  body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:14px 20px;z-index:5}
  h1{font-size:20px;margin:0 0 8px}
  .bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .chip{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:4px 12px;font-size:12px;cursor:pointer}
  .chip.on{background:var(--accent);color:#fff;border-color:var(--accent)}
  main{padding:8px 20px 80px;max-width:1400px;margin:0 auto}
  h2{font-size:16px;margin:28px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}
  h2 .n{color:var(--muted);font-weight:400}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
  .card{position:relative;display:block;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;color:inherit;text-decoration:none}
  .card img{width:100%;aspect-ratio:3/4;object-fit:cover;background:#eee;display:block}
  .card .q{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.65);color:#fff;border-radius:6px;padding:1px 6px;font-size:11px}
  .meta{padding:7px 9px 9px}
  .tags{display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px}
  .tags span{background:#f1f1ee;border-radius:4px;padding:0 5px;font-size:10px;color:#444}
  .ocr{font-size:11px;color:#333;margin-bottom:4px;max-height:2.8em;overflow:hidden}
  .src{font-size:10px;color:var(--muted)}
  section.hidden,.card.hidden{display:none}
</style></head><body>
<header>
  <h1>Virlo eye-care image library <span style="font-weight:400;color:var(--muted)">· ${index.total} panels classified · reference library, not clip-art</span></h1>
  <div class="bar">
    <strong style="font-size:12px">Category:</strong>
    ${cats.filter((c) => index.byCategory[c]).map((c) => chip(`${CATEGORY_LABEL[c] || c} (${index.byCategory[c]})`, "cat", c)).join("")}
    <strong style="font-size:12px;margin-left:10px">Niche:</strong>
    ${niches.map((n) => chip(`${n} (${index.byNiche[n]})`, "niche", n)).join("")}
    <button class="chip" id="reset">reset</button>
  </div>
</header>
<main>${sections}</main>
<script>
  const state={cat:null,niche:null};
  const chips=[...document.querySelectorAll('.chip[data-attr]')];
  function apply(){
    for(const card of document.querySelectorAll('.card')){
      const okCat=!state.cat||card.dataset.cat===state.cat;
      const okNiche=!state.niche||card.dataset.niche===state.niche;
      card.classList.toggle('hidden',!(okCat&&okNiche));
    }
    for(const sec of document.querySelectorAll('section')){
      const any=[...sec.querySelectorAll('.card')].some(c=>!c.classList.contains('hidden'));
      sec.classList.toggle('hidden',!any);
    }
  }
  chips.forEach(ch=>ch.addEventListener('click',()=>{
    const a=ch.dataset.attr,v=ch.dataset.val;
    state[a]=state[a]===v?null:v;
    chips.forEach(c=>{if(c.dataset.attr===a)c.classList.toggle('on',c.dataset.val===state[a])});
    apply();
  }));
  document.getElementById('reset').addEventListener('click',()=>{state.cat=null;state.niche=null;chips.forEach(c=>c.classList.remove('on'));apply();});
</script>
</body></html>`;
}
