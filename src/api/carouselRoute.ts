import type { Express, Request, Response } from "express";
import { RawCarouselPayload } from "../types/carousel";
import { orchestrateCarouselGeneration, orchestrateHookOnly } from "../core/orchestrator/orchestrateCarousel";
import { renderCarouselHtml, renderSingleSlideHtml } from "../template/htmlRenderer";
import { analyzeNarrative } from "../core/analysis/narrativeAnalysis";
import { generateImagePromptsForCarousel } from "../core/image/imagePromptGenerator";
import { generateImagesForCarousel, generateFirstSlideImage } from "../core/image/imageGenerator";
import { geminiGenerateImage } from "../lib/geminiImageClient";
import {
  planNarrativeFromForm,
  NarrativeFormInput
} from "../core/narrative/planFromForm";

interface PlanInputPayload {
  topic: string;
  concept: string;
  tone?: string;
  images?: string[];
}

interface FirstSlidePreviewInput {
  topic: string;
  concept: string;
  tone?: string;
  images?: string[];
}

const logRouteError = (label: string, err: unknown) => {
  console.error(`[route error] ${label}`, err);
};

const SAMPLE_PAYLOAD: RawCarouselPayload = [
  {
    overview:
      "How to vary your LinkedIn content so you grow consistently without burning out.",
    audience: "solo creators and founders who post on LinkedIn",
    tone: "direct, practical, a bit conversational"
  },
  {
    // slide 1 – hook (let LLM fill most)
    slide1_text1: "",
    slide1_text2: "",
    slide1_text3: ""
  },
  {
    // slide 2 – nudge/re-hook
    slide2_text1: "",
    slide2_text2: "",
    slide2_text3: ""
  },
  {
    // slide 3 – body
    slide3_text1: "",
    slide3_text2: "",
    slide3_text3: ""
  },
  {
    // slide 4 – body
    slide4_text1: "",
    slide4_text2: "",
    slide4_text3: ""
  },
  {
    // slide 5 – body
    slide5_text1: "",
    slide5_text2: "",
    slide5_text3: ""
  }
];

