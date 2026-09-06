# Long list — scout output → owner cull board

Turns raw scout output into a board where the owner keeps N and cuts the rest.

```
scout_*.json  +  research_findings   →  merge.py   →  pool_raw.json
                                        dedup.py   →  pool_clean.json
                                     build_board.py →  longlist.html  → Artifact (db)
```

## Running it

```bash
python3 merge.py                 # every scout_*.json in the scratchpad + findings_workflow.json
python3 dedup.py                 # prints exactly what it cut and why
SHOW=50 TARGET=20 python3 build_board.py
```

## What dedup.py cuts, and what it deliberately does not

It only makes cuts that are matters of fact, never of taste — the owner does the
narrowing.

1. **Already on the slate.** A candidate whose subject matches an existing
   episode. These are listed in `ON_SLATE` and must be updated as the slate
   grows.
2. **The same event told twice.** Two scouts returning one story. Requires a
   subject match *and* a shared year — Kuro-o's 1997 Klotho mouse coming back
   from two sweeps is one story.

It does **not** collapse two candidates that share a subject but sit on
different anchors — Leeuwenhoek seeing crystals in 1678 and Madeo's 2009 wheat
germ paper are both spermidine, but they are different stories and picking
between them is the owner's call. Both survive, each flagged on the board with
the other's title.

Subject matching runs on the anchor text, not the title. Word overlap between
titles catches almost none of the real collisions.

## The board

`db` capability, collection `longlist`, one document per kept candidate:
`{id, title, territory, vote, at}`. Cutting a candidate deletes its document,
so the collection is exactly the keep set. Read it back with `read_db`.

Degrades to a working read-only list when `db` is unavailable, and says so
rather than silently dropping choices.
