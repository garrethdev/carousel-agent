"""Fetch the active clip library from Supabase and emit shots_data.js for the Hook Bench.

The bench embeds every clip as a base64 data: URI because an Artifact's CSP blocks media from
Supabase storage. That keeps the page self-contained and offline-capable, at the cost of size:
the previews are deliberately small (280x498, 18fps, crf 30, first 5s) so all ~89 clips land
around 8.6 MB, well under the 16 MB artifact ceiling.

Usage:  python3 build_data.py [workdir]      # default: ./_work
"""
import base64, json, os, subprocess, sys

SB   = 'https://qlcmgxgwpzmiebzxflai.supabase.co/rest/v1'
KEY  = os.environ.get('SUPABASE_KEY', 'sb_publishable_GvqmGplB6Kq6fhumy0F1WA_YWV1hVB9')
CA   = '/root/.ccr/ca-bundle.crt'
LAY  = '/home/user/calesthio/openmontage/projects/cleora-batch/opener_layout.json'
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '_work')

# preview encode: small enough that the whole library fits in one artifact
W, H, FPS, CRF, SECS = 280, 498, 18, 30, 5


def api(path):
    r = subprocess.run(['curl', '-s', '--cacert', CA, f'{SB}/{path}',
                        '-H', f'apikey: {KEY}', '-H', f'Authorization: Bearer {KEY}'],
                       capture_output=True, text=True)
    return json.loads(r.stdout)


def main():
    os.makedirs(WORK, exist_ok=True)
    rows = [c for c in api('cleora_clips?status=eq.active&select=shot_key,video_public_url,'
                           'category,framing,mood,action,tags,beat_role,duration_seconds,can_open'
                           '&order=shot_key.asc') if c.get('video_public_url')]
    layout = json.load(open(LAY)) if os.path.exists(LAY) else {}
    print(f'{len(rows)} active clips')

    out = []
    for i, c in enumerate(rows, 1):
        k = c['shot_key']
        src, web = f'{WORK}/src_{k}.mp4', f'{WORK}/w_{k}.mp4'
        if not os.path.exists(src) or os.path.getsize(src) < 10000:
            subprocess.run(['curl', '-sS', '--cacert', CA, '-o', src, c['video_public_url']],
                           check=True)
        if not os.path.exists(web) or os.path.getsize(web) < 5000:
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-t', str(SECS), '-i', src, '-an',
                            '-vf', f'fps={FPS},scale={W}:{H}:flags=lanczos',
                            '-c:v', 'libx264', '-crf', str(CRF), '-preset', 'slow',
                            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', web], check=True)
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                    '-of', 'default=nw=1:nk=1', web],
                                   capture_output=True, text=True).stdout.strip())
        tags = c.get('tags')
        if isinstance(tags, list):
            tags = ' '.join(str(t) for t in tags)
        blob = ' '.join(str(x or '') for x in (k.replace('_', ' '), c.get('category'),
                        c.get('framing'), c.get('mood'), c.get('action'), tags,
                        c.get('beat_role')))
        out.append({
            'key': k,
            'cat': c.get('category') or '',
            'framing': c.get('framing') or '',
            'mood': c.get('mood') or '',
            'act': (c.get('action') or '')[:190],
            'role': (c.get('beat_role') or '')[:70],
            'open': bool(c.get('can_open')),
            'dur': round(dur, 2),                                   # what the preview holds
            'srcDur': round(float(c.get('duration_seconds') or dur), 2),  # true clip length
            'band': (layout.get(k) or {}).get('card_band'),
            'q': blob.lower(),
            'src': 'data:video/mp4;base64,' + base64.b64encode(open(web, 'rb').read()).decode(),
        })
        if i % 20 == 0:
            print(f'  {i}/{len(rows)}')

    out.sort(key=lambda x: (not x['open'], x['key']))
    p = os.path.join(HERE, 'shots_data.js')
    open(p, 'w').write('const SHOTS = ' + json.dumps(out) + ';')
    print(f'wrote {p}  ({os.path.getsize(p)/1048576:.2f} MB, {len(out)} clips)')


if __name__ == '__main__':
    main()
