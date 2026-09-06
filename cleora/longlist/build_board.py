#!/usr/bin/env python3
"""pool_clean.json -> longlist.html, the owner's cull board."""
import json, os, sys, html

HERE = os.path.dirname(os.path.abspath(__file__))
src  = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'pool_clean.json')
out  = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'longlist.html')
TARGET = int(os.environ.get('TARGET', '20'))
SHOW   = int(os.environ.get('SHOW', '50'))

rows = json.load(open(src))
rows = rows[:SHOW]

TERRITORY = {
 'healing':  'Incredible healing',
 'peptides': 'Peptides as secret knowledge',
 'mito':     'Mitochondrial healing',
 'weight':   'Weight loss',
 'eastern':  'Eastern longevity',
 'buried':   'Buried & suppressed',
 'workflow': 'Research workflow',
}

def clean(c, k, n=None):
    v = str(c.get(k) or '').strip()
    if n and len(v) > n:
        v = v[:n].rsplit(' ', 1)[0] + '…'
    return v

data = [{
    'id':      c['id'],
    'title':   clean(c, 'title'),
    'anchor':  clean(c, 'weird_anchor', 420),
    'felt':    clean(c, 'felt_symptom', 150),
    'mech':    clean(c, 'mechanism', 300),
    'card':    clean(c, 'on_screen_card', 90),
    'terr':    c.get('territory', ''),
    'terrName': TERRITORY.get(c.get('territory', ''), c.get('territory', '')),
    'si':      int(c.get('score_interesting') or 0),
    'sa':      int(c.get('score_aging') or 0),
    'shares':  clean(c, 'shares_subject_with'),
    'srcs':    [s.get('url', '') for s in (c.get('sources') or []) if isinstance(s, dict)][:3],
} for c in rows]

terrs = []
for c in data:
    if c['terr'] not in [t[0] for t in terrs]:
        terrs.append((c['terr'], c['terrName']))

TPL = open(os.path.join(HERE, 'board.tpl.html')).read()
page = TPL.replace('/*__DATA__*/', json.dumps(data))
page = page.replace('/*__TARGET__*/20', str(TARGET))
page = page.replace('<!--__TERRS__-->', ''.join(
    f'<button class="chip" data-terr="{html.escape(t)}">{html.escape(n)}</button>' for t, n in terrs))
page = page.replace('<!--__COUNT__-->', str(len(data)))
open(out, 'w').write(page)
print(f"{out}  ({len(data)} candidates, target {TARGET})")
