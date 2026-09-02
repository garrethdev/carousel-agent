# Madame Cleora — Process Notes: "Direct AI" Viral Video Workflow vs. Our Director/Stitcher Pipeline

**Prepared:** 2026-09-02
**Source video:** 7:02 promo/tutorial (uploaded `d5b3460b-TNge8HkNScYdxwLA.mp4`) for an AI tool the narrator calls **"Direct AI"** (stylization uncertain — heard as *Direct AI* / possibly *Dyrect AI*). It sells an all-in-one, "create a similar video in a couple of clicks" viral-video generator.
**Full transcript:** `docs/madame-cleora/direct-ai-video-transcript.txt` (auto-transcribed with faster-whisper, word-timed, EN, 0.99 confidence).

---

## TL;DR

The video is a marketing walkthrough of a **consumer SaaS** that automates the *entire* short-form video pipeline behind a few buttons — from **finding a viral reference** all the way to a **cross-post-ready render**. It is not a Before/After transformation tool; it makes **AI-animated "history / what-if" cartoon-style shorts**. But structurally, its pipeline maps almost 1:1 onto **our** Script Supervisor → Director → Stitcher chain.

**The single biggest difference:** *he starts from a proven viral video and reverse-engineers its hook/body/CTA + visual strategy.* We start from a story in a sheet and apply fixed craft rules. His front-end (discovery + "why did this go viral" analysis) is exactly the piece our pipeline does **not** have — and it's the most copyable idea in the video.

---

## Part 1 — What "he" does (the Direct AI workflow, stage by stage)

| # | Stage (timestamp) | What the tool does |
|---|---|---|
| 1 | **Creator Library / discovery** (`01:01`–`01:43`) | AI surfaces **viral trending channels per platform** (YouTube, TikTok, Instagram, Facebook). Filterable by **niche, minimum average views, and format**. He finds a history channel (1.4M followers, multiple 10M+ view videos). |
| 2 | **"Create Similar" from a viral video** (`01:55`–`02:11`) | One button clones the approach of a specific viral video. Routes into the short-video generator with the reference link pre-loaded. |
| 3 | **Idea generation** (`02:12`–`02:39`) | Analyzes the reference and generates **10 new topic ideas** derived from it ("The secret pact between enemies…"). Can also paste your own script. |
| 4 | **Length select** (`03:01`–`03:11`) | 30s up to 3–5 min. He picks ~30s. |
| 5 | **Script writing via viral reverse-engineering** (`03:14`–`03:31`) | AI **researches *why* the reference went viral**, decomposes it into **hook / body / CTA**, and **adapts the same techniques and writing style** to the new script. |
| 6 | **Voice selection** (`03:32`–`03:50`) | Library of **premium TTS voices** with inline demos (Chris, Brian…). |
| 7 | **Animation budget decision** (`03:50`–`04:52`) | Choose how many images to animate. Full animation = costly credits, **faster viral growth**; fewer/no animations + free movement & transition effects = **slower growth, cheaper**. He does a **hybrid**: 1–2 animations up front, stills for the rest. |
| 8 | **Visual style & strategy generation** (`04:53`–`05:25`) | AI analyzes the reference's **visual style + strategy**, produces a **sequenced image plan** + strategy notes. Pick **symbolic image style** vs **conceptual map animation style**. **Save as a preset** for future videos. |
| 9 | **Credit breakdown + Generate** (`05:25`–`05:42`) | Shows a per-run **credit cost breakdown**, then assembles animations + images + **captions** + voiceover into a final video. |
| 10 | **Simple editor** (`05:44`–`06:41`) | Post-gen control: **transitions, zoom effects, one-click presets** that auto-adapt styles/transitions/effects/captions, caption styling, **background music**, per-image effects. |
| 11 | **Render + cross-post** (`06:41`–`06:57`) | Renders in seconds; positioned for **YouTube Shorts + IG + TikTok + Facebook**. |

