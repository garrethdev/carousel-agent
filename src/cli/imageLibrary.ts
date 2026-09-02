import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { VIRLO_NICHES } from "../config/virloNiches";
import { getAllAgentSlideshows } from "../lib/virloClient";
import { loadHookCorpusCache } from "../core/virlo/hookCorpus";
import {
  appendPanel,
  classifyPanels,
  loadAllPanels,
  loadClassifiedIds,
  OCR_MODEL,
  PanelCandidate,
  panelId,
  selectPanelCandidates,
  thumbnailCandidates
} from "../core/virlo/imageLibrary";
import { buildLibraryOutputs } from "../core/virlo/renderLibrary";
import { collectBeforeAfterSets, buildBeforeAfterOutputs } from "../core/virlo/beforeAfterLibrary";
import { virloDataDir } from "../core/virlo/paths";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || ".env" });
dotenv.config({ path: "environment.env" });
dotenv.config({ path: ".env.local" });

/**
 * Build a tagged, reusable image library from Virlo slideshow panels.
 *
 *   npm run virlo:library select   – list candidate panel counts (no spend)
 *   npm run virlo:library build    – classify candidates (Qwen3-VL) and render gallery
 *   npm run virlo:library render   – rebuild index + gallery from what's classified
 *
 *   npm run virlo:library beforeafter [--all]  - before/after slideshow mini-library
 *
 * Flags: --concurrency=N (default 16), --limit=N, --source=agents|thumbs|all, --all (beforeafter: include body niches)
 * Candidate sources:
 *   - agents: panels of already-downloaded agent slideshow JSON in $AGENT_JSON_DIR
 *   - thumbs: cover thumbnails from the three skincare hook-corpus caches
 */

interface Args {
  command: string;
  concurrency: number;
  limit?: number;
  source: "agents" | "thumbs" | "all";
}

function parseArgs(argv: string[]): Args {
  const [command = "select", ...rest] = argv;
  const a: Args = { command, concurrency: 16, source: "all" };
  for (const x of rest) {
    if (x.startsWith("--concurrency=")) a.concurrency = Number(x.split("=")[1]);
    else if (x.startsWith("--limit=")) a.limit = Number(x.split("=")[1]);
    else if (x.startsWith("--source=")) a.source = x.split("=")[1] as Args["source"];
  }
  return a;
}

/** Agent slideshow JSON dumps live in $AGENT_JSON_DIR (default data/virlo/agents-raw). */
function agentJsonDir(): string {
  return process.env.AGENT_JSON_DIR || path.join(virloDataDir(), "agents-raw");
}

function loadAgentCandidates(): PanelCandidate[] {
  const dir = agentJsonDir();
  if (!fs.existsSync(dir)) return [];
  const out: PanelCandidate[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const niche = file.replace(/\.json$/, "");
    const slideshows = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    out.push(...selectPanelCandidates(slideshows, niche));
  }
  return out;
}

function loadThumbCandidates(): PanelCandidate[] {
  const out: PanelCandidate[] = [];
  for (const niche of VIRLO_NICHES) {
    const cache = loadHookCorpusCache(niche.key);
    if (cache) out.push(...thumbnailCandidates(cache.items, niche.key));
  }
  return out;
}

/**
 * Classification order priority by niche. The library is for the skincare / eye
 * lane, so those panels must be classified FIRST — otherwise a capped or
 * interrupted run (e.g. credits running out) spends its whole budget on the
 * large body-transformation niches and never reaches the eye content. Lower =
 * earlier. "peptides" carries facial/looksmaxing content so it ranks above the
 * pure body niches.
 */
const NICHE_PRIORITY: Record<string, number> = {
  "eye-care": 0,
  "eye-masks": 0,
  "anti-aging": 0,
  peptides: 1,
  bna: 2,
  glp1: 2,
  "weight-loss": 3,
  bww: 3,
  lavish: 3
};

