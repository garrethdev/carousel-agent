import { FinalCarousel } from "../../types/carousel";
import { openRouterChat } from "../../lib/openRouterClient";
import { startTiming } from "../../utils/timing";

export interface NarrativeAnalysisResult {
  ok: boolean;
  summary: string;
  issues: string[];
  suggestions: string[];
}

/**
 * Post-generation QA tool to evaluate narrative coherence of a completed carousel.
 *
 * This does NOT affect generation. It runs after text/images are produced and
 * returns a summary, list of issues, and suggestions.
 *
 * @param final FinalCarousel to inspect.
 * @returns NarrativeAnalysisResult with ok/summary/issues/suggestions.
 */
export async function analyzeNarrative(
  final: FinalCarousel
): Promise<NarrativeAnalysisResult> {
  const endTiming = startTiming("analyzeNarrative");
  try {
    const lines: string[] = [];

    final.slides.forEach((slide) => {
    lines.push(
      `Slide ${slide.index} (${slide.kind}/${slide.role}):`,
      `  TITLE: ${slide.text.title ?? ""}`,
      `  SUBTITLE: ${slide.text.subtitle ?? ""}`,
      `  FOOTER: ${slide.text.footer ?? ""}`,
      ""
    );
  });

  const storyDump = lines.join("\n");

  const systemPrompt = [
    "You are a narrative editor for LinkedIn carousels.",
    "You will receive a deck broken down slide by slide.",
    "Your job is to evaluate whether the story makes sense and flows:",
    "- Does the hook match the rest of the content?",
    "- Do slides 2–5 logically develop the hook?",
    "- Is the promise made on slide 1 actually delivered?",
    "You MUST respond with valid JSON only."
  ].join(" ");

  const userPrompt = [
    "Here is the deck:",
    "--------------------------------",
    storyDump,
    "--------------------------------",
    "",
    "Return JSON with this exact shape:",
    "{",
    '  "ok": true or false,',
    '  "summary": "one-paragraph summary",',
    '  "issues": ["bullet 1", "bullet 2"],',
    '  "suggestions": ["bullet 1", "bullet 2"]',
    "}",
    "",
    "Be strict but fair. If the story is weak or disjointed, ok should be false."
  ].join("\n");

  const raw = await openRouterChat({
    model: "meta-llama/llama-3.1-70b-instruct",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.4,
    max_tokens: 256
  });

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      summary: "Failed to parse narrative analysis JSON.",
      issues: ["Model returned non-JSON or invalid JSON."],
      suggestions: ["Retry analysis or inspect the raw response."]
    };
  }

    return {
      ok: Boolean(parsed.ok),
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
    };
  } finally {
    endTiming();
  }
}

