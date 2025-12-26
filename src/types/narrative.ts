import { SlideIndex, SlideRole } from "./carousel";

export interface SlidePlan {
  index: SlideIndex; // 1–6
  role: SlideRole; // "hook" | "nudge" | "body" | "outro"
  goal: string; // what this slide is supposed to accomplish
  textIntent: string; // description of what kind of text should go here (NOT actual copy)
  imageIntent?: string; // high-level visual idea or metaphor
}

export interface NarrativePlan {
  topic: string;
  concept: string;
  tone?: string;
  images: string[];
  slides: SlidePlan[]; // must have exactly 6 entries
}

