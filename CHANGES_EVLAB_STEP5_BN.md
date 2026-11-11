# EVLab Step 5: Hall-e manush ese bose (real manush)

- Mission shuru (`enterStage` -> `audience.setPresent(true)`) hole hall khali theke shuru. Manush **alada alada somoy-e** (prothom ~16 s-er moddhe) 3 ta door diye dhoke, ramp diye uthe, rear aisle ar aisle diye row-e jay, row-er legroom diye side-e hete nijer seat-er samne dnray, stage-er dike ghure **boshe**. Shobai boshte ~70 s.
- Ager box (body + matha) bad. Notun manush: matha + chul, torso, 2 haat (kandh/kuni/kobji), 2 pa (hip/hatu/pa) ar jutor pata. Hete: pa-haat opposite-e dole, hip nichu-uchu hoy. Boshe: ran cushion-er upor, hatu 90 deg, haat kole. Heading shobshomoy walk-er dike, boshar age stage-er dike ghore.
- `EVLabAudiencePath.ts` (notun, pure maths, three.js lage na): route (door -> ramp -> rear aisle -> aisle -> row lane -> seat), timing, `sample()`. Route kono seat-block-er bhitor diye jay na, pa floor-er sathe uthe-name (rake).
- `EVLabAudience.ts` (notun): 8 InstancedMesh = 8 draw call. Shudhu chola manush (30/s) ar mood cholar somoy boshe thaka manush (24/s) re-pose hoy; sob boshe gele ar kaj nei.
- Mood (Step 6-er age-er moto): `listen` = halka dola + matha nod, `clap` = haat-tali, `ovation` = sobai uthe dnrae + tali (hip uthe, pa shoja). `setPresent(false)` = ekhono sathe sathe remove (chole jawa Step 6).
- `Quality.ts`: notun `hallFill` (low 0.22 / medium 0.4 / high 0.62), `EVLabHall.ts` eta pore `buildAudience(P, seats, Q.hallFill)`-e dey (high = ~1800 jon).
- Test: `npm run test:evlab-audience` (route + model; stub three-e pass kora), tarpor `npm run test:tower`, `npm run test:missions`, `npm run test:quality`, `npm run build`.
- Ekhono nei: mission shesh-e manush uthe door diye chole jabe (Step 6).
