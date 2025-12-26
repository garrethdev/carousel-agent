import { FinalCarousel } from "../../types/carousel";
import { generateImagePromptsForCarousel } from "./imagePromptGenerator";
import { geminiGenerateImage } from "../../lib/geminiImageClient";
import { startTiming } from "../../utils/timing";

/**
 * Generate image for the hook slide (slide 1) only.
 *
 * - Uses generateHookImagePrompt via generateImagePromptsForCarousel internally.
 * - Calls Gemini once and attaches the image to slide 1.
 */
export async function generateFirstSlideImage(
  finalCarousel: FinalCarousel
): Promise<FinalCarousel> {
  const endTiming = startTiming("generateFirstSlideImage");
  try {
    // 1) Get prompts for all slides (existing behavior)
    const allPrompts = await generateImagePromptsForCarousel(finalCarousel);

    // 2) Filter for slideIndex === 1
    const hookPrompt = allPrompts.find((p) => p.slideIndex === 1);
    if (!hookPrompt) {
      return finalCarousel;
    }

    // 3) Call Gemini once for the hook prompt
    console.log(`[images] generating slide 1 only (hook image)`);
    const imageDataUrl = await geminiGenerateImage({ prompt: hookPrompt.prompt });

    const updatedSlides = finalCarousel.slides.map((slide) => {
      if (slide.index !== 1) return slide;
      return {
        ...slide,
        image: imageDataUrl
      };
    }) as FinalCarousel["slides"];

    return {
      ...finalCarousel,
      slides: updatedSlides
    };
  } finally {
    endTiming();
  }
}

/**
 * Calls the image prompt generator and Gemini image API to attach images to slides.
 *
 * Workflow:
 * - generateImagePromptsForCarousel: derive prompts from the FinalCarousel.
 * - geminiGenerateImage: request an image per prompt.
 * - Inject the returned base64 data URLs into slide.image.
 *
 * This function is currently used in test routes (e.g. /api/carousel/test-with-images).
 *
 * @param finalCarousel FinalCarousel with text; may be updated in-place with images.
 * @returns A new FinalCarousel with slide.image fields populated where applicable.
 */
export async function generateImagesForCarousel(
  finalCarousel: FinalCarousel
): Promise<FinalCarousel> {
  const endTiming = startTiming("generateImagesForCarousel");
  try {
    console.log(
      `[images] generating prompts for carousel (Gemini Nano banana) | overview="${finalCarousel.overview}"`
    );
    const prompts = await generateImagePromptsForCarousel(finalCarousel);
  const slideImages: Record<number, string> = {};

  for (const item of prompts) {
    console.log(
      `[images] generating slide ${item.slideIndex} via Gemini Nano banana`
    );
    try {
      const imageData = await geminiGenerateImage({
        prompt: item.prompt
      });
      slideImages[item.slideIndex] = imageData;
      console.log(`[images] slide ${item.slideIndex} generated (${imageData.slice(0, 50)}...)`);
    } catch (err) {
      console.error(
        `[images] failed slide ${item.slideIndex}`,
        err
      );
      throw err;
    }
  }

  console.log(
    `[images] generated images for slides: ${Object.keys(slideImages).join(", ")}`
  );

  const slides = finalCarousel.slides.map((slide) => {
    if (slideImages[slide.index]) {
      return {
        ...slide,
        image: slideImages[slide.index]
      };
    }
    return slide;
  }) as FinalCarousel["slides"];

    return { ...finalCarousel, slides };
  } finally {
    endTiming();
  }
}

