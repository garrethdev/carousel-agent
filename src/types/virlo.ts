/**
 * Types for the Virlo Public API (https://api.virlo.ai, OpenAPI at /openapi.json).
 *
 * Only the fields this project reads are typed strictly; everything else is
 * kept as loose records so a Virlo schema addition never breaks a pull.
 */

export type VirloPlatform = "tiktok" | "instagram" | "youtube";

export interface VirloAuthor {
  username?: string;
  verified?: boolean;
  followers?: number;
  avatar_url?: string;
  [key: string]: unknown;
}

export interface VirloSlideshowImage {
  image_url: string;
  position: number;
}

/**
 * Per-slideshow AI intelligence block. Populated by Virlo even when
 * `data_intelligence_enabled` is false on the agent (verified 2026-09-02 on the
 * existing "Weight loss general" agent), so we do not pay the $1/run surcharge.
 */
export interface VirloSlideshowIntelligence {
  primary_topic?: string;
  secondary_topics?: string[];
  keywords?: string[];
  category?: string;
  content_format?: string;
  background_type?: string;
  foreground_type?: string;
  narrative_arc?: string;
  text_density?: string;
  hook_text?: string;
  hook_type?: string;
  image_count?: number;
  panel_texts?: string[];
  panel_text_full?: string;
  panel_text_word_count?: number;
  panel_text_character_count?: number;
  language_detected?: string;
  emotional_tone?: string;
  sentiment?: string;
  has_face_visible?: boolean;
  setting?: string;
  brand_safety_tier?: string;
  is_educational?: boolean;
  is_sponsored?: boolean;
  brands_mentioned?: string[];
  cta_usages?: string[];
  trend_references?: string[];
  social_proof_used?: string[];
  summary?: string;
  primary_subject_gender?: string;
  primary_subject_age_bracket?: string;
  on_screen_presence?: string;
  presence_style?: string;
  has_real_person?: boolean;
  ai_provenance?: string;
  product_presence?: string;
  is_before_after?: boolean;
  is_compilation?: boolean;
  is_ranking?: boolean;
  is_repost?: boolean;
  [key: string]: unknown;
}

export type VirloIntelligenceStatus =
  | "ready"
  | "pending"
  | "disabled"
  | "failed"
  | "skipped";

export interface VirloSlideshow {
  id: string;
  url: string;
  description?: string;
  hashtags?: string[];
  publish_date?: string;
  views: number;
  comments?: number;
  likes?: number;
  shares?: number;
  bookmarks?: number;
  thumbnail_url?: string;
  images?: VirloSlideshowImage[];
  platform?: string;
  author?: VirloAuthor;
  intelligence?: VirloSlideshowIntelligence | null;
  intelligence_status?: VirloIntelligenceStatus;
  keyword_found_by?: string | null;
  region?: string | null;
  is_eligible_for_commission?: boolean;
  [key: string]: unknown;
}

export interface VirloSlideshowsPage {
  agent_id: string;
  agent_name?: string;
  total: number;
  limit: number;
  offset: number;
  slideshows: VirloSlideshow[];
}

export interface VirloSlideshowQuery {
  limit?: number;
  page?: number;
  min_views?: number;
  platforms?: string[];
  start_date?: string;
  end_date?: string;
  order_by?: "publish_date" | "views" | "created_at";
  sort?: "asc" | "desc";
  region?: string;
}

export type VirloRunStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "partial_failure"
  | "cancelled";

export interface VirloAgentRun {
  id: string;
  agent_id: string;
  status: VirloRunStatus;
  total_videos_inserted?: number;
  total_videos_updated?: number;
  slideshows_linked?: number;
  tiktok_count?: number;
  instagram_count?: number;
  youtube_count?: number;
  intent_filtered?: number;
  execution_time_ms?: number;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  keyword_breakdown?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface VirloAgent {
  id: string;
  name?: string;
  is_recurring: boolean;
  active: boolean;
  keywords: string[];
  platforms: string[];
  exclude_keywords: string[];
  data_intelligence_enabled: boolean;
  english_only: boolean;
  intent?: string | null;
  intent_keywords?: string[] | null;
  cadence?: string | null;
  next_run_at?: string | null;
  last_run_at?: string | null;
  is_processing: boolean;
  created_at: string;
  updated_at: string;
  latest_run?: VirloAgentRun | null;
  finalized?: boolean;
  analysis?: string | null;
  analysis_data?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface VirloCreateAgentInput {
  name: string;
  intent: string;
  keywords: string[];
  is_recurring: boolean;
  cadence?: string;
  platforms?: VirloPlatform[];
  exclude_keywords?: string[];
  exclude_keywords_strict?: boolean;
  meta_ads_enabled?: boolean;
  data_intelligence_enabled?: boolean;
  english_only?: boolean;
}

export interface VirloBalance {
  balance: string;
  credits_remaining: number;
  status: string;
}

export interface VirloSuggestKeywordsResult {
  keywords: string[];
  exclude_keywords: string[];
  reasoning?: string;
  quality?: { score: number; passes: boolean; issues: string[] };
}

/** One entry from the corpus-wide hook endpoints (/v1/hooks/search, /v1/hooks/trending). */
export interface VirloHookItem {
  hook_text: string;
  hook_type?: string;
  visual_hook_type?: string | null;
  content_type: "video" | "slideshow";
  platform: string;
  category?: string;
  language?: string;
  brand_safety_tier?: string;
  outlier_ratio?: number;
  weighted_score?: number;
  match_score?: number;
  video: {
    video_id: string;
    url: string;
    thumbnail_url?: string;
    views: number;
    likes?: number;
    comments?: number;
    shares?: number;
    duration?: number | null;
    publish_date?: string;
    author_handle?: string;
    author_followers?: number;
  };
}

export interface VirloHookSearchQuery {
  q?: string;
  content_type?: "video" | "slideshow" | "all";
  platform?: VirloPlatform;
  category?: string;
  hook_type?: string;
  language?: string;
  min_views?: number;
  limit?: number;
  page?: number;
}

export interface VirloHookTrendingQuery extends Omit<VirloHookSearchQuery, "q"> {
  days?: 7 | 14 | 30;
  sort?: "weighted_score" | "views";
}