export function registerCarouselRoutes(app: Express): void {
  /**
   * @openapi
   * /api/carousel:
   *   post:
   *     summary: Generate a full carousel from a low-level payload.
   *     description: >
   *       Accepts a RawCarouselPayload tuple (overview + 5 slide stubs),
   *       runs the text-generation orchestrator, and returns HTML with all slides rendered.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: array
   *             minItems: 6
   *             items:
   *               oneOf:
   *                 - type: object
   *                   properties:
   *                     overview:
   *                       type: string
   *                     audience:
   *                       type: string
   *                     tone:
   *                       type: string
   *                 - type: object
   *                   additionalProperties:
   *                     type: string
   *     responses:
   *       200:
   *         description: HTML string containing the rendered carousel.
   *         content:
   *           text/html:
   *             schema:
   *               type: string
   *       400:
   *         description: Invalid payload.
   *       500:
   *         description: Internal server error.
   */
  app.post("/api/carousel", async (req: Request, res: Response) => {
    try {
      const body = req.body;
      if (
        !Array.isArray(body) ||
        body.length < 6 ||
        typeof body[0]?.overview !== "string"
      ) {
        return res.status(400).json({ error: "Invalid payload" });
      }

      const payload = body as RawCarouselPayload;
      const finalCarousel = await orchestrateCarouselGeneration(payload);
      const html = renderCarouselHtml(finalCarousel);

      res.type("html").status(200).send(html);
    } catch (err) {
      logRouteError("POST /api/carousel", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * @openapi
   * /api/carousel/from-form:
   *   post:
   *     summary: Generate carousel from user-friendly form input.
   *     description: >
   *       Accepts a simplified payload with topic/concept/audience/tone/images,
   *       converts it to RawCarouselPayload, and returns rendered HTML.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - concept
   *             properties:
   *               topic:
   *                 type: string
   *                 description: Topic of the carousel (currently unused in backend).
   *               concept:
   *                 type: string
   *                 description: Main concept/description for the carousel.
   *               audience:
   *                 type: string
   *                 description: Target audience (optional).
   *               tone:
   *                 type: string
   *                 description: Desired tone (optional).
   *               images:
   *                 type: array
   *                 items:
   *                   type: string
   *                 description: Optional array of image URLs for slides 1-4.
   *     responses:
   *       200:
   *         description: HTML carousel rendered with generated text.
   *         content:
   *           text/html:
   *             schema:
   *               type: string
   *       400:
   *         description: Missing required field (concept).
   *       500:
   *         description: Internal server error.
   */
  app.post("/api/carousel/from-form", async (req: Request, res: Response) => {
    try {
      const { topic, concept, audience, tone, images } = req.body;
      
      if (!concept || typeof concept !== "string") {
        return res.status(400).json({ error: "concept is required" });
      }

      // Convert form input to RawCarouselPayload format
      const payload: RawCarouselPayload = [
        {
          overview: concept,
          audience: audience || undefined,
          tone: tone || undefined
        },
        { slide1_text1: "", slide1_text2: "", slide1_text3: "", slide1_img1: images?.[0] || "" },
        { slide2_text1: "", slide2_text2: "", slide2_text3: "", slide2_img1: images?.[1] || "" },
        { slide3_text1: "", slide3_text2: "", slide3_text3: "", slide3_img1: images?.[2] || "" },
        { slide4_text1: "", slide4_text2: "", slide4_text3: "", slide4_img1: images?.[3] || "" },
        { slide5_text1: "", slide5_text2: "", slide5_text3: "" }
      ];

      const finalCarousel = await orchestrateCarouselGeneration(payload);
      const html = renderCarouselHtml(finalCarousel);

      res.type("html").status(200).send(html);
    } catch (err) {
      logRouteError("POST /api/carousel/from-form", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * @openapi
   * /api/carousel/plan:
   *   post:
   *     summary: Generate narrative plan for carousel (Stage 1).
   *     description: >
   *       Accepts form payload, calls LLM once to produce a 6-slide NarrativePlan
   *       with roles, goals, textIntent, and imageIntent for each slide.
   *       Does NOT generate final copy or images.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - topic
   *               - concept
   *             properties:
   *               topic:
   *                 type: string
   *               concept:
   *                 type: string
   *               tone:
   *                 type: string
   *               images:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: NarrativePlan with 6 slide plans.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 topic:
   *                   type: string
   *                 concept:
   *                   type: string
   *                 tone:
   *                   type: string
   *                 images:
   *                   type: array
   *                   items:
   *                     type: string
   *                 slides:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       index:
   *                         type: integer
   *                       role:
   *                         type: string
   *                       goal:
   *                         type: string
   *                       textIntent:
   *                         type: string
   *                       imageIntent:
   *                         type: string
   *       400:
   *         description: Missing required fields.
   *       500:
   *         description: Internal server error.
   */
  app.post("/api/carousel/plan", async (req: Request, res: Response) => {
    try {
      const body = req.body as NarrativeFormInput;

      if (!body || typeof body.topic !== "string" || typeof body.concept !== "string") {
        return res.status(400).json({ error: "Invalid input (topic and concept are required)." });
      }

      const topic = body.topic.trim();
      const concept = body.concept.trim();
      const tone = typeof body.tone === "string" ? body.tone : undefined;
      const images = Array.isArray(body.images) ? body.images.filter(Boolean) : [];

      const plan = await planNarrativeFromForm({ topic, concept, tone, images });

      res.status(200).json(plan);
    } catch (err) {
      console.error("Error in /api/carousel/plan:", err);
      res.status(500).json({ error: "Failed to generate narrative plan." });
    }
  });

  /**
   * @openapi
   * /api/carousel/first-slide-preview:
   *   post:
   *     summary: Generate only the first slide (hook) with text + image.
   *     description: >
   *       Uses topic, concept, tone, and optional images[] from the form to build a minimal payload,
   *       runs the existing text orchestrator for slide 1, then generates the slide 1 image via Gemini,
   *       and returns an HTML document containing ONLY slide 1.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - topic
   *               - concept
   *             properties:
   *               topic:
   *                 type: string
   *               concept:
   *                 type: string
   *               tone:
   *                 type: string
   *               images:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: HTML for slide 1 preview.
   *         content:
   *           text/html:
   *             schema:
   *               type: string
   *       400:
   *         description: Missing required fields.
   *       500:
   *         description: Internal server error.
   */
  app.post("/api/carousel/first-slide-preview", async (req: Request, res: Response) => {
    try {
      const body = req.body as FirstSlidePreviewInput;

      if (!body || typeof body.topic !== "string" || typeof body.concept !== "string") {
        return res.status(400).json({ error: "Invalid input (topic and concept are required)." });
      }

      const concept = body.concept.trim();
      const tone = typeof body.tone === "string" ? body.tone : "";
      const images = Array.isArray(body.images) ? body.images.filter(Boolean) : [];

      // Build a minimal RawCarouselPayload:
      // - overview = concept (for now)
      // - slide 1 gets image[0] if present
      // - slides 2–5 are empty stubs
      const payload: RawCarouselPayload = [
        { overview: concept, tone },
        {
          slide1_text1: "",
          slide1_text2: "",
          slide1_text3: "",
          slide1_img1: images[0] || ""
        },
        {
          slide2_text1: "",
          slide2_text2: "",
          slide2_text3: "",
          slide2_img1: ""
        },
        {
          slide3_text1: "",
          slide3_text2: "",
          slide3_text3: "",
          slide3_img1: ""
        },
        {
          slide4_text1: "",
          slide4_text2: "",
          slide4_text3: "",
          slide4_img1: ""
        },
        {
          slide5_text1: "",
          slide5_text2: "",
          slide5_text3: "",
          slide5_img1: ""
        }
      ];

      // HOOK-ONLY TEXT GENERATION (skips body text for slides 2-5)
      let finalCarousel = await orchestrateHookOnly(payload);

      // HOOK-ONLY IMAGE GENERATION (only slide 1)
      finalCarousel = await generateFirstSlideImage(finalCarousel);

      const firstSlide = finalCarousel.slides[0];
      const html = renderSingleSlideHtml(firstSlide);

      res.type("html").status(200).send(html);
    } catch (err) {
      console.error("Error in /api/carousel/first-slide-preview:", err);
      res.status(500).json({ error: "Failed to generate first slide preview." });
    }
  });

  /**
   * @openapi
   * /api/carousel/test:
   *   get:
   *     summary: Test route with hardcoded sample carousel.
   *     description: Generates a sample carousel using SAMPLE_PAYLOAD and returns HTML.
   *     responses:
   *       200:
   *         description: HTML carousel rendered.
   *         content:
   *           text/html:
   *             schema:
   *               type: string
   *       500:
   *         description: Internal server error.
   */
  app.get("/api/carousel/test", async (_req: Request, res: Response) => {
    try {
      const finalCarousel = await orchestrateCarouselGeneration(SAMPLE_PAYLOAD);
      const html = renderCarouselHtml(finalCarousel);
      res.type("html").status(200).send(html);
    } catch (err) {
      logRouteError("GET /api/carousel/test", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * @openapi
   * /api/carousel/test-with-analysis:
   *   get:
   *     summary: Test route with carousel + narrative analysis.
   *     description: Generates sample carousel and analyzes its narrative coherence. Returns JSON.
   *     responses:
   *       200:
   *         description: JSON with html string and analysis object.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 html:
   *                   type: string
   *                 analysis:
   *                   type: object
   *                   properties:
   *                     ok:
   *                       type: boolean
   *                     summary:
   *                       type: string
   *                     issues:
   *                       type: array
   *                       items:
   *                         type: string
   *                     suggestions:
   *                       type: array
   *                       items:
   *                         type: string
   *       500:
   *         description: Internal server error.
   */
  app.get(
    "/api/carousel/test-with-analysis",
    async (_req: Request, res: Response) => {
      try {
        const payloadSource =
          typeof SAMPLE_PAYLOAD !== "undefined"
            ? SAMPLE_PAYLOAD
            : [
                { overview: "Sample deck for narrative analysis" },
                { slide1_text1: "", slide1_text2: "", slide1_text3: "" },
                { slide2_text1: "", slide2_text2: "", slide2_text3: "" },
                { slide3_text1: "", slide3_text2: "", slide3_text3: "" },
                { slide4_text1: "", slide4_text2: "", slide4_text3: "" },
                { slide5_text1: "", slide5_text2: "", slide5_text3: "" }
              ];

        const finalCarousel = await orchestrateCarouselGeneration(
          payloadSource as any
        );
        const html = renderCarouselHtml(finalCarousel);
        const analysis = await analyzeNarrative(finalCarousel);

        res.status(200).json({
          html,
          analysis
        });
      } catch (err) {
        logRouteError("GET /api/carousel/test-with-analysis", err);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  /**
   * @openapi
   * /api/carousel/test-image-prompts:
   *   get:
   *     summary: Test route returning image prompts only.
   *     description: Generates text for sample carousel, then creates image prompts. Returns JSON (no actual images).
   *     responses:
   *       200:
   *         description: JSON with array of image prompts.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 prompts:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       slideIndex:
   *                         type: integer
   *                       prompt:
   *                         type: string
   *       500:
   *         description: Internal server error.
   */
  app.get(
    "/api/carousel/test-image-prompts",
    async (_req: Request, res: Response) => {
      try {
        const payload =
          typeof SAMPLE_PAYLOAD !== "undefined"
            ? SAMPLE_PAYLOAD
            : [
                { overview: "Sample deck for image prompt testing" },
                { slide1_text1: "", slide1_text2: "", slide1_text3: "" },
                { slide2_text1: "", slide2_text2: "", slide2_text3: "" },
                { slide3_text1: "", slide3_text2: "", slide3_text3: "" },
                { slide4_text1: "", slide4_text2: "", slide4_text3: "" },
                { slide5_text1: "", slide5_text2: "", slide5_text3: "" }
              ];

        const finalCarousel = await orchestrateCarouselGeneration(payload as any);
        const prompts = await generateImagePromptsForCarousel(finalCarousel);

        res.status(200).json({ prompts });
      } catch (err) {
        logRouteError("GET /api/carousel/test-image-prompts", err);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  /**
   * @openapi
   * /api/carousel/test-with-images:
   *   get:
   *     summary: Test route with full text + image generation.
   *     description: >
   *       Generates sample carousel text, then calls Gemini to create images,
   *       and returns HTML with embedded base64 PNGs.
   *     responses:
   *       200:
   *         description: HTML with carousel slides including generated images.
   *         content:
   *           text/html:
   *             schema:
   *               type: string
   *       500:
   *         description: Internal server error.
   */
  app.get("/api/carousel/test-with-images", async (_req: Request, res: Response) => {
    try {
      const payload =
        typeof SAMPLE_PAYLOAD !== "undefined"
          ? SAMPLE_PAYLOAD
          : [
              { overview: "Sample deck for image prompt testing" },
              { slide1_text1: "", slide1_text2: "", slide1_text3: "" },
              { slide2_text1: "", slide2_text2: "", slide2_text3: "" },
              { slide3_text1: "", slide3_text2: "", slide3_text3: "" },
              { slide4_text1: "", slide4_text2: "", slide4_text3: "" },
              { slide5_text1: "", slide5_text2: "", slide5_text3: "" }
            ];

      const baseCarousel = await orchestrateCarouselGeneration(payload as any);
      const withImages = await generateImagesForCarousel(baseCarousel);
      const html = renderCarouselHtml(withImages);

      res.type("html").status(200).send(html);
    } catch (err) {
      logRouteError("GET /api/carousel/test-with-images", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}

