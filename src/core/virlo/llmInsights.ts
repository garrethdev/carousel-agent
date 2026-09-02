import * as fs from "fs";
import * as path from "path";
import { VirloNicheConfig } from "../../config/virloNiches";
import { ensureDir, reportDir } from "./paths";
import { openRouterChat } from "../../lib/openRouterClient";
import { startTiming } from "../../utils/timing";
import { NicheAnalysis } from "./analyzeSlideshows";

/**
 * LLM synthesis layer on top of the deterministic analysis.
 *
 * Input is a compact digest (stats with lift, top hooks, a few full panel
 * texts); output is a strict JSON brief the carousel pipeline can consume —
 * the `carouselBriefs` entries map 1:1 onto the /api/carousel/plan payload.
 */

export interface NicheInsights {
  ok: boolean;
  model: string;
  error?: string;
  headline: string;
  winningPatterns: Array<{ pattern: string; evidence: string; howToApply: string }>;
  hookFormulas: Array<{ formula: string; example: string; whyItWorks: string }>;
  slideStructure: {
    recommendedSlideCount: string;
    arc: string;
    textDensity: string;
    visualStyle: string;
    notes: string;
  };
  contentAngles: Array<{ title: string; angle: string; targetEmotion: string; exampleHook: string }>;
  carouselBriefs: Array<{ topic: string; concept: string; audience: string; tone: string; hookIdea: string }>;
  avoid: string[];
}

/**
 * OpenRouter model id for the insight pass. Claude Opus 5 via OpenRouter
 * (~$0.10 per niche at current digest sizes); override with VIRLO_INSIGHTS_MODEL.
 * No temperature is sent — Opus 5 rejects sampling parameters.
 */
export const DEFAULT_INSIGHTS_MODEL = "anthropic/claude-opus-5";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function liftLine(rows: NicheAnalysis["distributions"][string], max = 6): string {
  return rows
    .slice(0, max)
    .map((r) => `${r.value}: ${Math.round(r.share * 100)}% of all, ${Math.round(r.topTierShare * 100)}% of top tier (lift ${r.lift ?? "n/a"}), median ${fmt(r.medianViews)} views`)
    .join("; ");
}

