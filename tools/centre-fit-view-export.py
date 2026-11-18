# STEP 21.7-7: copy the FITTED + junction-fixed centrelines (docs/fit_chain/centre_fixed.json, made by scripts/centre-fit-export.ts from docs/centre_fit_<cls>.json) into
# src/roads/debug/RoadCentreData.ts and HousingStreetData.ts, so the key-3 layer of the game shows the new design lines. Keeps ids, classes, order and the other columns; only pts change
# (whole metres, Douglas-Peucker 1 m). Built / 8-lane / dropped lines are NOT touched. Old files: docs/centre_before_21_7_view/. Run centre-fit-export.ts first.
import json, math, os, re, shutil
J = json.load(open('docs/fit_chain/centre_fixed.json'))
FIX = {l['id']: l['pts'] for l in J['lines'] if not l['built'] and not l.get('dropped')}
def dp(p, tol):
    if len(p) < 3: return p
    ax, az = p[0]; bx, bz = p[-1]; L = math.hypot(bx - ax, bz - az) or 1e-9
    dmax, k = -1, 0
    for i in range(1, len(p) - 1):
        d = abs((bx - ax) * (az - p[i][1]) - (ax - p[i][0]) * (bz - az)) / L
        if d > dmax: dmax, k = d, i
    if dmax <= tol: return [p[0], p[-1]]
    return dp(p[:k + 1], tol)[:-1] + dp(p[k:], tol)
n = 0; seen = set()
for path in ('src/roads/debug/RoadCentreData.ts', 'src/roads/debug/HousingStreetData.ts'):
    txt = open(path, newline='').read(); nl = '\r\n' if '\r\n' in txt else '\n'; out = []
    for line in txt.split(nl):
        m = re.match(r"^  \{ id: '([^']+)'", line)
        if m and m.group(1) in FIX:
            pts = dp([[int(round(x)), int(round(z))] for x, z in FIX[m.group(1)]], 1.0)
            arr = '[' + ','.join('[%d,%d]' % (x, z) for x, z in pts) + ']'
            line = re.sub(r'pts: \[\[.*?\]\] \}', lambda _m: 'pts: ' + arr + ' }', line, count=1); n += 1; seen.add(m.group(1))
        out.append(line)
    open(path, 'w', newline='').write(nl.join(out))
    print(path, os.path.getsize(path), 'bytes')
print(n, 'lines rewritten; fixed lines not found in the viewer files:', sorted(set(FIX) - seen))
