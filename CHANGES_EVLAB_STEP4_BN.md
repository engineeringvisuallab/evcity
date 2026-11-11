# EVLab Step 4: Presentation Hall-e green marker

- Mission-er jaiga ekhon real hall-er stage-e, presenter jekhane dnrabe (lectern-er pichone, `PRESENTER`). Ager moto bairer boro (radius 45 m) area ar nei: radius 1.2 m.
- `MissionData.ts`: place = `EVLAB_POS.x + PRESENTER.x`, `BUILDING_Z + PRESENTER.z`, `lift = stage height`. Brief/arrival text update.
- `MissionTypes.ts`: `MissionPlace.lift?` (marker ar paa kotota uchchute).
- `MissionMarkers.ts`: baki mission-er moto-i choto shobuj cylinder (1 m x 1.5 m), shudhu stage-er upor boshe (`groundAt + lift`).
- `MissionManager.ts`: marker-e dhukle (stage-er uchchute, tower-er upor floor-e na) mission automatic shuru (hall overlay khule), protibar ashle ekbar. Marker-e dariye ENTER dile abar khole. Ager "Press ENTER" toast nei.
- `Engine.ts`: `missions.update`-e player-er zomi theke uchchota pass kora hoy (`missionPos`).
- Manush ashar kaj nei (Step 5). Hall overlay ager moto.
- Test: `scripts/mission-test.ts` e marker check add.
