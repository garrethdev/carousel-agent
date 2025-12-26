import {
  PreparedCarousel,
  PreparedSlide,
  SlideIndex,
  SlideRole
} from "../../types/carousel";

export type TextField = "title" | "subtitle" | "footer";

export interface MissingTextSlot {
  slideIndex: SlideIndex;
  role: SlideRole;
  field: TextField;
  context: {
    overview: string;
    audience?: string;
    tone?: string;
    existingText: {
      title?: string;
      subtitle?: string;
      footer?: string;
    };
  };
}

export function collectMissingTextSlots(
  prepared: PreparedCarousel
): MissingTextSlot[] {
  const slots: MissingTextSlot[] = [];

  prepared.slides.forEach((slide: PreparedSlide) => {
    if (slide.role === "outro" || slide.index === 1) return;

    (["title", "subtitle", "footer"] as TextField[]).forEach((field) => {
      const current = slide.text[field];
      if (current == null || current.trim() === "") {
        slots.push({
          slideIndex: slide.index,
          role: slide.role,
          field,
          context: {
            overview: prepared.overview,
            audience: prepared.audience,
            tone: prepared.tone,
            existingText: { ...slide.text }
          }
        });
      }
    });
  });

  return slots;
}

