import type { Express, Request, Response } from "express";
import { getNiche, VIRLO_NICHES } from "../config/virloNiches";
import { ensureNicheAgents } from "../core/virlo/ensureAgents";
import { loadLatestSnapshot } from "../core/virlo/pullSlideshows";
import {
  analyzeLatestNiche,
  loadLatestReport,
  pullAndAnalyzeNiche
} from "../core/virlo/runPipeline";
import { renderNicheReportHtml } from "../core/virlo/renderReport";

const logRouteError = (label: string, err: unknown) => {
  console.error(`[route error] ${label}`, err);
};

function nicheOr404(req: Request, res: Response) {
  try {
    return getNiche(String(req.params.niche));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
    return null;
  }
}

export function registerVirloRoutes(app: Express): void {
  /**
   * @openapi
   * /api/virlo/niches:
   *   get:
   *     summary: List the Virlo research niches and their agent status.
   *     description: >
   *       Returns the configured skincare niches (eye care, eye masks, anti-aging),
   *       the Virlo agent backing each one, and whether a local snapshot / report exists.
   *     responses:
   *       200:
   *         description: Niche list.
   *       500:
   *         description: Internal server error.
   */
  app.get("/api/virlo/niches", async (_req: Request, res: Response) => {
    try {
      const statuses = await ensureNicheAgents(VIRLO_NICHES);
      const niches = VIRLO_NICHES.map((n) => {
        const status = statuses.find((s) => s.nicheKey === n.key) ?? null;
        const snapshot = loadLatestSnapshot(n.key);
        const report = loadLatestReport(n.key);
        return {
          key: n.key,
          agentName: n.agentName,
          agentId: n.agentId,
          minViews: n.minViews,
          keywords: n.keywords,
          agent: status,
          snapshot: snapshot ? { pulledAt: snapshot.pulledAt, count: snapshot.count } : null,
          report: report ? { generatedAt: report.analysis.generatedAt, hasInsights: Boolean(report.insights?.ok) } : null
        };
      });
      res.status(200).json({ niches });
    } catch (err) {
      logRouteError("GET /api/virlo/niches", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * @openapi
   * /api/virlo/{niche}/pull:
   *   post:
   *     summary: Pull the latest slideshows for a niche from Virlo and analyse them.
   *     description: >
   *       Fetches every slideshow page for the niche's Virlo agent, applies the view floor,
   *       stores a snapshot, runs the deterministic analysis and (unless llm=false) the
   *       OpenRouter insight pass, and writes the reports under data/virlo/reports.
   *     parameters:
   *       - in: path
   *         name: niche
   *         required: true
   *         schema:
   *           type: string
   *           enum: [eye-care, eye-masks, anti-aging]
   *       - in: query
   *         name: minViews
   *         schema:
   *           type: integer
   *       - in: query
   *         name: llm
   *         schema:
   *           type: boolean
   *       - in: query
   *         name: hooks
   *         description: Also re-query the corpus-wide hook endpoints (bills $0.25 per niche query).
   *         schema:
   *           type: boolean
   *       - in: query
   *         name: agentOnly
   *         schema:
   *           type: boolean
   *     responses:
   *       200:
   *         description: Analysis JSON (analysis + insights + snapshot meta).
   *       404:
   *         description: Unknown niche.
   *       500:
   *         description: Internal server error.
   */
  app.post("/api/virlo/:niche/pull", async (req: Request, res: Response) => {
    const niche = nicheOr404(req, res);
    if (!niche) return;
    try {
      const minViews = req.query.minViews !== undefined ? Number(req.query.minViews) : undefined;
      const llm = req.query.llm !== "false";
      const refreshHooks = req.query.hooks === "true";
      const agentOnly = req.query.agentOnly === "true";
      const result = await pullAndAnalyzeNiche(niche, { minViews, llm, refreshHooks, agentOnly });
      res.status(200).json({
        niche: niche.key,
        snapshot: {
          pulledAt: result.snapshot.pulledAt,
          count: result.snapshot.count,
          totalReported: result.snapshot.totalReported,
          sourceCounts: result.snapshot.sourceCounts,
          hookCorpusPulledAt: result.snapshot.hookCorpusPulledAt
        },
        analysis: result.analysis,
        insights: result.insights,
        files: result.files
      });
    } catch (err) {
      logRouteError(`POST /api/virlo/${niche.key}/pull`, err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * @openapi
   * /api/virlo/{niche}/analyze:
   *   post:
   *     summary: Re-run the analysis on the latest stored snapshot (no Virlo call).
   *     parameters:
   *       - in: path
   *         name: niche
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: llm
   *         schema:
   *           type: boolean
   *     responses:
   *       200:
   *         description: Analysis JSON.
   *       404:
   *         description: Unknown niche or no snapshot yet.
   */
  app.post("/api/virlo/:niche/analyze", async (req: Request, res: Response) => {
    const niche = nicheOr404(req, res);
    if (!niche) return;
    try {
      if (!loadLatestSnapshot(niche.key)) {
        return res.status(404).json({ error: `No snapshot for ${niche.key}; POST /api/virlo/${niche.key}/pull first.` });
      }
      const result = await analyzeLatestNiche(niche, { llm: req.query.llm !== "false" });
      res.status(200).json({ niche: niche.key, analysis: result.analysis, insights: result.insights, files: result.files });
    } catch (err) {
      logRouteError(`POST /api/virlo/${niche.key}/analyze`, err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * @openapi
   * /api/virlo/{niche}/report:
   *   get:
   *     summary: Latest analysis for a niche as JSON or HTML.
   *     parameters:
   *       - in: path
   *         name: niche
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: format
   *         schema:
   *           type: string
   *           enum: [json, html]
   *     responses:
   *       200:
   *         description: Report.
   *       404:
   *         description: Unknown niche or no report yet.
   */
  app.get("/api/virlo/:niche/report", (req: Request, res: Response) => {
    const niche = nicheOr404(req, res);
    if (!niche) return;
    const report = loadLatestReport(niche.key);
    if (!report) {
      return res.status(404).json({ error: `No report for ${niche.key} yet.` });
    }
    if (req.query.format === "html") {
      return res.type("html").status(200).send(renderNicheReportHtml({ niche, ...report }));
    }
    res.status(200).json({ niche: niche.key, ...report });
  });

  /**
   * @openapi
   * /api/virlo/{niche}/briefs:
   *   get:
   *     summary: Carousel briefs derived from the latest analysis, shaped for /api/carousel/plan.
   *     parameters:
   *       - in: path
   *         name: niche
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Array of { topic, concept, audience, tone, userContext } payloads.
   *       404:
   *         description: No insights yet.
   */
  app.get("/api/virlo/:niche/briefs", (req: Request, res: Response) => {
    const niche = nicheOr404(req, res);
    if (!niche) return;
    const report = loadLatestReport(niche.key);
    if (!report?.insights?.ok) {
      return res.status(404).json({ error: `No LLM insights for ${niche.key} yet.` });
    }
    const topHooks = report.analysis.topSlideshows.slice(0, 10).map((m) => `- ${m.hookText} (${m.views} views)`).join("\n");
    const briefs = report.insights.carouselBriefs.map((b) => ({
      topic: b.topic,
      concept: b.concept,
      audience: b.audience,
      tone: b.tone,
      userContext: [
        `Hook idea: ${b.hookIdea}`,
        `Product context: ${niche.productContext}`,
        `Winning patterns: ${report.insights!.winningPatterns.map((p) => p.pattern).join("; ")}`,
        "Top-performing hooks in this niche:",
        topHooks
      ].join("\n")
    }));
    res.status(200).json({ niche: niche.key, briefs });
  });
}
