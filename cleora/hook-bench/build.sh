#!/bin/bash
# Assemble the publishable Hook Bench: bench.html + shots_data.js -> hook_bench.html
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/shots_data.js" ] || { echo "shots_data.js missing - run: python3 $HERE/build_data.py"; exit 1; }
python3 - "$HERE" <<'PY'
import sys, os
here = sys.argv[1]
h = open(os.path.join(here, 'bench.html')).read()
d = open(os.path.join(here, 'shots_data.js')).read()
h = h.replace('<script src="shots_data.js"></script>', '<script>\n' + d + '\n</script>')
out = os.path.join(here, 'hook_bench.html')
open(out, 'w').write(h)
print('built %s  (%.2f MB)' % (out, len(h) / 1048576))
PY
