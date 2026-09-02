import { VirloSlideshow } from "../../types/virlo";
import { slideshowExternalId } from "../../lib/virloClient";

/**
 * Per-slideshow derived metrics. Pure function of the Virlo payload so the
 * same numbers can be recomputed from any stored snapshot.
 */
export interface SlideshowMetrics {
  externalId: string;
  url: string;
  platform: string;
  publishDate: string | null;
  ageDays: number | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  bookmarks: number;
  followers: number;
  username: string;
  verified: boolean;
  /** views / followers — the "outlier" signal used by the n8n hook bridge. */
  outlierMultiplier: number | null;
  engagementRate: number;
  saveRate: number;
  shareRate: number;
  commentRate: number;
  viewsPerDay: number | null;
  /** 6–9, same rubric as the "[Virlo] content_posts → machine_hooks" workflow. */
  score: 6 | 7 | 8 | 9;
  /** Small account (<50k followers) that hit ≥50x its follower count. */
  isBreakout: boolean;
  hookText: string;
  hookType: string;
  narrativeArc: string;
  textDensity: string;
  contentFormat: string;
  emotionalTone: string;
  sentiment: string;
  imageCount: number | null;
  hasFace: boolean | null;
  isBeforeAfter: boolean | null;
  isSponsored: boolean | null;
  primaryTopic: string;
  keywords: string[];
  ctaUsages: string[];
  socialProof: string[];
  brandsMentioned: string[];
  trendReferences: string[];
  panelWordCount: number | null;
  subjectAgeBracket: string;
  subjectGender: string;
  backgroundType: string;
  foregroundType: string;
  setting: string;
  region: string;
  keywordFoundBy: string;
  hashtags: string[];
  summary: string;
  panelTextFull: string;
  thumbnailUrl: string;
  intelligenceReady: boolean;
  /** "agent" (full intelligence) or "hook_corpus" (hook + metrics only). */
  source: string;
  /** Virlo Virality Score, only present for hook-corpus items. */
  weightedScore: number | null;
}

const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);
const str = (v: unknown, fallback = "unknown"): string =>
  typeof v === "string" && v.trim() ? v.trim() : fallback;
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
const boolOrNull = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

export function scoreSlideshow(
  views: number,
  followers: number,
  multiplier: number | null
): 6 | 7 | 8 | 9 {
  let score: 6 | 7 | 8 | 9 = views > 1_000_000 ? 9 : views > 500_000 ? 8 : views > 100_000 ? 7 : 6;
  if (multiplier !== null && views >= 10_000) {
    if (followers < 50_000 && multiplier >= 100 && views >= 50_000) score = 9;
    else if (multiplier >= 50 && views >= 20_000 && score < 8) score = 8;
    else if (multiplier >= 20 && score < 7) score = 7;
  }
  return score;
}

export function firstLine(text: string): string {
  return (text || "").split("\n").map((l) => l.trim()).find((l) => l.length > 0) || "";
}

export function deriveMetrics(s: VirloSlideshow, now: Date = new Date()): SlideshowMetrics {
  const intel = (s.intelligence && typeof s.intelligence === "object" ? s.intelligence : {}) as Record<string, unknown>;
  const views = num(s.views);
  const likes = num(s.likes);
  const comments = num(s.comments);
  const shares = num(s.shares);
  const bookmarks = num(s.bookmarks);
  const followers = num(s.author?.followers);
  const multiplier = followers > 0 ? views / followers : null;

  const publishDate = typeof s.publish_date === "string" ? s.publish_date : null;
  let ageDays: number | null = null;
  if (publishDate) {
    const t = Date.parse(publishDate);
    if (!isNaN(t)) ageDays = Math.max(0, (now.getTime() - t) / 86_400_000);
  }

  const description = typeof s.description === "string" ? s.description : "";
  const hookText = str(intel.hook_text, "") || firstLine(description).replace(/#\S+/g, "").trim();
  const intelligenceReady = s.intelligence_status === "ready" || Object.keys(intel).length > 0;

  return {
    externalId: slideshowExternalId(s),
    url: s.url,
    platform: str(s.platform, "tiktok").toLowerCase(),
    publishDate,
    ageDays,
    views,
    likes,
    comments,
    shares,
    bookmarks,
    followers,
    username: str(s.author?.username, ""),
    verified: Boolean(s.author?.verified),
    outlierMultiplier: multiplier === null ? null : Math.round(multiplier * 10) / 10,
    engagementRate: views > 0 ? (likes + comments + shares + bookmarks) / views : 0,
    saveRate: views > 0 ? bookmarks / views : 0,
    shareRate: views > 0 ? shares / views : 0,
    commentRate: views > 0 ? comments / views : 0,
    viewsPerDay: ageDays !== null ? views / Math.max(ageDays, 1) : null,
    score: scoreSlideshow(views, followers, multiplier),
    isBreakout: multiplier !== null && followers > 0 && followers < 50_000 && multiplier >= 50 && views >= 50_000,
    hookText,
    hookType: str(intel.hook_type),
    narrativeArc: str(intel.narrative_arc),
    textDensity: str(intel.text_density),
    contentFormat: str(intel.content_format),
    emotionalTone: str(intel.emotional_tone),
    sentiment: str(intel.sentiment),
    imageCount:
      typeof intel.image_count === "number"
        ? intel.image_count
        : Array.isArray(s.images) && s.images.length > 0
        ? s.images.length
        : null,
    hasFace: boolOrNull(intel.has_face_visible),
    isBeforeAfter: boolOrNull(intel.is_before_after),
    isSponsored: boolOrNull(intel.is_sponsored),
    primaryTopic: str(intel.primary_topic, ""),
    keywords: strArr(intel.keywords),
    ctaUsages: strArr(intel.cta_usages).filter((c) => c.toLowerCase() !== "none"),
    socialProof: strArr(intel.social_proof_used).filter((c) => c.toLowerCase() !== "none"),
    brandsMentioned: strArr(intel.brands_mentioned),
    trendReferences: strArr(intel.trend_references),
    panelWordCount: typeof intel.panel_text_word_count === "number" ? intel.panel_text_word_count : null,
    subjectAgeBracket: str(intel.primary_subject_age_bracket),
    subjectGender: str(intel.primary_subject_gender),
    backgroundType: str(intel.background_type),
    foregroundType: str(intel.foreground_type),
    setting: str(intel.setting),
    region: str(s.region, "unknown").toUpperCase(),
    keywordFoundBy: str(s.keyword_found_by, "unknown"),
    hashtags: strArr(s.hashtags).map((h) => h.toLowerCase()),
    summary: str(intel.summary, ""),
    panelTextFull: str(intel.panel_text_full, ""),
    thumbnailUrl: str(s.thumbnail_url, ""),
    intelligenceReady,
    source: str(s._source, "agent"),
    weightedScore: typeof s._weighted_score === "number" ? s._weighted_score : null
  };
}
