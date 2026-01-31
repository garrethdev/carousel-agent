import { FinalCarousel, RawCarouselPayload } from "../../types/carousel";
import { buildPreparedCarousel } from "./buildPreparedCarousel";
import { generateHookSlideText, applyHookSlideText } from "../text/hookGenerator";
import { generateBodySlidesFromPlan } from "../text/textGenerator";
import { mergeGeneratedText } from "./mergeText";
import { startTiming } from "../../utils/timing";
import { planNarrativeFromForm } from "../narrative/planFromForm";
import { NarrativePlan } from "../../types/narrative";

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
    const meta = raw[0];

    // Stage 1: narrative plan from meta + user context
    const narrativePlan: NarrativePlan = await planNarrativeFromForm({
      topic: meta.topic ?? meta.overview,
      concept: meta.overview,
      audience: meta.audience,
      tone: meta.tone,
      userContext: meta.userContext,
      images: []
    });

    // Step 1: normalize raw into prepared slides
    let prepared = buildPreparedCarousel(raw);

    // Step 2: generate hook slide text (slide 1 only)
    const hookPlan = narrativePlan.slides.find((s) => s.index === 1);
    const hookText = await generateHookSlideText(
      prepared,
      hookPlan,
      meta.userContext,
      meta.topic ?? meta.overview
    );
    prepared = applyHookSlideText(prepared, hookText);

    // Step 3: generate body/outro slides 2–6 using narrative plan
    const generated = await generateBodySlidesFromPlan(
      prepared,
      narrativePlan,
      meta.userContext
    );
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
    const meta = raw[0];
    const narrativePlan: NarrativePlan = await planNarrativeFromForm({
      topic: meta.topic ?? meta.overview,
      concept: meta.overview,
      audience: meta.audience,
      tone: meta.tone,
      userContext: meta.userContext,
      images: []
    });

    let prepared = buildPreparedCarousel(raw);

    const hookPlan = narrativePlan.slides.find((s) => s.index === 1);
    const hookText = await generateHookSlideText(
      prepared,
      hookPlan,
      meta.userContext,
      meta.topic ?? meta.overview
    );
    prepared = applyHookSlideText(prepared, hookText);

    // No body text generation here; we return as-is.
    return prepared as FinalCarousel;
  } finally {
    endTiming();
  }
}

