# J7-B pictures from docs/J300_STRUCT_B.json -> docs/j300_struct_b.png (plan, section along R6 under the viaduct, view along R6). Concept pictures from the numbers, NOT a game render.
import json, math
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
S = json.load(open('docs/J300_STRUCT_B.json')); C = S['crossing']; R = S['rail']; Rd = S['road']; W = S['wall']; Pr = S['piers']
cx, cz = C['x'], C['z']; rd = C['railDir']; ad = C['armDir']
def L(x, z):  # a along the rail, c across the rail (left normal)
    dx, dz = x - cx, z - cz; return dx * rd[0] + dz * rd[1], dx * (-rd[1]) + dz * rd[0]
fig = plt.figure(figsize=(17, 10.5))
ax = fig.add_axes([0.04, 0.50, 0.46, 0.44]); ax.set_aspect('equal'); ax.set_title('J7-B plan: R6 (walled fill) passes between two moved viaduct piers; rail axis horizontal', fontsize=10)
pts = [L(p[0], p[1]) for p in S['armPoly']]
a0 = L(cx + ad[0], cz + ad[1]); n = math.hypot(*a0); av = (a0[0] / n, a0[1] / n); nv = (-av[1], av[0])
off = lambda h: [(p[0] + nv[0] * h, p[1] + nv[1] * h) for p in pts]
o1, o2 = off(16.6), off(-16.6)
ax.fill([q[0] for q in o1] + [q[0] for q in o2][::-1], [q[1] for q in o1] + [q[1] for q in o2][::-1], color='#d9d9d9', alpha=.8)
for h, ls, c in [(0, '--', 'k'), (W['toeHalf'], ':', '#a33'), (-W['toeHalf'], ':', '#a33')]:
    o = off(h); ax.plot([q[0] for q in o], [q[1] for q in o], ls, color=c, lw=1.2)
dh = R['deckHalf']; ax.fill([-65, 65, 65, -65], [-dh, -dh, dh, dh], color='#8aa0c8', alpha=.5, label='viaduct deck (station, half width 9.6 m)')
H = R['pierCol']
for p in Pr['existing']:
    a, _ = L(p['x'], p['z'])
    if abs(a) > 62: continue
    bad = not p['ok']; ax.add_patch(plt.Rectangle((a - H['hl'], -H['ha']), 2 * H['hl'], 2 * H['ha'], fc='none' if bad else '#555', ec='r' if bad else '#555', ls='--' if bad else '-', lw=1.4))
    ax.text(a, -H['ha'] - 3, f"s {p['s']}" + (' (removed)' if bad else ''), ha='center', fontsize=7, color='r' if bad else 'k')
for p in Pr['added']:
    a, _ = L(p['x'], p['z']); ax.add_patch(plt.Rectangle((a - H['hl'], -H['ha']), 2 * H['hl'], 2 * H['ha'], fc='#1b7f3b', ec='k', lw=1)); ax.text(a, H['ha'] + 1.5, f"NEW s {p['s']}", ha='center', fontsize=7, color='#1b7f3b')
