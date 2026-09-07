"""Lay a sound effect onto a fully rendered episode, on a real timeline.

The SFX is a track in the episode's edit_decisions.json (OpenMontage's timeline document) - not a
one-off ffmpeg command - so the placement is recorded, reviewable and re-runnable. Mixing goes through
OpenMontage's AudioMixer, the same tool that laid down her voice and the music bed.

  --source   the effect file (video or audio; the audio stream is what is used)
  --keep     fraction of the source to KEEP from the start (0.2 = chop the last 80%)
  --at       timeline seconds to fire it, repeatable
  --gain     dB relative to the episode mix (negative = under the voice)

Usage:
  python3 slate/sfx.py --ep ep503 --source /path/Ringtone.mp4 --keep 0.2 --at 0.0 --gain -8
"""
import argparse,glob,json,os,subprocess,sys
B='/home/user/calesthio/openmontage/projects/cleora-batch'
sys.path.insert(0,'/home/user/calesthio/openmontage')

def probe(p, stream='a'):
    r=subprocess.run(['ffprobe','-v','error','-select_streams',stream,'-show_entries',
                      'format=duration','-of','csv=p=0',p],capture_output=True,text=True,check=True)
    return float(r.stdout.strip())

def main():
    a=argparse.ArgumentParser()
    a.add_argument('--ep',required=True); a.add_argument('--source',required=True)
    a.add_argument('--keep',type=float,default=0.2); a.add_argument('--gain',type=float,default=-8.0)
    a.add_argument('--at',type=float,action='append',default=[])
    a.add_argument('--name',default=None)
    o=a.parse_args()
    if not os.path.exists(o.source): sys.exit(f'source not found: {o.source}')
    proj=glob.glob(f'/home/user/calesthio/openmontage/projects/cleora-{o.ep}-*')
    if not proj: sys.exit(f'no rendered project for {o.ep}')
    proj=proj[0]
    vid=sorted(glob.glob(f'{proj}/renders/{o.ep}_*.mp4'))
    vid=[v for v in vid if 'sfx' not in os.path.basename(v)]
    if not vid: sys.exit(f'no rendered video in {proj}/renders')
    vid=vid[0]
    name=o.name or os.path.splitext(os.path.basename(o.source))[0].lower()
    at=o.at or [0.0]

    # 1. TRIM. Keep the first `keep` of the source and drop the rest - the ask was "chop off the last 80%".
    full=probe(o.source); cut=round(full*o.keep,3)
    os.makedirs(f'{B}/sfx',exist_ok=True)
    stub=f'{B}/sfx/{name}_{int(o.keep*100)}pct.wav'
    subprocess.run(['ffmpeg','-y','-loglevel','error','-t',str(cut),'-i',o.source,'-vn',
                    '-ac','2','-ar','48000','-af','afade=t=out:st=%.3f:d=0.08'%max(0,cut-0.08),
                    stub],check=True)
    print(f'{name}: source {full:.2f}s -> kept {cut:.2f}s (first {int(o.keep*100)}%) -> {stub}')

    # 2. TIMELINE. Episode mix as track 0, one SFX track per placement, delayed to its timeline second.
    base=f'{B}/sfx/{o.ep}_base.wav'
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',vid,'-vn','-ac','2','-ar','48000',base],check=True)
    vol=10**(o.gain/20.0)
    tracks=[{'path':base,'role':'speech','volume':1.0}]
    for t in at: tracks.append({'path':stub,'role':'sfx','volume':round(vol,4),'start_seconds':t})
    mixed=f'{B}/sfx/{o.ep}_mix.wav'
    from tools.audio.audio_mixer import AudioMixer
    res=AudioMixer().execute({'operation':'mix','tracks':tracks,'normalize':True,
                              'loudnorm_target':-14,'output_path':mixed})
    assert res.success, f'AudioMixer mix failed: {res.error}'

    # 3. REMUX onto the untouched picture.
    out=f'{proj}/renders/{o.ep}_sfx.mp4'
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',vid,'-i',mixed,'-map','0:v:0','-map','1:a:0',
                    '-c:v','copy','-c:a','aac','-b:a','192k','-shortest',out],check=True)

    # 4. RECORD it on the timeline document so the placement is not lost in a shell command.
    ed=f'{proj}/artifacts/edit_decisions.json'
    if os.path.exists(ed):
        d=json.load(open(ed))
        d.setdefault('audio_tracks',[])
        d['audio_tracks']=[x for x in d['audio_tracks'] if x.get('id')!=f'sfx_{name}']
        d['audio_tracks'].append({'id':f'sfx_{name}','role':'sfx','source':stub,
            'source_original':os.path.abspath(o.source),'source_kept_fraction':o.keep,
            'clip_seconds':cut,'gain_db':o.gain,
            'hits':[{'start_seconds':round(t,3),'end_seconds':round(t+cut,3)} for t in at]})
        json.dump(d,open(ed,'w'),indent=1)
        print(f'timeline: wrote sfx_{name} into {ed}')
    print(f'{o.ep}: {len(at)} hit(s) at {at} @ {o.gain} dB -> {out}')

if __name__=='__main__': main()
