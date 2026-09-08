#!/usr/bin/env python3
"""63+ raw candidates -> deduped, collision-flagged pool ready for the board."""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
pool = json.load(open(os.path.join(HERE, 'pool_raw.json')))

# Subject keys: candidates sharing a key are the SAME STORY from different scouts.
# Built by reading the anchors, not the titles - word overlap misses all of these.
SUBJECT = [
 ('metformin',      r'metformin|galega|french lilac|goat.s rue|guanidine'),
 ('naked_mole_rat', r'naked mole.?rat'),
 ('deer_antler',    r'antler'),
 ('klotho',         r'klotho'),
 ('gtummo',         r'g.?tum.?mo|tummo|dried the sheets|dried wet sheets'),
 ('spermidine',     r'spermidine|polyamine'),
 ('brown_fat',      r'brown fat|brown adipose'),
 ('rapamycin',      r'rapamycin|easter island|sehgal|mtor'),
 ('nad',            r'\bnad\+|nicotinamide riboside|brenner'),
 ('ghk',            r'ghk|copper peptide|pickart'),
 ('parabiosis',     r'parabios|sewn into one|joined at the hip'),
 ('waglerin',       r'waglerin|syn.?ake|temple viper'),
 ('autophagy_fast', r'ohsumi|autophagy.*(yeast|nobel)|bigu|grain.avoiding'),
 ('birds_nest',     r"bird.s nest|swiftlet|cixi"),
 ('bpc157',         r'bpc.?157|body protection compound'),
 ('dnp',            r'\bdnp\b|dinitrophenol|munitions girls'),
 ('astragalus',     r'astragalus|cycloastragenol|ta-?65|\bgeron\b'),
 ('deprenyl',       r'deprenyl|selegiline|knoll'),
 ('c60',            r'\bc60\b|buckyball|fullerene'),
 ('calorie_restr',  r'calorie restriction|mccay|walford|biosphere'),
 ('leptin',         r'leptin|coleman'),
 ('gila',           r'gila monster|exenatide|john eng'),
 ('berberine',      r'berberine|coptis|golden thread'),
 ('mitchell_chemi', r'chemiosmotic|peter mitchell'),
 ('gerovital',      r'gerovital|aslan|procaine'),
 ('brown_sequard',  r'brown.?s.?quard|testicle extract'),
 ('five_rites',     r'five tibetan rites'),
 ('metchnikoff',    r'metchnikoff|autointoxication'),
 ('foxo4',          r'foxo4'),
 ('mots_c',         r'mots.?c'),
 ('humanin',        r'humanin'),
 ('khavinson',      r'khavinson|thymalin|epitalon|epithalon'),
 ('royal_jelly',    r'royalactin|royal jelly'),
 ('oxytocin',       r'oxytocin'),
 ('jellyfish',      r'turritopsis|immortal jellyfish'),
 ('bowhead',        r'bowhead|harpoon'),
 ('planarian',      r'planarian|flatworm|hunt morgan'),
 ('mrl_mouse',      r'\bmrl\b|heber.?katz|ear punch|mouse ears'),
 ('carter',         r'jimmy carter|pembrolizumab'),
 ('levi_montalcini',r'levi.?montalcini|nerve growth factor'),
 ('hyperbaric',     r'hyperbaric|efrati'),
 ('sauna',          r'sauna|laukkanen|kuopio'),
 ('cryo',           r'cryotherapy|yamaguchi|oita'),
 ('hara_hachi',     r'hara hachi|kaibara ekken'),
 ('puerh',          r'pu.?erh|tea horse road'),
 ('ephedra',        r'ephedra|ma huang|bechler'),
 ('banting',        r'banting|undertaker'),
 ('sims_prison',    r'\bsims\b|vermont prison|prisoners paid'),
 ('spalding_c14',   r'carbon.?14|spalding|bomb.*fat cell'),
]

# Already made - collides with one of the existing 108 episodes.
ON_SLATE = {
 'metformin':  'The Weed in the Ditch',
 'waglerin':   'The Temple Viper That Relaxes The Face',
 'ghk':        'The Copper He Found In Young Blood  (one of your approved 30)',
}

def _anchor_key(c):
    a = re.sub(r'[^a-z0-9 ]', ' ', str(c.get('weird_anchor', '')).lower())
    names = re.findall(r'\b(1[6-9]\d\d|20[0-2]\d)\b', a)
    words = [w for w in a.split() if len(w) > 4]
    return set(names)

def blob(c):
    return ' '.join(str(c.get(k, '')) for k in
                    ('title', 'weird_anchor', 'mechanism', 'on_screen_card')).lower()

def subject_of(c):
    b = blob(c)
    for key, pat in SUBJECT:
        if re.search(pat, b):
            return key
    return None

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:60]

def score(c):
    try:    return int(c.get('score_interesting', 0)) + int(c.get('score_aging', 0))
    except Exception: return 0

for c in pool:
    c['subject'] = subject_of(c)
    c['id']      = slug(c['title'])
    c['total']   = score(c)

# 1. drop anything already on the slate
onslate = [c for c in pool if c['subject'] in ON_SLATE]
pool    = [c for c in pool if c['subject'] not in ON_SLATE]

# 2. collapse internal duplicates - keep the highest-scoring telling of each subject
best, dupes = {}, []
keep = []
for c in sorted(pool, key=lambda x: -x['total']):
    s = c['subject']
    if s and s in best:
        prev = best[s]
        ya, yb = _anchor_key(c), _anchor_key(prev)
        # Same subject AND the same year = literally the same event, told twice.
        # Same subject, different years = two different moments in one story's
        # history (Leeuwenhoek 1678 vs Madeo 2009 on spermidine) - both stand.
        same_anchor = bool(ya & yb) or (not ya and not yb)
        if same_anchor:
            c['duplicate_of'] = prev['title']; dupes.append(c); continue
        # same subject, different anchor: KEEP BOTH, flag the pairing so the
        # owner can decide. Not our call to pick which telling survives.
        c['shares_subject_with'] = prev['title']
        prev.setdefault('shares_subject_with', c['title'])
    if s: best[s] = c
    keep.append(c)

keep.sort(key=lambda c: (-c['total'], c['territory'], c['title']))
json.dump(keep, open(os.path.join(HERE, 'pool_clean.json'), 'w'), indent=1)

print(f"raw {len(pool)+len(onslate)}  ->  clean {len(keep)}")
print(f"\ncut: already on the slate ({len(onslate)})")
for c in onslate:
    print(f"  - {c['title']}\n      = {ON_SLATE[c['subject']]}")
print(f"\ncut: same story from two scouts ({len(dupes)})")
for c in dupes:
    print(f"  - {c['title']}\n      = {c['duplicate_of']}")
from collections import Counter
print("\nby territory:", dict(Counter(c['territory'] for c in keep)))
