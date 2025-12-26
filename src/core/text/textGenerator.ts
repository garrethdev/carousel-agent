import { SlideIndex } from "../../types/carousel";
import { openRouterChat } from "../../lib/openRouterClient";
import { MissingTextSlot, TextField } from "./textSlots";
import { startTiming } from "../../utils/timing";
export type { TextField };

export type GeneratedTextMap = Record<
  SlideIndex,
  Partial<Record<TextField, string>>
>;

function clampField(field: TextField, text: string): string {
  const t = (text ?? "").trim();
  if (field === "title" && t.length > 52) return t.slice(0, 51).trimEnd() + "…";
  if (field === "subtitle" && t.length > 120)
    return t.slice(0, 119).trimEnd() + "…";
  if (field === "footer" && t.length > 60)
    return t.slice(0, 59).trimEnd() + "…";
  return t;
}

export async function generateMissingText(
  slots: MissingTextSlot[]
): Promise<GeneratedTextMap> {
  const endTiming = startTiming("generateMissingText");
  try {
    const result: GeneratedTextMap = {} as GeneratedTextMap;
    if (slots.length === 0) return result;

    for (const slot of slots) {
    const { slideIndex, role, field, context } = slot;

    const fieldRoleDescription =
      role === "hook"
        ? "Hook slide. Strong promise. Max 7 words for title, 1 short subtitle, optional footer."
        : role === "nudge"
        ? "Nudge slide. Clarify what the carousel will cover and why it matters in 1 line."
        : "Body slide. Teach one concrete idea or step in plain language.";

    const fieldDescription =
      field === "title"
        ? "Write ONLY the bold slide title, 3–7 words, max 52 characters. No punctuation at the end."
        : field === "subtitle"
        ? "Write ONE short sentence (max 18 words, max 120 characters) describing what this slide teaches."
        : "Write ONE short support line (up to 16 words, max 60 characters) that gives an example or clarifies the how/why.";

    const systemPrompt = [
      "You write BODY slides (slides 2–5) for a LinkedIn carousel.",
      "Each slide has three fields:",
      "- subtitle: one short sentence at the top (max 18 words, max 120 characters).",
      "- title: a bold phrase (3–7 words) that could be set in large type, max 52 characters.",
      "- footer: a short support line (up to 16 words, max 60 characters) giving an example or how-to detail.",
      "Rules:",
      "- No hashtags, no emojis.",
      "- No long paragraphs; everything must fit in these three slots.",
      "- The title must be skimmable and self-contained, like \"ALTERNATE BETWEEN EVERGREEN AND TIMELY CONTENT\".",
      "- subtitle and footer must not simply repeat the title wording."
    ].join(" ");

    const userPrompt = [
      `Carousel overview: ${context.overview}`,
      context.audience ? `Audience: ${context.audience}` : "",
      context.tone
        ? `Desired tone: ${context.tone}`
        : "Desired tone: direct, practical, slightly conversational.",
      `Slide index: ${slideIndex}`,
      `Slide role: ${role}`,
      `Field: ${field}`,
      `Field role: ${fieldRoleDescription}`,
      `Instruction for this field: ${fieldDescription}`,
      context.existingText.title
        ? `Existing title (if any): ${context.existingText.title}`
        : "",
      context.existingText.subtitle
        ? `Existing subtitle (if any): ${context.existingText.subtitle}`
        : "",
      context.existingText.footer
        ? `Existing footer (if any): ${context.existingText.footer}`
        : "",
      "",
      "Return ONLY the final text for this field, with no quotes or explanation."
    ]
      .filter(Boolean)
      .join("\n");

    const content = await openRouterChat({
      model: "meta-llama/llama-3.1-70b-instruct",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.6,
      max_tokens: 48
    });

    if (!result[slideIndex]) result[slideIndex] = {};
    const clamped = clampField(field, content);
      result[slideIndex][field] = clamped;
    }

    return result;
  } finally {
    endTiming();
  }
}

