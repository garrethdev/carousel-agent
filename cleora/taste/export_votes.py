#!/usr/bin/env python3
"""Export the owner's story votes from Supabase.

The Story Cull board (an artifact) writes one doc per vote into its own
`story_votes` collection. Those are mirrored into `public.cleora_story_votes`,
and `public.cleora_taste_signal` joins them to the story's title and opening
line. That view is what the research scout reads.

Usage:
    python3 export_votes.py            # write votes.json + votes.csv here
    python3 export_votes.py --print    # summarise to stdout instead
"""
import csv, json, os, sys, urllib.request

BASE = "https://qlcmgxgwpzmiebzxflai.supabase.co/rest/v1"
KEY = os.environ.get("SUPABASE_ANON_KEY", "sb_publishable_GvqmGplB6Kq6fhumy0F1WA_YWV1hVB9")
VIEW = "cleora_taste_signal?select=vote,content_id,title,opening_line,first_body_line"
HERE = os.path.dirname(os.path.abspath(__file__))


def fetch():
    req = urllib.request.Request(
        f"{BASE}/{VIEW}",
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    rows = fetch()
    rows.sort(key=lambda r: (-r["vote"], r["content_id"]))
    up = [r for r in rows if r["vote"] == 1]
    down = [r for r in rows if r["vote"] == -1]

    if "--print" in sys.argv:
        print(f"{len(up)} up / {len(down)} down")
        for r in down:
            print(f"  DOWN {r['content_id']}  {r['title']}")
        return

    with open(os.path.join(HERE, "votes.json"), "w") as f:
        json.dump(rows, f, indent=2)
    with open(os.path.join(HERE, "votes.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["vote", "content_id", "title",
                                          "opening_line", "first_body_line"])
        w.writeheader()
        w.writerows(rows)
    print(f"wrote votes.json + votes.csv - {len(up)} up, {len(down)} down")


if __name__ == "__main__":
    main()