function gatherCandidates(source: Args["source"]): PanelCandidate[] {
  const list: PanelCandidate[] = [];
  if (source === "agents" || source === "all") list.push(...loadAgentCandidates());
  if (source === "thumbs" || source === "all") list.push(...loadThumbCandidates());
  // dedupe by image url
  const seen = new Set<string>();
  const deduped = list.filter((c) => {
    const id = panelId(c.imageUrl);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  // Skincare/eye niches first, then by views desc so the strongest panels in
  // each niche are catalogued before weaker ones.
  return deduped.sort(
    (a, b) =>
      (NICHE_PRIORITY[a.niche] ?? 5) - (NICHE_PRIORITY[b.niche] ?? 5) ||
      (b.views || 0) - (a.views || 0)
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "select") {
    const cands = gatherCandidates(args.source);
    const byNiche: Record<string, number> = {};
    for (const c of cands) byNiche[c.niche] = (byNiche[c.niche] ?? 0) + 1;
    console.log(`Candidate panels: ${cands.length}`);
    console.log(JSON.stringify(byNiche, null, 2));
    console.log(`Estimated cost @ ~$0.00034/panel: $${(cands.length * 0.00034).toFixed(2)} (model ${OCR_MODEL})`);
    return;
  }

  if (args.command === "beforeafter") {
    const faceOnly = !process.argv.includes("--all");
    const sets = collectBeforeAfterSets(agentJsonDir(), { faceOnly });
    const { jsonFile, htmlFile } = buildBeforeAfterOutputs(sets);
    const byNiche: Record<string, number> = {};
    for (const s of sets) byNiche[s.niche] = (byNiche[s.niche] ?? 0) + 1;
    console.log(
      `Before/after mini-library: ${sets.length} slideshows (${faceOnly ? "face/skin only; pass --all for body too" : "all"}) → ${htmlFile}, ${jsonFile}`
    );
    console.log(JSON.stringify(byNiche, null, 2));
    return;
  }

  if (args.command === "render") {
    const panels = loadAllPanels();
    const { indexFile, galleryFile, index } = buildLibraryOutputs(panels);
    console.log(`Rendered ${panels.length} panels → ${indexFile}, ${galleryFile}`);
    console.log(JSON.stringify(index.byCategory, null, 2));
    return;
  }

  if (args.command === "build") {
    let cands = gatherCandidates(args.source);
    const done = loadClassifiedIds();
    cands = cands.filter((c) => !done.has(panelId(c.imageUrl)));
    if (args.limit) cands = cands.slice(0, args.limit);
    console.log(`[library] ${cands.length} panels to classify (${done.size} already done) with ${OCR_MODEL}, concurrency ${args.concurrency}`);
    if (cands.length === 0) {
      const panels = loadAllPanels();
      const { index } = buildLibraryOutputs(panels);
      console.log(`[library] nothing new; rendered ${panels.length}. Categories: ${JSON.stringify(index.byCategory)}`);
      return;
    }
    const t0 = Date.now();
    const { classified, failed } = await classifyPanels(cands, {
      concurrency: args.concurrency,
      onResult: appendPanel,
      onProgress: (d, total, f) =>
        console.log(`[library] ${d}/${total} classified (${f} failed, ${Math.round((Date.now() - t0) / 1000)}s)`)
    });
    console.log(`[library] done: ${classified} classified, ${failed} failed in ${Math.round((Date.now() - t0) / 1000)}s`);
    const panels = loadAllPanels();
    const { indexFile, galleryFile, index } = buildLibraryOutputs(panels);
    console.log(`[library] wrote ${indexFile}, ${galleryFile}`);
    console.log(JSON.stringify(index.byCategory, null, 2));
    return;
  }

  console.error(`Unknown command "${args.command}". Use: select | build | render | beforeafter`);
  process.exit(2);
}

main().catch((err) => {
  console.error("image library CLI failed:", err);
  process.exit(1);
});
