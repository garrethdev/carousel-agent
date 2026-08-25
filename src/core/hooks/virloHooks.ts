/**
 * Virlo hook-corpus integration.
 *
 * Virlo extracts a "hook" (the opening line / on-screen text) from every short-form
 * video it collects and tags it with a taxonomy:
 *   - hook_type        (question, bold_claim, before_after, pov_setup, ...)
 *   - visual_hook_type (text_hook, before_state, person_speaking_to_camera, ...)
 * plus an `outlier_ratio` (views vs. the creator's baseline) and a `weighted_score`
 * that blends performance with recency.
 *
 * This module pulls those hooks and aggregates them into a pattern report we can
 * use to (a) study what over-performs in a niche and (b) steer our own hook
 * generation toward high-signal formats instead of oversaturated ones.
 */

import { virloGet } from "../../lib/virloClient";

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

export const HOOK_TYPES = [
  "question",
  "bold_claim",
  "shock_statement",
  "story_tease",
  "tutorial_promise",
  "controversy",
  "before_after",
  "pov_setup",
  "statistic",
  "direct_address",
  "trend_reference",
  "cliffhanger",
  "negation",
  "relatable_scenario",
  "comparison",
  "mystery_setup"
] as const;
export type HookType = (typeof HOOK_TYPES)[number];

export const VISUAL_HOOK_TYPES = [
  "text_hook",
  "extreme_closeup",
  "before_state",
  "shocking_image",
  "aesthetic_setup",
  "person_speaking_to_camera",
  "motion_action",
  "crowded_scene",
  "mystery_object",
  "dramatic_zoom",
  "animal_pet"
] as const;
export type VisualHookType = (typeof VISUAL_HOOK_TYPES)[number];

export type Platform = "tiktok" | "youtube" | "instagram";

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export interface HookVideo {
  video_id: string;
  url: string;
  thumbnail_url?: string;
  views: number;
  likes?: number;
  comments?: number;
  shares?: number | null;
  duration?: number;
  publish_date?: string;
  author_handle?: string;
  author_followers?: number;
}

export interface HookRecord {
  hook_text: string;
  hook_type: HookType | "none" | null;
  visual_hook_type: VisualHookType | "none" | null;
  content_type?: "video" | "slideshow";
  platform: Platform;
  category?: string;
  language?: string;
  brand_safety_tier?: string;
  outlier_ratio?: number;
  weighted_score?: number;
  video: HookVideo;
}

export interface HookTypeStat {
  value: string;
  video_count: number;
  share_of_corpus: number;
  total_views: number;
  avg_views: number;
  median_views: number;
  avg_weighted_score: number;
  p90_weighted_score: number;
}

