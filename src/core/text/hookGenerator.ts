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

export const HOOK_DRAFT_SYSTEM_PROMPT = `
You are brainstorming HOOK copy for the FIRST slide of a LinkedIn carousel.

The layout has THREE text elements OVER an image:
1) subtitle – small top label in WHITE at the very top.
2) title – the MAIN hook in MINT just below the subtitle.
3) footer – ONE short supporting line under the image.

Your job is to propose strong hook options that:
- Stop the scroll in the feed.
- Make a bold, specific promise.
- Set up the rest of the carousel.

LAYOUT & LIMITS
- subtitle: 3–4 words, <= 32 characters.
- title: 4–7 strong words, <= 48 characters, no punctuation at the end.
- footer: ONE short sentence, 10–16 words, max 90 characters.

STYLE
- The copy must be PUNCHY and high-impact.
- Use strong action verbs where possible: Beat, Outrank, Steal, Hijack, Crush, Win, Unlock.
- Avoid weak filler words: improve, optimize, better, tips, insights, guide, strategy, tutorial.
- Subtitle should give context (e.g. "SEO Hack", "Reddit Playbook", "Ranking Trick").
- Title should state a bold promise (e.g. "Beat Google With Reddit", "Steal Traffic From Giants").
- Titles must be complete phrases, not fragments. Do NOT end a title with connector words like "in", "with", "for", "to", "from", "by", "just".
- Footer should be a single sharp claim or framing line, NOT a paragraph.

LENGTH BIAS
- When choosing the wording, aim for the UPPER END of the allowed word ranges:
  - subtitle: usually 4 words.
  - title: usually 6–7 words.
  - footer: usually 14–16 words.

RULES
- No hashtags. No emojis.
- Use short, punchy phrases, not full sentences for subtitle and title.
- Subtitle, title, and footer must NOT reuse the same key nouns or verbs.
- Footer must add new information (e.g. "Reddit is Google's blindspot in AI search"), not restate the title.

OUTPUT
You must propose EXACTLY THREE different hook options.

Return ONLY JSON with an "options" array; no explanations outside the JSON.
`;

async function draftHookCandidates(
  overview: string,
  tone?: string
): Promise<HookCandidate[]> {
  const systemPrompt = HOOK_DRAFT_SYSTEM_PROMPT;

  const userPrompt = buildHookDraftUserPrompt(overview, tone);

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

export const HOOK_REFINE_SYSTEM_PROMPT = `
You are refining HOOK copy for the FIRST slide of a LinkedIn carousel.

You are given several candidate options (subtitle, title, footer).

Your job is to pick ONE and lightly edit it so that:
- It is as PUNCHY and high-impact as possible.
- It feels like a bold promise, not a vague statement.
- It uses at least one strong action verb if appropriate (Beat, Outrank, Steal, Hijack, Crush, Win, Unlock).
- It avoids weak filler words (improve, optimize, better, tips, insights, guide, strategy).

LAYOUT & LIMITS
- subtitle: 3–4 words, <= 32 characters.
- title: 4–7 words, <= 48 characters.
- footer: ONE short supporting line, 10–16 words, max 90 characters.

RULES
- No hashtags. No emojis.
- Subtitle, title, and footer must NOT reuse the same key nouns or verbs.
- Footer must add a new angle or claim, not restate the title.

Quality rules:
- The final title must be a complete, self-contained phrase. It should make sense on its own.
- The title must NOT end with connector words like: "in", "with", "for", "to", "from", "by", "just", "using", "via", "through".
- Avoid patterns like "in just" unless you fully complete the idea within the phrase. Prefer "Triple Your Conversion Rate" over "Triple Conversions In Just".
- If a candidate ends in one of those connector words, rewrite it so it stands alone.

LENGTH BIAS
- Prefer the longer option as long as it stays punchy.
- If an option is too short, expand it toward the upper word limit without adding fluff.

OUTPUT
Return ONLY JSON with keys: subtitle, title, footer.
`;

export function buildHookDraftUserPrompt(overview: string, tone?: string): string {
  return `
Concept / overview: ${overview}
${tone ? `Tone: ${tone}` : ""}

You must propose EXACTLY THREE different hook options.

Each option MUST have:
- subtitle: 3–4 word white top label that does NOT reuse any key word from the title.
- title: 4–7 word mint hook phrase stating the main promise.
- footer: ONE short support line (10–16 words) with a sharp claim.

Return JSON in this shape:
{
  "options": [
    {
      "subtitle": "short top label",
      "title": "main hook phrase",
      "footer": "one short supporting claim",
      "rationale": "one sentence about why this hook works"
    },
    { ... },
    { ... }
  ]
}
`.trim();
}

function buildHookRefineUserPrompt(
  overview: string,
  optionsText: string,
  tone?: string
): string {
  return `
Concept / overview: ${overview}
${tone ? `Tone: ${tone}` : ""}

Here are the candidate hook options:
${optionsText}

Choose ONE option and polish it within the length constraints.

- subtitle: 3–4 words, white label at top.
- title: 4–7 words, bold hook phrase.
- footer: ONE short supporting line (10–16 words) with a sharp, concrete claim.

Return JSON in this shape:
{
  "subtitle": "final subtitle",
  "title": "final title",
  "footer": "final supporting claim"
}
`.trim();
}

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

  const userPrompt = buildHookRefineUserPrompt(overview, optionsText, tone);

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
  prepared: PreparedCarousel,
  hookPlan?: { goal: string; textIntent: string },
  userContext?: string,
  topic?: string
): Promise<HookSlideText> {
  const endTiming = startTiming("generateHookSlideText");
  try {
    const overview = prepared.overview;
    const audience = prepared.audience;
    const tone = prepared.tone;
    const extraContext = [
      topic ? `Topic: ${topic}` : "",
      audience ? `Audience: ${audience}` : "",
      hookPlan
        ? `Hook plan: goal="${hookPlan.goal}", textIntent="${hookPlan.textIntent}"`
        : "",
      userContext ? `User context: ${userContext}` : ""
    ]
      .filter(Boolean)
      .join("\n");

    // STEP 1: brainstorm multiple candidates
    const candidates = await draftHookCandidates(
      [overview, extraContext].filter(Boolean).join("\n\n"),
      tone
    );

    // STEP 2: refine and select the best one
    const refined = await refineHookChoice(overview, tone, candidates);

  // Final normalization and clamping
  let rawSubtitle = typeof refined.subtitle === "string" ? refined.subtitle : "";
  let rawTitle = typeof refined.title === "string" ? refined.title : "";
  let rawFooter = typeof refined.footer === "string" ? refined.footer : "";

    // Remove overlapping words between subtitle and title
    ({ subtitle: rawSubtitle, title: rawTitle } = stripOverlappingWords(
      rawSubtitle,
      rawTitle
    ));

  // Word-level clamps (match prompt ranges upper bound)
  rawSubtitle = clampWords(rawSubtitle, 4); // subtitle target 3–4 words
  rawTitle = clampWords(rawTitle, 7); // title target 4–7 words
  rawFooter = clampWords(rawFooter, 16); // footer target 10–16 words

  // Character-level clamps (match prompt caps)
  const subtitle = clampWithEllipsis(rawSubtitle, 32);
  const title = clampWithEllipsis(rawTitle, 48);
  const footer = clampWithEllipsis(rawFooter, 90);

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

