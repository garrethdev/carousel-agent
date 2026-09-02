import * as fs from "fs";
import * as path from "path";
import { VirloNicheConfig } from "../../config/virloNiches";
import { analyzeSnapshot, NicheAnalysis } from "./analyzeSlideshows";
import { generateNicheInsights, NicheInsights } from "./llmInsights";
import { ensureDir, reportDir } from "./paths";
import { loadLatestSnapshot, NicheSnapshot, pullNicheSnapshot, PullOptions } from "./pullSlideshows";
import {
  NicheReportBundle,
  renderCrossNicheMarkdown,
  renderNicheReportHtml,
  renderNicheReportMarkdown
} from "./renderReport";

export interface AnalyzeOptions {
  /** Skip the OpenRouter insight pass (deterministic report only). */
  llm?: boolean;
  /** Skip writing report files. */
  persist?: boolean;
}

export interface NicheRunResult extends NicheReportBundle {
  snapshot: NicheSnapshot;
  files: { json?: string; markdown?: string; html?: string };
}

/** Analyse a snapshot, optionally run the LLM pass, and write reports. */
export async function analyzeNiche(
  niche: VirloNicheConfig,
  snapshot: NicheSnapshot,
  opts: AnalyzeOptions = {}
): Promise<NicheRunResult> {
  const analysis: NicheAnalysis = analyzeSnapshot(snapshot);
  const insights: NicheInsights | null = opts.llm === false ? null : await generateNicheInsights(niche, analysis);
  const bundle: NicheReportBundle = { niche, analysis, insights };
  const files: NicheRunResult["files"] = {};

  if (opts.persist !== false) {
    const dir = reportDir();
    ensureDir(dir);
    files.json = path.join(dir, `${niche.key}.json`);
    files.markdown = path.join(dir, `${niche.key}.md`);
    files.html = path.join(dir, `${niche.key}.html`);
    fs.writeFileSync(files.json, JSON.stringify({ analysis, insights }, null, 2), "utf-8");
    fs.writeFileSync(files.markdown, renderNicheReportMarkdown(bundle), "utf-8");
    fs.writeFileSync(files.html, renderNicheReportHtml(bundle), "utf-8");
    console.log(`[virlo] wrote ${files.markdown}`);
  }
  return { ...bundle, snapshot, files };
}

/** Pull fresh data for a niche and analyse it in one go. */
export async function pullAndAnalyzeNiche(
  niche: VirloNicheConfig,
  opts: PullOptions & AnalyzeOptions = {}
): Promise<NicheRunResult> {
  const snapshot = await pullNicheSnapshot(niche, opts);
  return analyzeNiche(niche, snapshot, opts);
}

/** Analyse the latest stored snapshot for a niche (no API calls to Virlo). */
export async function analyzeLatestNiche(
  niche: VirloNicheConfig,
  opts: AnalyzeOptions = {}
): Promise<NicheRunResult> {
  const snapshot = loadLatestSnapshot(niche.key);
  if (!snapshot) {
    throw new Error(`No snapshot for niche "${niche.key}" — run a pull first.`);
  }
  return analyzeNiche(niche, snapshot, opts);
}

export function writeCrossNicheSummary(results: NicheReportBundle[]): string {
  const dir = reportDir();
  ensureDir(dir);
  const file = path.join(dir, "README.md");
  fs.writeFileSync(file, renderCrossNicheMarkdown(results), "utf-8");
  console.log(`[virlo] wrote ${file}`);
  return file;
}

/** Rebuild the cross-niche README from the stored per-niche reports (no API or LLM calls). */
export function rebuildCrossNicheSummary(niches: VirloNicheConfig[]): string | null {
  const bundles: NicheReportBundle[] = [];
  for (const niche of niches) {
    const report = loadLatestReport(niche.key);
    if (report) bundles.push({ niche, analysis: report.analysis, insights: report.insights });
  }
  if (bundles.length === 0) return null;
  return writeCrossNicheSummary(bundles);
}

export function loadLatestReport(nicheKey: string): { analysis: NicheAnalysis; insights: NicheInsights | null } | null {
  const file = path.join(reportDir(), `${nicheKey}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}
