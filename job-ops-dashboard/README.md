# job-ops dashboard

Source for **https://job-ops-dashboard.vercel.app** — the "new business hunter"
lead-hunting cockpit. This folder was vendored into git from the live Vercel
deployment (the app was previously CLI-deployed with no repo); it is the source
of truth going forward.

## What it is

A password-gated dashboard (Vercel serverless + static frontend, no framework)
that tracks job/consulting leads across lanes, enriches contacts via Apollo,
and drafts outreach in Garreth's voice via OpenRouter:

- **Leads / YC GTM / Recruiters / Warm** — the board over `jobops_leads` (Supabase).
- **Outreach** — crafts an email per lead and saves it to Gmail Drafts ("Sendouts"). Nothing is auto-sent.
- **📸 Drop** — screenshot → LinkedIn outreach:
  1. Drop/paste a job-posting screenshot; a vision model reads company/role/comp.
  2. The posting is saved as a board lead (same id scheme as the scraper pipeline, so it dedupes).
  3. Apollo *search* (free — credits are only spent on email reveals) finds 4–5
     senior tech leaders with their LinkedIn profiles.
  4. Person-level dedupe against the rest of business hunter: anyone already
     DM'd, already emailed via the dashboard, or already drafted-to by the
     **YC GTM Hunter** n8n workflow is excluded (with the reason shown).
     Company overlap is allowed — multi-channel touch is fine.
  5. Connection notes (≤300 chars) + follow-up messages are crafted in
     Garreth's voice. Sending stays manual: one click copies the note and
     opens the profile; you paste and hit send in your own browser. **The
     server never talks to LinkedIn.**
  6. "Mark sent" logs the DM to `jobops_li_outreach` and moves the lead to
     *Reached out*, so every other process sees the touch. The header shows
     a DMs-sent-today count.

## Layout

- `src/` — the Vercel deploy root (`vercel deploy` from inside `src/`).
  - `api/` — one serverless function per route; `api/li.js` is the Drop view
    (action-routed: `extract | hunt | dm | mark` to stay inside the function budget).
  - `lib/` — server modules; pure logic lives here so it's unit-testable
    (`li.js`, `id.js`, `manual_lead.js`, `llm.js`, …).
  - `public/` — static frontend (`index.html`, `app.js`, `format.js`, `styles.css`).
  - `test/` — `node --test` suite (run `npm test` in `src/`).
- `tests/fixtures/id_vectors.json` — golden vectors for the `makeId` parity
  test. The original file (generated from the Python pipeline) was not part of
  the deployment snapshot, so it was **regenerated from the deployed JS
  implementation** when this folder was vendored; it still locks the JS side
  against regressions.

## Storage (Supabase project `Contract-Dashboard`)

- `jobops_leads` — the board. RLS on, no policies; only the service key reads/writes.
- `yc_companies` — YC GTM Hunter's working set (founders, `founder_email`, state).
- `jobops_li_outreach` — one row per person targeted from the Drop view
  (`queued | sent | skipped`, canonical LinkedIn URL, note + message).

## Env (Vercel project `job-ops-dashboard`, production)

`DASH_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `APOLLO_API_KEY`,
`OPENROUTER_API_KEY` (+ optional `OPENROUTER_MODEL`, and
`OPENROUTER_VISION_MODEL` — defaults to `google/gemini-2.5-flash` for the
screenshot reader), `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
`GMAIL_REFRESH_TOKEN`, `SCRAPECREATORS_API_KEY`.

## Deploy

```sh
cd src
npm test                      # 63 tests, no deps
vercel deploy                 # preview
vercel deploy --prod          # production (aliases job-ops-dashboard.vercel.app)
```