**Core promise:** discovery → clone → script → voice → visual plan → render → cross-post, all in one UI, "a couple of clicks." Monetization is credits + an affiliate discount link.

---

## Part 2 — What we do (Madame Cleora / n8n Director + Stitch)

Our Before/After transformation pipeline is a **modular, rule-driven agent chain**, not a single UI:

- **05A — Script Supervisor** (deterministic prep): downloads the voiceover, runs **Whisper word-level transcription**, computes **phrase timing** and **phase boundaries** ([BEFORE]/[MIDDLE]/[AFTER]), and emits a `context_{script_id}.json`. Also sets **production vs testing mode**.
- **05B — Director** (creative only): consumes that context and builds the **EDL (Edit Decision List) v2.0** — semantic **clip↔phrase matching** via a strict **5-tier hierarchy** (Scriptwriter suggestion → phase → keyword → emotion → phase-only → flag/halt), **phrase-aligned durations**, **slowdown** (`playback_speed`) instead of splitting, **cut-on-action** trims, **climax ordering**, and **hard cuts**. Hard rule: **phase order is absolute**, never borrow clips across phases.
- **05C — Quality Control**: validates the EDL and **publishes** `EDL` + `B-Roll Shots` to the Google Sheet.
- **Stitcher (ba-video-stitcher)**: FFmpeg assembly → 1080×1920 / 30fps / H.264+AAC. Burns the **text hook (0–5s)**, **word-level subtitles** (Whisper, suppressed under the hook window), enforces **full voiceover playback**, concat of trimmed/slowed segments, uploads to Drive, writes `Final Video` to the sheet.

Our whole system is oriented around **one fixed narrative template** (Before → Middle → After transformation) sourced from **our own story sheet**, assembled from a **hand-tagged b-roll library**.

---

## Part 3 — Side-by-side comparison

| Capability | Direct AI (video) | Our pipeline | Verdict |
|---|---|---|---|
| **Viral reference discovery** | ✅ Creator Library, filter by niche/avg views/format | ❌ None — we start from a story sheet | **Gap for us** |
| **"Why did this go viral" analysis** | ✅ Decomposes reference hook/body/CTA + visual strategy | ⚠️ Partial — our Scriptwriter has hook craft, but no reference-driven analysis | **Gap for us** |
| **Script generation** | ✅ From reference, adapts proven style | ✅ Scriptwriter, from our stories | Parity (different inputs) |
| **Phase / structure model** | ⚠️ Implicit (hook/body/CTA) | ✅ Explicit BEFORE/MIDDLE/AFTER with enforced ordering | **Our edge (discipline)** |
| **Voiceover** | ✅ Premium TTS picker w/ demos | ✅ ElevenLabs voiceover generator | Parity |
| **Timing precision** | ❓ Not shown (tool-handled) | ✅ Whisper phrase + word timing, phrase-aligned cuts, 1.5s opening-image offset fix | **Our edge (precision)** |
| **Visuals** | ✅ Generates AI images/animations on demand | ⚠️ Fixed hand-tagged b-roll library; flag/halt when no match | **His edge (unlimited assets)** |
| **Animation** | ✅ Optional image→motion animation | ❌ We slow/trim real clips; no generative motion | **His edge** |
| **Captions/subtitles** | ✅ Auto captions + styling presets | ✅ Word-level ASS subtitles, hook-window suppression | Parity |
| **Transitions/effects** | ✅ Zoom/transition presets, one-click restyle | ⚠️ Hard cuts only, by design | Different intent |
| **Background music** | ✅ Built-in | ❌ Not in Stitcher | **Gap for us** |
| **Cost visibility** | ✅ Credit breakdown before render | ⚠️ Implicit (API costs, not surfaced) | Minor gap |
| **Presets / reuse** | ✅ Save style+strategy as preset | ⚠️ Rules are codified, but no user-savable style presets | Minor gap |
| **Editor / human-in-loop** | ✅ Simple post-gen editor | ⚠️ QC validation + testing mode, but no visual editor | Different model |
| **Cross-posting** | ✅ Positioned for 4 platforms | ⚠️ Delivers file to Drive; distribution is downstream | **Gap for us** |
| **Determinism / auditability** | ❌ Black-box SaaS | ✅ Every decision is an inspectable EDL field + match_tier + flags | **Our edge (control)** |

