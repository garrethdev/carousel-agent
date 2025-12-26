import { FinalCarousel, PreparedSlide } from "../types/carousel";
import { CAROUSEL_CSS } from "./carouselStyles";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PLACEHOLDER_SVG =
  `<svg class="icon-placeholder" viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;

const ARROW_TOP_RIGHT =
  `<svg class="arrow-svg" style="top:80px; right:32px; width:46px;" viewBox="0 0 50 80"><path d="M10,0 Q10,40 40,70 M25,60 L40,70 L45,55"/></svg>`;
const ARROW_LEFT_CURVE =
  `<svg class="arrow-svg" style="top:190px; left:24px; width:40px; height:150px" viewBox="0 0 50 150"><path d="M40,10 Q0,75 40,140 M25,130 L40,140 L45,125"/></svg>`;
const ARROW_BOTTOM_RIGHT =
  `<svg class="arrow-svg" style="bottom:120px; right:32px; width:50px; height:80px" viewBox="0 0 50 80"><path d="M10,70 Q40,40 40,10 M25,20 L40,10 L45,25"/></svg>`;

function renderSlideContent(slide: PreparedSlide): string {
  const title = slide.text.title ? escapeHtml(slide.text.title) : "";
  const subtitle = slide.text.subtitle ? escapeHtml(slide.text.subtitle) : "";
  const footer = slide.text.footer ? escapeHtml(slide.text.footer) : "";

  if (slide.kind === "cover") {
    const imageSrc = slide.image || "";

    return `
      <div class="cover-wrapper">
        ${
          imageSrc
            ? `<div class="cover-bg"><img src="${escapeHtml(imageSrc)}" alt=""></div>`
            : `<div class="cover-bg cover-bg--placeholder"></div>`
        }
        <div class="cover-overlay">
          ${subtitle ? `<div class="txt-pre cover-subtitle">${escapeHtml(subtitle)}</div>` : ""}
          ${title ? `<div class="txt-title-huge cover-title">${title.replace(/\n/g, "<br>")}</div>` : ""}
        </div>
      </div>
    `;
  }

  if (slide.kind === "outro") {
    const outroTitle = title.replace(/\n/g, "<br>");
    const profileImg = slide.image ? escapeHtml(slide.image) : "";
    return `
      <div class="outro-wrapper">
        <div class="txt-title-huge">${outroTitle}</div>
        <div class="outro-grid">
          <div>Like</div>
          <div>Comment</div>
          <div>Repost</div>
          <div>Save</div>
        </div>
        ${profileImg ? `<img src="${profileImg}" class="profile-pic">` : ""}
      </div>
    `;
  }

  const imgHTML = slide.image
    ? `<img src="${escapeHtml(slide.image)}">`
    : PLACEHOLDER_SVG;

  let arrowHTML = "";
  if (slide.arrow === "top-right") arrowHTML = ARROW_TOP_RIGHT;
  else if (slide.arrow === "left-curve") arrowHTML = ARROW_LEFT_CURVE;
  else if (slide.arrow === "bottom-right") arrowHTML = ARROW_BOTTOM_RIGHT;

  return `
    <div class="content-wrapper">
      <div class="txt-pre">${subtitle}</div>
      <div class="txt-title">${title}</div>
      <div class="img-container">${imgHTML}</div>
      ${arrowHTML}
      <div class="txt-footer">${footer}</div>
    </div>
  `;
}

function renderSlide(slide: PreparedSlide): string {
  return `
    <div class="slide">
      <div class="layer-texture"></div>
      <div class="layer-border"></div>
      <div class="layer-content">
        ${renderSlideContent(slide)}
      </div>
    </div>
  `;
}

export function renderCarouselHtml(final: FinalCarousel): string {
  const slidesHtml = final.slides.map(renderSlide).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>LinkedIn Carousel</title>
  <style>${CAROUSEL_CSS}</style>
</head>
<body>
  <div class="status-bar">&gt; Carousel generator ready.</div>
  <div class="carousel-grid">
    ${slidesHtml}
  </div>
</body>
</html>`;
}

/**
 * Render a full HTML document containing only a single slide.
 * Useful for debugging or previewing the hook slide.
 */
export function renderSingleSlideHtml(slide: PreparedSlide): string {
  const slideHtml = renderSlide(slide);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>First Slide Preview</title>
  <style>${CAROUSEL_CSS}</style>
</head>
<body>
  <div class="status-bar">&gt; First slide preview.</div>
  <div class="carousel-grid">
    ${slideHtml}
  </div>
</body>
</html>`;
}

