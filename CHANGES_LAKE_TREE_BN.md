# CHANGES_LAKE_TREE — sea-r ekta Wanaka-style autumn gach

## Ki holo
- Notun gach: shobuj gach-er moto na, **ekta ekla gach shudhu sea-te** (shallow pani-te dariye), trunk beka-chora, kichu nera dal, pata gold / orange / rust (autumn).
- Jaygay: world-er **south-west** side (target x -3500, z +3500). Ekhane shallow sea (1-3.5 m gobhir) khuje nearest jaygay boshe; na pele 10 m porjonto gobhir pani-te.
- Normal gach system (chunk / forest atlas) ke chhuyni — alada ekta chhoto module, tai onno gach-er color/physics-e kono effect nai.

## File
- NOTUN: src/vegetation/LakeTree.ts (buildLakeTree, findLakeTreeSpot, LakeTree)
- Engine.ts: import + `readonly lakeTree` + spawnBoats-er por `new LakeTree(world.root, terrain)` + update-e halka batase dolar sway

## Adjust
- Jaygay change: LakeTree.ts `TARGET` {x, z}
- Boro/choto: `this.group.scale.setScalar(1.4)` constructor-e add koro
- Pata aro ghono: `const n = 4 + ...` barao; aro faka: komao
- Rong: `AUTUMN` table

## Check
- Syntax check PASS (TypeScript transpile). Full `tsc` ar game run kora jay ni (node_modules / three nai).
- Gach-er collider nai (boat/player gach-er bhitor diye jete pare) — chaile Rapier trunk collider add kora jay.
