# CHANGES - City Mall Step C5 (27 Nov 2026): product + example link + shelf-e sajano

Bistarito: `HANDOFF_CITYMALL_10FLOOR_BN.md` -> "Step C5 (27 Nov)".

Changed / notun file:
- `src/mall/MallCatalog.ts` (80 x 10 product, notun kind bed / chair / appliance)
- `src/mall/ProductModels.ts` (bed, chair, appliance)
- `src/mall/MallShelfModels.ts` (NOTUN, shelf model)
- `src/mall/MallFixtures.ts` (slots + layoutProducts)
- `src/mall/MallBuilder.ts` (product InstancedMesh, pickList, items)
- `src/mall/MallInteraction.ts` (instance pick, hidden floor skip)
- `src/mall/MallManager.ts`, `src/core/Quality.ts` (mallProducts 50 / 100 / 160)
- `scripts/mall-shops-check.ts`, `scripts/mall-test.ts`
- `HANDOFF.md`, `HANDOFF_CITYMALL_10FLOOR_BN.md`, `CHANGES_CITYMALL_C5_BN.md`
- Agro build fix (ager zip-er moto, ei zip-e abar ache): `src/agro/AgroRooms.ts`, `AgroManager.ts`, `AgroViewer.ts`, `CHANGES_AGRO_PICK_TYPE_FIX_BN.md`

Test: tsc + vite build clean; `npm run test:mall-shops` ALL OK; `npm run test:mall` 8 ta FAIL age-o chhilo (hubohu ek). Browser NOT RUN.
