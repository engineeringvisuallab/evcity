# HK-3 picture: layout with C-D extents vs the first structures on the arm (north 584 m) and the link (south 462 m). SCHEMATIC.
import json, matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle
d = json.load(open("docs/hk_layout.json")); e = d["ext"]; b = d["box"]
fig, ax = plt.subplots(figsize=(9, 11)); ax.set_aspect("equal"); ax.set_xlim(-420, 330); ax.set_ylim(-640, 640); ax.set_facecolor("#e8f3dc")
ax.plot([-420, 330], [0, 0], color="red", lw=10, zorder=5, label="ring = flyover (over)")
ax.plot([0, 0], [0, 640], color="orange", lw=7, label="J1-S arm (under)"); ax.plot([0, 0], [-640, 0], color="m", lw=6, label="island link (under)")
for sx in (-1, 1): ax.plot([sx * d["vCD"]] * 2, [-e["150"]["south"], e["150"]["north"]], color="dimgray", lw=3, zorder=3, label="C-D road, slipSize 150 (PASS)" if sx == 1 else None)
ax.plot([-d["vCD"]] * 2, [-e["250"]["south"], e["250"]["north"]], color="red", lw=1.5, ls="--", label="C-D road, default slipSize 250 (link side FAIL)")
ax.axhline(584, color="blue", ls=":", label="first arm structure 584 m"); ax.axhline(-462, color="blue", ls=":", label="first link structure 462 m")
for (cx, cy, r, c, n) in [(125, 95, 55, "#7fb6d9", "pond R55"), (125, -95, 55, "#7fb6d9", "pond R55"), (-170, 155, 115, "#b9e08a", "lawn R115"), (-170, -155, 115, "#b9e08a", "lawn R115")]:
    ax.add_patch(Circle((cx, cy), r, fc=c, ec="k", lw=2.5, alpha=.9, zorder=4)); ax.text(cx, cy, n, ha="center", va="center", fontsize=9, zorder=6)
ax.add_patch(Rectangle((b["x0"], b["y0"]), b["x1"] - b["x0"], b["y1"] - b["y0"], fill=False, ec="green", lw=1.5, ls="--", label="loop footprint %dx%d m" % (b["x1"] - b["x0"], b["y1"] - b["y0"])))
ax.plot(0, 0, "k*", ms=16, zorder=7); ax.legend(loc="lower left", fontsize=7); ax.grid(alpha=.25)
ax.set_title("HK-3 layout numbers (SCHEMATIC, no ramps joined yet; x east, y north, m)", fontsize=10)
plt.savefig("docs/hk_layout.png", dpi=105, bbox_inches="tight")
