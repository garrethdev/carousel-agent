import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { VirloSlideshow } from "../../types/virlo";
import { virloDataDir, ensureDir } from "./paths";

/**
 * Reusable image library built from Virlo slideshow panels.
 *
 * Every panel image linked to a slideshow is classified by a cheap vision model
 * (Qwen3-VL-8B via OpenRouter — strong OCR, ~$0.0003/panel) into the buckets a
 * skincare carousel needs, with the on-screen text OCR'd so panels can be
 * searched and tagged. The images are real creators' posts, so the library is a
 * tagged REFERENCE library (pose, framing, text pattern) for steering our own
 * generation or shoots — not clip-art to republish.
 */

export type LibraryCategory =
  | "doctor_quote"
  | "two_person_quote"
  | "applying_cream"
  | "fact_card"
  | "before_after"
  | "problem_closeup"
  | "testimonial"
  | "other";

/** The buckets the user asked for; everything else is kept but de-emphasised. */
export const TARGET_CATEGORIES: LibraryCategory[] = [
  "doctor_quote",
  "two_person_quote",
  "applying_cream",
  "fact_card",
  "before_after"
];

export type LibrarySubject = "eyes" | "face_skin" | "body" | "hair" | "other";

export interface LibraryPanel {
  id: string; // sha1(imageUrl)
  imageUrl: string;
  category: LibraryCategory;
  subject: LibrarySubject;
  peopleCount: number;
  ocrText: string;
  scene: string;
  quality: number; // 1-5 visual quality
  tags: string[];
  // provenance
  niche: string;
  slideshowUrl: string;
  panelIndex: number;
  views: number;
  hookType: string;
  platform: string;
  classifiedBy: string;
  classifiedAt: string;
}

export interface PanelCandidate {
  imageUrl: string;
  niche: string;
  slideshowUrl: string;
  panelIndex: number;
  views: number;
  hookType: string;
  platform: string;
}

export const OCR_MODEL = process.env.VIRLO_OCR_MODEL || "qwen/qwen3-vl-8b-instruct";

export function libraryDir(): string {
  return path.join(virloDataDir(), "library");
}

export function panelId(imageUrl: string): string {
  return crypto.createHash("sha1").update(imageUrl).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Candidate selection (cheap, from stored slideshow JSON — no API calls)
// ---------------------------------------------------------------------------

const SKIN = /skin|eye|face|wrinkle|collagen|derm|retinol|aging|glow|under.?eye|puffy|dark circle|serum|cream|peptide|botox|filler|glass skin/;
const DOC = /\bdr\.?\s|doctor|dermatolog|\bmd\b|physician|surgeon|nurse|pharmacist|endocrinolog|expert|according to|study|research|scientist|clinic/;
const APPLY = /apply|applying|rub|massage|\bpat |\btap |routine|skincare|moistur|serum|cream|patch/;
const TWO = /interview|podcast|asked|q&a|conversation|\bvs\.?\b|debate|reacts?/;

/** Keep a panel-bearing slideshow if its intelligence text hints at any target bucket. */
export function isCandidateSlideshow(s: VirloSlideshow): boolean {
  const i = (s.intelligence || {}) as Record<string, any>;
  const txt = [
    i.panel_text_full,
    s.description,
    i.primary_topic,
    (i.secondary_topics || []).join(" "),
    (i.keywords || []).join(" ")
  ]
    .join(" ")
    .toLowerCase();
  return (
    SKIN.test(txt) ||
    i.is_before_after === true ||
    DOC.test(txt) ||
    (i.foreground_type === "text_only" && /\d/.test(txt)) ||
    APPLY.test(txt) ||
    TWO.test(txt)
  );
}

/** Flatten candidate slideshows into individual panel candidates (capped per slide). */
export function selectPanelCandidates(
  slideshows: VirloSlideshow[],
  niche: string,
  maxPanelsPerSlide = 8
): PanelCandidate[] {
  const out: PanelCandidate[] = [];
  for (const s of slideshows) {
    if (!isCandidateSlideshow(s)) continue;
    const imgs = (s.images || []).slice(0, maxPanelsPerSlide);
    imgs.forEach((img, idx) => {
      if (!img?.image_url) return;
      out.push({
        imageUrl: img.image_url,
        niche,
        slideshowUrl: s.url,
        panelIndex: typeof img.position === "number" ? img.position : idx,
        views: s.views || 0,
        hookType: (s.intelligence as any)?.hook_type || "unknown",
        platform: (s.platform || "tiktok").toLowerCase()
      });
    });
  }
  return out;
}

/** Cover-thumbnail candidates (single image per slideshow) — used for the hook-corpus niches. */
export function thumbnailCandidates(items: VirloSlideshow[], niche: string): PanelCandidate[] {
  const out: PanelCandidate[] = [];
  for (const s of items) {
    if (!s.thumbnail_url) continue;
    out.push({
      imageUrl: s.thumbnail_url,
      niche,
      slideshowUrl: s.url,
      panelIndex: 0,
      views: s.views || 0,
      hookType: (s.intelligence as any)?.hook_type || "unknown",
      platform: (s.platform || "tiktok").toLowerCase()
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Classification (vision model via OpenRouter)
// ---------------------------------------------------------------------------

const CLASSIFY_PROMPT = `You are cataloguing ONE panel from a TikTok/Instagram skincare slideshow for a reusable image library.
Return ONLY minified JSON, no prose, with these keys:
- "category": one of ["doctor_quote","two_person_quote","applying_cream","fact_card","before_after","problem_closeup","testimonial","other"].
  doctor_quote = a person presented as a doctor/dermatologist/expert (white coat, clinic, "Dr", credential) with a claim.
  two_person_quote = two distinct people shown (split panels or side by side), interview/reaction/versus.
  applying_cream = hands applying cream/serum/eye product to the face or under-eyes.
  fact_card = text-dominant panel: a stat, list, ingredient, timeline or claim, little or no face.
  before_after = a transformation: two states, day/week labels, "before/after", or a visible skin/body change.
  problem_closeup = a close-up of the problem (dark circles, wrinkles, puffy eyes) with no fix shown yet.
- "subject": one of ["eyes","face_skin","body","hair","other"].
- "people_count": integer number of distinct people visible.
- "ocr_text": verbatim on-screen text, keep line breaks as \\n; "" if none.
- "scene": <=12 word description of the image.
- "quality": integer 1-5, visual quality/clarity for reuse as a reference.`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function classifyOne(cand: PanelCandidate, apiKey: string): Promise<LibraryPanel | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1500 * attempt);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OCR_MODEL,
          messages: [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: cand.imageUrl } },
                { type: "text", text: CLASSIFY_PROMPT }
              ]
            }
          ],
          max_tokens: 600
        })
      });
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) continue;
        return null;
      }
      const data = (await res.json()) as any;
      const raw = data.choices?.[0]?.message?.content;
      if (typeof raw !== "string") continue;
      let t = raw.trim().replace(/```json/gi, "```").replace(/```/g, "");
      const a = t.indexOf("{");
      const b = t.lastIndexOf("}");
      if (a === -1 || b === -1) continue;
      const parsed = JSON.parse(t.slice(a, b + 1));
      const category = String(parsed.category || "other") as LibraryCategory;
      const subject = String(parsed.subject || "other") as LibrarySubject;
      const ocrText = typeof parsed.ocr_text === "string" ? parsed.ocr_text : "";
      const tags = buildTags(category, subject, cand, ocrText);
      return {
        id: panelId(cand.imageUrl),
        imageUrl: cand.imageUrl,
        category,
        subject,
        peopleCount: Number(parsed.people_count) || 0,
        ocrText,
        scene: typeof parsed.scene === "string" ? parsed.scene : "",
        quality: Number(parsed.quality) || 0,
        tags,
        niche: cand.niche,
        slideshowUrl: cand.slideshowUrl,
        panelIndex: cand.panelIndex,
        views: cand.views,
        hookType: cand.hookType,
        platform: cand.platform,
        classifiedBy: OCR_MODEL,
        classifiedAt: new Date().toISOString()
      };
    } catch {
      /* retry */
    }
  }
  return null;
}

