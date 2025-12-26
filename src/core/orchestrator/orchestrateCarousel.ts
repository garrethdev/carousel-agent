import { FinalCarousel, RawCarouselPayload } from "../../types/carousel";
import { buildPreparedCarousel } from "./buildPreparedCarousel";
import { generateHookSlideText, applyHookSlideText } from "../text/hookGenerator";
import { collectMissingTextSlots } from "../text/textSlots";
import { generateMissingText } from "../text/textGenerator";
import { mergeGeneratedText } from "./mergeText";
import { startTiming } from "../../utils/timing";

/**
 * Main text-generation orchestrator for a carousel.
 *
 * Pipeline:
 * 1. buildPreparedCarousel: normalize RawCarouselPayload into PreparedCarousel.
 * 2. generateHookSlideText + applyHookSlideText: dedicated LLM call for slide 1 (hook).
 * 3. collectMissingTextSlots + generateMissingText + mergeGeneratedText:
 *    populate missing title/subtitle/footer fields for slides 2–5.
 *
 * @param raw RawCarouselPayload describing overview + raw slide stubs.
 * @returns FinalCarousel with all text fields filled; images may be added in a separate pipeline.
 */
export async function orchestrateCarouselGeneration(
  raw: RawCarouselPayload
): Promise<FinalCarousel> {
  const endTiming = startTiming("orchestrateCarouselGeneration");
  try {
    // Step 1: normalize raw into prepared slides
    let prepared = buildPreparedCarousel(raw);

    // Step 2: generate hook slide text (slide 1 only)
    const hookText = await generateHookSlideText(prepared);
    prepared = applyHookSlideText(prepared, hookText);

    // Step 3: fill missing fields for slides 2–5
    const slots = collectMissingTextSlots(prepared);
    const generated = await generateMissingText(slots);
    const finalCarousel = mergeGeneratedText(prepared, generated);

    // Step 4: return final deck (slide 6 remains static)
    return finalCarousel;
  } finally {
    endTiming();
  }
}

/**
 * Hook-only orchestrator:
 * - buildPreparedCarousel
 * - generateHookSlideText + applyHookSlideText
 * - Skips body text generation for slides 2–5.
 *
 * Used by /api/carousel/first-slide-preview to speed up the preview.
 */
export async function orchestrateHookOnly(
  raw: RawCarouselPayload
): Promise<FinalCarousel> {
  const endTiming = startTiming("orchestrateHookOnly");
  try {
    let prepared = buildPreparedCarousel(raw);

    const hookText = await generateHookSlideText(prepared);
    prepared = applyHookSlideText(prepared, hookText);

    // No body text generation here; we return as-is.
    return prepared as FinalCarousel;
  } finally {
    endTiming();
  }
}

