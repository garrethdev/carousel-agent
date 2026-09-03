import { NicheSnapshot } from "./pullSlideshows";
import { deriveMetrics, SlideshowMetrics } from "./metrics";
import { startTiming } from "../../utils/timing";

/**
 * Deterministic analysis of one niche snapshot.
 *
 * The central idea is a "top tier" (top quartile by views, min 3 items) and,
 * for every categorical attribute Virlo's intelligence gives us, the LIFT:
 * how over-represented that value is in the top tier vs. the whole set.
 * Lift > 1.3 means "the winners do this more"; < 0.7 means "the winners avoid it".
 */

export interface DistributionRow {
  value: string;
  count: number;
  share: number;
  topTierCount: number;
  topTierShare: number;
  lift: number | null;
  medianViews: number;
  avgViews: number;
}

export interface RankedTerm {
  value: string;
  count: number;
  avgViews: number;
  medianViews: number;
}

export interface CreatorRow {
  username: string;
  followers: number;
  verified: boolean;
  count: number;
  totalViews: number;
  maxViews: number;
  bestUrl: string;
}

export interface HookExample {
  hook: string;
  views: number;
  url: string;
  hookType: string;
  narrativeArc: string;
  imageCount: number | null;
  outlierMultiplier: number | null;
}

export interface NicheAnalysis {
  nicheKey: string;
  agentName: string;
  generatedAt: string;
  snapshotPulledAt: string;
  minViews: number;
  summary: {
    count: number;
    intelligenceReady: number;
    totalViews: number;
    medianViews: number;
    meanViews: number;
    p75Views: number;
    p90Views: number;
    maxViews: number;
    topTierThresholdViews: number;
    topTierCount: number;
    medianEngagementRate: number;
    /** null when no item in the set carries bookmark counts (hook-corpus only). */
    medianSaveRate: number | null;
    medianOutlierMultiplier: number | null;
    breakoutCount: number;
    scoreCounts: Record<string, number>;
    platformCounts: Record<string, number>;
    sourceCounts: Record<string, number>;
    earliestPublish: string | null;
    latestPublish: string | null;
    postedLast30Days: number;
    postedLast90Days: number;
  };
  distributions: Record<string, DistributionRow[]>;
  panelText: {
    medianWords: number | null;
    medianWordsTopTier: number | null;
    medianWordsRest: number | null;
    medianImageCount: number | null;
    medianImageCountTopTier: number | null;
  };
  topHashtags: RankedTerm[];
  topKeywords: RankedTerm[];
  topTopics: RankedTerm[];
  topCreators: CreatorRow[];
  topSlideshows: SlideshowMetrics[];
  breakouts: SlideshowMetrics[];
  velocityLeaders: SlideshowMetrics[];
  hooksByType: Record<string, HookExample[]>;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

function distribution(
  items: SlideshowMetrics[],
  topTier: Set<string>,
  accessor: (m: SlideshowMetrics) => string | string[] | null | undefined,
  opts: { max?: number; minCount?: number } = {}
): DistributionRow[] {
  const buckets = new Map<string, SlideshowMetrics[]>();
  for (const m of items) {
    const raw = accessor(m);
    const values = Array.isArray(raw) ? raw : raw === null || raw === undefined ? [] : [raw];
    const uniq = Array.from(new Set(values.map((v) => String(v))));
    for (const v of uniq) {
      if (!buckets.has(v)) buckets.set(v, []);
      buckets.get(v)!.push(m);
    }
  }
  const total = items.length || 1;
  const topTotal = topTier.size || 1;
  const rows: DistributionRow[] = [];
  for (const [value, members] of buckets) {
    if (members.length < (opts.minCount ?? 1)) continue;
    const topCount = members.filter((m) => topTier.has(m.externalId)).length;
    const share = members.length / total;
    const topShare = topCount / topTotal;
    rows.push({
      value,
      count: members.length,
      share: round(share),
      topTierCount: topCount,
      topTierShare: round(topShare),
      lift: share > 0 ? round(topShare / share, 2) : null,
      medianViews: Math.round(median(members.map((m) => m.views))),
      avgViews: Math.round(members.reduce((a, m) => a + m.views, 0) / members.length)
    });
  }
  rows.sort((a, b) => b.count - a.count || b.medianViews - a.medianViews);
  return rows.slice(0, opts.max ?? 12);
}

function rankedTerms(
  items: SlideshowMetrics[],
  accessor: (m: SlideshowMetrics) => string[],
  opts: { max?: number; minCount?: number; stop?: Set<string> } = {}
): RankedTerm[] {
  const buckets = new Map<string, number[]>();
  for (const m of items) {
    const uniq = Array.from(new Set(accessor(m).map((v) => v.toLowerCase().trim()).filter(Boolean)));
    for (const v of uniq) {
      if (opts.stop?.has(v)) continue;
      if (!buckets.has(v)) buckets.set(v, []);
      buckets.get(v)!.push(m.views);
    }
  }
  const rows: RankedTerm[] = [];
  for (const [value, views] of buckets) {
    if (views.length < (opts.minCount ?? 2)) continue;
    rows.push({
      value,
      count: views.length,
      avgViews: Math.round(views.reduce((a, b) => a + b, 0) / views.length),
      medianViews: Math.round(median(views))
    });
  }
  rows.sort((a, b) => b.count - a.count || b.medianViews - a.medianViews);
  return rows.slice(0, opts.max ?? 25);
}

const GENERIC_HASHTAGS = new Set(["fyp", "foryou", "foryoupage", "viral", "fypシ", "fypage", "trending", "xyzbca", "tiktok", "explore", "reels"]);

function imageCountBucket(n: number | null): string {
  if (n === null) return "unknown";
  if (n <= 3) return "1-3";
  if (n <= 5) return "4-5";
  if (n <= 8) return "6-8";
  if (n <= 12) return "9-12";
  return "13+";
}

export function analyzeSnapshot(snapshot: NicheSnapshot, now: Date = new Date()): NicheAnalysis {
  const endTiming = startTiming(`analyzeSnapshot:${snapshot.nicheKey}`);
  try {
    const items = snapshot.items.map((s) => deriveMetrics(s, now)).sort((a, b) => b.views - a.views);
    const views = items.map((m) => m.views);
    const count = items.length;

    const p75 = percentile(views, 75);
    const topTierItems = count >= 8 ? items.filter((m) => m.views >= p75) : items.slice(0, Math.min(3, count));
    const topTier = new Set(topTierItems.map((m) => m.externalId));
    const rest = items.filter((m) => !topTier.has(m.externalId));

    const scoreCounts: Record<string, number> = { "6": 0, "7": 0, "8": 0, "9": 0 };
    const platformCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};
    for (const m of items) {
      scoreCounts[String(m.score)] = (scoreCounts[String(m.score)] ?? 0) + 1;
      platformCounts[m.platform] = (platformCounts[m.platform] ?? 0) + 1;
      sourceCounts[m.source] = (sourceCounts[m.source] ?? 0) + 1;
    }

    const publishTimes = items
      .map((m) => (m.publishDate ? Date.parse(m.publishDate) : NaN))
      .filter((t) => !isNaN(t));
    const multipliers = items.map((m) => m.outlierMultiplier).filter((x): x is number => x !== null);

    const dist = (
      accessor: (m: SlideshowMetrics) => string | string[] | null | undefined,
      opts?: { max?: number; minCount?: number }
    ) => distribution(items, topTier, accessor, opts);

    const distributions: Record<string, DistributionRow[]> = {
      hookType: dist((m) => m.hookType),
      narrativeArc: dist((m) => m.narrativeArc),
      textDensity: dist((m) => m.textDensity),
      contentFormat: dist((m) => m.contentFormat),
      emotionalTone: dist((m) => m.emotionalTone),
      sentiment: dist((m) => m.sentiment),
      imageCountBucket: dist((m) => imageCountBucket(m.imageCount)),
      hasFace: dist((m) => (m.hasFace === null ? "unknown" : m.hasFace ? "yes" : "no")),
      isBeforeAfter: dist((m) => (m.isBeforeAfter === null ? "unknown" : m.isBeforeAfter ? "yes" : "no")),
      isSponsored: dist((m) => (m.isSponsored === null ? "unknown" : m.isSponsored ? "yes" : "no")),
      backgroundType: dist((m) => m.backgroundType),
      foregroundType: dist((m) => m.foregroundType),
      setting: dist((m) => m.setting),
      subjectAgeBracket: dist((m) => m.subjectAgeBracket),
      subjectGender: dist((m) => m.subjectGender),
      platform: dist((m) => m.platform),
      source: dist((m) => m.source),
      region: dist((m) => m.region, { max: 10 }),
      keywordFoundBy: dist((m) => m.keywordFoundBy, { max: 15 }),
      hasCta: dist((m) => (m.ctaUsages.length > 0 ? "yes" : "no")),
      ctaUsages: dist((m) => m.ctaUsages, { max: 10 }),
      hasSocialProof: dist((m) => (m.socialProof.length > 0 ? "yes" : "no")),
      socialProof: dist((m) => m.socialProof, { max: 10 }),
      trendReferences: dist((m) => m.trendReferences, { max: 10, minCount: 2 })
    };

    const words = (list: SlideshowMetrics[]) =>
      list.map((m) => m.panelWordCount).filter((x): x is number => x !== null);
    const imgs = (list: SlideshowMetrics[]) =>
      list.map((m) => m.imageCount).filter((x): x is number => x !== null);
    const medOrNull = (v: number[]) => (v.length ? Math.round(median(v)) : null);

    const creators = new Map<string, CreatorRow>();
    for (const m of items) {
      if (!m.username) continue;
      const row = creators.get(m.username) ?? {
        username: m.username,
        followers: m.followers,
        verified: m.verified,
        count: 0,
        totalViews: 0,
        maxViews: 0,
        bestUrl: m.url
      };
      row.count += 1;
      row.totalViews += m.views;
      if (m.views > row.maxViews) {
        row.maxViews = m.views;
        row.bestUrl = m.url;
      }
      creators.set(m.username, row);
    }

    const hooksByType: Record<string, HookExample[]> = {};
    for (const m of items) {
      if (!m.hookText) continue;
      const list = hooksByType[m.hookType] ?? (hooksByType[m.hookType] = []);
      if (list.length >= 6) continue;
      list.push({
        hook: m.hookText.slice(0, 200),
        views: m.views,
        url: m.url,
        hookType: m.hookType,
        narrativeArc: m.narrativeArc,
        imageCount: m.imageCount,
        outlierMultiplier: m.outlierMultiplier
      });
    }

    const analysis: NicheAnalysis = {
      nicheKey: snapshot.nicheKey,
      agentName: snapshot.agentName,
      generatedAt: now.toISOString(),
      snapshotPulledAt: snapshot.pulledAt,
      minViews: snapshot.minViews,
      summary: {
        count,
        intelligenceReady: items.filter((m) => m.intelligenceReady).length,
        totalViews: views.reduce((a, b) => a + b, 0),
        medianViews: Math.round(median(views)),
        meanViews: count ? Math.round(views.reduce((a, b) => a + b, 0) / count) : 0,
        p75Views: p75,
        p90Views: percentile(views, 90),
        maxViews: views[0] ?? 0,
        topTierThresholdViews: topTierItems.length ? topTierItems[topTierItems.length - 1].views : 0,
        topTierCount: topTierItems.length,
        medianEngagementRate: round(median(items.map((m) => m.engagementRate)), 4),
        medianSaveRate: items.some((m) => m.bookmarks > 0) ? round(median(items.map((m) => m.saveRate)), 4) : null,
        medianOutlierMultiplier: multipliers.length ? round(median(multipliers), 1) : null,
        breakoutCount: items.filter((m) => m.isBreakout).length,
        scoreCounts,
        platformCounts,
        sourceCounts,
        earliestPublish: publishTimes.length ? new Date(Math.min(...publishTimes)).toISOString() : null,
        latestPublish: publishTimes.length ? new Date(Math.max(...publishTimes)).toISOString() : null,
        postedLast30Days: items.filter((m) => m.ageDays !== null && m.ageDays <= 30).length,
        postedLast90Days: items.filter((m) => m.ageDays !== null && m.ageDays <= 90).length
      },
      distributions,
      panelText: {
        medianWords: medOrNull(words(items)),
        medianWordsTopTier: medOrNull(words(topTierItems)),
        medianWordsRest: medOrNull(words(rest)),
        medianImageCount: medOrNull(imgs(items)),
        medianImageCountTopTier: medOrNull(imgs(topTierItems))
      },
      topHashtags: rankedTerms(items, (m) => m.hashtags, { stop: GENERIC_HASHTAGS }),
      topKeywords: rankedTerms(items, (m) => m.keywords),
      topTopics: rankedTerms(items, (m) => (m.primaryTopic ? [m.primaryTopic] : []), { minCount: 1, max: 20 }),
      topCreators: Array.from(creators.values())
        .sort((a, b) => b.totalViews - a.totalViews)
        .slice(0, 15),
      topSlideshows: items.slice(0, 30),
      breakouts: items
        .filter((m) => m.isBreakout)
        .sort((a, b) => (b.outlierMultiplier ?? 0) - (a.outlierMultiplier ?? 0))
        .slice(0, 20),
      velocityLeaders: items
        .filter((m) => m.viewsPerDay !== null && m.ageDays !== null && m.ageDays <= 120)
        .sort((a, b) => (b.viewsPerDay ?? 0) - (a.viewsPerDay ?? 0))
        .slice(0, 10),
      hooksByType
    };
    return analysis;
  } finally {
    endTiming();
  }
}