function buildTags(
  category: LibraryCategory,
  subject: LibrarySubject,
  cand: PanelCandidate,
  ocr: string
): string[] {
  const tags = new Set<string>([category, subject, cand.niche, cand.platform]);
  if (cand.panelIndex === 0) tags.add("cover");
  const t = ocr.toLowerCase();
  for (const [tag, re] of [
    ["dark_circles", /dark circle|under.?eye|panda|raccoon/],
    ["wrinkles", /wrinkle|fine line|crow'?s feet|smile line/],
    ["retinol", /retinol|retinal/],
    ["collagen", /collagen/],
    ["puffiness", /puffy|puffiness|eye bag/],
    ["timeline", /\bday \d|\bweek \d|\bmonth \d|\d+ ?(day|week|month)/],
    ["rating", /rating|honest|\/10|score/]
  ] as const) {
    if (re.test(t)) tags.add(tag);
  }
  return Array.from(tags);
}

/** Classify a list of candidates with bounded concurrency; append each result via onResult. */
export async function classifyPanels(
  candidates: PanelCandidate[],
  opts: { concurrency?: number; onResult: (p: LibraryPanel) => void; onProgress?: (done: number, total: number, failed: number) => void }
): Promise<{ classified: number; failed: number }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const concurrency = opts.concurrency ?? 16;
  let next = 0;
  let done = 0;
  let failed = 0;

  async function worker(): Promise<void> {
    while (next < candidates.length) {
      const cand = candidates[next++];
      const result = await classifyOne(cand, apiKey);
      done++;
      if (result) opts.onResult(result);
      else failed++;
      if (opts.onProgress && done % 25 === 0) opts.onProgress(done, candidates.length, failed);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { classified: done - failed, failed };
}

// ---------------------------------------------------------------------------
// Persistence (resumable — append JSONL, skip already-classified ids)
// ---------------------------------------------------------------------------

export function panelsFile(): string {
  return path.join(libraryDir(), "panels.jsonl");
}

export function loadClassifiedIds(): Set<string> {
  const file = panelsFile();
  if (!fs.existsSync(file)) return new Set();
  const ids = new Set<string>();
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      ids.add(JSON.parse(line).id);
    } catch {
      /* skip */
    }
  }
  return ids;
}

export function appendPanel(p: LibraryPanel): void {
  ensureDir(libraryDir());
  fs.appendFileSync(panelsFile(), JSON.stringify(p) + "\n", "utf-8");
}

export function loadAllPanels(): LibraryPanel[] {
  const file = panelsFile();
  if (!fs.existsSync(file)) return [];
  const out: LibraryPanel[] = [];
  const seen = new Set<string>();
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const p = JSON.parse(line) as LibraryPanel;
      if (seen.has(p.id)) continue; // last-writer would duplicate; first wins
      seen.add(p.id);
      out.push(p);
    } catch {
      /* skip */
    }
  }
  return out;
}
