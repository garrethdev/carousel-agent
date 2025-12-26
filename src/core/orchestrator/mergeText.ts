import { PreparedCarousel } from "../../types/carousel";
import { GeneratedTextMap, TextField } from "../text/textGenerator";

export function mergeGeneratedText(
  prepared: PreparedCarousel,
  generated: GeneratedTextMap
): PreparedCarousel {
  const slides = prepared.slides.map((slide) => {
    const gen = generated[slide.index];
    if (!gen) return slide;

    const text = { ...slide.text };
    (Object.keys(gen) as TextField[]).forEach((field) => {
      const current = text[field];
      const candidate = gen[field];
      if (
        (current == null || current.trim() === "") &&
        candidate &&
        candidate.trim() !== ""
      ) {
        text[field] = candidate.trim();
      }
    });

    return { ...slide, text };
  }) as PreparedCarousel["slides"];

  return { ...prepared, slides };
}

