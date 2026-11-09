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

## Step 4 (shape thik kora: screenshot er feedback)
- **Kandh:** gol ball (deltoid cap) fele deowa holo. Shoulder joint 57 cm theke 41 cm (`SHOULDER_X = 0.205`), tai haat body r kache. Trapezius slope neck theke kandh porjonto, deltoid ta kandh er line e shesh hoy.
- **Komor er niche pouch:** pelvis ar thigh er shape thik kora (`SkinMath.ts` TORSO / LEG table), groin notch choto.
- **Gola:** matha 3 cm upore (`HEAD_LIFT`), tai neck dekha jay.
- **Hat:** ekta lomba hand + thumb (ager duto blob na).
- **Boot:** ankle-high work boot (toe box + sole + shaft), pant er upore.
- Body er shape ekhon `src/people/BodyParts.ts` e (pure array, three.js lage na). Game, test ar preview sob ekei source theke.
- Triangle: near ~5.1k, far ~2.1k.

## Step 5 (matha: egg theke real head)
- Matha ekhon lofted skull (`BodyParts.ts` HEAD table, superellipse ring): chaoRa 15.6 cm, goviro 19.8 cm, ucha 24.5 cm. Temple chapta, kopal, brow, jaw sharu hoye chin e shesh. Ager egg 19.6 x 25 cm chilo.
- Face: nak (bridge + tip + nostril), thot (upper + lower + mouth line), kan, chokh (shada + iris). Chokh er upor halka palak (rest e 30% bondho, blink e 100%).
- Hair, beard, cap, helmet, topi notun matha r size e fit kora (`HEAD_R` ar topi radius, `HumanBody.ts`). Hair o brow er position real render e ekbar dekhe nio.
- Preview renderer e hair er sudhu ekta approximation dekhechi, tai hair/helmet fit real game e check kora lagbe.

## Files
Step 3 e bodlano: `SkinnedHuman.ts`, `SkinMath.ts`, `HumanAim.ts`, `PersonModel.ts`, `PlayerModel.ts`, `Player.ts`.
Notun: `BodyParts.ts`, `SkinnedHuman.ts`, `SkinMath.ts`, `HumanMotion.ts`, `HumanAim.ts`, `scripts/skin-test.ts`, `scripts/human-test.ts`.
Bodlano: `HumanBody.ts`, `PersonModel.ts`, `PlayerModel.ts`, `Player.ts` (muzzle), `Person.ts`, `PeopleManager.ts`, `CombatSystem.ts`, `package.json`.

## Test
`npm run typecheck`, `npm run test:skin` (body math), `npm run test:human` (bone, aim, reload, blink, LOD), `npm run test:combat`, `npm run test:people`, tarpor `npm run dev`.

## Ekhono nei
Rapier ragdoll (physics diye mara), kapor er fold, saree/salwar/hijab, meye/bachcha, prone (shuye pora), NPC der gun swap/crouch.
