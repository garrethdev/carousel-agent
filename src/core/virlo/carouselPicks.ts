import * as fs from "fs";
import * as path from "path";
import { libraryDir, LibraryPanel, loadAllPanels } from "./imageLibrary";
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

function card(p: LibraryPanel): string {
  return `<a class="card" href="${esc(p.slideshowUrl)}" target="_blank" rel="noopener" title="${esc(p.scene)}">
  <img loading="lazy" src="${esc(p.imageUrl)}" alt="${esc(p.scene)}">
  <div class="q">${p.quality}★</div>
  <div class="meta">
    ${p.ocrText ? `<div class="ocr">${esc(clean(p.ocrText).slice(0, 120))}</div>` : ""}
    <div class="src">${esc(p.niche)} · ${fmt(p.views)} views</div>
  </div>
</a>`;
}

function renderPicks(grouped: { cluster: PickCluster; items: LibraryPanel[] }[]): string {
  const total = grouped.reduce((a, g) => a + g.items.length, 0);
  const sections = grouped
    .filter((g) => g.items.length > 0)
    .map(
      (g) =>
        `<section><h2>${esc(g.cluster.label)} <span class="n">${g.items.length}</span></h2><p class="blurb">${esc(g.cluster.blurb)}</p><div class="grid">${g.items.map(card).join("")}</div></section>`
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Virlo carousel picks</title>
<style>
  :root{color-scheme:light;--ink:#1a1a1a;--muted:#6b6b6b;--line:#e6e6e6;--bg:#fafaf8;--card:#fff}
  body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  main{max-width:1300px;margin:0 auto;padding:24px 20px 80px}
  h1{font-size:22px;margin:0 0 4px}
  h2{font-size:17px;margin:32px 0 4px;border-bottom:1px solid var(--line);padding-bottom:6px}
  h2 .n{color:var(--muted);font-weight:400}
  .blurb{color:var(--muted);margin:4px 0 12px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
  .card{position:relative;display:block;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;color:inherit;text-decoration:none}
  .card img{width:100%;aspect-ratio:3/4;object-fit:cover;background:#eee;display:block}
  .card .q{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.65);color:#fff;border-radius:6px;padding:1px 6px;font-size:11px}
  .meta{padding:7px 9px 9px}.ocr{font-size:11px;color:#333;margin-bottom:4px;max-height:3.4em;overflow:hidden}.src{font-size:10px;color:var(--muted)}
</style></head><body><main>
<h1>Virlo carousel picks <span style="font-weight:400;color:var(--muted)">· ${total} curated panels · reusable reference, not clip-art</span></h1>
<p class="blurb">The high-value clusters beyond the five requested buckets — skincare-usable panels (face/eye), quality 4-5, best of each by views.</p>
${sections}
</main></body></html>`;
}
