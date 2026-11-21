# CHANGES_REAL_TREES v1 — Step 1: 4 ta jhopalo gach real korano

## Ki holo
`broadleaf`, `oak`, `vase`, `slender` (TreeAssets.ts STYLE_ROUND / OAK / VASE / SLENDER) notun shape:
- trunk lomba ar nongra (8-10.5 m), pata-r dal onek upore (startFrac 0.5-0.65)
- dal kom (primary 4-5), `simple: true` (dal-pala multiplier nai), pata-clump kom (cards 3)
- pata = gum-er jhulonto pata (TILE_GUM, halka grey-green, lime na) -> fanke akash dekha jay
- gum, gum2, sal, segun ar baki kind chhuiyni

## Triangle (near LOD, measured)
broadleaf 7946 -> 2090, oak 8080 -> 1874, vase 6218 -> 1838, slender 6304 -> 1666

## Ar je file
TreePlacement.ts (SMALL_H height 9.4.. -> 15..), TreeTypes.ts (TREE_TRUNK climb height + r)

## Check
- `tsc --noEmit` PASS
- scripts/tree-test.ts: ager moto-i 854757 PROBLEMS (original zip-eo same, amar change-er karon na)
- Game / preview-trees.html browser e RUN HOY NI. Tumi dekhe bolo.

## Adjust
- Aro faka: cards 3 -> 2; aro bhora: cards 4
- Pata boro/choto: `card: [..]`; gum-er moto na chaile leafTile line muche dao
- Gach choto lagle trunkH / crownY komao