---

## Part 4 — What he does that we don't (opportunities to steal)

1. **Reference-first discovery.** The Creator Library is the whole unlock: *pick a proven winner, then build toward it.* We could add a "**Reference Miner**" entity that pulls trending shorts (Scrape Creators / YouTube/TikTok tools we already have access to) filtered by niche + min avg views, and feeds a reference into the Scriptwriter.
2. **"Why it went viral" decomposition.** Before writing, analyze the reference's hook/body/CTA and pacing, and pass that as guidance to our Scriptwriter — instead of relying only on generic craft rules. This is the highest-leverage, most-copyable idea in the video.
3. **Generative visuals as a fallback to flag/halt.** When our Director hits **Tier 5 (no matching clip)**, instead of halting, it could **generate an AI image/animation** for that beat (we have image/video generation tooling available). Turns a blocker into an asset.
4. **Background music track** in the Stitcher (ducked under the voiceover). Cheap add, real polish.
5. **Cost/credit breakdown surfaced pre-render** so a run's spend is visible before committing.
6. **Savable style presets** (voice + caption style + pacing + effect set) so a "look" is one selection, not re-derived each run.
7. **Cross-post packaging** — output platform-specific captions/hashtags + the render, not just a Drive file.

## Part 5 — What we do that he doesn't (our real edge)

1. **Absolute structural discipline.** Enforced BEFORE/MIDDLE/AFTER ordering with zero cross-phase borrowing. A SaaS won't guarantee narrative integrity like this.
2. **Frame-accurate audio↔visual sync.** Whisper phrase/word timing, phrase-aligned cuts, the 1.5s opening-image offset fix, hold-on-topic vs cut-on-topic-change. His tool is "wonderful" but opaque; ours is *provably* synced.
3. **Full auditability & control.** Every cut is an EDL field with `match_tier`, `trim_note`, `flags`, `vo_lines`. We can debug, QC, and improve deterministically. He gets a black box.
4. **Anti-mistake rules** a generic tool lacks: the **negation rule** (don't show "gym" on "not the gym"), opening image ≠ first clip scene, no image/video equivalent reuse, image-audio coherence checks.
5. **Testing vs production mode** — we never pollute the production sheet with experiments.
6. **Real b-roll authenticity.** For Before/After transformation content, real human footage beats cartoon AI images for credibility.

## Part 6 — Recommendations (priority order)

1. **Build a Reference Miner + "viral decomposition" front-end** (Parts 4.1 & 4.2). Biggest ROI; directly closes the gap that makes his tool compelling. We already have the scraping/transcript tooling to do it.
2. **Add generative-image fallback at Director Tier 5** (4.3) — kills the most common halt in our pipeline.
3. **Add background music + surfaced cost breakdown to the Stitcher** (4.4, 4.5) — small, high-polish wins.
4. **Introduce savable style presets** (4.6).
5. **Keep our structural/sync/audit advantages as the moat** — do **not** trade determinism for one-click convenience. The winning position is *his front-end (discovery + reverse-engineering) bolted onto our disciplined, auditable back-end.*

---

### One-line summary
> He automates **taste and discovery** (find a winner, clone its formula) with **generative** visuals; we automate **craft and precision** (frame-accurate, phase-locked, auditable) with **real** footage. Bolt his front-end onto our back-end and we beat both.

*Appendix: full timestamped transcript at `docs/madame-cleora/direct-ai-video-transcript.txt`.*
