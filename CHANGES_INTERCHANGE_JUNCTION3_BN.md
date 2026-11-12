# 3-way at-grade junction (flyover chhara), standalone

3 ta 6-lane highway 3 dik theke ek level-e mile (T = 0/90/180 degree, Y = 120 degree). Road-e boshate hoy na.

- `src/interchange/Junction3Geometry.ts` — pure math (three nai): arm angle, pad outline, corner fillet (kerb radius 30 m).
- `src/interchange/InterchangeView.ts` — `buildJunction3Object({ kind: 'T' | 'Y', cornerR?, armLength? })` -> Group: pad, 3 arm, median island, edge line, lane dash, stop bar (left-hand traffic).
- `scripts/junction3-test.ts` — `npx tsx scripts/junction3-test.ts`: outline star-shaped, area positive, 1 pak ghure.

Chokhe dekha hoy ni (three nai). Viewer artifact-e "T 3-way" / "Y 3-way" button.
