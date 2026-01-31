export const CAROUSEL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@700&family=Inter:wght@400;600&display=swap');

:root {
  --accent: #e0f2e9;   /* Mint accent */
  --bg-page: #e3f0dd;  /* Light mint page background */
  --bg-card: #f7fbf2;  /* Slightly lighter card background */
  --border-card: #c6d9b7;
  --text-main: #111111;
  --text-soft: #4a4a4a;
  --font-head: 'Oswald', sans-serif;
  --font-body: 'Inter', sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  background-color: var(--bg-page);
  color: var(--text-main);
  margin: 0;
  padding: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: var(--font-head);
  min-height: 100vh;
}

.status-bar {
  width: 100%;
  max-width: 980px;
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-soft);
  font-family: monospace;
  padding: 12px 16px;
  margin-bottom: 32px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.carousel-grid {
  width: 100%;
  max-width: 980px;
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
  justify-content: center;
}

/* Slide chassis (4:5) */
.slide {
  width: 360px;
  height: 450px;
  position: relative;
  background-color: var(--bg-card);
  border-radius: 28px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.10);
  border: 1px solid var(--border-card);
  opacity: 0;
  animation: fadeIn 0.4s forwards;
}

@keyframes fadeIn {
  to { opacity: 1; }
}

/* Layers */
.layer-texture {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(circle at 5% 0%, rgba(255,255,255,0.35), transparent 55%),
                    radial-gradient(circle at 100% 90%, rgba(0,0,0,0.08), transparent 60%);
  z-index: 5;
}

.layer-border {
  position: absolute;
  inset: 12px;
  border-radius: 22px;
  border: 1px solid rgba(0, 0, 0, 0.10);
  pointer-events: none;
  z-index: 6;
}

.layer-content {
  position: relative;
  z-index: 10;
  width: 100%;
  height: 100%;
  padding: 24px 20px 28px 20px;
  display: flex;
  flex-direction: column;
  text-align: left;
}

/* Content and outro wrappers need padding since .layer-content has none */
.content-wrapper {
  width: 100%;
  height: 100%;
  padding: 24px 20px 28px 20px;
  display: flex;
  flex-direction: column;
}

.outro-wrapper {
  width: 100%;
  height: 100%;
  padding: 32px 26px;
  display: flex;
  flex-direction: column;
}

/* Hook cover layout - full bleed image with text overlay */
.cover-wrapper {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
}

.cover-bg {
  position: absolute;
  inset: 0;
  z-index: 5;
}

.cover-bg img {
  position: absolute;
  left: 50%;
  bottom: -10%;                     /* nudge the card further down */
  transform: translateX(-50%) scale(1.44);
  transform-origin: center bottom;
  width: 100%;
  height: auto;
  object-fit: contain;
  display: block;
}

/* Optional placeholder if no image yet */
.cover-bg--placeholder {
  background: radial-gradient(
    circle at 50% 40%,
    rgba(0, 0, 0, 0.45),
    rgba(0, 0, 0, 0.95)
  );
}

.cover-overlay {
  position: relative;
  z-index: 20;
  width: 100%;
  height: 100%;
  padding: 40px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;      /* center horizontally */
  justify-content: flex-start;
  text-align: center;       /* center text within the block */
  color: #f8f8f8;
}

/* Let the top label sit tight at the top */
.cover-subtitle {
  margin-bottom: 12px;
}

/* Make the main hook big but not insane; allow 2–3 lines */
.cover-title {
  max-width: 90%;
}

/* Two-colour cover text (white subtitle, mint title) */
.txt-pre.cover-subtitle {
  font-family: var(--font-body);
  font-size: 14px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #ffffff;
  margin-bottom: 10px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}

.txt-title-huge.cover-title {
  font-family: var(--font-head);
  font-size: 40px;
  line-height: 1.05;
  text-transform: uppercase;
  color: var(--accent);    /* mint */
  max-width: 90%;
  margin: 0;
  text-shadow: 0 3px 12px rgba(0, 0, 0, 0.7);
}

/* Typography */
.txt-pre {
  font-family: var(--font-body);
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--text-soft);
  margin-bottom: 6px;
  line-height: 1.3;
  max-width: 100%;
  word-break: break-word;
}

.txt-title {
  font-family: var(--font-head);
  font-size: 32px;
  line-height: 1.1;
  text-transform: uppercase;
  color: var(--text-main);
  margin: 0 0 8px 0;
}

.txt-title-huge {
  font-family: var(--font-head);
  font-size: 44px;
  line-height: 1.0;
  text-transform: uppercase;
  color: var(--text-main);
  margin: 0 0 10px 0;
}

.txt-footer {
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.2;
  text-transform: uppercase;
  color: var(--text-soft);
  margin-top: auto;
}

/* Split layout used for body/nudge slides (2–5) */
.split-layout {
  display: flex;
  gap: 16px;
  width: 100%;
  height: 100%;
  align-items: center;
}

/* Image column for split layouts - more "card-like" */
.split-image {
  flex: 0 0 45%;             /* image takes ~45% of card width */
  display: flex;
  align-items: center;
  justify-content: center;
}

.split-image img {
  width: 100%;
  aspect-ratio: 4 / 3;       /* more square (4:3), not a long strip */
  object-fit: cover;         /* crop to fill */
  display: block;
  border-radius: 16px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
}

.split-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

/* Headline inside split layouts (NOT the cover title) */
.split-text .txt-title {
  font-size: 24px;
  line-height: 1.1;
  text-transform: uppercase;
  max-width: 90%;
  margin-bottom: 8px;

  /* Optional: visually clamp to ~2 lines for overly long titles */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Footer/caption inside split layouts - short-looking line under image */
.split-text .txt-footer {
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.3;
  max-width: 95%;
  opacity: 0.9;

  /* Visually limit to 2 lines with ellipsis if text is long */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.txt-cover-bottom {
  font-family: var(--font-head);
  font-size: 46px;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--text-main);
  margin-top: auto;
}

/* Image container area */
.img-container {
  flex: 1;
  width: 100%;
  margin: 12px 0 8px 0;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 14px;
  border: 1px dashed rgba(0, 0, 0, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.img-container img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.icon-placeholder {
  width: 72px;
  opacity: 0.45;
}

/* Arrows */
.arrow-svg {
  position: absolute;
  stroke: var(--text-main);
  stroke-width: 3;
  fill: none;
  stroke-linecap: round;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.25));
  z-index: 20;
}

/* Outro grid */
.outro-grid {
  margin-top: 32px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-family: var(--font-head);
  font-size: 22px;
  color: var(--text-main);
}

.profile-pic {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  border: 4px solid var(--accent);
  object-fit: cover;
  margin-top: auto;
}

@media print {
  body {
    background: #ffffff;
    padding: 0;
  }

  .status-bar {
    display: none;
  }

  .carousel-grid {
    display: block;
    max-width: 100%;
  }

  .slide {
    width: 100%;
    max-width: 760px;
    height: auto;
    page-break-after: always;
    break-after: page;
    box-shadow: none;
    margin: 0 auto 24px auto;
  }
}
`;

