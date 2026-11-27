# CHANGES - Agro PickInfo type fix (27 Nov 2026)

GitHub Actions build fail: TS2352 (AgroManager.ts:97, AgroViewer.ts:102) + TS2430 (AgroRooms.ts:6).

Karon: Mall C2 `PickInfo`-te `action?: PickAction` (object) add hoyechhilo, Agro-r `AgroPick.action` string, tai conflict.

Files:
- `src/agro/AgroRooms.ts`: `AgroPick extends Omit<PickInfo, 'action'>`
- `src/agro/AgroManager.ts`: `p as unknown as AgroPick`
- `src/agro/AgroViewer.ts`: `k = p as unknown as AgroPick`
- `HANDOFF.md`, `CHANGES_AGRO_PICK_TYPE_FIX_BN.md`

Check: `npx tsc --noEmit` OK, `npx vite build` OK.
