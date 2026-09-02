import dotenv from "dotenv";
import { resolveNiches, VIRLO_NICHES } from "../config/virloNiches";
import { getBalance } from "../lib/virloClient";
import { ensureNicheAgents, waitForNicheAgents } from "../core/virlo/ensureAgents";
import { pullNicheSnapshot } from "../core/virlo/pullSlideshows";
import {
  crossRouteHookCaches,
  mergeIntoHookCorpusCache,
  pullHookCorpusForNiche,
  pullTrendingBeautySlideshows
} from "../core/virlo/hookCorpus";
import {
  analyzeLatestNiche,
  analyzeNiche,
  rebuildCrossNicheSummary,
  writeCrossNicheSummary
} from "../core/virlo/runPipeline";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || ".env" });
dotenv.config({ path: "environment.env" });
dotenv.config({ path: ".env.local" });

/**
 * CLI for the Virlo slideshow research lane.
 *
 *   npm run virlo:status                 – agents, latest runs, credit balance
 *   npm run virlo:ensure                 – create any missing niche agents
 *   npm run virlo:pull   [niche ...]     – pull slideshows into data/virlo/snapshots
 *   npm run virlo:analyze [niche ...]    – analyse latest snapshots → data/virlo/reports
 *   npm run virlo:run    [niche ...]     – ensure + wait for runs + pull + analyze
 *   npm run virlo:summary                – rebuild reports/README.md from stored reports (no LLM)
 *
 * Flags:
 *   --no-llm          skip the OpenRouter insight pass
 *   --min-views=N     override the niche view floor
 *   --wait            (pull/run) block until every agent's latest run has settled
 *   --timeout-min=N   max wait (default 30)
 *   --hooks           ALSO query the corpus-wide hook endpoints for slideshows.
 *                     Incremental: only queries not yet in the niche cache are
 *                     billed ($0.25 each) + $0.25 for one beauty-trending call
 *                     when all niches run. Cached in snapshots/<niche>/hooks-latest.json
 *                     and reused by later pulls that omit --hooks.
 *   --refresh-hooks   re-run every hook query (bills all of them)
 *   --agent-only      ignore the hook-corpus cache entirely
 */

interface CliArgs {
  command: string;
  niches: string[];
  llm: boolean;
  minViews?: number;
  wait: boolean;
  timeoutMin: number;
  hooks: boolean;
  refreshHooks: boolean;
  agentOnly: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const [command = "status", ...rest] = argv;
  const args: CliArgs = { command, niches: [], llm: true, wait: false, timeoutMin: 30, hooks: false, refreshHooks: false, agentOnly: false };
  for (const a of rest) {
    if (a === "--no-llm") args.llm = false;
    else if (a === "--wait") args.wait = true;
    else if (a === "--hooks") args.hooks = true;
    else if (a === "--refresh-hooks") { args.hooks = true; args.refreshHooks = true; }
    else if (a === "--agent-only") args.agentOnly = true;
    else if (a.startsWith("--min-views=")) args.minViews = Number(a.split("=")[1]);
    else if (a.startsWith("--timeout-min=")) args.timeoutMin = Number(a.split("=")[1]);
    else if (!a.startsWith("--")) args.niches.push(a);
  }
  return args;
}

/** Refresh the hook-corpus caches (billed). Trending routing only when every niche is in scope. */
async function refreshHookCorpus(
  niches: ReturnType<typeof resolveNiches>,
  minViews: number | undefined,
  force: boolean
): Promise<void> {
  for (const niche of niches) {
    await pullHookCorpusForNiche(niche, { minViews, force });
  }
  if (niches.length === VIRLO_NICHES.length && force) {
    const routed = await pullTrendingBeautySlideshows(niches, { minViews });
    for (const niche of niches) {
      const extra = routed[niche.key] ?? [];
      const merged = mergeIntoHookCorpusCache(niche, extra);
      console.log(`[virlo] ${niche.key}: +${extra.length} routed trending hooks -> hook cache now ${merged.items.length}`);
    }
  }
  const added = crossRouteHookCaches(VIRLO_NICHES);
  console.log(`[virlo] cross-niche routing added: ${JSON.stringify(added)}`);
}

function printStatusTable(rows: Awaited<ReturnType<typeof ensureNicheAgents>>): void {
  for (const r of rows) {
    console.log(
      `- ${r.nicheKey.padEnd(12)} ${r.agentId}  active=${r.active} processing=${r.isProcessing} finalized=${r.finalized} run=${r.latestRunStatus ?? "none"} last=${r.lastRunAt ?? "never"} next=${r.nextRunAt ?? "–"}${r.created ? "  (CREATED — update agentId in config)" : ""}`
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const niches = resolveNiches(args.niches);

  switch (args.command) {
    case "status": {
      const balance = await getBalance();
      console.log(`Virlo balance: ${balance.balance} (${balance.credits_remaining} credits, ${balance.status})`);
      printStatusTable(await ensureNicheAgents(niches));
      return;
    }
    case "ensure": {
      printStatusTable(await ensureNicheAgents(niches));
      return;
    }
    case "pull": {
      if (args.wait) {
        printStatusTable(await waitForNicheAgents(niches, { timeoutMs: args.timeoutMin * 60_000 }));
      }
      if (args.hooks) await refreshHookCorpus(niches, args.minViews, args.refreshHooks);
      for (const niche of niches) {
        await pullNicheSnapshot(niche, { minViews: args.minViews, agentOnly: args.agentOnly });
      }
      return;
    }
    case "analyze": {
      const results = [];
      for (const niche of niches) {
        results.push(await analyzeLatestNiche(niche, { llm: args.llm }));
      }
      if (niches.length === VIRLO_NICHES.length) writeCrossNicheSummary(results);
      return;
    }
    case "summary": {
      const file = rebuildCrossNicheSummary(VIRLO_NICHES);
      if (!file) console.error("No stored reports yet — run analyze first.");
      return;
    }
    case "run": {
      printStatusTable(await waitForNicheAgents(niches, { timeoutMs: args.timeoutMin * 60_000 }));
      if (args.hooks) await refreshHookCorpus(niches, args.minViews, args.refreshHooks);
      const results = [];
      for (const niche of niches) {
        const snapshot = await pullNicheSnapshot(niche, { minViews: args.minViews, agentOnly: args.agentOnly });
        results.push(await analyzeNiche(niche, snapshot, { llm: args.llm }));
      }
      if (niches.length === VIRLO_NICHES.length) writeCrossNicheSummary(results);
      const balance = await getBalance();
      console.log(`Virlo balance after run: ${balance.balance}`);
      return;
    }
    default:
      console.error(`Unknown command "${args.command}". Use: status | ensure | pull | analyze | summary | run`);
      process.exit(2);
  }
}

main().catch((err) => {
  console.error("virlo CLI failed:", err);
  process.exit(1);
});
