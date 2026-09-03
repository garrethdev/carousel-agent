import * as fs from "fs";
import * as path from "path";
import { VirloNicheConfig } from "../../config/virloNiches";
import { searchHooks, trendingHooks } from "../../lib/virloClient";
import { VirloHookItem, VirloSlideshow } from "../../types/virlo";
import { startTiming } from "../../utils/timing";
import { ensureDir, snapshotDir } from "./paths";

/**
 * Second slideshow source: Virlo's corpus-wide hook endpoints.
 *
 * Agent runs only link slideshows that the keyword crawl happens to surface
 * (the first runs for the skincare agents linked none), whereas
 * /v1/hooks/search?content_type=slideshow reaches the 350k-slideshow corpus
 * directly. Items are normalised into the VirloSlideshow shape so the same
 * analysis runs over both sources; attributes the corpus does not carry
 * (panel texts, narrative arc, …) simply read as "unknown".
 */

export const HOOK_CORPUS_SOURCE = "hook_corpus";
export const AGENT_SOURCE = "agent";
export const HOOK_CORPUS_MIN_VIEWS = 25000;

export interface HookCorpusCache {
  nicheKey: string;
  pulledAt: string;
  queries: string[];
  creditsSpent: number;
  items: VirloSlideshow[];
}

export function hookItemToSlideshow(item: VirloHookItem, foundBy: string): VirloSlideshow {
  const v = item.video || ({} as VirloHookItem["video"]);
  return {
    id: v.video_id,
    url: v.url,
    description: item.hook_text,
    platform: item.platform || "tiktok",
    views: v.views || 0,
    likes: v.likes,
    comments: v.comments,
    shares: v.shares,
    publish_date: v.publish_date,
    thumbnail_url: v.thumbnail_url,
    author: { username: v.author_handle, followers: v.author_followers },
    keyword_found_by: foundBy,
    intelligence_status: "ready",
    intelligence: {
      hook_text: item.hook_text,
      hook_type: item.hook_type,
      category: item.category,
      language_detected: item.language,
      brand_safety_tier: item.brand_safety_tier
    },
    _source: HOOK_CORPUS_SOURCE,
    _outlier_ratio: item.outlier_ratio,
    _weighted_score: item.weighted_score,
    _match_score: item.match_score
  };
}

function routingRegex(niche: VirloNicheConfig): RegExp | null {
  if (!niche.hookRouting.length) return null;
  return new RegExp(niche.hookRouting.join("|"), "i");
}

/**
 * Run the niche's hook queries against the slideshow corpus and cache the
 * merged, deduped result. Incremental by default: queries already recorded in
 * the cache are skipped (no charge); pass `force` to re-run every query.
 * One billed call ($0.25) per query executed.
 */
export async function pullHookCorpusForNiche(
  niche: VirloNicheConfig,
  opts: { minViews?: number; persist?: boolean; force?: boolean } = {}
): Promise<HookCorpusCache> {
  const endTiming = startTiming(`pullHookCorpusForNiche:${niche.key}`);
  try {
    const minViews = opts.minViews ?? niche.minViews ?? HOOK_CORPUS_MIN_VIEWS;
    const previous = opts.force ? null : loadHookCorpusCache(niche.key);
    const byId = new Map<string, VirloSlideshow>();
    for (const s of previous?.items ?? []) byId.set(s.url || s.id, s);
    const doneQueries = new Set(previous?.queries ?? []);
    let credits = previous?.creditsSpent ?? 0;

    const pending = niche.hookQueries.filter((q) => !doneQueries.has(q));
    if (pending.length === 0) {
      console.log(`[virlo] ${niche.key}: hook corpus cache already covers all ${niche.hookQueries.length} queries (no charge)`);
    }
    for (const q of pending) {
      const items = await searchHooks({ q, content_type: "slideshow", min_views: minViews, limit: 100 });
      credits += 25;
      doneQueries.add(q);
      console.log(`[virlo] hooks/search "${q}" (slideshow, >=${minViews}) -> ${items.length} items`);
      for (const item of items) {
        const s = hookItemToSlideshow(item, `search:${q}`);
        const key = s.url || s.id;
        if (!byId.has(key)) byId.set(key, s);
      }
    }

    const cache: HookCorpusCache = {
      nicheKey: niche.key,
      pulledAt: pending.length > 0 || !previous ? new Date().toISOString() : previous.pulledAt,
      queries: Array.from(doneQueries),
      creditsSpent: credits,
      items: Array.from(byId.values()).sort((a, b) => (b.views || 0) - (a.views || 0))
    };
    if (opts.persist !== false) writeHookCorpusCache(cache);
    return cache;
  } finally {
    endTiming();
  }
}

