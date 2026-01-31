import { openRouterChat } from "../../lib/openRouterClient";
import { NarrativePlan, SlidePlan } from "../../types/narrative";
import { startTiming } from "../../utils/timing";

export interface NarrativeFormInput {
  topic: string;
  concept: string;
  audience?: string;
  tone?: string;
  userContext?: string;
  images?: string[];
}

/**
 * Stage 1 planner: given the high-level form input, call the LLM once to produce
 * a strict 6-slide NarrativePlan with roles + goals + text/image intents.
 *
 * This does NOT generate final copy. It only decides:
 * - what each slide is for,
 * - what each slide should roughly talk about,
 * - what each slide's image should roughly show.
 */
export async function planNarrativeFromForm(
  input: NarrativeFormInput
): Promise<NarrativePlan> {
  const endTiming = startTiming("planNarrativeFromForm");
  try {
    const { topic, concept, audience, tone, userContext = "", images = [] } = input;

    const systemPrompt = [
      "You are a narrative planner for 6-slide LinkedIn carousels.",
    "Map slide indices to meanings:",
    "- Slide 1: HOOK (bold promise, handled elsewhere).",
    "- Slide 2: REHOOK / PREMISE (continuation of hook; why this matters).",
    "- Slide 3: STEP 1.",
    "- Slide 4: STEP 2.",
    "- Slide 5: STEP 3 or RULE.",
    "- Slide 6: RECAP / CTA.",
      "",
      "Your job:",
      "- Take a topic, a concept, an audience, a desired tone, and rich user-provided context.",
      "- Do a bit of internal \"research\" using your general knowledge:",
      "  - common pain points",
      "  - typical mistakes",
      "  - obvious examples",
      "  - simple frameworks",
      "- Then design a 6-slide structure that works like high-performing TikTok / LinkedIn slideshows:",
      "  - Slide 1: HOOK — bold promise + specific angle.",
      "  - Slide 2: REHOOK / CLAIM — continuation of hook, why this matters.",
      "  - Slides 3–5: BODY — each slide is ONE sharp step/rule with a tiny example.",
      "  - Slide 6: OUTRO — recap + CTA / next step.",
      "",
      "Constraints:",
      "- Treat the user’s context as PRIMARY. Do NOT contradict it.",
      "- Use your own knowledge only to sharpen the examples, pain points, and angle.",
      "- Slides must be distinct; no duplicate points with slightly different wording.",
      "- Each slide must have:",
      "  - goal: what this slide is trying to achieve (in plain English).",
      "  - textIntent: what kind of text should appear (hook, list item, example, warning, etc.).",
      "  - imageIntent: a simple description of the visual metaphor or scene for that slide.",
      "",
      "Output:",
      "Return valid JSON with this exact shape:",
      "",
      "{",
      '  "topic": string,',
      '  "concept": string,',
      '  "tone": string,',
      '  "images": string[],              // leave as [] for now',
      '  "slides": [',
      '    { "index": 1, "role": "hook",  "goal": string, "textIntent": string, "imageIntent": string },',
      '    { "index": 2, "role": "nudge", "goal": string, "textIntent": string, "imageIntent": string },',
      '    { "index": 3, "role": "body",  "goal": string, "textIntent": string, "imageIntent": string },',
      '    { "index": 4, "role": "body",  "goal": string, "textIntent": string, "imageIntent": string },',
      '    { "index": 5, "role": "body",  "goal": string, "textIntent": string, "imageIntent": string },',
      '    { "index": 6, "role": "outro", "goal": string, "textIntent": string, "imageIntent": string }',
      "  ]",
      "}",
      "",
      "No extra keys, no explanations outside the JSON."
    ].join(" ");

  const imagesSummary =
    images.length > 0
      ? `The user provided ${images.length} image references: ${images
          .map((s, i) => `[${i}]: ${s}`)
          .join(", ")}. You may reference them in imageIntent if relevant.`
      : "The user did not provide any image references.";

  const userPrompt = [
    `Topic: ${topic}`,
    `Concept: ${concept}`,
    `Audience: ${audience || "not specified"}`,
    `Desired tone: ${tone || "direct, practical, slightly conversational"}`,
    "",
    "User context (primary source of truth):",
    userContext && userContext.trim().length > 0
      ? userContext
      : "No extra context provided.",
    "",
    "Using the instructions in the system prompt, plan a 6-slide carousel narrative.",
    "Remember:",
    "- Slide 1: hook",
    "- Slide 2: nudge / stakes",
    "- Slides 3–5: body",
    "- Slide 6: outro / CTA",
    "",
    "Return ONLY the JSON narrative plan."
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await openRouterChat({
    model: "meta-llama/llama-3.1-70b-instruct",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.4,
    max_tokens: 512
  });

  const extractJson = (text: string): any => {
    let t = text.trim();
    // Strip code fences if present
    t = t.replace(/```json/gi, "```").replace(/```/g, "");
    const firstBrace = t.indexOf("{");
    const lastBrace = t.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      t = t.slice(firstBrace, lastBrace + 1);
    }
    return JSON.parse(t);
  };

  let parsed: any;
  try {
    parsed = extractJson(raw);
  } catch (err) {
    console.error("[planNarrativeFromForm] Failed to parse narrative plan JSON. Raw:", raw);
    throw new Error("Failed to parse narrative plan JSON from LLM.");
  }

  const slides: SlidePlan[] = Array.isArray(parsed.slides) ? parsed.slides : [];
  if (slides.length !== 6) {
    throw new Error("Narrative plan must contain exactly 6 slides.");
  }

    return {
      topic,
      concept,
      tone: tone ?? parsed.tone ?? "",
      images,
      slides
    };
  } finally {
    endTiming();
  }
}