export interface AgentHooksResponse {
  agent_id: string;
  coverage: { videos_collected: number; videos_with_hooks: number };
  hooks: HookRecord[];
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

/** Hook taxonomy with corpus-wide effectiveness stats. */
export async function fetchHookTypeStats(
  dimension: "hook_type" | "visual_hook_type" = "hook_type",
  opts: { platform?: Platform; category?: string } = {}
): Promise<HookTypeStat[]> {
  const res = await virloGet<{ data: { types: HookTypeStat[] } }>(
    "hooks/types",
    { dimension, platform: opts.platform, category: opts.category }
  );
  return res.data?.types ?? [];
}

/** Ranked hooks extracted from a single content-research agent's videos. */
export async function fetchAgentHooks(
  agentId: string,
  opts: {
    limit?: number;
    page?: number;
    platform?: Platform;
    hookType?: HookType;
    minViews?: number;
    sort?: "weighted_score" | "views";
  } = {}
): Promise<AgentHooksResponse> {
  const res = await virloGet<{ data: AgentHooksResponse }>(
    `agents/${agentId}/hooks`,
    {
      limit: opts.limit ?? 100,
      page: opts.page,
      platform: opts.platform,
      hook_type: opts.hookType,
      min_views: opts.minViews,
      sort: opts.sort ?? "weighted_score"
    }
  );
  return res.data;
}

/** Top-performing hooks across the whole corpus (optionally filtered). */
export async function fetchTrendingHooks(
  opts: {
    limit?: number;
    days?: 7 | 14 | 30;
    platform?: Platform;
    category?: string;
    hookType?: HookType;
    minViews?: number;
    sort?: "weighted_score" | "views";
  } = {}
): Promise<HookRecord[]> {
  const res = await virloGet<{ data: HookRecord[] }>("hooks/trending", {
    limit: opts.limit ?? 50,
    days: opts.days,
    platform: opts.platform,
    category: opts.category,
    hook_type: opts.hookType,
    min_views: opts.minViews,
    sort: opts.sort ?? "weighted_score"
  });
  return res.data ?? [];
}

// ---------------------------------------------------------------------------
// Pattern aggregation
// ---------------------------------------------------------------------------

export interface HookTypeBreakdown {
  hookType: string;
  count: number;
  share: number; // 0..1 of the sample
  avgWeightedScore: number;
  avgViews: number;
  medianViews: number;
}

export interface HookPatternReport {
  sampleSize: number;
  coverage?: { videos_collected: number; videos_with_hooks: number };
  byHookType: HookTypeBreakdown[];
  byVisualHookType: HookTypeBreakdown[];
  topHooks: HookRecord[];
  /**
   * hook_types that punch above their weight: high avg weighted score in the
   * sample but a low share of the corpus (i.e. effective but under-used).
   */
  recommendedHookTypes: string[];
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Collapse repeated hook records down to one per video. */
export function dedupeHooks(hooks: HookRecord[]): HookRecord[] {
  const seen = new Map<string, HookRecord>();
  for (const h of hooks) {
    const id = h.video?.video_id ?? h.hook_text;
    if (!seen.has(id)) seen.set(id, h);
  }
  return [...seen.values()];
}

function breakdown(
  hooks: HookRecord[],
  key: "hook_type" | "visual_hook_type"
): HookTypeBreakdown[] {
  const groups = new Map<string, HookRecord[]>();
  for (const h of hooks) {
    const v = (h[key] as string) || "none";
    if (!groups.has(v)) groups.set(v, []);
    groups.get(v)!.push(h);
  }
  const total = hooks.length || 1;
  return [...groups.entries()]
    .map(([hookType, items]) => {
      const scores = items.map((i) => i.weighted_score ?? 0);
      const views = items.map((i) => i.video?.views ?? 0);
      const avg = (a: number[]) =>
        a.reduce((s, x) => s + x, 0) / (a.length || 1);
      return {
        hookType,
        count: items.length,
        share: items.length / total,
        avgWeightedScore: Number(avg(scores).toFixed(2)),
        avgViews: Math.round(avg(views)),
        medianViews: Math.round(median(views))
      };
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * Build a pattern report from a set of hook records. Optionally pass the
 * corpus-wide `hook_type` stats so we can flag formats that over-perform
 * relative to how saturated they are (effective + under-used).
 */
export function buildHookPatternReport(
  hooks: HookRecord[],
  opts: {
    coverage?: { videos_collected: number; videos_with_hooks: number };
    corpusStats?: HookTypeStat[];
    topN?: number;
  } = {}
): HookPatternReport {
  const deduped = dedupeHooks(hooks);
  const byHookType = breakdown(deduped, "hook_type");
  const byVisualHookType = breakdown(deduped, "visual_hook_type");

  const topHooks = [...deduped]
    .sort((a, b) => (b.weighted_score ?? 0) - (a.weighted_score ?? 0))
    .slice(0, opts.topN ?? 15);

  // Recommended = above-median in-sample weighted score, ranked by a lift
  // that rewards low corpus saturation when corpus stats are available.
  const corpusShare = new Map<string, number>();
  for (const s of opts.corpusStats ?? []) corpusShare.set(s.value, s.share_of_corpus);

  const scored = byHookType
    .filter((b) => b.hookType !== "none" && b.count >= 2)
    .map((b) => {
      const saturation = corpusShare.get(b.hookType) ?? 0.05;
      // effectiveness per unit of saturation; +0.02 guards divide-by-zero
      const lift = b.avgWeightedScore / (saturation + 0.02);
      return { hookType: b.hookType, avgWeightedScore: b.avgWeightedScore, lift };
    })
    .sort((a, b) => b.lift - a.lift);

  return {
    sampleSize: deduped.length,
    coverage: opts.coverage,
    byHookType,
    byVisualHookType,
    topHooks,
    recommendedHookTypes: scored.slice(0, 5).map((s) => s.hookType)
  };
}

/**
 * Turn a pattern report into a short block of guidance suitable for injecting
 * into an LLM hook-writing prompt. Steers generation toward the formats that
 * over-perform in the niche, with a few real high-scoring exemplars.
 */
export function patternGuidanceFromReport(
  report: HookPatternReport,
  opts: { exemplars?: number } = {}
): string {
  const recs = report.recommendedHookTypes.length
    ? report.recommendedHookTypes.join(", ")
    : report.byHookType.slice(0, 3).map((b) => b.hookType).join(", ");

  const exemplars = report.topHooks
    .slice(0, opts.exemplars ?? 5)
    .map((h) => {
      const text = (h.hook_text || "").replace(/\s+/g, " ").trim();
      return `- (${h.hook_type}) "${text}"`;
    })
    .join("\n");

  return [
    "REAL-WORLD HOOK PATTERNS (from Virlo's viral hook corpus for this niche):",
    `- Lean toward these high-performing, under-used hook types: ${recs}.`,
    "- Prefer concrete before/after, POV, and shock framings over generic bold claims.",
    "High-scoring example hooks from real viral videos:",
    exemplars
  ]
    .filter(Boolean)
    .join("\n");
}

/** Convenience: pull an agent's hooks and return a pattern report. */
export async function analyzeAgentHookPatterns(
  agentId: string,
  opts: { limit?: number; withCorpusStats?: boolean } = {}
): Promise<HookPatternReport> {
  const [agent, corpusStats] = await Promise.all([
    fetchAgentHooks(agentId, { limit: opts.limit ?? 100 }),
    opts.withCorpusStats !== false
      ? fetchHookTypeStats("hook_type")
      : Promise.resolve<HookTypeStat[]>([])
  ]);
  return buildHookPatternReport(agent.hooks, {
    coverage: agent.coverage,
    corpusStats
  });
}
