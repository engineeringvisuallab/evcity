# HK-5a picture: the two east pond loops (SE + NE) with spirals, ring, east C-D road. Local frame: x east, y north (m).
import json, math, matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle
d = json.load(open("docs/hk_loops_a.json"))
fig, ax = plt.subplots(figsize=(9, 9)); ax.set_aspect("equal"); ax.set_xlim(-60, 200); ax.set_ylim(-200, 200); ax.set_facecolor("#e8f3dc")
ax.plot([-60, 200], [0, 0], color="red", lw=12, solid_capstyle="butt", label="ring flyover (8 lane, half width 22.1 m)")
ax.plot([29.3, 29.3], [-200, 200], color="dimgray", lw=4, label="east C-D road (x = 29.3 m)"); ax.plot([0, 0], [-200, 200], color="orange", lw=6, alpha=.7, label="arm / link axis")
for key, col, lab in (("se", "blue", "SE loop: C-D -> ring (southbound to westbound)"), ("ne", "green", "NE loop: ring -> C-D (eastbound to southbound)")):
    ax.plot([p["x"] for p in d[key]], [p["y"] for p in d[key]], color=col, lw=2.5, label=lab)
cx, cy = d["centre"]; R = d["R"] - 4.2 - 12
for sy in (1, -1): ax.add_patch(Circle((cx, sy * -cy if False else (cy if sy == 1 else -cy)), R, fc="#7fb6d9", ec="k", alpha=.7))
ax.text(cx, cy, "pond\ninfield r %.0f m" % R, ha="center", va="center", fontsize=8); ax.text(cx, -cy, "pond\ninfield r %.0f m" % R, ha="center", va="center", fontsize=8)
ax.plot(0, 0, "k*", ms=15); ax.grid(alpha=.25); ax.legend(fontsize=7, loc="lower left")
ax.set_title("HK-5a east pond loops, R %d m, V%d, spirals %d m each (PLAN, local frame)" % (d["R"], d["V"], d["Ls"]), fontsize=10)
plt.savefig("docs/hk_loops_a.png", dpi=105, bbox_inches="tight")
