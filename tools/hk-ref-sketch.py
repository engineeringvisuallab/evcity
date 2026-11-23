# HK-1 schematic sketch: target layout (NOT final geometry). x east, y north, node at (0,0), metres.
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle
fig, ax = plt.subplots(figsize=(10, 10))
ax.set_aspect("equal"); ax.set_xlim(-420, 420); ax.set_ylim(-420, 420)
ax.set_facecolor("#e8f3dc")
# ring = flyover (over), E-W
ax.plot([-420, 420], [0, 0], color="red", lw=11, solid_capstyle="butt", zorder=5, label="ring M8 = FLYOVER (over)")
# ground road N-S: arm (north, 8 lane) + link (south, 6 lane), with one-way C-D roads each side
ax.plot([0, 0], [0, 420], color="orange", lw=8, zorder=3, label="J1-S arm (under)")
ax.plot([0, 0], [-420, 0], color="m", lw=7, zorder=3, label="island link M6-1 (under)")
for sx in (-1, 1):
    ax.plot([sx * 38] * 2, [-300, 300], color="dimgray", lw=3, zorder=3, ls="-", label="C-D road (one way)" if sx == 1 else None)
# loops: ponds EAST (wet valley), lawns WEST
def loop(cx, cy, r, fill, name):
    ax.add_patch(Circle((cx, cy), r, fc=fill, ec="black", lw=3, zorder=4, alpha=.9))
    ax.text(cx, cy, name, ha="center", va="center", fontsize=9, zorder=6, weight="bold")
rp, rl = 55, 115
loop(rp + 70, rp + 40, rp, "#7fb6d9", "POND loop\nR55 (V45)\nNE")
loop(rp + 70, -(rp + 40), rp, "#7fb6d9", "POND loop\nR55 (V45)\nSE")
loop(-(rl + 55), rl + 40, rl, "#b9e08a", "LAWN loop\nR115 (V60)\nNW")
loop(-(rl + 55), -(rl + 40), rl, "#b9e08a", "LAWN loop\nR115 (V60)\nSW")
ax.plot(0, 0, "k*", ms=18, zorder=7)
ax.set_title("HK-1 target layout, SCHEMATIC (video proportions; numbers from game standards)\n"
             "ring over, arm + link under with C-D roads; ponds east (wet valley), lawns west. Final geometry in HK-3", fontsize=10)
ax.legend(loc="lower right", fontsize=8); ax.grid(alpha=.25); ax.set_xlabel("x east (m)"); ax.set_ylabel("y north (m)")
plt.savefig("docs/hk_ref_sketch.png", dpi=110, bbox_inches="tight")
