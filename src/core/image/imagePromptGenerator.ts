import { FinalCarousel, PreparedSlide, SlideIndex } from "../../types/carousel";
import { openRouterChat } from "../../lib/openRouterClient";

export interface SlideImagePrompt {
  slideIndex: SlideIndex;
  prompt: string;
}

const BASE_PHOTO_STYLE_PROMPT = `
Photorealistic 4:5 vertical studio poster image. Dark charcoal textured background with a soft vignette. Subtle film grain. Soft cinematic studio lighting. Realistic shadows. Minimal props. Single hero object placed slightly below center.
`.trim();

const CENTER_SAFEZONE_PROMPT = `
Designed for centered typography overlay: keep the central 40% of the frame clean, low-contrast, and uncluttered.
`.trim();

const INLINE_NEGATIVE_PROMPT = `
No readable text, no letters, no words, no logos, no watermarks. No UI with real text; only abstract grey lines if needed. No cartoon style, no flat vector, no illustration, no clipart. No busy backgrounds, no clutter, no multiple focal objects. Avoid high-contrast detail in the center area reserved for text overlay.
`.trim();

const HOOK_IMAGE_BASE_PROMPT = `
A single, large matte white card is shown in a close-up, slightly tilted toward the viewer, filling most of the lower two-thirds of the frame. Its top edge rises close to the middle of the image so it sits just beneath where a headline would go. The front of the card shows a printed generic Reddit-style discussion layout — a white page with a light grey header bar, a left column of grey icons and scores, and rows of post titles and "X comments", all rendered as abstract grey lines with no readable words or letters. Behind the card is a strong but controlled pale mint-green halo, tightly wrapped around the card and the area immediately below it, creating a bright ring of light that quickly fades into the charcoal background and does not reach the top third of the image. The upper third of the frame remains mostly clean, dark space so bold typography can sit above the card and feel visually connected to it. Absolutely no real words, letters, or readable text anywhere in the image; all interface text is just abstract grey lines.
`.trim();

function validatePrompt(prompt: string, fallback: string): string {
  const required = [
    "4:5",
    "Photorealistic",
    CENTER_SAFEZONE_PROMPT,
    INLINE_NEGATIVE_PROMPT
  ];
  const ok = required.every((r) => prompt.includes(r));
  return ok ? prompt : `${fallback} ${INLINE_NEGATIVE_PROMPT}`;
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
  _slide: PreparedSlide,
  _overview: string,
  _audience?: string
): Promise<string> {
  const prompt = [
    BASE_PHOTO_STYLE_PROMPT,
    CENTER_SAFEZONE_PROMPT,
    HOOK_IMAGE_BASE_PROMPT,
    INLINE_NEGATIVE_PROMPT
  ].join(" ");
  return prompt;
}

/**
 * Generate an image prompt for a BODY slide (2–5).
 */
function getBodySceneByIndex(slideIndex: SlideIndex): string {
  if (slideIndex === 2) {
    return "A single matte off-white rounded carousel cover card, bland and generic, angled slightly toward camera. Abstract grey placeholder lines only. Small red X marker on a corner. Tight pale mint halo behind the card only.";
  }
  if (slideIndex === 3) {
    return "A tall stack of 6–8 off-white rounded cards, compressed and heavy-looking. Top card has dense abstract grey placeholder lines. A few cards slightly skewed. Small red X marker on the stack. Tight pale mint halo behind the stack only.";
  }
  if (slideIndex === 4) {
    return "One clean off-white rounded card with only 2–3 abstract grey lines. Beside it, sleek pruning shears or a craft knife has cut away a messy bundle of thin grey abstract lines pushed to the side. Small green check marker near the clean card. Tight pale mint halo behind the clean card only.";
  }
  if (slideIndex === 5) {
    return "A minimalist off-white rounded blank signboard/panel on a simple stand. A small pale mint megaphone prop points toward the panel. Small green check marker near the panel. Tight pale mint halo behind the panel only.";
  }
  return "A single off-white rounded card with abstract grey lines and a subtle pale mint halo behind it. One clear hero object only.";
}

async function generateBodyImagePrompt(
  slide: PreparedSlide,
  overview: string,
  audience?: string
): Promise<string> {
  const scene = getBodySceneByIndex(slide.index);
  const prompt = [
    BASE_PHOTO_STYLE_PROMPT,
    CENTER_SAFEZONE_PROMPT,
    `The scene is about ${overview}. ${audience ? `Audience: ${audience}. ` : ""}${scene}`,
    INLINE_NEGATIVE_PROMPT
  ].join(" ");
  return validatePrompt(prompt, `${BASE_PHOTO_STYLE_PROMPT} ${CENTER_SAFEZONE_PROMPT} ${INLINE_NEGATIVE_PROMPT}`);
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

