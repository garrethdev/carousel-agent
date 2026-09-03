# carousel-agent

Express + TypeScript service that generates LinkedIn-style carousels
(narrative plan → hook → body copy → images → HTML) and, since 2026-09,
runs a **Virlo slideshow research lane** for skincare niches.

```
npm install
npm run dev            # http://localhost:3000  (Swagger at /docs)
npm run typecheck
```

## Virlo research lane

Pulls high-performing TikTok / Instagram slideshows for **eye care**,
**eye masks & patches** and **anti-aging skincare** from Virlo and turns them
into lift tables, hook formulas and ready-to-run carousel briefs.

```
npm run virlo:status               # agents, runs, credit balance
npm run virlo:pull -- --hooks      # pull (agent + hook corpus) into data/virlo/snapshots
npm run virlo:analyze              # reports → data/virlo/reports/<niche>.{md,html,json}
```

Full details, costs and API routes: [docs/virlo-research.md](docs/virlo-research.md).
Latest reports: [data/virlo/reports/README.md](data/virlo/reports/README.md).

Secrets: `OPENROUTER_API_KEY` / `GEMINI_API_KEY` in `.env` / `environment.env`,
`VIRLO_API_KEY` in the git-ignored `.env.local`.
