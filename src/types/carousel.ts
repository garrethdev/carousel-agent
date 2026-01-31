export type SlideIndex = 1 | 2 | 3 | 4 | 5 | 6;

export type SlideKind = "cover" | "content" | "outro";

export type SlideRole =
  | "hook" // slide 1 – big hook
  | "nudge" // slide 2 – rehook / nudge
  | "body" // slides 3–5 – teaching
  | "outro"; // slide 6 – CTA

export interface RawOverview {
  overview: string; // what the carousel is about
  topic?: string; // optional short topic label
  audience?: string; // optional (e.g. “solo SaaS founders”)
  tone?: string; // optional (e.g. “direct, practical”)
  userContext?: string; // optional rich context from user form
}

export interface RawSlideInput {
  [key: string]: string | undefined; // slideN_text1, slideN_text2, slideN_text3, slideN_img1
}

// Payload is overview + 5 slide stubs; slide 6 is fixed CTA.
export type RawCarouselPayload = [
  RawOverview,
  RawSlideInput,
  RawSlideInput,
  RawSlideInput,
  RawSlideInput,
  RawSlideInput
];

export interface PreparedSlide {
  index: SlideIndex;
  kind: SlideKind;
  role: SlideRole;
  text: {
    title?: string;
    subtitle?: string;
    footer?: string;
  };
  image?: string;
  arrow?: "none" | "top-right" | "left-curve" | "bottom-right";
}

export interface PreparedCarousel {
  overview: string;
  topic?: string;
  audience?: string;
  tone?: string;
  userContext?: string;
  slides: [
    PreparedSlide,
    PreparedSlide,
    PreparedSlide,
    PreparedSlide,
    PreparedSlide,
    PreparedSlide
  ];
}

// After LLM fill, we still use the same shape.
export type FinalCarousel = PreparedCarousel;

