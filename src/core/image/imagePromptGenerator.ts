import { FinalCarousel, PreparedSlide, SlideIndex } from "../../types/carousel";
import { openRouterChat } from "../../lib/openRouterClient";

export interface SlideImagePrompt {
  slideIndex: SlideIndex;
  prompt: string;
}

const HOOK_IMAGE_BASE_PROMPT = `
Photorealistic 4:5 vertical studio photograph. A single, large matte white card is shown in a close-up, slightly tilted toward the viewer, filling most of the lower two-thirds of the frame. Its top edge rises close to the middle of the image so it sits just beneath where a headline would go. The background is a dark charcoal, slightly textured wall with a soft vignette. The front of the card shows a printed [SUBJECT] layout – a Reddit-style discussion page with a white page, light grey header bar, left column of grey icons and scores, and rows of post titles and "X comments", all text rendered as abstract grey lines, no real logos or readable words. Behind the card is a strong but controlled pale mint-green halo, tightly wrapped around the card and the area immediately below it, creating a bright ring of light that quickly fades into the charcoal background and does not reach the top third of the image. The upper third of the frame remains mostly clean, dark space so bold typography can sit above the card and feel visually connected to it. Lighting is soft and cinematic with gentle grain so it looks like a real product photo, not a 3D render. No other objects, no on-image text.
`.trim();

function buildHookSubjectDescription(
  slide: PreparedSlide,
  overview: string
): string {
  const title = slide.text?.title?.trim();
  if (title && title.length > 0) {
    // Emphasize that we are visualizing the idea of the hook
    return `a page layout that visually represents "${title}"`;
  }
  const shortOverview =
    overview.length > 80 ? overview.slice(0, 77).trimEnd() + "…" : overview;
  return `a page layout that symbolizes ${shortOverview}`;
}

/**
 * Generates the hook image prompt for slide 1 using a fixed, tested base description.
 * No LLM is used here; we simply plug a subject phrase into HOOK_IMAGE_BASE_PROMPT.
 *
 * @param slide The prepared hook slide, including its text.
 * @param overview Global overview / concept of the deck.
 * @param audience Optional audience descriptor (currently unused).
 * @returns A deterministic prompt string for the hook visual.
 */
async function generateHookImagePrompt(
  slide: PreparedSlide,
  overview: string,
  audience?: string
): Promise<string> {
  const subject = buildHookSubjectDescription(slide, overview);
  const prompt = HOOK_IMAGE_BASE_PROMPT.replace("[SUBJECT]", subject);
  return prompt;
}

/**
 * Generate an image prompt for a BODY slide (2–5).
 */
async function generateBodyImagePrompt(
  slide: PreparedSlide,
  overview: string,
  audience?: string
): Promise<string> {
  const title = slide.text.title ?? "";
  const subtitle = slide.text.subtitle ?? "";
  const footer = slide.text.footer ?? "";

  const systemPrompt = [
    "You write prompts for Google's image generator for BODY slides (2–5) of a LinkedIn carousel.",
    "These images sit inside a rounded rectangle in the middle of a card, so they must be simple and very clear.",
    "Brand / style requirements:",
    "- Horizontal illustration, aspect ratio ~4:3 (wider than tall).",
    "- ONE clear subject or metaphor that visually matches the slide's title.",
    "- Flat or semi-flat 2D vector style (no photo, no 3D render).",
    "- Soft, minimal background with lots of negative space around the subject.",
    "- Color palette: light mint, cream, and soft neutrals with a few darker accents.",
    "- No on-image text or lettering. No logos, no UI screens, no watermarks.",
    "- Composition: main subject centered or slightly off-center, nothing important cropped at edges."
  ].join(" ");

  const userPrompt = [
    `Slide title: ${title}`,
    subtitle ? `Slide subtitle: ${subtitle}` : "",
    footer ? `Slide footer: ${footer}` : "",
    `Carousel overview: ${overview}`,
    audience ? `Audience: ${audience}` : "",
    "",
    "You are designing ONE illustration for this slide.",
    "Decide internally on a single strong visual metaphor or scene that represents this idea.",
    "",
    "Now output ONLY ONE final prompt for Google's image generator that:",
    "- Describes the main subject or metaphor in concrete detail (who or what is shown, what they are doing).",
    "- Specifies a horizontal 4:3 illustration, flat/vector 2D style, with a clean, uncluttered background.",
    "- Mentions a light mint / cream color palette with soft neutral background and a few darker accents.",
    "- Emphasizes a single clear subject, centered or slightly off-center, with plenty of negative space.",
    "- Explicitly avoids any on-image text, letters, logos, UI screenshots, or watermarks.",
    "",
    "IMPORTANT: Return ONLY the final prompt string, no bullet points, no numbered steps, no explanation."
  ]
    .filter(Boolean)
    .join("\n");

  const content = await openRouterChat({
    model: "meta-llama/llama-3.1-70b-instruct",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.5,
    max_tokens: 80
  });

  const firstLine = content.split("\n")[0].trim();
  return firstLine;
}

/**
 * Generates image prompts for all slides that should have images.
 *
 * - Always considers slide 1 (hook) unless an image is already provided.
 * - Considers slides 2–5 as body slides.
 * - Skips slide 6 (static CTA).
 *
 * @param finalCarousel FinalCarousel with text populated.
 * @returns An array of { slideIndex, prompt } pairs for image generation.
 */
export async function generateImagePromptsForCarousel(
  finalCarousel: FinalCarousel
): Promise<SlideImagePrompt[]> {
  const prompts: SlideImagePrompt[] = [];
  const overview = finalCarousel.overview;
  const audience = finalCarousel.audience;

  console.log(
    `[images] collecting prompts | overview="${overview}" audience="${audience ?? ""}"`
  );

  for (const slide of finalCarousel.slides) {
    // Skip static CTA (slide 6)
    if (slide.index === 6) continue;

    // If user already attached an image, do not generate one
    if (slide.image && slide.image.trim() !== "") continue;

    if (slide.index === 1) {
      const prompt = await generateHookImagePrompt(slide, overview, audience);
      prompts.push({ slideIndex: slide.index, prompt });
    } else if (slide.index >= 2 && slide.index <= 5) {
      const prompt = await generateBodyImagePrompt(slide, overview, audience);
      prompts.push({ slideIndex: slide.index, prompt });
    }
  }

  console.log(
    `[images] collected ${prompts.length} prompt(s) for slides: ${prompts
      .map((p) => p.slideIndex)
      .join(", ")}`
  );

  return prompts;
}

