"""Sync saved Hook Bench edits into public.cleora_hooks, the catalogue the Director reads.

The bench saves each edit into its artifact database (collection "configs"). This script turns
those saves into rows the Director can reason about: it cuts each pair for real, has Gemini
describe what is on screen and what the cut communicates, and upserts the result.

The bench now enforces one hook per A->B pair, so a re-save of the same pairing replaces the
earlier one instead of creating a near-duplicate. This script keys on the same rule.

Usage:
  1. read the configs out of the artifact (Claude: Artifact action=read_db, collection=configs)
     into configs.json here
  2. python3 sync_hooks.py configs.json
"""
import json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, '_hooks')
SB   = 'https://qlcmgxgwpzmiebzxflai.supabase.co/rest/v1'
KEY  = os.environ.get('SUPABASE_KEY', 'sb_publishable_GvqmGplB6Kq6fhumy0F1WA_YWV1hVB9')
CA   = '/root/.ccr/ca-bundle.crt'
ZONE = {'top': 120, 'middle': 1050, 'lower-third': 1550}


def api(path):
    r = subprocess.run(['curl', '-s', '--cacert', CA, f'{SB}/{path}',
                        '-H', f'apikey: {KEY}', '-H', f'Authorization: Bearer {KEY}'],
                       capture_output=True, text=True)
    return json.loads(r.stdout)


def leg(src_path, out, ss, secs, mv):
    """Cut one leg of the pair at 1080x1920 with its zoom move baked in."""
    f = max(1, round(secs * 30) - 1)
    if mv and abs(float(mv.get('zt', 1)) - float(mv.get('zf', 1))) > 0.02:
        zf, zt = float(mv['zf']), float(mv['zt'])
        fx, fy = float(mv.get('fx', .5)), float(mv.get('fy', .6))
        d = zt - zf
        z = f"{zf:.3f}{'+' if d > 0 else '-'}{abs(d):.3f}*on/{f}"
        vf = (f"fps=30,scale=2160:3840,zoompan=z='{z}':x='{fx:.2f}*iw-iw/(2*zoom)':"
              f"y='{fy:.2f}*ih-ih/(2*zoom)':d=1:s=1080x1920:fps=30")
    else:
        vf = 'fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', str(ss), '-t', str(secs),
                    '-i', src_path, '-an', '-vf', vf, '-r', '30', '-c:v', 'libx264',
                    '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', out], check=True)


def main():
    cfgs = json.load(open(sys.argv[1]))
    clips = {c['shot_key']: c for c in api('cleora_clips?select=shot_key,video_public_url')}
    existing = {h['hook_key']: h for h in api('cleora_hooks?select=hook_key,shot_a,shot_b')}
    by_pair = {(h['shot_a'], h['shot_b']): k for k, h in existing.items()}
    os.makedirs(WORK, exist_ok=True)
    sys.path.insert(0, '/home/user/calesthio/openmontage/projects/cleora-ep01-rooftops')
    from gemini_direct import upload, ask

    prompt = open(os.path.join(HERE, 'tag_prompt.txt')).read()
    nxt = max([int(k[4:]) for k in existing] or [0])
    for c in cfgs:
        pair = (c['a'], c['b'])
        key = by_pair.get(pair)                       # same pair -> update that row
        if not key:
            nxt += 1
            key = f'hook{nxt:02d}'
        slug = os.path.join(WORK, key)
        for tag, shot, ss, secs, mv in (('A', c['a'], c.get('inA', 0), c['cutA'], c.get('moveA')),
                                        ('B', c['b'], c.get('inB', 0), c['cutB'], c.get('moveB'))):
            src = os.path.join(WORK, f"src_{shot}.mp4")
            if not os.path.exists(src):
                subprocess.run(['curl', '-sS', '--cacert', CA, '-o', src,
                                clips[shot]['video_public_url']], check=True)
            leg(src, f'{slug}_{tag}.mp4', ss, secs, mv)
        lst = f'{slug}.txt'
        open(lst, 'w').write(f"file '{key}_A.mp4'\nfile '{key}_B.mp4'\n")
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0',
                        '-i', lst, '-c', 'copy', f'{slug}.mp4'], check=True)
        t = json.loads(re.search(r'\{.*\}', ask(upload(f'{slug}.mp4', key), prompt), re.S).group(0))
        hy = c.get('hookY') if c.get('hookY') not in (None, 300) else ZONE.get(t['card_safe_zone'], 300)
        print(json.dumps({'hook_key': key, 'pair': pair, 'cut_reads_as': t['cut_reads_as'],
                          'hook_y': hy, 'tag': t}, indent=1))
        # emit the row; apply with your SQL tool of choice
        json.dump({'cfg': c, 'tag': t, 'hook_key': key, 'hook_y': hy},
                  open(f'{slug}.row.json', 'w'), indent=1)
    print(f'\nrows written to {WORK}/*.row.json')


if __name__ == '__main__':
    main()
