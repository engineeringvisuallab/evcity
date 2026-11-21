# plots-move-buildings.py : PLOT TILING P3c. Finds every building whose body (W x D minus 8 m yard, turned by its yaw) touches road / street / rail / keep-out / water / steep
#   and moves it the SHORTEST way (max 90 m, keeping its yaw) to ground where the whole body is free land. Writes docs/city_plots_moves.json:
#   [{"src":"hand"|"fill", "i":row number in that table, "id","x","z","nx","nz"}]. tools/plots-apply-moves.py then writes the new x / z into the placement files.
# Run: python3 tools/plots-move-buildings.py
import json, base64, numpy as np, cv2
N = json.load(open('docs/city_nogo.json')); INP = json.load(open('docs/city_plots_input.json'))
M = np.frombuffer(base64.b64decode(N['mask']), dtype=np.uint8).reshape(N['nz'], N['nx']); WET = np.frombuffer(base64.b64decode(N['wet']), dtype=np.uint8).reshape(N['nz'], N['nx']) > 0
HARD = 1 | 2 | 4 | 8 | 16 | 64; C = N['cell']; X0, Z0 = N['x0'], N['z0']
import cv2
AREA = cv2.imread('docs/city_plots_area.png', 0) > 0      # where plots are made (city circle + every building area), 2 m raster
def in_area(x, z):
    i, j = int((x - X0) / 2), int((z - Z0) / 2); return 0 <= i < AREA.shape[1] and 0 <= j < AREA.shape[0] and AREA[j, i]
bad = ((M & HARD) != 0) | WET                       # True = cannot build
# other buildings: keep 2 m clear of the bodies of the ones that stay (simple list, checked while moving)
def body(b):
    w, d = max(b['W'] - 8, 4), max(b['D'] - 8, 4); return w, d
def corners(x, z, w, d, y):
    c, s = np.cos(y), np.sin(y); return [(x + u * c + v * s, z - u * s + v * c) for u in (-w / 2, w / 2) for v in (-d / 2, d / 2)]
def hits(x, z, w, d, y):
    for u in np.linspace(-w / 2, w / 2, 7):
        for v in np.linspace(-d / 2, d / 2, 7):
            px, pz = x + u * np.cos(y) + v * np.sin(y), z - u * np.sin(y) + v * np.cos(y)
            i, j = int((px - X0) / C), int((pz - Z0) / C)
            if not (0 <= i < N['nx'] and 0 <= j < N['nz']) or bad[j, i]: return True
    return False
allb = [('hand', i, b) for i, b in enumerate(INP['hand'])] + [('fill', i, b) for i, b in enumerate(INP['fill'])]
allb = [t for t in allb if in_area(t[2]['x'], t[2]['z'])]
stay = [t for t in allb if not hits(t[2]['x'], t[2]['z'], *body(t[2]), t[2].get('yaw') or 0)]
todo = [t for t in allb if t not in stay]
print('buildings in the plot area', len(allb), ' fine', len(stay), ' to move', len(todo))
occ = [(t[2]['x'], t[2]['z'], max(body(t[2])) / 2) for t in stay]       # circles of the buildings that stay
moves = []; failed = []
offs = sorted(((dx, dz) for dx in range(-90, 91, 2) for dz in range(-90, 91, 2) if dx * dx + dz * dz <= 8100), key=lambda o: o[0] ** 2 + o[1] ** 2)
for src, i, b in sorted(todo, key=lambda t: -t[2]['W'] * t[2]['D']):
    w, d = body(b); y = b.get('yaw') or 0; r = max(w, d) / 2; ok = None
    for dx, dz in offs:
        x, z = b['x'] + dx, b['z'] + dz
        if not in_area(x, z) or hits(x, z, w, d, y): continue
        if any(np.hypot(x - ox, z - oz) < r + orr + 1 for ox, oz, orr in occ): continue
        ok = (x, z); break
    if ok: moves.append({'src': src, 'i': i, 'id': b['id'], 'x': b['x'], 'z': b['z'], 'nx': round(ok[0], 1), 'nz': round(ok[1], 1)}); occ.append((ok[0], ok[1], r))
    else: failed.append({'src': src, 'i': i, 'id': b['id'], 'x': b['x'], 'z': b['z']})
print('moved', len(moves), ' could not move within 90 m', len(failed), [f['id'] for f in failed[:10]])
json.dump({'moves': moves, 'failed': failed}, open('docs/city_plots_moves.json', 'w'))
