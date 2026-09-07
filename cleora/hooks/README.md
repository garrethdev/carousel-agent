# Hook openers — the owner's hand-cut two-shot intros

Seven openers, built by hand in the Hook Bench and deployed to
`public.cleora_hooks`. They replaced an earlier set of 13.

## In-points are edits, not metadata

Each leg carries **both** an in-point and a duration:

| column | meaning |
|---|---|
| `in_a` / `in_b` | seconds into the source where that leg starts |
| `cut_a` / `cut_b` | seconds of footage taken from that point |

`in_b = 0.9` on `hook01` is a deliberate edit — shot B opens nine tenths
of a second in, not at the top. Treating in-points as optional silently
re-cuts the owner's work back to frame 0, and the result still renders,
so nothing fails loudly.

Three places had to agree before that value survived a render, and none
of them did:

1. **The table** had only `cut_a`/`cut_b`. Durations cannot express an
   in-point. Added `in_a`/`in_b`.
2. **The Director** (`ILloovicJh9HTH5v`) selected an explicit column list
   that omitted them, and `resolveHook` did not copy them onto the EDL.
   Both fixed; the single-shot fallback carries `0`/`0`.
3. **The renderer** ran `ffmpeg -t <secs> -i <src>` with no `-ss`, so
   every leg began at frame 0 regardless. Fixed in `_leg()`.

If a fourth consumer is ever added, it has to carry them too.

## Why -ss goes before -i

As an input option, `-ss` seeks the source before decoding. After `-i`
it trims the *filtered result* instead, which throws away the seek and
shortens the clip. The same trap applies to `-t`. Both stay in front of
`-i`.

In-points are scaled by 1.1 alongside durations, because `build_episode`
speeds every source by 1.1x downstream — an unscaled in-point would drift
against its own cut.

## Files

- `hook_configs.json` — the Hook Bench export, the source of truth for
  what the owner actually built (`inA`/`outA`/`inB`/`outB` as edited).
- `hook_rows.json` — the same seven translated to `cleora_hooks` rows,
  with the Gemini shot tags the Director reads to choose between them.
- `build_new_episode.py` — a copy of the live renderer, kept here because
  it lives outside this repo on an ephemeral container.

## Known, deliberate

- `hook04` and `hook05` are the same shot pair differing only by 0.1s on
  leg A. Both are the owner's; do not dedupe them.
- Four of the seven carry `hook_y = 300`, a fallback rather than a
  measured card position.
