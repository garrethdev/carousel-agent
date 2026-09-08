#!/usr/bin/env python3
"""Merge every scout_*.json plus the workflow's research_findings into one pool."""
import json, os, glob, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCR  = os.path.dirname(HERE)

def norm(s):
    return re.sub(r'[^a-z0-9]+', ' ', (s or '').lower()).strip()

pool = []
for f in sorted(glob.glob(os.path.join(SCR, 'scout_*.json'))):
    src = os.path.basename(f).replace('scout_', '').replace('.json', '')
    try:
        rows = json.load(open(f))
    except Exception as e:
        print(f"  !! {src}: {e}", file=sys.stderr); continue
    if isinstance(rows, dict):
        rows = rows.get('candidates') or []
    for c in rows:
        if not isinstance(c, dict) or not c.get('title'):
            continue
        c['territory'] = src
        pool.append(c)
    print(f"  {src:10} {len(rows):3}")

# workflow findings, if the caller dropped them in
wf = os.path.join(SCR, 'findings_workflow.json')
if os.path.exists(wf):
    for c in json.load(open(wf)):
        c['territory'] = 'workflow'
        pool.append(c)
    print(f"  {'workflow':10} {len(json.load(open(wf))):3}")

print(f"\nraw pool: {len(pool)}")
json.dump(pool, open(os.path.join(HERE, 'pool_raw.json'), 'w'), indent=1)
