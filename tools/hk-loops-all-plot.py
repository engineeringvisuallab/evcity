# HK-5: four equal loops R80 V45 + four slips + ground C-D roads, 8-lane arm (north) and 6-lane link (south). PLAN, local frame x east, y north (m).
import json, math, matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle
a = json.load(open("docs/hk_loops_a.json")); b = json.load(open("docs/hk_loops_b.json")); c = json.load(open("docs/hk_cd_slips.json"))
fig, ax = plt.subplots(figsize=(11, 9)); ax.set_aspect("equal"); ax.set_xlim(-430, 430); ax.set_ylim(-400, 400); ax.set_facecolor("#e8f3dc")
ax.plot([-430, 430], [0, 0], color="red", lw=12, solid_capstyle="butt", label="ring flyover (8 lane)")
ax.plot([0, 0], [0, 400], color="orange", lw=7, alpha=.7, label="arm (8 lane)"); ax.plot([0, 0], [-400, 0], color="m", lw=5, alpha=.7, label="link (6 lane)")
for sx in (-1, 1):
    ax.plot([sx * a["vN"]] * 2, [26, 400], color="dimgray", lw=3, label="C-D roads: x +-29.3 m north, +-23.2 m south" if sx == 1 else None)
    ax.plot([sx * a["vS"]] * 2, [-400, -76], color="dimgray", lw=3)
    xs = [sx * (a["vS"] + (a["vN"] - a["vS"]) * (1 - (1 - math.cos(math.pi * t / 50)) / 2)) for t in range(51)]; ax.plot(xs, [-26 - 50 * t / 50 for t in range(51)], color="dimgray", lw=3)
for key in ("se", "ne"): ax.plot([p["x"] for p in a[key]], [p["y"] for p in a[key]], color="blue", lw=2.2, label="loops R %d m, V%d" % (a["R"], a["V"]) if key == "se" else None)
for key in ("nw", "sw"): ax.plot([p["x"] for p in b[key]], [p["y"] for p in b[key]], color="blue", lw=2.2)
for i, (sx, sk) in enumerate(((1, "slipNE"), (-1, "slipNE"), (1, "slipSE"), (-1, "slipSE"))): ax.plot([sx * p["x"] for p in c[sk]], [p["y"] for p in c[sk]], color="green", lw=2.2, label="slips (left turns), slipSize %d m" % c["S"] if i == 0 else None)
r = a["R"] - 4.2 - 12; cx, cy = a["centre"]; cxb, cyb = b["centre"]; cxn = cx + (a["vN"] - a["vS"]); cxbn = b["centreN"][0]
for (x, y, col) in ((cx, cy, "#7fb6d9"), (cxn, -cy, "#7fb6d9"), (cxb, cyb, "#b9e08a"), (cxbn, -cyb, "#b9e08a")): ax.add_patch(Circle((x, y), r, fc=col, ec="k", alpha=.6))
ax.plot(0, 0, "k*", ms=15); ax.grid(alpha=.25); ax.legend(fontsize=7, loc="lower left")
ax.set_title("HK-5 loops + slips + C-D roads, 8-lane arm / ring, 6-lane link (PLAN). Weave: ring %.0f / %.0f m, C-D %.0f m (min 150)" % (c["wRingS"], c["wRingN"], c["wCD"]), fontsize=9)
plt.savefig("docs/hk_loops_all.png", dpi=100, bbox_inches="tight")
