# Virlo slideshow research lane

Pulls high-performing TikTok / Instagram photo slideshows for three skincare
niches from [Virlo](https://dev.virlo.ai) and turns them into an evidence-backed
creative brief the carousel generator can consume.

| Niche key    | Virlo agent            | Agent id                               |
|--------------|------------------------|----------------------------------------|
| `eye-care`   | Eye care (under-eye)   | `5c26c264-9a3a-4cc3-83fe-bf7527795169` |
| `eye-masks`  | Eye masks & patches    | `cbe5fcbe-e03c-4b7b-bfcb-12e62ff43c0a` |
| `anti-aging` | Anti-aging skincare    | `1c486df6-a489-400a-870c-3e0e374db23c` |

All three are **recurring agents** (Mondays 00:00 UTC, TikTok + Instagram,
English only), created 2026-09-02 with keyword sets from Virlo's free
`POST /v1/agents/suggest-keywords` endpoint (quality score 100/100 each).
Config lives in `src/config/virloNiches.ts`.

## Two slideshow sources

1. **Agent slideshows** (free) — `GET /v1/agents/{id}/slideshows`. Whatever the
   weekly keyword crawl links as a TikTok photo post, with the full
   intelligence block (hook, hook type, narrative arc, panel texts, CTA, social
   proof, subject demographics…). Slideshow linking lags the video crawl:
   the first runs on 2026-09-02 linked 742 videos per niche but **zero
   slideshows**, and the older agents' recent runs link 0–10 per week.
2. **Hook corpus** ($0.25 per query) — `GET /v1/hooks/search?content_type=slideshow`
   over Virlo's 350k-slideshow corpus, three queries per niche, plus one
   `GET /v1/hooks/trending?category=beauty&content_type=slideshow` call routed
   to niches by keyword. Carries hook text, hook type, metrics, outlier ratio
   and Virality Score but no slide-by-slide text. Opt-in via `--hooks`
   (CLI) or `?hooks=true` (API); results are cached in
   `snapshots/<niche>/hooks-latest.json` and reused by later pulls.

Both are merged per niche (agent items win on duplicates) and tagged with a
`source` so the analysis can show what came from where.

## How the data flows

```
Virlo agent run (weekly)
   │  comet.run.completed webhook
   ▼
n8n "Virlo — Webhook Receiver"  ──►  Supabase content_posts  ──►  n8n "[Virlo] content_posts → machine_hooks"
   (existing; 25k view floor default for any comet not in its FLOORS map)

This repo (on demand / cron)
   npm run virlo:pull     ──►  data/virlo/snapshots/<niche>/latest.json   (git-ignored)
   npm run virlo:analyze  ──►  data/virlo/reports/<niche>.{json,md,html}  (committed)
                               data/virlo/reports/README.md              (cross-niche summary)
```

The n8n side needs no change: the receiver already ingests every completed
agent run and applies its default 25,000-view floor to unknown comet ids, so
the three new agents land in `content_posts` automatically. The `[Virlo]
content_posts → machine_hooks` bridge picks them up too (its `NICHES` map
falls back to the niche id as the topic name — add the ids there if you want
friendly names).

## Setup

```
# .env.local (git-ignored)
VIRLO_API_KEY=virlo_tkn_...
# optional
VIRLO_INSIGHTS_MODEL=anthropic/claude-opus-5   # any OpenRouter model id (default shown)
VIRLO_DATA_DIR=./data/virlo
```

`OPENROUTER_API_KEY` (already in `.env`) is used for the LLM insight pass, which
runs on `anthropic/claude-opus-5` through OpenRouter by default. Measured cost
on 2026-09-02: about $0.23 per niche per run (thinking tokens included), so
roughly $0.70 for all three niches.

## Commands

| Command | What it does | Virlo cost |
|---|---|---|
| `npm run virlo:status` | Balance, agent state, latest run per niche | free |
| `npm run virlo:ensure` | Re-create any niche agent missing from the account | free (first run bills $0.50) |
| `npm run virlo:pull [niche…] [--wait] [--min-views=N]` | Fetch every agent slideshow page, merge cached hook-corpus items, dedupe, apply floor, store snapshot | free |
| `npm run virlo:pull -- --hooks` | Same, but first re-query the hook corpus (3 queries per niche + 1 trending) | $0.25 per call ≈ $2.50 for all three niches |
| `npm run virlo:pull -- --agent-only` | Ignore the hook-corpus cache | free |
| `npm run virlo:analyze [niche…] [--no-llm]` | Analyse latest snapshots, write reports | free (OpenRouter tokens only) |
| `npm run virlo:run [niche…]` | ensure → wait for runs → pull → analyze | free |
| `npm run virlo:summary` | Rebuild `reports/README.md` from the stored per-niche reports | free |

Each scheduled agent run bills **$0.50 (50 credits)**. Three agents weekly ≈
$1.50/week. `data_intelligence_enabled` is deliberately off: the per-slideshow
`intelligence` block (hook text, hook type, narrative arc, panel texts, …) is
populated regardless, so the $1.00/run surcharge buys nothing for slideshows.

## HTTP API (served by `npm run dev`, documented at `/docs`)

| Route | Purpose |
|---|---|
| `GET  /api/virlo/niches` | Niche config + live agent status + local snapshot/report state |
| `POST /api/virlo/:niche/pull?minViews=&llm=` | Pull + analyse + write reports |
| `POST /api/virlo/:niche/analyze?llm=` | Re-analyse the stored snapshot |
| `GET  /api/virlo/:niche/report?format=json\|html` | Latest report |
| `GET  /api/virlo/:niche/briefs` | Carousel briefs shaped for `POST /api/carousel/plan` |

## What the analysis produces

`src/core/virlo/metrics.ts` derives per-slideshow metrics (outlier multiplier =
views ÷ followers, engagement / save / share rates, views per day, and the same
6–9 score the n8n hook bridge uses).

`src/core/virlo/analyzeSlideshows.ts` builds the niche picture:

- **Top tier** = top quartile by views. For every Virlo intelligence attribute
  (hook type, narrative arc, text density, slide count, face visible,
  before/after, background, CTA, social proof, subject age…) it reports the
  **lift**: top-tier share ÷ overall share. ▲ ≥ 1.3 means winners do it more.
- Top 30 slideshows with hooks, small-account **breakouts** (< 50k followers,
  ≥ 50× follower views), fastest-moving posts, hooks grouped by type, top
  topics / keywords / hashtags, top creators.

`src/core/virlo/llmInsights.ts` feeds a compact digest of that to OpenRouter
and returns winning patterns (with cited evidence), reusable hook formulas,
recommended slide structure, five content angles, three ready-to-run carousel
briefs, and an avoid list. `GET /api/virlo/:niche/briefs` reshapes the briefs
into `/api/carousel/plan` payloads.
