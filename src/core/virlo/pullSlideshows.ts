import * as fs from "fs";
import * as path from "path";
import { VirloNicheConfig } from "../../config/virloNiches";
import { getAllAgentSlideshows } from "../../lib/virloClient";
import { VirloSlideshow } from "../../types/virlo";
import { startTiming } from "../../utils/timing";
import { ensureDir, snapshotDir, timestampSlug } from "./paths";
import { AGENT_SOURCE, loadHookCorpusCache, pullHookCorpusForNiche } from "./hookCorpus";
import { slideshowExternalId } from "../../lib/virloClient";

export interface NicheSnapshot {
  nicheKey: string;
  agentId: string;
  agentName: string;
  pulledAt: string;
  minViews: number;
  /** Items Virlo reported for the agent before floor/dedupe. */
  totalReported: number;
  rawCount: number;
  count: number;
  /** Items per source after merge: agent (free) vs hook_corpus ($0.25/query). */
  sourceCounts: Record<string, number>;
  hookCorpusPulledAt: string | null;
  items: VirloSlideshow[];
}

export interface PullOptions {
  /** Override the niche floor (e.g. 0 to keep everything). */
  minViews?: number;
  maxPages?: number;
  /** Skip writing to disk (API use). */
  persist?: boolean;
  /** Query the hook corpus for any niche query not yet cached (bills $0.25 per new query). Default: reuse cache only. */
  refreshHooks?: boolean;
  /** Ignore the hook corpus entirely (agent slideshows only). */
  agentOnly?: boolean;
}

/**
 * Pull all slideshows for a niche's agent, apply the view floor, and persist a
 * timestamped snapshot plus `latest.json` under data/virlo/snapshots/<niche>/.
 */
export async function pullNicheSnapshot(
  niche: VirloNicheConfig,
  opts: PullOptions = {}
): Promise<NicheSnapshot> {
  const endTiming = startTiming(`pullNicheSnapshot:${niche.key}`);
  try {
    const minViews = opts.minViews ?? niche.minViews;
    const agentPull = await getAllAgentSlideshows(niche.agentId, {
      minViews,
      maxPages: opts.maxPages
    });
    const rawCount = agentPull.rawCount;
    const total = agentPull.total;

    const byId = new Map<string, VirloSlideshow>();
    for (const s of agentPull.items) {
      byId.set(slideshowExternalId(s), { ...s, _source: AGENT_SOURCE });
    }

    let hookCorpusPulledAt: string | null = null;
    if (!opts.agentOnly) {
      const cache = opts.refreshHooks
        ? await pullHookCorpusForNiche(niche, { minViews, persist: opts.persist })
        : loadHookCorpusCache(niche.key);
      if (cache) {
        hookCorpusPulledAt = cache.pulledAt;
        for (const s of cache.items) {
          if ((s.views || 0) < minViews) continue;
          const id = slideshowExternalId(s);
          // Agent items win: they carry the full intelligence block.
          if (!byId.has(id)) byId.set(id, s);
        }
      }
    }

    const items = Array.from(byId.values()).sort((a, b) => (b.views || 0) - (a.views || 0));
    const sourceCounts: Record<string, number> = {};
    for (const s of items) {
      const src = typeof s._source === "string" ? s._source : AGENT_SOURCE;
      sourceCounts[src] = (sourceCounts[src] ?? 0) + 1;
    }

    const snapshot: NicheSnapshot = {
      nicheKey: niche.key,
      agentId: niche.agentId,
      agentName: niche.agentName,
      pulledAt: new Date().toISOString(),
      minViews,
      totalReported: total,
      rawCount,
      count: items.length,
      sourceCounts,
      hookCorpusPulledAt,
      items
    };

    if (opts.persist !== false) {
      const dir = snapshotDir(niche.key);
      ensureDir(dir);
      const json = JSON.stringify(snapshot, null, 2);
      fs.writeFileSync(path.join(dir, `${timestampSlug()}.json`), json, "utf-8");
      fs.writeFileSync(path.join(dir, "latest.json"), json, "utf-8");
    }

    console.log(
      `[virlo] ${niche.key}: agent reported=${total} raw=${rawCount}; merged aboveFloor(${minViews})=${items.length} sources=${JSON.stringify(sourceCounts)}`
    );
    return snapshot;
  } finally {
    endTiming();
  }
}

export function loadLatestSnapshot(nicheKey: string): NicheSnapshot | null {
  const file = path.join(snapshotDir(nicheKey), "latest.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8")) as NicheSnapshot;
}
