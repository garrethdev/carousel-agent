import { openRouterChat } from "../../lib/openRouterClient";
import { NarrativePlan, SlidePlan } from "../../types/narrative";
import { startTiming } from "../../utils/timing";

export interface NarrativeFormInput {
  topic: string;
  concept: string;
  tone?: string;
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
    const { topic, concept, tone, images = [] } = input;

    const systemPrompt = [
    "You are planning a 6-slide LinkedIn carousel.",
    "You must output a JSON object that describes the PLAN only, not the final copy.",
    "There are always exactly 6 slides with fixed roles:",
    "  1 = hook (big promise or pattern break)",
    "  2 = nudge (clarify what this is really about and why it matters)",
    "  3 = body (first key idea)",
    "  4 = body (second key idea)",
    "  5 = body (third key idea or example)",
    "  6 = outro (call to action / wrap up).",
    "",
    "For each slide, you must provide:",
    "- index: number 1–6.",
    "- role: one of hook, nudge, body, outro.",
    "- goal: one sentence describing what this slide is meant to accomplish.",
    "- textIntent: one or two sentences describing what kind of text should appear (no actual phrases, just description).",
    "- imageIntent: one sentence describing the visual metaphor or subject (may be empty for slide 6).",
    "",
    "Do NOT write the actual headline or body copy; only describe intent.",
    "The output must be valid JSON and nothing else."
  ].join(" ");

  const imagesSummary =
    images.length > 0
      ? `The user provided ${images.length} image references: ${images
          .map((s, i) => `[${i}]: ${s}`)
          .join(", ")}. You may reference them in imageIntent if relevant.`
      : "The user did not provide any image references.";

  const userPrompt = [
    `Topic: ${topic}`,
    `Concept (full explanation): ${concept}`,
    tone ? `Tone: ${tone}` : "",
    imagesSummary,
    "",
    "Return JSON in this shape:",
    "{",
    '  "topic": "string",',
    '  "concept": "string",',
    '  "tone": "string or empty",',
    '  "images": ["array of strings"],',
    '  "slides": [',
    "    {",
    '      "index": 1,',
    '      "role": "hook",',
    '      "goal": "one sentence",',
    '      "textIntent": "one or two sentences",',
    '      "imageIntent": "one sentence or empty string"',
    "    },",
    "    ... 5 more slide objects ...",
    "  ]",
    "}",
    "",
    "Do not include any explanation or comments; only the JSON object."
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

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
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