export function buildInsightDigest(niche: VirloNicheConfig, analysis: NicheAnalysis): string {
  const s = analysis.summary;
  const d = analysis.distributions;
  const lines: string[] = [];

  lines.push(`NICHE: ${niche.agentName} (${niche.key})`);
  lines.push(`PRODUCT CONTEXT: ${niche.productContext}`);
  lines.push(
    `DATASET: ${s.count} slideshows over ${fmt(analysis.minViews)} views; median ${fmt(s.medianViews)}, p90 ${fmt(s.p90Views)}, max ${fmt(s.maxViews)} views. Top tier = ${s.topTierCount} slideshows with >= ${fmt(s.topTierThresholdViews)} views. ${s.breakoutCount} small-account breakouts (<50k followers, >=50x follower views). Median engagement ${(s.medianEngagementRate * 100).toFixed(1)}%, median save rate ${s.medianSaveRate === null ? "n/a" : (s.medianSaveRate * 100).toFixed(2) + "%"}. Posted last 30d: ${s.postedLast30Days}, last 90d: ${s.postedLast90Days}.`
  );
  lines.push(
    `SOURCES: ${Object.entries(s.sourceCounts).map(([k, v]) => `${k}=${v}`).join(", ")}. "agent" items carry full slide-by-slide intelligence; "hook_corpus" items carry only the hook text, hook type and metrics, so attributes marked "unknown" mostly come from them — do not read "unknown" as a creative signal.`
  );
  lines.push("");
  lines.push("ATTRIBUTE LIFT (share among top tier / share overall; >1.3 = winners do this more):");
  lines.push(`- hook_type: ${liftLine(d.hookType)}`);
  lines.push(`- narrative_arc: ${liftLine(d.narrativeArc)}`);
  lines.push(`- text_density: ${liftLine(d.textDensity)}`);
  lines.push(`- content_format: ${liftLine(d.contentFormat)}`);
  lines.push(`- emotional_tone: ${liftLine(d.emotionalTone)}`);
  lines.push(`- slide count: ${liftLine(d.imageCountBucket)}`);
  lines.push(`- face visible: ${liftLine(d.hasFace)}`);
  lines.push(`- before/after: ${liftLine(d.isBeforeAfter)}`);
  lines.push(`- background: ${liftLine(d.backgroundType)}`);
  lines.push(`- foreground: ${liftLine(d.foregroundType)}`);
  lines.push(`- subject age: ${liftLine(d.subjectAgeBracket)}`);
  lines.push(`- has CTA: ${liftLine(d.hasCta)}; CTA types: ${liftLine(d.ctaUsages, 5)}`);
  lines.push(`- social proof: ${liftLine(d.socialProof, 5)}`);
  lines.push(
    `- panel words: median ${analysis.panelText.medianWords ?? "n/a"} overall, ${analysis.panelText.medianWordsTopTier ?? "n/a"} in top tier; median slides ${analysis.panelText.medianImageCount ?? "n/a"} overall, ${analysis.panelText.medianImageCountTopTier ?? "n/a"} top tier`
  );
  lines.push("");
  lines.push(`TOP TOPICS: ${analysis.topTopics.slice(0, 12).map((t) => `${t.value} (${t.count})`).join("; ")}`);
  lines.push(`TOP KEYWORDS: ${analysis.topKeywords.slice(0, 20).map((t) => `${t.value} (${t.count})`).join(", ")}`);
  lines.push(`TOP HASHTAGS: ${analysis.topHashtags.slice(0, 15).map((t) => `#${t.value} (${t.count})`).join(", ")}`);
  lines.push("");
  lines.push("TOP 40 HOOKS (views | hook_type | arc | slides | outlier x):");
  analysis.topSlideshows.slice(0, 40).forEach((m, i) => {
    lines.push(
      `${i + 1}. [${fmt(m.views)} | ${m.hookType} | ${m.narrativeArc} | ${m.imageCount ?? "?"} | ${m.outlierMultiplier ?? "?"}x] ${m.hookText.replace(/\s+/g, " ").slice(0, 140)}`
    );
  });
  if (analysis.breakouts.length) {
    lines.push("");
    lines.push("SMALL-ACCOUNT BREAKOUTS (followers -> views):");
    analysis.breakouts.slice(0, 10).forEach((m) => {
      lines.push(`- ${fmt(m.followers)} -> ${fmt(m.views)} (${m.outlierMultiplier}x): ${m.hookText.replace(/\s+/g, " ").slice(0, 120)}`);
    });
  }

  // A few full slideshows from the top tier, one per hook type, so the model
  // sees actual slide-by-slide structure rather than only hooks.
  const seenTypes = new Set<string>();
  const samples = analysis.topSlideshows.filter((m) => {
    if (!m.panelTextFull || seenTypes.has(m.hookType)) return false;
    seenTypes.add(m.hookType);
    return true;
  }).slice(0, 4);
  if (samples.length) {
    lines.push("");
    lines.push("FULL PANEL TEXT SAMPLES:");
    samples.forEach((m, i) => {
      lines.push(`--- sample ${i + 1}: ${fmt(m.views)} views, ${m.imageCount ?? "?"} slides, ${m.hookType}/${m.narrativeArc} ---`);
      lines.push(m.panelTextFull.replace(/\n{2,}/g, "\n").slice(0, 700));
    });
  }
  return lines.join("\n");
}

export function extractJsonObject(text: string): any {
  let t = text.trim().replace(/```json/gi, "```").replace(/```/g, "");
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) t = t.slice(first, last + 1);
  return JSON.parse(t);
}

const INSIGHTS_SYSTEM_PROMPT = `
You are a short-form content strategist analysing TikTok / Instagram photo slideshows (carousels) for a skincare brand.
You receive a statistical digest of high-performing slideshows in one niche: attribute lift tables, top hooks, breakouts and (when available) full slide-by-slide texts.

Your job: turn the numbers into concrete, evidence-backed creative direction.

Evidence rules
- A "winning pattern" must be backed by a lift >= 1.3 with at least 3 slideshows in that bucket, OR by at least 3 named hooks from the top-40 / breakout lists. Quote the exact lift value or the exact hooks with view counts.
- Never present a lift below 1.0 as something the winners do. If a common attribute has lift < 1.0, it belongs in "avoid" or is simply not a pattern.
- Attributes marked "unknown" are missing data (hook-corpus items carry no slide-level intelligence). Never treat "unknown" as a signal; when slide-level data is missing, say so in slideStructure.notes and base structure advice on the hook types and the hooks themselves.
- Do not invent statistics. Every number you write must appear in the digest.

Output rules
- hookFormulas: reusable templates with [placeholders]; each formula must be derived from a specific top hook (name it in whyItWorks) and the example must be rewritten for the product context.
- contentAngles: 5 distinct angles (no two about the same idea), each specific enough to brief a designer today, with a scroll-stopping example hook under 12 words.
- carouselBriefs: 3 DIFFERENT briefs for a 6-slide carousel, each built on a different angle: topic (2-5 words), concept (2-3 sentences that say what the six slides will teach or show), audience (a specific person, e.g. "women 30-45 who wake up with puffy eyes"), tone (3-4 adjectives), hookIdea (<= 10 words, modelled on a top hook).
- avoid: 3-6 concrete things the data says not to do (low-lift attributes, saturated hooks, off-brand-safety topics).
- Return ONLY valid JSON, no prose outside the JSON.
`;

const INSIGHTS_OUTPUT_SHAPE = `{
  "headline": "one sentence: the single most important takeaway",
  "winningPatterns": [{ "pattern": "...", "evidence": "...", "howToApply": "..." }],
  "hookFormulas": [{ "formula": "...", "example": "...", "whyItWorks": "..." }],
  "slideStructure": { "recommendedSlideCount": "...", "arc": "...", "textDensity": "...", "visualStyle": "...", "notes": "..." },
  "contentAngles": [{ "title": "...", "angle": "...", "targetEmotion": "...", "exampleHook": "..." }],
  "carouselBriefs": [{ "topic": "...", "concept": "...", "audience": "...", "tone": "...", "hookIdea": "..." }],
  "avoid": ["..."]
}`;

export async function generateNicheInsights(
  niche: VirloNicheConfig,
  analysis: NicheAnalysis
): Promise<NicheInsights> {
  const endTiming = startTiming(`generateNicheInsights:${niche.key}`);
  const model = process.env.VIRLO_INSIGHTS_MODEL || DEFAULT_INSIGHTS_MODEL;
  try {
    if (analysis.summary.count === 0) {
      return emptyInsights(model, "No slideshows in snapshot; nothing to analyse.");
    }
    const digest = buildInsightDigest(niche, analysis);
    const raw = await openRouterChat({
      model,
      messages: [
        { role: "system", content: INSIGHTS_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            digest,
            "",
            "Return JSON with exactly this shape (4-7 winningPatterns, 5-7 hookFormulas, 5 contentAngles, 3 carouselBriefs, 3-6 avoid items). Fill every slideStructure field; when slide-level data is missing say so in notes:",
            INSIGHTS_OUTPUT_SHAPE
          ].join("\n")
        }
      ],
      // Opus 5 thinks before answering and thinking tokens count against
      // max_tokens, so leave generous headroom for a ~4k-token JSON answer.
      max_tokens: 24000
    });

    let parsed: any;
    try {
      parsed = extractJsonObject(raw);
    } catch (err) {
      // Keep the raw text next to the reports so a parse failure is debuggable.
      ensureDir(reportDir());
      const rawFile = path.join(reportDir(), `${niche.key}.insights-raw.txt`);
      fs.writeFileSync(rawFile, raw, "utf-8");
      console.error(`[generateNicheInsights] non-JSON response (${raw.length} chars) saved to ${rawFile}: ${(err as Error).message}`);
      return emptyInsights(model, `LLM returned non-JSON output (${(err as Error).message}).`);
    }

    const arr = (v: unknown) => (Array.isArray(v) ? v : []);
    const s = (v: unknown) => (typeof v === "string" ? v : "");
    return {
      ok: true,
      model,
      headline: s(parsed.headline),
      winningPatterns: arr(parsed.winningPatterns).map((p: any) => ({
        pattern: s(p?.pattern),
        evidence: s(p?.evidence),
        howToApply: s(p?.howToApply)
      })),
      hookFormulas: arr(parsed.hookFormulas).map((p: any) => ({
        formula: s(p?.formula),
        example: s(p?.example),
        whyItWorks: s(p?.whyItWorks)
      })),
      slideStructure: {
        recommendedSlideCount: s(parsed.slideStructure?.recommendedSlideCount),
        arc: s(parsed.slideStructure?.arc),
        textDensity: s(parsed.slideStructure?.textDensity),
        visualStyle: s(parsed.slideStructure?.visualStyle),
        notes: s(parsed.slideStructure?.notes)
      },
      contentAngles: arr(parsed.contentAngles).map((p: any) => ({
        title: s(p?.title),
        angle: s(p?.angle),
        targetEmotion: s(p?.targetEmotion),
        exampleHook: s(p?.exampleHook)
      })),
      carouselBriefs: arr(parsed.carouselBriefs).map((p: any) => ({
        topic: s(p?.topic),
        concept: s(p?.concept),
        audience: s(p?.audience),
        tone: s(p?.tone),
        hookIdea: s(p?.hookIdea)
      })),
      avoid: arr(parsed.avoid).map(s).filter(Boolean)
    };
  } catch (err) {
    console.error("[generateNicheInsights] failed:", err);
    return emptyInsights(model, err instanceof Error ? err.message : String(err));
  } finally {
    endTiming();
  }
}

export function emptyInsights(model: string, error: string): NicheInsights {
  return {
    ok: false,
    model,
    error,
    headline: "",
    winningPatterns: [],
    hookFormulas: [],
    slideStructure: { recommendedSlideCount: "", arc: "", textDensity: "", visualStyle: "", notes: "" },
    contentAngles: [],
    carouselBriefs: [],
    avoid: []
  };
}
