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
