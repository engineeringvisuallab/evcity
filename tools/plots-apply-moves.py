# plots-apply-moves.py : PLOT TILING P3c. Writes docs/city_plots_moves.json into the building tables (new x / z only, yaw and everything else stay).
# Rows are found by model id + old x / z. Run: python3 tools/plots-apply-moves.py
import json, re
mv = json.load(open('docs/city_plots_moves.json'))['moves']
files = ['src/buildings/PlacementsPlots.ts', 'src/buildings/Placements.ts', 'src/buildings/PlacementsFill.ts', 'src/buildings/PlacementsResidential.ts']
left = list(mv); done = 0
rj = re.compile(r'"id":"([^"]+)","x":(-?[\d.]+),"z":(-?[\d.]+),')
rx = re.compile(r"id: '([^']+)', x: (-?[\d.]+), z: (-?[\d.]+),")
for f in files:
    lines = open(f, newline='').read().split('\n'); ch = 0
    for k, ln in enumerate(lines):
        m = rx.search(ln); js = False
        if not m:
            m = rj.search(ln); js = True
            if not m: continue
        for t in left:
            if t['id'] == m.group(1) and abs(float(m.group(2)) - t['x']) < .051 and abs(float(m.group(3)) - t['z']) < .051:
                lines[k] = ln.replace(m.group(0), (f'"id":"{t["id"]}","x":{t["nx"]:g},"z":{t["nz"]:g},' if js else f"id: '{t['id']}', x: {t['nx']:g}, z: {t['nz']:g},"), 1)
                if not js: lines[k] = re.sub(r"(\r?)$", " // PLOTS: moved from (%g, %g) into free plot land\\1" % (t['x'], t['z']), lines[k], 1) if '//' not in lines[k] else lines[k]
                left.remove(t); done += 1; ch += 1; break
    if ch: open(f, 'w', newline='').write('\n'.join(lines)); print(f, 'rows changed', ch)
print('moved rows', done, ' not found', len(left), [t['id'] for t in left[:8]])
