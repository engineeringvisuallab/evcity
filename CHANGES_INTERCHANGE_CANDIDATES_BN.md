# INTERCHANGE — candidate junction finder (game file bodlay ni)

Age apply koro: Step 1, 2a, 2b. Ei zip-e **shudhu notun file**, game-er kono file bodlay ni.

## Ki
`scripts/interchange-candidates.ts` — asol road network (flag off) theke prottek junction pad dekhe: jekhane **duto divided road** (highway / arterial / avenue) prai 90° te mile, shekhane diamond, parclo, cloverleaf — tin-ta-i baniye **pani, khara dhal (>9 m cut/fill), onno road/pad (20 m-er moddhe)** check kore. Result: `docs/INTERCHANGE_CANDIDATES_BN.md` (table + copy-paste `Config` list).

Avenue × avenue (downtown 110 m block) bad — interchange-er jonno onek chhoto.

## Ei seed-er result (169 pad theke)
- 13 ta junction-e duto divided road mile; **2 ta-te pattern boshe**:
  - `I11`: x 2602, z 1821 (F2 × P10) — **cloverleaf** (diamond/parclo-o boshe)
  - `I13`: x 262, z -2820 (F4 × P13) — **parclo** (cloverleaf-e onno road 5 m kachhe, diamond-e 7 m)
- Baki gulo-te kono na kono karone fit kore na: dhal (steep), nodi (water) ba kachhe onno road. Table-e karon dekha ache (`water / steep / road` sonkha).
- Verify: ei 2 entry real network-e flag on kore boshiye dekhechi: **2/2 interchange, 12 ramp road, kono warning nai.**

## Jante rakho
- Threshold gulo shabdhani (9 m / 20 m). Chaile script-e `check()` e dhil dile aro junction fit hobe (kintu tokhon matir cut/fill ba road-er kachhakachhi hobe).
- Spawn crossing (pad 0, F4 × F6): sob pattern-e city-r road kachhe (14–49 ta point), tai bad.
- Cross road ke main-er sathe ~90° dhora hoy (sin >= 0.9), tai ja 64°-er kom, shegulo list-e nai.

## Chalu korte
`docs/INTERCHANGE_CANDIDATES_BN.md` er "Ready to paste" line gulo `Config.roads.interchange.list`-e dao, `enabled: true`. (Step 2b-r moto: ekhon ramp embankment, deck/pier Step 2c-te.)
