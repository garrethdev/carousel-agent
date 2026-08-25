import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import {
  analyzeAgentHookPatterns,
  fetchHookTypeStats,
  HookPatternReport
} from "../src/core/hooks/virloHooks";

const envPath = process.env.DOTENV_CONFIG_PATH || ".env";
dotenv.config({ path: envPath });
dotenv.config({ path: "environment.env" });

/**
 * Pulls Virlo hooks for one or more content-research agents and prints a
 * pattern report (hook_type / visual_hook_type distribution, top hooks, and
 * the under-used-but-effective formats worth leaning into).
 *
 * Usage:
 *   npm run analyze:hooks -- <agentId> [agentId2 ...]
 *   npm run analyze:hooks            # falls back to VIRLO_AGENT_IDS env (comma-sep)
 */

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function printReport(label: string, r: HookPatternReport): void {
  console.log(`\n=================== ${label} ===================`);
  if (r.coverage) {
    console.log(
      `coverage: ${r.coverage.videos_with_hooks} hooks / ${r.coverage.videos_collected} videos collected`
    );
  }
  console.log(`sample (unique hooks analyzed): ${r.sampleSize}`);

  console.log("\nhook_type distribution:");
  for (const b of r.byHookType) {
    console.log(
      `  ${b.hookType.padEnd(20)} ${String(b.count).padStart(3)}  ${pct(
        b.share
      ).padStart(6)}  avgScore ${String(b.avgWeightedScore).padStart(
        7
      )}  medViews ${b.medianViews.toLocaleString()}`
    );
  }

  console.log("\nvisual_hook_type distribution:");
  for (const b of r.byVisualHookType) {
    console.log(
      `  ${b.hookType.padEnd(26)} ${String(b.count).padStart(3)}  ${pct(
        b.share
      ).padStart(6)}`
    );
  }

  console.log(
    `\nrecommended (effective + under-used): ${r.recommendedHookTypes.join(", ")}`
  );

  console.log("\ntop hooks by weighted score:");
  for (const h of r.topHooks.slice(0, 10)) {
    const text = (h.hook_text || "").replace(/\s+/g, " ").slice(0, 70);
    console.log(
      `  [${h.hook_type}/${h.visual_hook_type}] score=${(
        h.weighted_score ?? 0
      ).toFixed(1)} views=${h.video.views.toLocaleString()}`
    );
    console.log(`     "${text}"`);
  }
}

async function main() {
  const argIds = process.argv.slice(2);
  const envIds = (process.env.VIRLO_AGENT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const agentIds = argIds.length ? argIds : envIds;

  if (agentIds.length === 0) {
    console.error(
      "No agent ids. Pass them as args or set VIRLO_AGENT_IDS (comma-separated)."
    );
    process.exit(1);
  }

  // Corpus-wide effectiveness baseline (context for the per-agent reports).
  const corpus = await fetchHookTypeStats("hook_type");
  console.log("=== Corpus hook_type effectiveness (p90 weighted score) ===");
  for (const s of [...corpus].sort(
    (a, b) => b.p90_weighted_score - a.p90_weighted_score
  )) {
    console.log(
      `  ${s.value.padEnd(20)} share ${pct(s.share_of_corpus).padStart(
        6
      )}  medViews ${s.median_views.toLocaleString().padStart(9)}  p90 ${s.p90_weighted_score}`
    );
  }

  const reports: Record<string, HookPatternReport> = {};
  for (const id of agentIds) {
    const report = await analyzeAgentHookPatterns(id, { limit: 100 });
    reports[id] = report;
    printReport(id, report);
  }

  const outPath = path.resolve(__dirname, "hookPatternReport.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ corpus, reports }, null, 2),
    "utf-8"
  );
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error("analyzeHookPatterns failed:", err);
  process.exit(1);
});
