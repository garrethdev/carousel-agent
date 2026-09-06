# Cleora Hook Bench

A two-shot hook opener is the first ~5 seconds of a Madame Cleora short: shot A, a cut, shot B,
with the headline card sitting over the pair. This is the bench for building them and the
pipeline that carries them through to a rendered episode.

Live: https://claude.ai/code/artifact/298d28a7-6f83-4fab-abfb-5b4785af5880

## What the bench does

- **Search** all active clips by describing them ("green liquid", "stern men in coats"). The index
  is built from each clip's `action`, `mood`, `tags`, `category` and `beat_role`.
- **Assign** any clip to slot A or B.
- **Trim** each clip with a two-handle rail — start and end point inside the source, not just a
  duration. Drag the middle to slide the window without changing its length.
- **Move** each clip independently: zoom start, zoom end, and a focus pad saying *where* the zoom
  goes. Presets (Portal, Push A in, Pull B out, Slow drift, Static) set both clips at once.
- **Join** A to B with a hard cut or a fade.
- **Card** — type the headline and it renders in the shot's real card band, in Arimo Bold, which is
  metric-compatible with the Liberation Sans Bold the renderer actually draws with.
- **Save** the edit. Saves live in the artifact's own database, so they survive the session.

### One hook per pair

Saving an A→B pairing that already exists **overwrites** it. The button says
`Overwrite "<name>"` when it is about to. This exists because three near-identical
`ancient_book_close → eyes_dilated_zoom_reveal` hooks accumulated, differing only in how long
shot A ran (1.8s / 1.9s / 2.0s), and the Director then had three indistinguishable options
competing for the same slot. Order matters: A→B and B→A are different hooks.

## Files

| file | what it is |
|---|---|
| `bench.html` | the page. `<script src="shots_data.js">` is replaced at build time |
| `build_data.py` | pulls active clips from Supabase, encodes previews, writes `shots_data.js` |
| `build.sh` | inlines the data into `hook_bench.html`, ready to publish |
| `sync_hooks.py` | saved edits → cut → Gemini-tagged → rows for `cleora_hooks` |
| `tag_prompt.txt` | the prompt Gemini answers about each hook |

`shots_data.js` and `hook_bench.html` are build outputs and are not committed — regenerate them.

## Rebuild

```bash
python3 build_data.py     # ~89 clips, a few minutes, writes shots_data.js (~8.6 MB)
./build.sh                # writes hook_bench.html
```

Then publish `hook_bench.html` to the artifact URL above — publishing to a *new* path creates a
separate artifact and orphans the saved hooks, which live per-artifact.

## Why the clips are embedded

An Artifact's CSP blocks media from Supabase storage, so every preview ships inside the page as a
base64 `data:` URI. That is why they are 280×498, 18fps, and capped at the first 5 seconds — all
89 clips have to fit under the 16 MB artifact ceiling. Twelve clips are longer than 5s
(`wide_closed_eye` and `card_field_purple` are 15s); on those the trim rail shows an amber tick
where the preview footage stops. You can still trim past it and the real cut uses the full source —
the bench just cannot show you that stretch.

## How a saved hook reaches a video

1. **Bench** — you build and save the pair.
2. **`sync_hooks.py`** — cuts it at 1080×1920, Gemini describes what is literally on screen, what
   the cut communicates, and which stories it fits or misleads. Upserts into `cleora_hooks`.
3. **Director** (n8n `[Cleora] Director`, workflow `ILloovicJh9HTH5v`) — fetches the catalogue and
   picks one `hook_key` per episode by matching the story against `fits_stories_about` /
   `avoid_for_stories_about`, or returns `none`. Writes it to `cleora_content.edl.hook`.
   The Director never sees video; those Gemini descriptions are its only evidence.
4. **Renderer** (`build_new_episode.py`) — builds the pair as one file with the moves baked in and
   uses it as the opener, placing the card at the hook's own `hook_y`.

If no hook genuinely fits, the Director returns `none` and the episode opens on the single shot
`cleora_orb_open_dramatic`. A code-level backstop also rejects any hook whose own
`avoid_for_stories_about` matches the episode, so a wrong opener cannot ship on the model's word
alone.

## Gotchas worth keeping

- The renderer **never loops** a short source to fill a slot — it *slows* it. So the hook pair is
  built longer than any plausible hook read (shot B runs to 14s) and gets trimmed, rather than
  dragging the opener into slow motion.
- `fps=30` must come **before** `zoompan`. The 24fps sources otherwise yield 121 frames where the
  zoom expression expects 135, and the move never reaches its end value.
- In the ffmpeg cut, `-ss`/`-t` are **input** options. As output options they truncate the
  retimed result instead of trimming the source read.