/**
 * Free cross-pollination: a hook pulled for one niche whose text matches
 * another niche's routing patterns (e.g. "under eye patches" found by the
 * eye-care query) is copied into that niche's cache as well.
 */
export function crossRouteHookCaches(niches: VirloNicheConfig[]): Record<string, number> {
  const caches = new Map(niches.map((n) => [n.key, loadHookCorpusCache(n.key)]));
  const added: Record<string, number> = {};
  for (const target of niches) {
    const re = routingRegex(target);
    if (!re) continue;
    const extra: VirloSlideshow[] = [];
    for (const source of niches) {
      if (source.key === target.key) continue;
      for (const s of caches.get(source.key)?.items ?? []) {
        const text = `${s.description ?? ""} ${(s.intelligence as any)?.hook_text ?? ""}`;
        if (re.test(text)) extra.push({ ...s, keyword_found_by: `routed:${source.key}` });
      }
    }
    const before = caches.get(target.key)?.items.length ?? 0;
    const merged = mergeIntoHookCorpusCache(target, extra);
    added[target.key] = merged.items.length - before;
  }
  return added;
}

/**
 * One billed call for the beauty category's best slideshow hooks of the last
 * 30 days, routed to niches by keyword pattern and merged into each cache.
 */
export async function pullTrendingBeautySlideshows(
  niches: VirloNicheConfig[],
  opts: { minViews?: number; days?: 7 | 14 | 30; category?: string } = {}
): Promise<Record<string, VirloSlideshow[]>> {
  const endTiming = startTiming("pullTrendingBeautySlideshows");
  try {
    const items = await trendingHooks({
      content_type: "slideshow",
      category: opts.category ?? "beauty",
      days: opts.days ?? 30,
      min_views: opts.minViews ?? HOOK_CORPUS_MIN_VIEWS,
      limit: 100
    });
    console.log(`[virlo] hooks/trending beauty slideshows -> ${items.length} items`);
    const routed: Record<string, VirloSlideshow[]> = {};
    for (const niche of niches) {
      const re = routingRegex(niche);
      routed[niche.key] = re
        ? items.filter((i) => re.test(i.hook_text || "")).map((i) => hookItemToSlideshow(i, "trending:beauty"))
        : [];
    }
    return routed;
  } finally {
    endTiming();
  }
}

function cacheFile(nicheKey: string): string {
  return path.join(snapshotDir(nicheKey), "hooks-latest.json");
}

export function writeHookCorpusCache(cache: HookCorpusCache): void {
  ensureDir(snapshotDir(cache.nicheKey));
  fs.writeFileSync(cacheFile(cache.nicheKey), JSON.stringify(cache, null, 2), "utf-8");
}

export function loadHookCorpusCache(nicheKey: string): HookCorpusCache | null {
  const file = cacheFile(nicheKey);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8")) as HookCorpusCache;
}

/** Merge extra items into a niche's cache (dedupe by url), e.g. routed trending hooks. */
export function mergeIntoHookCorpusCache(niche: VirloNicheConfig, extra: VirloSlideshow[]): HookCorpusCache {
  const existing = loadHookCorpusCache(niche.key) ?? {
    nicheKey: niche.key,
    pulledAt: new Date().toISOString(),
    queries: [],
    creditsSpent: 0,
    items: []
  };
  const byUrl = new Map(existing.items.map((s) => [s.url || s.id, s]));
  for (const s of extra) {
    const key = s.url || s.id;
    if (!byUrl.has(key)) byUrl.set(key, s);
  }
  existing.items = Array.from(byUrl.values()).sort((a, b) => (b.views || 0) - (a.views || 0));
  writeHookCorpusCache(existing);
  return existing;
}
