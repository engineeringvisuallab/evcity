# HK-4 picture: ring level, old vs new (ring OVER), deck 1.4 m scenario. x: offset from node, + = WEST, - = EAST.
import json, matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
d = json.load(open("docs/hk_vertical.json")); old = d["old"]
fig, ax = plt.subplots(figsize=(11, 5))
ax.plot([p[0] for p in old], [p[1] for p in old], color="gray", lw=2, label="old ring level")
pts = sorted(d["res"]["WEST_1.4"]["pts"] + d["res"]["EAST_1.4"]["pts"])
ax.plot([p[0] for p in pts], [p[1] for p in pts], color="red", lw=2.5, label="new ring, deck 1.4 m")
ax.axvspan(-432, -312, color="blue", alpha=.15, label="river bridge (fixed): -312 .. -432")
ax.axvline(-439, color="red", ls=":", label="east ramp ends at -439 m (needs the river bridge area)")
ax.axhline(d["y0"], color="m", ls="--", lw=1, label="highest lower-road level %.2f m" % d["y0"])
ax.set_xlim(600, -600); ax.set_xlabel("offset from the node (m): WEST (+) on the left, EAST (-) on the right"); ax.set_ylabel("level (m)")
ax.set_title("HK-4 ring OVER, vertical plan (numbers from docs/HK_VERTICAL.txt)"); ax.grid(alpha=.3); ax.legend(fontsize=8)
plt.savefig("docs/hk_vertical.png", dpi=105, bbox_inches="tight")
