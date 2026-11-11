# EVLab Tower v1.3 (Phase A): tower main game e boshano

## Ki holo
- Tower (podium + lobby + Presentation Hall + 68 level + stair + glass lift) ekhon main game e ache. `src/core/Engine.ts` e shudhu 4 ta chhoto hook (import, field, create, update, dispose).
- Missing 5 ta module notun kore lekha holo (v1.2 repo te chilo na): `EVLabParts`, `EVLabTextures`, `EVLabHall`, `EVLabGrounds`, `EVLabAudience`.
- `tsc` clean, `vite build` ok, `scripts/evlab-tower-test.ts` all ok, `mission-test` ok, `evlab-site-test` ok.

## Overlay kibhabe
1. Repo root e ei zip extract koro (shudhu notun/bodlano file ache, kono file delete hobe na).
2. `src/core/Engine.ts` repo commit cc921e9 er opor based. Jodi tumi Engine.ts por e bodle thako, zip er Engine.ts boshiyo na. Tar bodole `patches/engine-evlab.patch` apply koro: `git apply --ignore-whitespace patches/engine-evlab.patch`.
3. `package.json` e `scripts` e ekta line add koro: `"test:tower": "tsx scripts/evlab-tower-test.ts",`
4. `npm run typecheck` ar `npm run test:tower` chalao.

## Ekhono baki (Phase B)
- Mission pin ekhono puran jaygay (plot er gate, z -60). Hall mission er Enter eto 2D overlay hall khole, 3D stage e na. 3D stage er jonno MissionManager e `stage` hook (enter/leave/showSlide/audience) ar Player e `faceHeading` lagbe, duto-i v1.2 e chilo, repo te nai.
- Browser e chalie test (Step 4): lift, stair, fps (Step 5).
- Hall er audience 1792 jon, hall ~78k tri (shudhu kache gele draw hoy).
