# CHANGES: driver view (P) e samner glass / dot / line fix

## Somossha
Gari te P chaple samner windscreen e black dot, black border, wiper line, ar kisu gari te chokher samne mota slab dekha jhacchilo.

## Ki hoyeche
- Cockpit.ts: windscreen er "frit" (dot + black border) bad. Ekhon shudhu upore halka blue sun-band, baki clear.
- Cockpit.ts: wiper ekhon shudhu brishti te (rain) dekha jay, parked wiper er black line nai.
- Cockpit.ts: headliner (ceiling) er "drop" panel bad. Ceiling glass er line e shesh hoy, chokher samne jhule na (sedan e beige slab chhilo).
- VehicleModel.ts: sedan / hypercar / suprim er roof windscreen er dhal bore niche nemto (lal / carbon slab ba spike). Ekhon roof glass er upor-ei shesh.

## Changed files
src/vehicles/Cockpit.ts, src/vehicles/VehicleModel.ts, CHANGES_DRIVER_GLASS_BN.md

## RUN hoyeche
- npx tsc --noEmit: error nai.
- Headless Chromium e driver-eye render (sedan, jeep, hypercar, evhypar, suprim, pickup, bus, truck, combine, tractor): dot / border / spike chole geche.

## RUN HOY NI
- Pura game e chalano hoy ni (shudhu vehicle model alada render korechi). Brishti te wiper, rat, ar gari bhanga/pora abostha check kori ni.

## Tumi check koro
1. Sedan, jeep, hypercar, evhypar, suprim, bus e P chap: samne clear kina.
2. Brishti hole wiper dekha jay kina.
3. Gari ke baire theke dekho: roof er samner dik thik ase kina (sedan, hypercar, suprim).
