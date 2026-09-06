# Taste signal — owner votes → research scout

The chain, end to end:

```
Story Cull artifact          →  cleora_story_votes  →  cleora_taste_signal
(db capability, story_votes)    (table, content_id PK)  (view + title + opening line)
                                                                  |
                                                                  v
                                             [Cleora] Story Research → Findings Queue
                                             node: Fetch Taste Signal (HTTP, anon key)
                                                                  |
                                                                  v
                                                node: Build Research Brief
                                        appends MAKE IT / NEVER MAKE IT lists
```

Board: https://claude.ai/code/artifact/ab0d50c2-2d30-403c-b4ff-672f32dd81df
Workflow: `GrTdGsVVKMHjQvQ0`

## Schema

`public.cleora_story_votes`

| column   | type     | notes                        |
|----------|----------|------------------------------|
| content_id | text PK | e.g. `CLE-B4-0031`          |
| vote     | smallint | `1` = make it, `-1` = never  |
| voted_at | timestamptz |                           |
| source   | text     | `story_cull` for board votes |

`public.cleora_taste_signal` joins that to `cleora_content` for `title`,
`opening_line` and `first_body_line`. Only voted stories appear — the
unvoted majority is deliberately absent.

## What the brief contains

`Build Research Brief` assembles the scout prompt in this order. Only the
last block is data-driven; everything above it is static text in the node.

1. **Who Cleora is** and who the audience is.
2. **The two tests** — Interesting, Anti-aging. These are the only gates.
3. **Nothing else disqualifies** — no filtering on evidence strength, cost,
   or whether the viewer can act on it.
4. **Preferred flavour** — Eastern mysticism and traditional wellness. A
   tiebreak, not a gate.
5. **Where to hunt** — three territories swept every run, with an explicit
   note that they are places to look rather than extra tests:
   - Incredible healing — bodies that repaired themselves when they should
     not have; recoveries the doctors could not explain.
   - Peptides as secret knowledge — peptides told as withheld or buried
     wisdom, not as a supplement review.
   - Mitochondrial healing — what drains the cell's power supply, what
     restores it, and the specific cases where restoring it turned someone
     around.
6. **Not your job** — fact-checking and de-duplication happen downstream.
7. **Owner taste** — the vote block described below.
8. **Output contract** — the JSON shape `Parse + Gate + Build Rows` expects.

Adding a territory means editing the `WHERE TO HUNT` block. Keep new ones
phrased as territories; a territory that reads like a rule quietly becomes
a third gate and starts cutting good stories.

## Re-syncing after a voting session

The board keeps votes in its own artifact db. To pull a fresh batch in,
read the `story_votes` collection off the artifact and upsert:

```sql
insert into public.cleora_story_votes (content_id, vote, source)
values ('CLE-B4-0031', 1, 'story_cull')
on conflict (content_id) do update
  set vote = excluded.vote, voted_at = now();
```

Then `python3 export_votes.py` for a local `votes.json` / `votes.csv`.

## How the scout uses it

`Build Research Brief` appends the votes to the prompt as **worked
examples, not rules** — the two tests (Interesting, Anti-aging) are still
the only gates. The block ends with a note that an absent vote means no
strong feeling rather than approval, so the model does not read the
unvoted slate as endorsed.

It degrades safely: if the view is empty or the fetch fails, the `try`
around `$("Fetch Taste Signal")` yields zero votes and the brief is
byte-identical to the pre-taste version.

## Verifying the wiring without spending

`test_workflow` on `GrTdGsVVKMHjQvQ0` pins every HTTP node, so pin real
rows onto `Fetch Taste Signal` and a stub onto `Hunt + Verify` — the Code
nodes still run for real, nothing is spent on the Anthropic call and
nothing is written to `research_findings`. Check `taste_examples` in the
`Build Research Brief` output; it is the vote count that reached the brief.
