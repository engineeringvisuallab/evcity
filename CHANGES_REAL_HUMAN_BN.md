# Real manus step 1: skinned body (smooth joint) + natural walk

## Ki bodlalo
- `src/people/SkinnedHuman.ts` (notun): manus ekhon ekta continuous `SkinnedMesh`, 17 ta bone (Mixamo nam: mixamorigHips, Spine, Spine2, Neck, Head, Left/RightArm, ForeArm, Hand, UpLeg, Leg, Foot). Kolchi, kuni, kandh e ar gap/overlap nei, joint skin er moto bend hoy.
- `src/people/SkinMath.ts` (notun): body er ring table, tube builder, skin weight (pure math, three.js lage na).
- `src/people/HumanMotion.ts` (notun): natural gait. Pelvis twist, shoulder counter-rotation, matha steady, pa heel->toe roll, stance pa er upor hip bob (pa ar bhashe na), idle e breathing + weight shift + majhe majhe pashe takano.
- `src/people/HumanBody.ts`: `buildHuman` ekhon skinned body dey. Rig interface same (pivot, armL, foreL, legL, shinL...) tai `PlayerModel`/`PersonModel`/gun/umbrella/farm work/seated/fall sob agey r moto kaj kore. Extra bone gulo optional field (spine, chest, neck, head, handL/R, footL/R).
- `PlayerModel.ts`, `PersonModel.ts`: gait/relax call, type `Group` -> `Object3D` (bone er jonno).
- Gun ekhon hand er grip e (`HAND_GRIP_Y = -0.31`).

## Fallback
`src/people/HumanBody.ts` er `USE_SKINNED_BODY = false` korle ager rigid body fire ashe.

## Numbers
- Body ~4k triangle (tube 1932 + head, hand, shoe), 1 shared geometry per body type (slim/average/stocky), 7 material group.
- Hair, beard, cap, helmet, topi: head bone er static mesh. Vest stripe: chest bone er static mesh.

## Test
`npm run test:skin` (tube closed + outward, index valid, weight sum = 1). Sobar age `npm run typecheck` ar `npm run dev` e dekhe nao.
