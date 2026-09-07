# Sound effects on the episode timeline

`sfx.py` lays an effect onto a **fully rendered** episode and records the placement as a track in that
episode's `artifacts/edit_decisions.json` — OpenMontage's timeline document, the same file that already
carries the picture cuts and the hook-card overlay. The placement is data, not a shell command that
vanishes, so it can be reviewed, diffed and re-run.

```
python3 sfx.py --ep ep503 --source /path/to/Ringtone.mp4 --keep 0.2 --at 0.0 --gain -8
```

| flag | meaning |
|------|---------|
| `--ep` | rendered episode to lay the effect onto |
| `--source` | the effect file; video or audio, only the audio stream is used |
| `--keep` | fraction kept **from the start** — `0.2` chops off the last 80% |
| `--at` | timeline second to fire it, repeatable for multiple hits |
| `--gain` | dB relative to the episode mix; negative sits it under her voice |

## What it does

1. **Trim** — keeps the first `keep` of the source, with an 80 ms fade-out so the chop is not a click.
2. **Timeline** — the episode mix becomes track 0; each `--at` becomes an SFX track delayed to that
   second. Mixing runs through OpenMontage's `AudioMixer` (`operation: mix`), the same tool that laid
   down her voice and the music bed, then re-normalises to −14 LUFS for TikTok.
3. **Remux** — new audio onto the untouched picture, written as `<ep>_sfx.mp4` alongside the original.
   The original render is never overwritten.
4. **Record** — an `audio_tracks` entry naming the original source, the fraction kept, the clip length,
   the gain, and every hit's start/end second.

## Verified

Tested end to end against a synthetic 1200 Hz stand-in on ep503 with hits at 0s and 30s. Band-limited
measurement of the finished file against the pre-mix audio: **+14.5 dB at 0s**, **+25.7 dB at 30s**, and
+3.2 dB at 45s where no hit was placed (that residual is the loudness re-normalisation, not the effect).
Test artifacts were removed afterwards; ep503's timeline is back to its rendered state.

## Note

`Ringtone.mp4` is not on this machine — this render container only has what was cloned or generated
here, and it is not in the owner's Drive either. Get the file onto the box and the command above is the
whole job.
