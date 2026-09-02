# Vox-Style Documentary Collage — Calliope Template Pack

Everything needed to reproduce the "Vox style" hand-cut paper-collage
documentary short from [@seergioo_gil's article](https://x.com/seergioo_gil/status/2094082937402581220),
plus a deep-dive on the **Calliope MCP** that actually renders it.

Pulled with **ScrapeCreators** (`v1_twitter_tweet`) and reorganized into a
drop-in pack.

```
calliope-vox-template/
├── README.md                     ← you are here (MCP deep-dive + workflow)
├── article.md                    ← full scraped article, verbatim
├── prompts/
│   ├── 1-master-agent-prompt.md  ← paste into Claude (runs the whole job)
│   ├── 2-image-prompt-visual_style.md
│   └── 3-video-prompt-video_style.md
└── reference-images/
    ├── style-refs/               ← the 6 references you attach to Claude
    ├── calliope-ui/              ← UI walkthrough screenshots
    └── cover-banner.jpg
```

---

## What this actually is

**Calliope** ([calliopelabs.co](https://calliopelabs.co)) is an AI *faceless
video* generator for YouTube/TikTok shorts and long-form. It scripts, generates
per-scene images, animates them, adds narration + captions + SFX, and renders an
MP4 — all from a **template** (a locked style) plus a **brief** (your topic).

The clever part of this particular pack is the **template**, not the topic. A
Vox-style look (halftone cutouts, redacted eyes, archival maps, one hot-red
accent on aged paper) is easy on *one* frame and hard to hold across *every*
scene of a 60-second cut. The template pins it down two ways at once:

1. **Words** — split into two fields that must never be mixed:
   - `visual_style` (the Image Prompt) = what a frame *looks* like. No motion words.
   - `video_style` (the Video Prompt) = how clips *move*. No colors/textures.
2. **Pictures** — six `visual_references` that set the *ceiling* the words can't.
   "A prompt sets intent. A reference sets the ceiling." Attaching the prompts
   but not the references is why "scene 7 looks like a different show than scene 1."

Recommended settings: **shorts, narrator on, animated on, image quality `extra`,
video quality `high`.** Extra-high image matters most — halftone dots, torn
fibres and typewriter labels are the fine detail that collapses first.

---

## The Calliope MCP (the "figure it out" part)

The article's whole workflow runs through Claude talking to Calliope over MCP.
Here's what I dug up.

### Connect it to Claude

| | |
|---|---|
| **MCP server URL** | `https://www.calliopelabs.co/api/mcp` |
| **Transport** | Streamable HTTP (JSON-RPC; `Accept: application/json, text/event-stream`) |
| **Auth** | OAuth 2.0 — interfaces (Claude) sign in via OAuth; CLIs use an API key |
| **Rate limits** | Starter 100/min · 5,000/day · Pro ×2 · Creator ×4 |

Setup (from Calliope's `/mcp` page):
1. In Claude → **Customize → Connectors**
2. **+ → Add custom connector**
3. Name it `Calliope`, paste the MCP URL
4. **Add → Connect**, approve the consent screen
5. In chat → **+ → Connectors**, toggle **Calliope** on

**OAuth is fully automatic** (verified against the discovery endpoints): standard
Authorization-Code + PKCE (`S256`) with **dynamic client registration** —
`token_endpoint_auth_methods: none`, so no client secret and no manually pasted
key for the Claude interface.

```
authorization_endpoint : https://www.calliopelabs.co/api/mcp/oauth/authorize
token_endpoint         : https://www.calliopelabs.co/api/mcp/oauth/token
registration_endpoint  : https://www.calliopelabs.co/api/mcp/oauth/register
```

> Note: the endpoint is auth-gated even for `tools/list` — an unauthenticated
> call returns `{"error":"invalid_token"}`. The tool inventory below is
> reconstructed from the article's master prompt; connect the MCP in Claude to
> see the live, complete schema.

### Tools exercised by this workflow

| Tool | What it does (as used here) |
|------|------|
| `read_skill` | Loads Calliope's own guidance skills, e.g. `chat-style/create-video-best-practices` and `image-style/IMAGE-STYLE-CREATOR`, before building anything |
| `register_upload` | Uploads the 6 reference images so they can be attached to a template |
| `create_template` | Creates the reusable style. Key fields: `content_type` ("short"), `name`, `description`, `source.visual_references` (the uploads), `source.visual_style` (Image Prompt), `video_style` (Video Prompt), `settings` (voiceover/animate/captions, custom quality image `extra` + video `high`) |
| `estimate_generation_cost` | Prices a run, e.g. `target_duration_sec: 60`, before spending credits |
| `create_video` | Kicks off the job: `content_type` "short", `source.template_id`, `auto_accept: false` |
| `get_job` | Polls job status (poll ~every 60s, stop between polls) |
| `character_reference` + `get_clip` (`sheet_index: 0`) | Fetches the character reference sheet to approve before rendering |
| `resume_job` | Advances the job to the next stage (→ assets, → render) after your approval |

### Credits

`1 USD = 100 credits`. Plans: **Starter $39 / 3,900 cr**, **Pro $79 / 8,000 cr**,
**Creator $149 / 15,000 cr**. The Visuals-Lab screenshot in this pack shows this
template costing **939 cr/min** at these settings — so `estimate_generation_cost`
before you render is not optional.

---

## How to run it

**Fast path (one paste):**
1. Connect the Calliope MCP in Claude (above).
2. Open `prompts/1-master-agent-prompt.md`, paste it into Claude.
3. Attach the **six** images from `reference-images/style-refs/`.
4. Paste `prompts/2-image-prompt-visual_style.md` then
   `prompts/3-video-prompt-video_style.md` right after.
5. Give it a topic (or let it propose three hooks that open with a number/date),
   say **yes** to the quoted price, approve the character reference sheet, done.

**Manual path (in the Calliope app):** build the template in the **Visuals Lab**
— paste the Image Prompt into `visual_style`, the Video Prompt into `video_style`,
attach all six refs, set shorts / narrator / animated / image `extra` / video
`high`, confirm the **Visual References** panel shows all six, **Save Shorts
Template**. Then the Creation Lab handles script → character sheet → shoot.

---

## Common mistakes (from the article)

- Motion words ("slow push in") in the **Image** prompt → fake blur baked into stills.
- Letting **red** spread onto backgrounds/multiple elements — it's reserved for
  strokes, underlines, arrows, stat counters, emphasis only.
- Five or six cutouts per frame instead of **one hero at ~70%** + 2–3 supporting.
- Attaching the prompts but **not the six references** → drifting style across scenes.
- Paragraphs of on-screen text — the style allows **one 1–4 word label** on a strip/stamp.

## Reference images

`style-refs/` — the 6 collage-art references to attach:
1. `01-master-style-sheet.jpg` — cast, palette (with exact hex), rules, sample shots. The master ref.
2. `02-breaking-news-title.jpg` — title-card treatment.
3. `03-multi-shot-king-of-pop.jpg` — multi-panel example (wide/medium/close beats).
4. `04-redacted-figures-stat-card.jpg` — public figures with black eye bars + red `$7T` stat card.
5. `05-access-log-lock-collage.jpg` — lock hero + redacted figure + typewriter caption strip.
6. `06-archival-map-pins.jpg` — archival map with red string, brass pins, date strip.

`calliope-ui/` — screenshots of the Visuals Lab, the Visual References panel, and
the Creation Lab timeline, for orientation.

---

*Assembled from public content. Calliope is a third-party product; this pack just
documents and organizes the referenced workflow.*
