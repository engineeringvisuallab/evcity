# STEP 21.6b picture: python3 tools/centre-meshsec-plot.py [dir]  (reads dir/centre_meshsec.json, writes dir/centre_meshsec.png)
# One panel per section: both sides of the centreline (drive side LEFT, mirrored), bands coloured by kind, widths in metres.
import json, sys
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
D = sys.argv[1] if len(sys.argv) > 1 else 'docs'
J = json.load(open(f'{D}/centre_meshsec.json'))
COL = {'median': '#7bbf6a', 'shoulder-in': '#777777', 'lanes': '#3a3a3a', 'shoulder-out': '#777777', 'earth-shoulder': '#b59a6a', 'kerb': '#cccccc', 'footpath': '#d9b38c',
       'verge-drain': '#9bc47a', 'barrier': '#2a6bff', 'ditch': '#6a8fb5', 'clear-zone': '#cfe8b8', 'row-strip': '#f2f2e0'}
S = J['sections']
fig, axs = plt.subplots(len(S), 1, figsize=(11, 1.55 * len(S) + 0.6))
for ax, s in zip(axs, S):
    for sgn in (1, -1):
        for b in s['bands']:
            x0, x1 = sorted((sgn * b['from'], sgn * b['to']))
            ax.add_patch(plt.Rectangle((x0, 0), x1 - x0, 1, fc=COL.get(b['kind'], '#ccc'), ec='k', lw=0.4))
    for b in s['bands']:
        if b['to'] - b['from'] >= 1.4:
            ax.text((b['from'] + b['to']) / 2, 0.5, f"{b['to'] - b['from']:.1f}", ha='center', va='center', fontsize=6)
    ax.axvline(0, color='r', lw=0.6, ls='--')
    h = s['rowHalf']; ax.set_xlim(-h - 1, h + 1); ax.set_ylim(0, 1.45); ax.set_yticks([])
    ax.set_title(f"{s['id']}   paved edge {s['pavementEdge']:.2f}   formation half {s['formationHalf']:.2f}   ROW half {s['rowHalf']:.2f}   drain: {s['drain']['kind']}", fontsize=8, loc='left')
    ax.tick_params(labelsize=7)
handles = [plt.Rectangle((0, 0), 1, 1, fc=c, ec='k', lw=0.4) for c in COL.values()]
fig.legend(handles, list(COL.keys()), ncol=6, fontsize=6, loc='lower center')
fig.tight_layout(rect=(0, 0.04, 1, 1))
fig.savefig(f'{D}/centre_meshsec.png', dpi=110)
