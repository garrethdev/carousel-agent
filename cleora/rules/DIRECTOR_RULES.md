# The Director's rules

The rules that decide which clip lands on which beat live in **three** places. They are listed here
in full because they have historically disagreed with each other, and because the QA agent
(`cleora/rules/QA.md`) checks rendered episodes against *this* file, not against anyone's memory.

Owner's standing correction (2026-09-07):

> "You can use the same shot twice in a video, but it can't be back to back."

That is now rule R7. The old rule it replaced — *"Do not reuse a clip more than once in the episode"* —
was stated in the prompt AND enforced in the guard, and is **removed from both**.

---

## Layer 1 — the Director's system prompt

n8n `[Cleora] Director` (`ILloovicJh9HTH5v`), node **Assign Clips** — Claude Sonnet 4.6, temp 0.4,
max 1500 tokens. The model sees the script beats, the shot library and the hook catalogue; it never
sees video, only the written descriptions.

### Hook opener (chosen first)

| id | rule |
|----|------|
| H1 | Pick the `hook_key` whose `fits_stories_about` genuinely matches what this episode is about. |
| H2 | If any phrase in that hook's `avoid_for_stories_about` describes this episode, do not pick it. |
| H3 | `owner_note`, when present, outranks the model's judgement. |
| H4 | Do not stretch. A hook promising a sick patient must not open a story with no illness in it. |
| H5 | If nothing fits, answer `"hook_key":"none"` — that is a correct answer, not a failure. |
| H6 | Give a one-sentence `hook_reason`. |

### Per-beat clips

| id | rule |
|----|------|
| R1 | **Hook beat** must use a clip with `can_open=true`. Never the vial, never b-roll. |
| R2 | Other **talk** beats (verdict) use any `talk_capable=true` clip. |
| R3 | **Closer beat** maps to `the_peptide_vial`. |
| R4 | **Body beats** use only `vo_safe=true`, and never a `cleora_*` clip — cutting back to her mid-story reads as a loop. Allowed only if no other vo_safe clip depicts the line. |
| R5 | **Match by meaning.** Pick the clip whose action/beat_role best depicts what the line literally says. This outranks every preference below. |
| R6 | **Gender casting.** A line about a woman gets female or neutral, never male; about a specific man, male or neutral; objects/wards/crowds are neutral. |
| **R7** | **Never the same clip in two back-to-back beats.** Consecutive beats must differ. |
| **R8** | **Reuse is allowed.** A clip may appear more than once in an episode, and reuse is *correct* when that clip is the best depiction of the line. Only adjacency (R7) is banned. Prefer an unused clip on a tie — never downgrade to a worse match to avoid a repeat. |
| R9 | **Adjacent variety.** Consecutive beats must change setting or subject. Never back-to-back: two ward shots, two book/ledger shots, two coin shots, two basin shots, two portrait shots. |
| R10 | **Pacing.** Every shot holds at least 1.5s, never looped, one clip per beat, never a sub-second flash. |
| R11 | **Beat-role guide.** substance → `the_offering`/`the_price_tag`; villain → `the_suits`/`the_money_man`; buried → `the_buried_records`/`the_taking`; recovery → `the_healing`; proof → `ultrasound_dissolve`; discovery → `under_the_floor`. |
| R12 | **Music.** One bed for the whole episode, chosen by dominant mood from the three the owner supplied. |

## Layer 2 — the code guard (runs after the model, silently rewrites it)

Node **Build EDL + No-Repeat Guard**.

| id | rule |
|----|------|
| G1 | A clip outside the correct pool, or with no URL, is replaced by a pool clip that isn't the previous one. |
| G2 | A clip equal to the previous beat's clip is swapped (enforces R7). |
| G3 | On body beats, a `cleora_*` clip or a same-`FAMILY` collision is swapped, preferring the same beat_role and matching gender (enforces R4 and R9). Families: `ward, bedside, book, money, basin, portrait, suits, cleora`. |
| G4 | Preference, not veto: an already-used clip is only avoided when an equally valid unused one exists (enforces R8). |
| G5 | An unresolved missing clip, or an adjacent repeat that survived, sets `script_status='failed'` and blocks the episode. |
| G6 | A hook is rejected if one of its avoid-phrases appears in the episode **title**; falls back to the single shot `cleora_orb_open_dramatic`. |
| G7 | Invalid music falls back to a hash of the content_id. |

## Layer 3 — the renderer (overrules both)

`openmontage/projects/cleora-batch/build_episode.py`. These were never written down before.

| id | rule |
|----|------|
| V1 | Hard assert `shots[i] != shots[i-1]` — the render crashes on a back-to-back repeat. |
| V2 | `MINSLOT = 1.5s` per shot. |
| V3 | If the body span cannot hold every clip at ≥1.5s, the renderer **drops middle clips** (always keeping the last). The Director's casting is discarded with no record. |
| V4 | A source shorter than its slot is **slowed**, never looped. |
| V5 | The opener runs at the owner's hook-pair length (`cut_a + cut_b`), not the length of the spoken hook. |

## Known gaps

1. **No maximum shot length.** R10 sets a floor of 1.5s and nothing sets a ceiling. Because the
   Director casts one clip per beat and the renderer holds each clip for as long as its beat is
   spoken, a long beat becomes a long shot: measured worst case 14.1s on a single frame, with 110
   body beats across the slate running over 6s.
2. **V3 is invisible.** Dropped clips are not recorded anywhere.
3. **Hook clustering.** `hook03`'s `fits_stories_about` ("shocking historical discoveries",
   "uncovering hidden truths") describes essentially every story on this channel, so it was picked
   for 15 of 40 episodes. H1 has no diversity pressure across a batch.
