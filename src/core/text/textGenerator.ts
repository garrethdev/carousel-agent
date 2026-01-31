import { SlideIndex, PreparedCarousel } from "../../types/carousel";
import { openRouterChat } from "../../lib/openRouterClient";
import { MissingTextSlot, TextField } from "./textSlots";
import { startTiming } from "../../utils/timing";
import { NarrativePlan, SlidePlan } from "../../types/narrative";
export type { TextField };

export type GeneratedTextMap = Record<
  SlideIndex,
  Partial<Record<TextField, string>>
>;

function clampField(field: TextField, text: string): string {
  const t = (text ?? "").trim();
  if (field === "title" && t.length > 64) return t.slice(0, 63).trimEnd() + "…";
  if (field === "subtitle" && t.length > 140)
    return t.slice(0, 139).trimEnd() + "…";
  if (field === "footer" && t.length > 90)
    return t.slice(0, 89).trimEnd() + "…";
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
        model: "anthropic/claude-3.5-sonnet",
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

export const BODY_SYSTEM_PROMPT = `
You write high-performing LinkedIn carousel slides.

You NEVER write slide 1 (the hook). That is handled separately.

You ONLY write text for slides 2–6, using this structure:

- Slide 2: REHOOK & CLAIM
  • Deepens the hook from slide 1.
  • Explains why this topic matters in one sharp line.
- Slides 3–5: STEPS / RULES
  • Each slide teaches ONE concrete step or rule.
  • Always include a tiny example or "how to apply this" in the footer.
- Slide 6: RECAP & NEXT STEP
  • Recaps the core idea.
  • Suggests a simple next action or CTA.

Each slide has three fields:
- subtitle: one short sentence at the top (max 22 words, max 140 characters).
- title: bold, skimmable phrase (label of the slide), 5–9 words, max 64 characters.
- footer: short support line with an example or how-to (12–20 words, max 90 characters).

GLOBAL RULES (APPLY TO EVERY FIELD YOU WRITE)
- No hashtags. No emojis.
- No long paragraphs. Everything must be a short, skimmable line.
- Avoid vague fluff words like "insights", "tips", "guide", "leverage", "optimize" unless absolutely necessary.
- Prefer concrete language, simple verbs, and specific actions.
- subtitle, title, and footer must NOT simply repeat each other.

LENGTH BIAS
- Aim for the upper end of the allowed range for each field.
- Do NOT leave subtitle or footer empty unless explicitly instructed to do so.

LENGTH LIMITS
- subtitle: max 14 words, max 90 characters.
- title: 3–6 words, no punctuation at the end, max 40 characters.
- footer: max 12 words, max 50 characters.

ROLE- AND SLIDE-SPECIFIC BEHAVIOR

Slide 2 (role = "nudge"):
- Purpose: act like line 2 of the hook.
- subtitle: deepen the hook with ONE concrete reason this matters (e.g. a simple claim or contrast).
- title: sharpen or reframe the main promise (not a new topic).
- footer: briefly state what the carousel will show (e.g. "3 ways to turn Reddit into AI-ready content").

Slides 3–5 (role = "body"):
- Purpose: steps / rules.
- subtitle: state the step or rule in plain language.
- title: very short label for the step (e.g. "STEAL REDDIT'S TOP THREADS").
- footer: give a tiny example or "how to" (e.g. "Search 'your keyword' + site:reddit.com and study top 3 threads").

Slide 6 (role = "outro"):
- Purpose: recap + next step.
- subtitle: restate the payoff in one short line.
- title: 3–5 word recap of the main promise (e.g. "TURN REDDIT INTO TRAFFIC").
- footer: soft CTA or next step (e.g. "Pick one subreddit and test this this week").

CONTEXT & GROUNDING

You will be given:
- Carousel overview (what this carousel is about).
- Audience (who it is for), when provided.
- Desired tone, when provided.

Treat the overview and audience as HARD CONSTRAINTS:
- Use them to choose examples, language, and level of detail.
- When you imply "facts", keep them simple and believable (e.g. "often", "tends to", "2–3x", "a handful").

CALL PATTERN

You are called ONCE PER FIELD:

- You receive: slideIndex, slide role, field name ("subtitle" | "title" | "footer"),
  the carousel overview, audience, tone, and any existing text (if present).

- You must:
  1) Use slideIndex + role to decide which behavior above applies.
  2) Respect the global rules and length limits.
  3) Write ONLY the requested field.

Do not return empty strings unless explicitly told the field should be blank.
`;

export function buildBodyFieldUserPrompt(args: {
  context: { overview: string; audience?: string; tone?: string };
  slideIndex: number;
  role: "nudge" | "body" | "outro";
  field: "subtitle" | "title" | "footer";
  existingValue?: string;
}): string {
  const { context, slideIndex, role, field, existingValue } = args;

  const audienceLine = context.audience
    ? `Audience: ${context.audience}`
    : "Audience: not specified, assume typical LinkedIn readers in this niche.";

  const toneLine = context.tone
    ? `Desired tone: ${context.tone}`
    : "Desired tone: direct, practical, slightly conversational.";

  let fieldRoleDescription: string;
  let fieldInstruction: string;

  if (field === "title") {
    fieldRoleDescription = "Bold label for the slide, the main phrase people skim.";
    fieldInstruction = `
Write ONLY the bold slide title, 3–6 words, max 40 characters.
No punctuation at the end.
Make it punchy and concrete, not vague.
Do NOT repeat the exact wording of the subtitle or footer.
    `.trim();
  } else if (field === "subtitle") {
    fieldRoleDescription = "Short sentence at the top that sets context for the slide.";
    fieldInstruction = `
Write ONE short sentence (max 14 words, max 90 characters)
that fits the purpose of this slide given its index and role.
For slide 2, deepen the hook and explain why this matters.
For slides 3–5, clearly state the step or rule in plain language.
For slide 6, restate the payoff.
    `.trim();
  } else {
    fieldRoleDescription = "Support line under the image that gives an example or simple how-to.";
    fieldInstruction = `
Write ONE short support line (max 12 words, max 50 characters)
with either a tiny example or "how to apply this".
If you have nothing genuinely useful to add, return an empty string.
Do NOT repeat the title or subtitle.
    `.trim();
  }

  const existingLine = existingValue
    ? `Existing value (you may improve or replace it): ${existingValue}`
    : "No existing value. Create this from scratch.";

  return `
Carousel overview: ${context.overview}
${audienceLine}
${toneLine}

Slide index: ${slideIndex}
Slide role: ${role}
Field: ${field}
Field role: ${fieldRoleDescription}

Instruction for this field:
${fieldInstruction}

${existingLine}

Return ONLY the final text for this field, with no quotes and no explanation.
`.trim();
}

export async function generateBodySlidesFromPlan(
  prepared: PreparedCarousel,
  narrativePlan: NarrativePlan,
  userContext?: string
): Promise<GeneratedTextMap> {
  const endTiming = startTiming("generateBodySlidesFromPlan");
  try {
    const result: GeneratedTextMap = {} as GeneratedTextMap;
    const slides = narrativePlan.slides.filter((s) => s.index >= 2 && s.index <= 6);
    const context = {
      overview: prepared.overview,
      audience: prepared.audience,
      tone: prepared.tone
    };

    for (const plan of slides) {
      const fields: TextField[] = ["subtitle", "title", "footer"];
      for (const field of fields) {
        const userPrompt = buildBodyFieldUserPrompt({
          context,
          slideIndex: plan.index,
          role: plan.role as "nudge" | "body" | "outro",
          field: field as "subtitle" | "title" | "footer",
          existingValue: ""
        });

        const raw = await openRouterChat({
          model: "anthropic/claude-3.5-sonnet",
          messages: [
            { role: "system", content: BODY_SYSTEM_PROMPT },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.4,
          max_tokens: field === "title" ? 32 : 48
        });

        let text = raw.trim();
        // In case model returns quotes or extra whitespace
        if (text.startsWith(`"`)) {
          text = text.replace(/^"+|"+$/g, "").trim();
        }

        if (!result[plan.index as SlideIndex]) result[plan.index as SlideIndex] = {};
        result[plan.index as SlideIndex][field] = clampField(field, text);
      }
    }

    return result;
  } finally {
    endTiming();
  }
}

