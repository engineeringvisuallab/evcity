# Ghono jangal e bash jhar 3-5 gun lomba

- Ghono jangal (dense jungle) er bhitore bash jhar (bamboo clump) ager cheye **3-5 gun uchu**, prottek jhar e alada random (`Config.vegetation.bamboo.jungleTall` = [3, 5]).
  Ager jhar ~8-14 m chilo, jangal e ekhon ~25-65 m (average ~45 m). Jangal er kinar e kom, bhitore puro (jungle density 0.1 theke 0.6 porjonto dhire dhire barbe).
  Jangal er baire er jhar (gram, pukur par, grove) ager moto-i.
- Chowra: height er motoi 3-5 gun na, ar kom bare (`treeWidth` in `TreeTypes.ts`: height scale 1.2 er upore width ~ scale^0.4). Tai jhar ta shoru-lomba thake.
  Collider (radius), kete fela (falling) ar draw sob jaygay ei width use hoy.
- Jhar er sonkhya (bambooShare) bodlay ni.

## Files
`src/core/Config.ts`, `src/vegetation/TreeTypes.ts`, `src/vegetation/TreePlacement.ts`, `src/vegetation/TreeChunkBuilder.ts`, `src/vegetation/TreePhysics.ts`,
`src/vegetation/TreeDestruction.ts`, `scripts/bamboo-tall-test.ts`.

## Test
`npx tsc --noEmit` OK. `npx tsx scripts/bamboo-tall-test.ts`: jangal e jhar scale 2.2-5.6 (avg 3.7), baire avg 0.95.
