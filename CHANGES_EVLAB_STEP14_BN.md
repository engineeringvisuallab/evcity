# EVLab Step 14: Fountain (jharna) physics

## Ki holo
Ager fountain-er fota-gulo fixed path-e uthto-namto. Ekhon pratita fota asol projectile.
- **Projectile:** nozzle theke (vh, vy) niye berole, gravity niche tane (`y = y0 + vy s - g s^2 / 2`). Pool-er pani-r level-e thik shei muhurte porbe (`flightTime`), plinth-er opor theke hok ba pani-r niche theke.
- **Hawa:** halka breeze (`windAt`, 0.15..1.65 m/s, dhire ghure ar kokhono jore). Fota-r sideways speed hawa-r speed-er dike jay (drag 0.18 /s), tai ucho jet beshi hele. Uporer-niche drag nei, tai landing time exact thake.
- **Prati fota alada:** height +-3 %, reach +-6 %, dik +-0.05 rad, size +-18 %, `hash01(jet, drop, cycle)` theke. Per-drop random state nei, tai ekoi somoy = ekoi chhobi (test ei-tar upor nirbhor).
- **Pore gele:** fota chapta splash puff (0.32 s). Prati jet-er lead fota 3 ta chhoto fota uthay (jototo druto, totto upore) ar ekta ripple ring pathay, ring pani-te dure giye mishe jay.
- **Pani-te-i pore:** `fitReach` shob landing plinth/pedestal-er baire ar basin rim-er bhitore rakhe, sob-theke joray hawa ar jitter shoho. Plaza basin-e notun: floor, patla wall, flat rim, pani `BASIN.water` (0.6 m) e (ager solid wall pani dhekhe dito).
- **Performance:** pani (drop + puff + splash fota) = **1 InstancedMesh**, ripple ring = ar 1 chhoto InstancedMesh. Texture nei, shob mile ~2.2k instance. `FountainSet` API (group, setNight, update) ager moto, tai `EVLabGrounds.ts`-e change lage na.

## Changed / notun file
- notun: `src/evlab/EVLabFountainPhysics.ts` (pure maths, three nei), `scripts/evlab-fountains-test.ts`
- changed: `src/evlab/EVLabFountains.ts`, `package.json` (`test:evlab-fountains`), `HANDOFF_EVLAB.md`

## Test
`npm run test:evlab-fountains` (maths, landing shob pool-er bhitore, deterministic, ring/splash, 2 InstancedMesh). Tarpor `npm run build`.
Browser-e real chokh diye dekha baki: fota-r size (`DROP_R` 0.17), hawa-r jor (`windAt`), ripple-er brightness.
