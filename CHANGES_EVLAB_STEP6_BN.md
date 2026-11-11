# EVLab Step 6: mission shesh hole manush uthe door diye chole jay

- **Wiring (Step 5-er jonno-o dorkar chhilo):** ager `enterStage / leaveStage` mission theke kothao call hoto na, tai 3D hall-er manush in-game-e ashto na. Ekhon `PresentationHall` -> `HallStage { enter, end, mood }` -> `MissionManager` (`MissionDeps.stage`) -> `Engine.ts` (`new MissionManager({... stage: {...}})`) -> `EVLabManager`.
  - Hall overlay khulle `enter()` = `enterStage()`: manush ashte shuru kore (Step 5).
  - Hall overlay bondho hole `end()` = notun `EVLabManager.endPresentation()`: audience uthe chole jay. Player jaygay-i thake (teleport nai).
  - Mood: topic/ready = `idle`, pora shuru = `listen`, page bhalo porle = `clap` (1.8 s), bhalo mark = `ovation` (4.2 s), tarpor abar `listen`/`idle`.
- **Chole jawa (`EVLabAudience.dismiss()`):** manush alada alada somoy-e (prothom ~12 s-er moddhe) uthe dnray (hip uthe, pa shoja), row-er legroom-e ghure, ager route ulte diye (aisle -> rear aisle -> door -> ramp-er niche) hete lobby-te chole jay, tarpor remove. Shesh jon-o bahire gele hall hide hoy. Je manush tokhono dhukchhilo se chhut boshe tarpor-i uthe jay; je ekhono dhukeni se ashe-i na.
- **Abar dhukle:** notun mission (ba chole jawar majhkhane abar dhukle) hall khali theke notun kore sobai ashe.
- `EVLabAudiencePath.ts`: `sampleLeave`, `leftAt`, `LEAVE_SPAN`; route-e ulte `rway/rcum`, `leaveDelay`, `riseTime`. `EVLabAudience.ts`: `dismiss()`, `leaving`.
- Test: `npm run test:evlab-audience` (route + leave + model). Tarpor `npm run test:missions`, `npm run test:tower`, `npm run build`.
- **Note:** hall overlay (page overlay, `PresentationHall`) ekhono full-screen opaque, tai mission cholar somoy 3D manush dekha jay na (bondho howar por-i dekha jay). Overlay-ke see-through kora alada step.
