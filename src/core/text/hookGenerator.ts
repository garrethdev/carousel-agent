import { PreparedCarousel, PreparedSlide } from "../../types/carousel";
import { openRouterChat } from "../../lib/openRouterClient";
import { startTiming } from "../../utils/timing";

export interface HookSlideText {
  title: string;
  subtitle?: string;
  footer?: string;
}

interface HookCandidate {
  subtitle: string;
  title: string;
  footer: string;
  rationale?: string;
}

function clampWithEllipsis(text: string, max: number): string {
  const t = (text ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

function clampWords(text: string, maxWords: number): string {
  const parts = (text ?? "").trim().split(/\s+/);
  if (parts.length <= maxWords) return (text ?? "").trim();
  return parts.slice(0, maxWords).join(" ");
}

function stripOverlappingWords(
  subtitle: string,
  title: string
): { subtitle: string; title: string } {
  const subWords = subtitle.toLowerCase().split(/\s+/).filter(Boolean);
  const titleWords = title.toLowerCase().split(/\s+/).filter(Boolean);

  const titleSet = new Set(titleWords);

  const filteredSubWords = subWords.filter((w) => !titleSet.has(w));
  const cleanedSubtitle = filteredSubWords.join(" ").trim();

  return {
    subtitle: cleanedSubtitle || subtitle, // if we strip everything, fall back to original
    title
  };
}

const HOOK_DRAFT_SYSTEM_PROMPT = [
  "You are brainstorming HOOK copy for the FIRST slide of a LinkedIn carousel.",
  "The layout has TWO text elements OVER an image:",
  "1) subtitle – small top label in WHITE at the very top, 2–3 words, <= 24 characters.",
  "2) title – the MAIN hook in MINT just below the subtitle, 3–4 strong words, <= 32 characters.",
  "",
  "Style:",
  "- The copy must be PUNCHY and high-impact.",
  "- Use strong action verbs where possible: Beat, Outrank, Steal, Hijack, Crush, Win, Unlock.",
  "- Avoid generic, weak words: improve, optimize, better, tips, insights, guide, strategy, tutorial.",
  "- Subtitle should give context (e.g. \"SEO Hack\", \"Reddit Playbook\", \"Ranking Trick\").",
  "- Title should state a bold promise (e.g. \"Outrank Big Brands\", \"Steal Traffic From Giants\").",
  "",
  "Rules:",
  "- No hashtags. No emojis.",
  "- Use short, punchy phrases, not full sentences.",
  "- The subtitle and title in each option must NOT reuse the same key nouns or verbs.",
  "- Footer for slide 1 is always empty; do not generate footer content.",
  "",
  "You must propose EXACTLY THREE different hook options.",
  "Return ONLY JSON with an 'options' array; no explanations outside the JSON."
].join(" ");

async function draftHookCandidates(
  overview: string,
  tone?: string
): Promise<HookCandidate[]> {
  const systemPrompt = HOOK_DRAFT_SYSTEM_PROMPT;

  const userPrompt = [
    `Concept / overview: ${overview}`,
    tone ? `Tone: ${tone}` : "",
    "",
    "You must propose EXACTLY THREE different hook options.",
    "Each option MUST have:",
    "- subtitle: 2–3 word white top label that does NOT reuse any key word from the title.",
    "- title: 3–4 word mint hook phrase stating the main promise.",
    "- footer: always empty string.",
    "",
    "Return JSON in this shape:",
    "{",
    '  "options": [',
    "    {",
    '      "subtitle": "short top label",',
    '      "title": "main hook phrase",',
    '      "footer": "",',
    '      "rationale": "one sentence about why this hook works"',
    "    },",
    "    { ... },",
    "    { ... }",
    "  ]",
    "}"
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await openRouterChat({
    model: "meta-llama/llama-3.1-70b-instruct",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.8,
    max_tokens: 256
  });

  // Extract JSON from response (may have explanation text + code fences)
  let jsonString = raw.trim();
  
  // Try to find JSON object boundaries
  const firstBrace = jsonString.indexOf("{");
  const lastBrace = jsonString.lastIndexOf("}");
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonString = jsonString.slice(firstBrace, lastBrace + 1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (parseErr) {
    console.error("[draftHookCandidates] Failed to parse JSON. Raw response:", raw);
    console.error("[draftHookCandidates] Extracted string:", jsonString);
    throw new Error("Failed to parse hook candidate JSON from LLM.");
  }

  const options = Array.isArray(parsed.options) ? parsed.options : [];
  const candidates: HookCandidate[] = options
    .map((opt: any) => ({
      subtitle: typeof opt.subtitle === "string" ? opt.subtitle : "",
      title: typeof opt.title === "string" ? opt.title : "",
      footer: typeof opt.footer === "string" ? opt.footer : "",
      rationale: typeof opt.rationale === "string" ? opt.rationale : ""
    }))
    .filter((opt: HookCandidate) => opt.title && opt.title.trim().length > 0);

  if (candidates.length === 0) {
    throw new Error("No valid hook candidates returned by LLM.");
  }

  return candidates;
}

const HOOK_REFINE_SYSTEM_PROMPT = [
  "You are refining HOOK copy for the FIRST slide of a LinkedIn carousel.",
  "You are given several candidate options (subtitle, title).",
  "",
  "Your job is to pick ONE and lightly edit it so that:",
  "- It is as PUNCHY and high-impact as possible.",
  "- It feels like a bold promise, not a vague statement.",
  "- It uses at least one strong action verb if appropriate (Beat, Outrank, Steal, Hijack, Crush, Win, Unlock).",
  "- It avoids weak filler words (improve, optimize, better, tips, insights, guide, strategy).",
  "",
  "Layout and limits:",
  "- subtitle: 2–3 words, <= 24 characters, context label (e.g. \"SEO Hack\", \"Reddit Playbook\").",
  "- title: 3–4 words, <= 32 characters, main promise (e.g. \"Outrank Big Brands Fast\").",
  "- The footer for slide 1 is always empty; do not produce any footer content.",
  "",
  "IMPORTANT:",
  "- Subtitle and title in the final choice must NOT reuse the same key nouns or verbs.",
  "- If the subtitle repeats words from the title, adjust or replace it.",
  "",
  "Return ONLY JSON with keys: subtitle, title, footer (footer must be an empty string)."
].join(" ");

async function refineHookChoice(
  overview: string,
  tone: string | undefined,
  candidates: HookCandidate[]
): Promise<HookCandidate> {
  const systemPrompt = HOOK_REFINE_SYSTEM_PROMPT;

  const optionsText = candidates
    .map((c, i) => {
      return [
        `Option ${i + 1}:`,
        `  subtitle: ${c.subtitle}`,
        `  title: ${c.title}`,
        `  footer: ${c.footer}`,
        c.rationale ? `  rationale: ${c.rationale}` : ""
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const userPrompt = [
    `Concept / overview: ${overview}`,
    tone ? `Tone: ${tone}` : "",
    "",
    "Here are the candidate hook options:",
    optionsText,
    "",
    "Choose ONE option and polish it within the length constraints.",
    "- subtitle: 2-3 words, white label at top.",
    "- title: 3-4 words, mint hook phrase.",
    "",
    "Return JSON in this shape:",
    "{",
    '  "subtitle": "final subtitle",',
    '  "title": "final title",',
    '  "footer": ""',
    "}"
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await openRouterChat({
    model: "meta-llama/llama-3.1-70b-instruct",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.5,
    max_tokens: 128
  });

  // Extract JSON from response (may have explanation text + code fences)
  let jsonString = raw.trim();
  
  // Try to find JSON object boundaries
  const firstBrace = jsonString.indexOf("{");
  const lastBrace = jsonString.lastIndexOf("}");
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonString = jsonString.slice(firstBrace, lastBrace + 1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (parseErr) {
    console.error("[refineHookChoice] Failed to parse JSON. Raw response:", raw);
    console.error("[refineHookChoice] Extracted string:", jsonString);
    throw new Error("Failed to parse refined hook JSON from LLM.");
  }

  return {
    subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle : "",
    title: typeof parsed.title === "string" ? parsed.title : "",
    footer: typeof parsed.footer === "string" ? parsed.footer : ""
  };
}

/**
 * Generates the two text zones for the hook slide (slide 1):
 * - subtitle: small white label at top (2-3 words, ≤24 chars)
 * - title: large mint hook phrase (3-4 words, ≤32 chars)
 * - footer: always empty for slide 1
 *
 * Uses a 2-step LLM process: draft 3 candidates, then refine the best one.
 *
 * @param prepared PreparedCarousel (only global context is used here).
 * @returns HookSlideText with subtitle, title, and empty footer.
 */
export async function generateHookSlideText(
  prepared: PreparedCarousel
): Promise<HookSlideText> {
  const endTiming = startTiming("generateHookSlideText");
  try {
    const overview = prepared.overview;
    const tone = prepared.tone;

    // STEP 1: brainstorm multiple candidates
    const candidates = await draftHookCandidates(overview, tone);

    // STEP 2: refine and select the best one
    const refined = await refineHookChoice(overview, tone, candidates);

    // Final normalization and clamping
    let rawSubtitle = typeof refined.subtitle === "string" ? refined.subtitle : "";
    let rawTitle = typeof refined.title === "string" ? refined.title : "";

    // Remove overlapping words between subtitle and title
    ({ subtitle: rawSubtitle, title: rawTitle } = stripOverlappingWords(
      rawSubtitle,
      rawTitle
    ));

    // Word-level clamps
    rawSubtitle = clampWords(rawSubtitle, 3); // 2–3 words max
    rawTitle = clampWords(rawTitle, 4); // 3–4 words max

    // Character-level clamps
    const subtitle = clampWithEllipsis(rawSubtitle, 24);
    const title = clampWithEllipsis(rawTitle, 32);
    const footer = ""; // slide 1 does not use footer on the cover

    return { subtitle, title, footer };
  } finally {
    endTiming();
  }
}

/**
 * Applies the generated hook text to slide 1 of the PreparedCarousel.
 *
 * @param prepared PreparedCarousel before hook injection.
 * @param hookText Text for the hook slide (subtitle, title, footer).
 * @returns New PreparedCarousel with slide 1 text populated.
 */
export function applyHookSlideText(
  prepared: PreparedCarousel,
  hookText: HookSlideText
): PreparedCarousel {
  const slides = prepared.slides.map((slide: PreparedSlide) => {
    if (slide.index !== 1) return slide;

    return {
      ...slide,
      text: {
        title: hookText.title,
        subtitle: hookText.subtitle,
        footer: hookText.footer
      }
    };
  }) as PreparedCarousel["slides"];

  return { ...prepared, slides };
}

