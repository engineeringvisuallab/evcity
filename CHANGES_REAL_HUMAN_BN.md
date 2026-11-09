# Real manus: skinned body + natural motion + shooting + hit/death + LOD

## Step 1 (body + walk)
- `src/people/SkinnedHuman.ts`: manus ekta continuous `SkinnedMesh`, 17 bone (Mixamo nam). Joint skin er moto bend hoy, gap nei.
- `src/people/SkinMath.ts`: ring table, tube builder, skin weight (pure math).
- `src/people/HumanMotion.ts`: pelvis twist, shoulder counter-rotation, matha steady, pa heel->toe roll, hip bob, breathing, weight shift, pashe takano, blink.
- `src/people/HumanBody.ts`: `buildHuman` skinned body dey. `USE_SKINNED_BODY = false` korle ager rigid body fire ashe.

## Step 2 (baki gulo)
- **Chokh:** eyelid + natural blink (2-6 sec, majhe majhe double blink). Mara gele chokh bondho thake.
- **Gun dhora (`src/people/HumanAim.ts`):**
  - Right hand grip chest er kache, gun camera pitch onujayi uthe/name, wrist ghure gun ke aim e rakhe.
  - Left hand two-bone IK diye foregrip e boshe (elbow natural bend).
  - Recoil: gun uthe, hand ar chest pichone dhakka khay, tarpor settle kore.
  - Reload: gun nambe, left hand belt theke magazine ane, gun e dhukay, rack kore (CombatSystem er ammo timer follow kore).
  - Gun ekhon hand bone e, tracer ar muzzle flash gun er asol muzzle theke.
- **NPC (gunman, police):** same two-hand grip + recoil. Hit lagle body jerk (flinch).
- **Mara:** 3 rokom pora: pichone, mukh niche, pashe. Hatu bhenge jay, haat chhitke jay, matha jhule jay, chokh bondho.
- **LOD:** 70 m er dure sasta mesh (~1.9k tri, same skeleton), 120 m er dure animation 3 frame e 1 bar. Near mesh ~5k tri.
- **Leak fix:** manus remove hole skeleton er GPU texture free hoy (`dispose`).

## Step 3
- **Crouch:** `C` dhore rakhle (jekhane pani te na) hatu bhenge boshe, hip nichu, pith samne jhuke, speed adhek. Physics capsule er size ager moto, tai nichu jayga diye jawa jabe na.
- **Gun swap (Q):** aim kora obosthay gun nambe, notun gun ta nicher bindu te hate boshe, tarpor uthbe.
- **Lungi ar panjabi:** `Appearance.outfit`. Panjabi = lomba dhila shirt hatu porjonto, shada pyjama. Lungi = komor theke mid-calf porjonto, khali pa. Kapor er hem same dike er thigh er sathe dole, boshe thakle hatur sathe ashe. Random manus er moddhe ~12% panjabi (topi wala der 45%), ~15% lungi.

## Files
Step 3 e bodlano: `SkinnedHuman.ts`, `SkinMath.ts`, `HumanAim.ts`, `PersonModel.ts`, `PlayerModel.ts`, `Player.ts`.
Notun: `SkinnedHuman.ts`, `SkinMath.ts`, `HumanMotion.ts`, `HumanAim.ts`, `scripts/skin-test.ts`, `scripts/human-test.ts`.
Bodlano: `HumanBody.ts`, `PersonModel.ts`, `PlayerModel.ts`, `Player.ts` (muzzle), `Person.ts`, `PeopleManager.ts`, `CombatSystem.ts`, `package.json`.

## Test
`npm run typecheck`, `npm run test:skin` (body math), `npm run test:human` (bone, aim, reload, blink, LOD), `npm run test:combat`, `npm run test:people`, tarpor `npm run dev`.

## Ekhono nei
Rapier ragdoll (physics diye mara), kapor er fold, saree/salwar/hijab, meye/bachcha, prone (shuye pora), NPC der gun swap/crouch.
