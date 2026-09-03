import { VirloNicheConfig } from "../../config/virloNiches";
import { createAgent, getAgent, listAgents } from "../../lib/virloClient";
import { VirloAgent } from "../../types/virlo";
import { startTiming } from "../../utils/timing";

export interface NicheAgentStatus {
  nicheKey: string;
  agentName: string;
  agentId: string;
  created: boolean;
  active: boolean;
  isProcessing: boolean;
  finalized: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  latestRunStatus: string | null;
  slideshowsLinked: number | null;
  intentKeywords: string[];
}

function toStatus(nicheKey: string, agent: VirloAgent, created: boolean): NicheAgentStatus {
  const run = agent.latest_run ?? null;
  return {
    nicheKey,
    agentName: agent.name ?? "",
    agentId: agent.id,
    created,
    active: Boolean(agent.active),
    isProcessing: Boolean(agent.is_processing),
    finalized: Boolean(agent.finalized),
    lastRunAt: agent.last_run_at ?? null,
    nextRunAt: agent.next_run_at ?? null,
    latestRunStatus: run?.status ?? null,
    slideshowsLinked: typeof run?.slideshows_linked === "number" ? run.slideshows_linked : null,
    intentKeywords: Array.isArray(agent.intent_keywords) ? agent.intent_keywords : []
  };
}

/**
 * Make sure every niche has a live Virlo agent.
 *
 * Resolution order per niche: configured agentId → agent with the same name →
 * create a new recurring agent from the niche config. Creation is free; the
 * first run (dispatched immediately by Virlo) bills $0.50.
 */
export async function ensureNicheAgents(
  niches: VirloNicheConfig[]
): Promise<NicheAgentStatus[]> {
  const endTiming = startTiming("ensureNicheAgents");
  try {
    const existing = await listAgents(100);
    const byId = new Map(existing.map((a) => [a.id, a]));
    const byName = new Map(existing.map((a) => [a.name ?? "", a]));
    const out: NicheAgentStatus[] = [];

    for (const niche of niches) {
      let agent = byId.get(niche.agentId) ?? byName.get(niche.agentName);
      let created = false;

      if (!agent) {
        console.warn(
          `[virlo] agent for niche "${niche.key}" not found (id ${niche.agentId}); creating "${niche.agentName}"`
        );
        agent = await createAgent({
          name: niche.agentName,
          intent: niche.intent,
          keywords: niche.keywords,
          exclude_keywords: niche.excludeKeywords,
          platforms: niche.platforms,
          is_recurring: true,
          cadence: niche.cadence,
          english_only: true,
          meta_ads_enabled: false,
          data_intelligence_enabled: false
        });
        created = true;
        console.warn(
          `[virlo] created agent ${agent.id} for "${niche.key}" — update agentId in src/config/virloNiches.ts`
        );
      }

      // Detail call adds latest_run + finalized, which the list omits.
      const detail = await getAgent(agent.id);
      out.push(toStatus(niche.key, detail, created));
    }
    return out;
  } finally {
    endTiming();
  }
}

/**
 * Poll until every listed agent has settled its latest run (or the timeout
 * elapses). Returns the final statuses either way; callers decide whether a
 * still-processing agent is acceptable.
 */
export async function waitForNicheAgents(
  niches: VirloNicheConfig[],
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<NicheAgentStatus[]> {
  const timeoutMs = opts.timeoutMs ?? 30 * 60 * 1000;
  const intervalMs = opts.intervalMs ?? 30 * 1000;
  const started = Date.now();

  let statuses = await ensureNicheAgents(niches);
  const settled = (s: NicheAgentStatus) =>
    !s.isProcessing &&
    s.lastRunAt !== null &&
    (s.latestRunStatus === null || !["queued", "processing"].includes(s.latestRunStatus));

  while (!statuses.every(settled) && Date.now() - started < timeoutMs) {
    const pending = statuses.filter((s) => !settled(s)).map((s) => s.nicheKey);
    console.log(`[virlo] waiting on agents: ${pending.join(", ")}`);
    await new Promise((r) => setTimeout(r, intervalMs));
    statuses = await Promise.all(
      niches.map(async (n) => {
        const prev = statuses.find((s) => s.nicheKey === n.key)!;
        const detail = await getAgent(prev.agentId);
        return toStatus(n.key, detail, prev.created);
      })
    );
  }
  return statuses;
}
