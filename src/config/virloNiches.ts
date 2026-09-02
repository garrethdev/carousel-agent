import { VirloPlatform } from "../types/virlo";

/**
 * Niche definitions for the skincare slideshow research lane.
 *
 * Each niche maps 1:1 to a recurring Virlo agent. The agent ids below were
 * created on 2026-09-02 via POST /v1/agents; `ensureNicheAgents` re-creates an
 * agent by name if an id ever disappears from the account.
 *
 * Conventions copied from the six existing agents in the account
 * (weight loss / GLP-1 / peptides / wellness lanes):
 * - platforms: tiktok + instagram (slideshows are a TikTok format; IG is kept
 *   so the agent also surfaces IG photo carousels when Virlo links them)
 * - cadence: Mondays 00:00 UTC ("0 0 * * 1")
 * - english_only: true
 * - data_intelligence_enabled: false (slideshow intelligence is still populated)
 * - view floor: 25,000 — the n8n webhook receiver's default floor for any
 *   comet id that is not in its explicit FLOORS map.
 */
export interface VirloNicheConfig {
  /** Short stable key used for file names, CLI args and API paths. */
  key: string;
  /** Must match the Virlo agent name exactly (used for lookup / re-creation). */
  agentName: string;
  /** Virlo agent UUID. */
  agentId: string;
  intent: string;
  keywords: string[];
  excludeKeywords: string[];
  platforms: VirloPlatform[];
  cadence: string;
  /** Read-time minimum views applied when pulling slideshows. */
  minViews: number;
  /** Product framing handed to the LLM insight pass. */
  productContext: string;
  /**
   * Free-text queries for GET /v1/hooks/search (content_type=slideshow).
   * Each query bills $0.25, so keep this list short and high-recall.
   */
  hookQueries: string[];
  /** Case-insensitive patterns used to route corpus-wide trending hooks to this niche. */
  hookRouting: string[];
}

export const VIRLO_DEFAULT_MIN_VIEWS = 25000;

export const VIRLO_NICHES: VirloNicheConfig[] = [
  {
    key: "eye-care",
    agentName: "Eye care (under-eye)",
    agentId: "5c26c264-9a3a-4cc3-83fe-bf7527795169",
    intent:
      "Find high performing TikTok and Instagram slideshows about eye care: under-eye treatment, dark circles, puffy eyes, under-eye bags, eye creams and eye serums, for a skincare brand planning carousel content.",
    keywords: [
      "dark circles treatment",
      "puffy eyes remedy",
      "best eye cream",
      "undereye bags solution",
      "eye care routine",
      "anti-aging eye serum",
      "reduce dark circles",
      "skincare for eyes",
      "brighten under eyes",
      "eye massage technique"
    ],
    excludeKeywords: [
      "eye makeup tutorial",
      "eyelash growth serum",
      "contact lens care",
      "vision correction tips",
      "eyewear fashion trends",
      "eye doctor appointment",
      "eye strain exercises"
    ],
    platforms: ["tiktok", "instagram"],
    cadence: "0 0 * * 1",
    minViews: VIRLO_DEFAULT_MIN_VIEWS,
    productContext:
      "Under-eye care products: eye creams, eye serums, caffeine / peptide / retinol eye treatments targeting dark circles, puffiness and under-eye bags.",
    hookQueries: ["dark circles", "under eye", "eye cream"],
    hookRouting: ["dark circle", "under.?eye", "undereye", "eye cream", "eye serum", "puffy eye", "eye bag"]
  },
  {
    key: "eye-masks",
    agentName: "Eye masks & patches",
    agentId: "cbe5fcbe-e03c-4b7b-bfcb-12e62ff43c0a",
    intent:
      "Find high performing TikTok and Instagram slideshows about eye masks and under-eye patches: collagen and hydrogel eye patches, korean eye masks, overnight eye masks, before and after results, for a skincare brand planning carousel content.",
    keywords: [
      "eye mask skincare routine",
      "under eye patch tutorial",
      "collagen eye mask benefits",
      "dark circles eye treatment",
      "puffy eyes remedy patches",
      "hydrogel eye mask review",
      "sleep mask for beauty",
      "korean eye patch hacks",
      "best under eye masks",
      "anti aging eye patches"
    ],
    excludeKeywords: [
      "face mask",
      "hair mask",
      "eye makeup",
      "sleep apnea mask",
      "halloween mask",
      "mascara tutorial",
      "sheet mask",
      "face roller"
    ],
    platforms: ["tiktok", "instagram"],
    cadence: "0 0 * * 1",
    // Narrow topic: a 10k floor keeps enough slideshows to analyse. The n8n
    // receiver still applies its own 25k default to this comet's webhook runs.
    minViews: 10000,
    productContext:
      "Under-eye masks and patches: collagen / hydrogel eye patches, overnight eye masks, reusable silicone eye patches, and eye-mask routines.",
    hookQueries: ["eye mask", "eye patches", "under eye patches", "puffy eyes", "collagen eye"],
    hookRouting: ["eye mask", "eye patch", "under.?eye patch", "collagen patch", "hydrogel"]
  },
  {
    key: "anti-aging",
    agentName: "Anti-aging skincare",
    agentId: "1c486df6-a489-400a-870c-3e0e374db23c",
    intent:
      "Find high performing TikTok and Instagram slideshows about anti-aging skincare: wrinkles, fine lines, retinol, collagen, peptides for skin, looking younger, skincare for mature skin, for a skincare brand planning carousel content.",
    keywords: [
      "anti aging skincare routine",
      "best retinol for wrinkles",
      "collagen for youthful skin",
      "reduce fine lines naturally",
      "skincare for mature skin",
      "anti wrinkle cream review",
      "korean anti aging secrets",
      "dermatologist anti aging tips",
      "prevent premature aging",
      "affordable anti aging products"
    ],
    excludeKeywords: [
      "makeup tutorial",
      "plastic surgery",
      "hair care routine",
      "weight loss tips",
      "fashion trends"
    ],
    platforms: ["tiktok", "instagram"],
    cadence: "0 0 * * 1",
    minViews: VIRLO_DEFAULT_MIN_VIEWS,
    productContext:
      "Anti-aging skincare: retinol, peptide and collagen serums, anti-wrinkle creams, routines for fine lines and mature skin.",
    hookQueries: ["anti aging", "wrinkles", "retinol"],
    hookRouting: ["anti.?aging", "wrinkle", "fine line", "retinol", "collagen", "look(s|ing)? younger", "mature skin", "aging skin", "botox"]
  }
];

export function getNiche(key: string): VirloNicheConfig {
  const niche = VIRLO_NICHES.find((n) => n.key === key || n.agentId === key);
  if (!niche) {
    throw new Error(
      `Unknown Virlo niche "${key}". Known: ${VIRLO_NICHES.map((n) => n.key).join(", ")}`
    );
  }
  return niche;
}

export function resolveNiches(keys?: string[]): VirloNicheConfig[] {
  if (!keys || keys.length === 0) return VIRLO_NICHES;
  return keys.map(getNiche);
}
