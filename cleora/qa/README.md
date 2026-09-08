# The QA gate

`qa.py` checks an episode against the Director's rules (`cleora/rules/DIRECTOR_RULES.md`), widens the
sample when one fails, and halts the batch when too many do. Every finding cites the rule id it broke,
so a report names the rule rather than describing a symptom.

```
python3 qa.py --batch slate/rows.json     # sample one, escalate on failure, halt if the rate is high
python3 qa.py --all                       # check every scripted episode, no sampling
python3 qa.py --ep CLE-B1-0001            # one episode, verbose
python3 qa.py --clear-halt                # lift a halt after fixing the cause
```

## How the sampling works

Pull **one** episode from the batch and check it. Pass → the batch is presumed good and rendering
proceeds; that is the point of sampling rather than checking forty. Fail → widen by `--widen` (4 by
default) and compute the failure rate over everything checked. At or above `--threshold` (30%), write
`HALT`.

`drive.py` reads that file before starting each render and stops the batch, letting anything already
running finish. So a batch that is casting badly produces one or two videos, not forty.

## What it checks

Deterministic, read straight off the EDL:

| rule | check |
|---|---|
| R1 | the hook beat opens on a `can_open` clip |
| R3 | the closer is `the_peptide_vial` |
| R4 | body beats are `vo_safe` and never a `cleora_*` clip |
| R5a | one cut per beat — the count matches the script |
| R7 | no clip in two back-to-back beats |
| R9 | consecutive beats change setting (warning — R5 outranks it) |
| R10 | every body beat holds between 1.5s and 6.0s at 2.7 words/sec |
| R12 | music is one of the owner's three beds |
| H1/H5 | the opener exists and its cut points are sane |
| OSH | the on-screen card: written, one style device, at most one emoji, at the end, not decorative |

`R10`'s ceiling is scoped to **body** beats. The hook runs on the owner's built pair and the closer
rests on the vial through the whole payoff — long by design, so both are warnings.

## What it does NOT check

**R5, the literal match** — whether the clip on screen shows what she is saying — is judgement, not
arithmetic. It needs a model reading the line against the clip's `action`, or a vision pass on the
render. That is the next layer; the deterministic gate above runs first and is free.

## First run, 2026-09-08

Run over the 20 slate episodes that had been re-split and re-cast. Sampled one, it failed, widened by
four, all five failed — **100%, halted at a 30% threshold**.

Every blocking finding across all 20 was the same rule: **R10, 29 body beats holding longer than 6s.**
Nothing else in the deterministic set fired — no adjacent repeats, no Cleora on a body beat, no wrong
closer, no missing card, no bad music, no cut/beat mismatch.

So the re-split did not finish the job. It splits at sentence boundaries, then clause boundaries, and
each side must keep at least 5 words. The beats that survive it are the **evidence sentences**:

> In a two-month French multicentre trial of 94 people with chronic venous insufficiency it eased leg
> heaviness and ankle swelling and improved vein tone versus placebo.   *(27 words, 10.0s)*

One sentence, no internal punctuation, nothing to split on. Of the 29:

- **8** would split cleanly on a conjunction (`and`, `than`, `versus`, `while`) with both halves ≥6 words
- **21** are one unbreakable clause and need the line rewritten shorter

Three ways forward, and the third is the only one that fixes it at the source:

1. Widen the splitter to break on conjunctions — rescues 8, needs a Director re-cast, no re-voicing.
2. Accept 7–13s holds on those beats for this batch only.
3. Have the Writing Agent rewrite the 21 evidence beats short. This changes words, so those episodes
   need re-voicing (~0.6 credits per read) and a re-cast. **Writer v6 already caps body beats at 12
   words, so episodes written from now on will not have this problem** — this is cleanup of a batch
   written under the old rules.

Also fixed while investigating: the writer's cleanup replaced em-dashes with a comma and **no space**
(`users,an association`), which both reads badly and defeated the clause splitter. 29 beats across 19
episodes repaired.
