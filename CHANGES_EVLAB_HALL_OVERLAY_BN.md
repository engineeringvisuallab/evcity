# Presentation Hall overlay: shudhu text, ar samne asol 3D hall-er lok

## Ki thik hoyeche
- Age purono overlay full screen dhake dito: pordar rong, nokol screen, emoji audience, bhitore mic card. Tai asol 3D hall (je lok-ra ese boshe) dekha jeto na.
- Ekhon topic nao-er pore overlay transparent. Shudhu thake: upore choto bar (topic, page, mic), niche 3 line text, ar Back / Next lines button.
- Tumi ja bolo (voice), sei shobdo-gulo sobuj hoy; baki shobdo sada. (Ager moto-i word-matching, `HallScoring`.)
- "Start bolo" card ar result card chhoto: start card niche (text-er thik upore), result card upore, jate samner lok dekha jay.
- Emoji audience, pordar rong, floor, podium, bubble animation shob bad.

## File
- Bodlano: `src/missions/PresentationHall.ts` (buildStage, start/result card, react ekhon shudhu real hall-er mood).
- Notun: `CHANGES_EVLAB_HALL_OVERLAY_BN.md`.

## Test
`tsc --noEmit`, mission-test pass. Browser-e dekhte hobe: mission start -> lok ese boshe (~16 s), samne dekha jay kina, camera-r angle (`faceSouth` elevation 0.16).
