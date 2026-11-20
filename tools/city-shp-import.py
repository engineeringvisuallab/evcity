# STEP CITY-SHP-1 importer: python3 tools/city-shp-import.py City_Road/City_Road.shp   (pure python, no GIS library)
# Reads the user's drawn city street centrelines (PolylineZ, 25 lines, no attributes, no .prj) and writes docs/city_shp_raw.json in GAME metres.
# Grid = the game's GIS export grid (src/export/RasterExport.ts): Easting = x + W/2, Northing = W/2 - z, W = 10000  ->  x = E - 5000, z = 5000 - N  (x east, z south).
import json, struct, sys
W = 10000.0
src = sys.argv[1] if len(sys.argv) > 1 else 'City_Road.shp'
d = open(src, 'rb').read()
st, = struct.unpack('<i', d[32:36])
lines, i = [], 100
while i < len(d):
    rn, cl = struct.unpack('>ii', d[i:i + 8]); i += 8
    c = d[i:i + cl * 2]; i += cl * 2
    t, = struct.unpack('<i', c[:4])
    if t not in (3, 13, 23):
        continue
    nparts, npts = struct.unpack('<ii', c[36:44])
    parts = list(struct.unpack('<%di' % nparts, c[44:44 + 4 * nparts])) + [npts]
    o = 44 + 4 * nparts
    pts = [struct.unpack('<2d', c[o + 16 * k:o + 16 * k + 16]) for k in range(npts)]
    for k in range(nparts):
        seg = pts[parts[k]:parts[k + 1]]
        lines.append({'id': 'SH-%d' % rn, 'rec': rn, 'pts': [[round(e - W / 2, 2), round(W / 2 - n, 2)] for e, n in seg]})
json.dump({'note': 'City_Road.shp -> game metres (x east, z south): x = Easting - 5000, z = 5000 - Northing. No .prj in the file: the GIS export grid of the game is ASSUMED (the overlay with the road network fits). Drawn by the user, not fitted.', 'shape_type': st, 'lines': lines}, open('docs/city_shp_raw.json', 'w'))
print('lines', len(lines), 'points', sum(len(l['pts']) for l in lines))
