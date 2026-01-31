import {
  PreparedCarousel,
  PreparedSlide,
  RawCarouselPayload,
  SlideIndex,
  SlideKind,
  SlideRole
} from "../../types/carousel";

function getSlideRole(index: SlideIndex): SlideRole {
  if (index === 1) return "hook";
  if (index === 2) return "nudge";
  if (index === 6) return "outro";
  return "body";
}

const OUTRO_SLIDE: PreparedSlide = {
  index: 6,
  kind: "outro",
  role: "outro",
  text: {
    title: "If You Found This Valuable",
    subtitle: undefined,
    footer: "Like · Comment · Repost · Save"
  },
  image: undefined,
  arrow: "none"
};

function makeSlide(
  index: SlideIndex,
  raw: Record<string, string | undefined>
): PreparedSlide {
  if (index === 6) return OUTRO_SLIDE;

  const kind: SlideKind = index === 1 ? "cover" : "content";
  const role = getSlideRole(index);
  const prefix = `slide${index}_`;

  return {
    index,
    kind,
    role,
    text: {
      title: raw[`${prefix}text1`],
      subtitle: raw[`${prefix}text2`],
      footer: raw[`${prefix}text3`]
    },
    image: raw[`${prefix}img1`],
    arrow:
      index === 2
        ? "top-right"
        : index === 3
        ? "left-curve"
        : index === 4
        ? "bottom-right"
        : "none"
  };
}

export function buildPreparedCarousel(raw: RawCarouselPayload): PreparedCarousel {
  const [meta, s1, s2, s3, s4, s5] = raw;

  const slide1 = makeSlide(1, s1);
  const slide2 = makeSlide(2, s2);
  const slide3 = makeSlide(3, s3);
  const slide4 = makeSlide(4, s4);
  const slide5 = makeSlide(5, s5);

  return {
    topic: meta.topic,
    overview: meta.overview,
    audience: meta.audience,
    tone: meta.tone,
    userContext: meta.userContext,
    slides: [slide1, slide2, slide3, slide4, slide5, OUTRO_SLIDE]
  };
}

