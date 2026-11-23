#!/usr/bin/env python3
"""HK-8c (data only, src NOT changed): the ground road under the ring deck goes from 8 lanes (arm J1-S, 4 + 4) to 6 lanes (island link M6-1, 3 + 3).
Run from the project root:  python3 -I tools/hk-lanes.py  -> docs/HK_LANES.txt, docs/hk_lanes.json
Frame: y NORTH, node (ring axis x arm axis) at 0,0; the arm comes from the NORTH (y > 0), the link starts 25 m SOUTH (y = -25). Left-hand traffic:
SOUTHBOUND traffic (arm -> link) keeps to the EAST side and LOSES its outer lane; NORTHBOUND traffic (link -> arm) keeps WEST and GAINS an outer lane."""
import json

out, fails, warns = [], 0, 0
def say(s): out.append(s); print(s)
def chk(ok, name, detail, warn=False):
    global fails, warns
    if not ok:
        if warn: warns += 1
        else: fails += 1
    say(f"  {'PASS' if ok else ('WARN' if warn else 'FAIL')}  {name:<62} {detail}")

S = json.load(open('docs/hk_structures.json')); CD = json.load(open('docs/hk_cd_slips.json'))
# ---- inputs (HANDOFF section 2, HK_SITE.txt, HK-4, HK-5c) ----
ARM_LANES, ARM_W, ARM_HALF, ARM_V = 4, 3.65, 22.1, 100
LINK_LANES, LINK_W, LINK_HALF, LINK_V = 3, 3.5, 16.0, 80
DECK_HALF = S['deckW'] / 2                    # 25.75: the deck covers y -25.75 .. +25.75
LINK_START = -25.0                            # link starts 25 m south of the ring axis
ARM_STRUCT = 584.0                            # first arm structure north of the node (HK-0)
CD_EXIT_NOSE = CD['ext']['eastArmEnd']        # 607.3: first C-D gore on the arm side
LEVEL_ARM, LEVEL_LINK = 19.68, 20.02          # arm end / link start level (HK-0)

# ---- decisions of this step ----
TAPER_END = 30.0                              # lane drop ends 30 m north of the node = 4.25 m beyond the deck edge: no merge under the deck
def taper(w, v): return 0.625 * w * v         # lane-drop taper, L = W x S (AASHTO, metric: 0.625 x W[m] x V[km/h])
need = taper(ARM_W, ARM_V)                    # at the ARM speed 100 (the traffic arrives at that speed)
TAPER_LEN = 230.0
TAPER_START = TAPER_END + TAPER_LEN
GAIN_LEN = 90.0                               # northbound lane gain: the new lane opens from the deck edge, fully open 90 m further
say("HK-8c LANE DROP 8 -> 6 lanes of the ground road (2026-11-23, data only, src NOT changed)")
say(f"Arm {ARM_LANES}+{ARM_LANES} lanes of {ARM_W} m (half {ARM_HALF}, V{ARM_V}); link {LINK_LANES}+{LINK_LANES} lanes of {LINK_W} m (half {LINK_HALF}, V{LINK_V}); the link starts at y {LINK_START:.0f}, the deck covers |y| <= {DECK_HALF}.")
say(f"DECISION: the arm keeps its 8-lane pavement (arm is FIXED). SOUTHBOUND outer (east) lane is closed by a lane-drop taper y +{TAPER_START:.0f} .. +{TAPER_END:.0f} ({TAPER_LEN:.0f} m, rule {need:.0f} m), then hatched + barrier y +{TAPER_END:.0f} .. 0. NORTHBOUND (west) lane is GAINED: opens at the deck edge y +{DECK_HALF}, fully open at y +{DECK_HALF + GAIN_LEN:.0f}. The pavement edge steps from half {ARM_HALF} to {LINK_HALF} inside the connector y 0 .. {LINK_START:.0f}, which lies completely under the deck.\n\nChecks:")
chk(ARM_LANES - 1 == LINK_LANES, "Lane balance southbound (4 - 1 dropped = 3)", f"{ARM_LANES - 1} through lanes = link {LINK_LANES}")
chk(LINK_LANES + 1 == ARM_LANES, "Lane balance northbound (3 + 1 gained = 4)", f"{LINK_LANES + 1} lanes = arm {ARM_LANES}")
chk(TAPER_LEN >= need, "Lane-drop taper >= 0.625 x W x V (V100)", f"{TAPER_LEN:.0f} m >= {need:.0f} m (at V80 the rule gives {taper(ARM_W, LINK_V):.0f} m)")
chk(TAPER_END >= DECK_HALF + 4, "Taper ends outside the deck (>= 4 m beyond the edge)", f"ends y {TAPER_END:.0f}, deck edge {DECK_HALF}: {TAPER_END - DECK_HALF:.2f} m")
chk(ARM_STRUCT - TAPER_START >= 100, "Taper start clear of the first arm structure (>= 100 m)", f"start y {TAPER_START:.0f}, structure at {ARM_STRUCT:.0f}: {ARM_STRUCT - TAPER_START:.0f} m")
chk(CD_EXIT_NOSE - TAPER_START >= 100, "Taper start clear of the C-D gore on the arm (>= 100 m)", f"gore at {CD_EXIT_NOSE:.0f}: {CD_EXIT_NOSE - TAPER_START:.0f} m, no weave with the C-D exit")
chk(LINK_START >= -DECK_HALF, "Connector (arm end y 0 -> link start y -25) lies under the deck", f"y {LINK_START:.0f} .. 0 inside |y| <= {DECK_HALF}")
shift = ARM_HALF - LINK_HALF
chk(True, "Pavement edge step in the connector (closed lane, no vehicle uses it)", f"{shift:.1f} m over {abs(LINK_START):.0f} m = 1:{abs(LINK_START) / shift:.1f}, hidden under the deck")
g = (LEVEL_LINK - LEVEL_ARM) / abs(LINK_START) * 100
chk(g <= 4.0, "Level change over the connector (arm 19.68 -> link 20.02)", f"{g:.1f} % (limit 4 %); the arm climbs 1.5 % to the node and the link up to 3.5 %: smooth")
chk(GAIN_LEN >= 3 * ARM_W * 5, "Northbound lane gain opens over >= 55 m", f"{GAIN_LEN:.0f} m", warn=True)
res = {"taperStartY": TAPER_START, "taperEndY": TAPER_END, "taperLen": TAPER_LEN, "gainStartY": DECK_HALF, "gainEndY": DECK_HALF + GAIN_LEN, "deadLaneY": [0, TAPER_END], "dropSide": "east, southbound", "gainSide": "west, northbound", "connectorY": [LINK_START, 0], "edgeStep": shift}
say("\nFOR LATER STEPS: HK-9 (markings): taper chevrons + hatching + a barrier / crash cushion on the closed east outer lane y 0 .. +30. HK-11 (traffic graph): southbound lane 4 merges into lane 3 along the taper; northbound a 4th lane starts at y +25.75; both only inside the arm's last 260 m. The arm data / pavement are NOT changed.")
say("RUN: this script only. NOT RUN: tsc, npm run build, game look, the real traffic graph. NOT CHECKED: the connector pavement mesh (arm and link end shapes in src), terrain / drainage under the deck, lighting under the deck, C-D road tie-in at the arm (assumed to stay clear: C-D inner edge at x 25.1, arm outer edge 22.1).")
say(f"RESULT: {fails} FAIL, {warns} WARN")
json.dump(res, open("docs/hk_lanes.json", "w"), indent=1)
open("docs/HK_LANES.txt", "w").write("\n".join(out) + "\n")
