# CHANGES_GUM_TREE v2 — gum choranor + sob gacher color/look

## Ki holo
1. GUM aro chorano: boro gach-er ~40% ekhon gum (age 26%). Dui shape: `gum` (choru crown, dal beshi chorano) ar `gum2` (lomba, upright, soru crown). Dal-er spread, limbLen, cards barano.
2. Ager gach (sal, segun, koroi etc) NOTUN banai ni, shudhu color thik:
   - pata: beshi ujjol, hue/sat/light variation beshi (halka holud-sobuj theke gaDho sobuj), far LOD (TILE_MASS) o same
   - leafTint: thanda/neutral/gorom sobuj mix
   - bark: kalo-brown theke halka grey-brown, fibre colour variation, moss patch
   - jungle-e gach 30% kalo hoto, ekhon 12% (TreePlacement tint)
3. Lata-pata (jungle floor): fern frond lomba o boro, shrub-e beshi pata + ujjol, lata-r vine beshi (7->9) o lomba, lobed pata boro (0.34 -> 0.42). Card ektu beshi.

## File
TreeTypes.ts, TreeAssets.ts, TreePlacement.ts, TreePreview.ts

## Dhyan dao
- Game/build NOT RUN (node_modules nai). Screenshot dekhe bolo.
- Tomar FPS ager screenshot e 22, 43M triangle: lata/gum card barano ektu cost dibe. Bhari lagle `cards` kom koro (STYLE_GUM/GUM2 5->4, lata/fern 4->3).
- Gum % : TreePlacement `bigKind` er `0.42`.
- Color beshi ujjol/dark: TreeAssets paintSprays light `32 + r()*16` ar paintMass `l` value.
