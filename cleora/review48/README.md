# The 48 — full script, voice hook, on-screen hook

Thirty stories the owner approved on the Story Cull board, plus the
eighteen he kept on the long list. Every one now carries all three
layers.

## Two hooks, two jobs

| field | what it is |
|---|---|
| `hook_text` | the line Cleora **speaks** over the opening shot |
| `script.on_screen_hook` | the headline **burned on screen** while she speaks it |

They are deliberately different. The spoken hook opens on the viewer's
own body or an image; the on-screen hook names the subject plainly enough
that a stranger scrolling past knows what the video is about, while
leaving the payoff unresolved. Written to the Writing Agent's own
published spec, including its worked pair:

> spoken: "Some of your skin cells stopped working years ago and will not die, darling."
> on screen: THE SKIN CELLS THAT WILL NOT DIE

## Why this was not done by the Writing Agent

The agent regenerates an entire script from a brief. Pointing it at the
thirty approved stories would have discarded scripts the owner had
already signed off. This job adds one field and touches nothing else, so
it was applied directly with `jsonb_set` on `script.on_screen_hook`.

The five oldest rows (CLE-B1-0001..0005) also had no `hook_text` at all.
Filled from their own `beats[0].vo`, which is the convention the agent
uses.

## Board

`db` capability, collection `hookreview`, one document per marked story:
`{id, title, osh, vote, note, at}`. A note field per row captures a
rewrite or the reason it misses, so feedback comes back specific rather
than as a list of ids.