ax.set_xlim(-65, 65); ax.set_ylim(-45, 45); ax.set_xlabel('along the rail (m)'); ax.set_ylabel('across the rail (m)'); ax.legend(fontsize=7, loc='upper right')
ax.text(-63, -42, 'grey = M6 top width 33.2 m; dotted red = MSE wall toe', fontsize=7)
bx = fig.add_axes([0.55, 0.52, 0.42, 0.40]); bx.set_title(f"section along R6 under the viaduct: clearance {S['clear']['min']} m (>= 5.5), road falls {Rd['gradePct']} %", fontsize=10)
rows = S['rows']; xs = [r['d'] for r in rows]
bx.fill_between(xs, [r['natural'] for r in rows], [r['level'] for r in rows], color='#c9b79c', label='R6 fill (MSE walled)'); bx.plot(xs, [r['level'] for r in rows], 'k', lw=2); bx.plot(xs, [r['natural'] for r in rows], color='#6b5a3c')
hd = Rd['lenUnderDeck'] / 2; bx.fill([-hd, hd, hd, -hd], [R['soffit'], R['soffit'], R['deckTop'], R['deckTop']], color='#8aa0c8', ec='k')
bx.text(0, R['deckTop'] + .3, f"rail deck top {R['deckTop']} m (soffit {R['soffit']} m)", ha='center', fontsize=8)
bx.annotate('', xy=(-hd, R['soffit']), xytext=(-hd, Rd['levelAtHighEdgeOfDeck']), arrowprops=dict(arrowstyle='<->', color='r')); bx.text(-hd - 1, (R['soffit'] + Rd['levelAtHighEdgeOfDeck']) / 2, f"{S['clear']['min']} m", color='r', ha='right', fontsize=9)
bx.set_xlim(-62, 62); bx.set_ylim(17, 38); bx.set_xlabel('distance along R6 from the crossing (m)'); bx.set_ylabel('level (m)'); bx.legend(fontsize=8, loc='lower right')
cxa = fig.add_axes([0.04, 0.05, 0.46, 0.36]); cxa.set_title('view along R6: deck above, moved piers beside the walls', fontsize=10)
yc = Rd['levelCentre']; nat = Rd['natural']; tp = 16.6
cxa.fill([-tp, tp, tp, -tp], [nat, nat, yc, yc], color='#c9b79c', ec='k'); cxa.fill([-tp, tp, tp, -tp], [yc - .3, yc - .3, yc, yc], color='#333')
cxa.fill([-40, 40, 40, -40], [R['soffit'], R['soffit'], R['deckTop'], R['deckTop']], color='#8aa0c8', ec='k')
for sg in (-1, 1):
    x0 = sg * (W['needFaceCol'] + 1.3); cxa.fill([x0 - 1.3, x0 + 1.3, x0 + 1.3, x0 - 1.3], [nat, nat, R['capSoffit'], R['capSoffit']], color='#6e7276', ec='k'); cxa.fill([x0 - 1.6, x0 + 1.6, x0 + 1.6, x0 - 1.6], [R['capSoffit'], R['capSoffit'], R['soffit'], R['soffit']], color='#9aa0a6', ec='k')
cxa.annotate('', xy=(0, R['soffit']), xytext=(0, yc), arrowprops=dict(arrowstyle='<->', color='r')); cxa.text(1, (R['soffit'] + yc) / 2, f"{S['clear']['centre']} m at the centre", color='r', fontsize=8)
cxa.text(0, nat - 1.5, f"MSE wall faces +-16.6 m, wall toe +-{W['toeHalf']} m, pier faces >= {W['needFaceCol']} m", ha='center', fontsize=8)
cxa.set_xlim(-40, 40); cxa.set_ylim(nat - 3, R['deckTop'] + 3); cxa.set_aspect('equal'); cxa.set_xlabel('across R6 (m)'); cxa.set_ylabel('level (m)')
tx = fig.add_axes([0.55, 0.05, 0.42, 0.36]); tx.axis('off')
tx.text(0, 1, "J7-B RESULT (numbers, not a game render)\n\n- rail at the crossing = station VIADUCT, soffit %.2f m\n- R6 crosses at %.1f deg skew, fill %.1f m between MSE walls\n- clearance %.2f m (needs 5.5), spare %.2f m\n- game piers at rail s %s stand IN the corridor\n  -> moved to s %s and %s\n- spans %s m (limit 46); L/D of the 45 m span %.1f (assumed limit 22)\n- R6 falls %.1f %% under the deck: gravity drainage" % (R['soffit'], C['skewDeg'], W['fillH'], S['clear']['min'], S['clear']['spare'], ', '.join(str(x) for x in Pr['conflicts']), Pr['added'][0]['s'], Pr['added'][1]['s'], ' / '.join(str(x) for x in Pr['spans']), Pr['spanOverDepth'], Rd['gradePct']), va='top', fontsize=10, family='monospace')
plt.savefig('docs/j300_struct_b.png', dpi=100); print('saved')
