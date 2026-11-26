# Building interior (real-er moto) - handoff

Kaj: ekta ekta building kore interior real-er moto kora. Prottek building e: ghor/room, asol-er moto furniture, ceiling light, notice, sign.

## Kora hoyeche
1. **Clinic** (`health.ts` -> `buildClinic`): `k.storeys(0.46, 2, { furnish: furnishClinic })`
   - `ClinicInterior.ts`: ground floor = reception, waiting chair, water cooler, scale, 3 room (doctor, treatment, pharmacy + toilet); upor tola = ward (hospital bed, curtain, drip stand, bedside table, bathroom) + nurse station.
   - `MedFurniture.ts`: notun furniture library (hospitalBed, examCouch, ivStand, receptionDesk, waitingRow, doctorDesk, officeChair, sideChair, medCabinet, trolley, weighScale, waterCooler, wallCross, curtain, ceilingLight, noticeBoard). Shudhu boro body solid, chhoto detail solid na (collider kom).
   - Test: `node --import ./scripts/img-stub.mjs --import tsx scripts/clinic-interior-test.ts` (91 solid, furniture overlap 0).

## Baki (ek ek kore)
- Hospital, diagnostic, school/college, bank, office, hotel, restaurant, pharmacy, supermarket, thana, fire station, post office, mosque/temple/church, court, DC office, city hall ...
- apt-slim-14 er uporer 2 floor ekhono solid.
- Furniture library `Furniture.ts` (bari) ke o ei MedFurniture er moto detail diye upgrade kora.

## Janar jinis
- Browser e ekbar dekha lagbe: furniture size, stair er pashe jayga, ceiling light.
- Performance: boxVisual merge hoy, tai draw call barbe na; model shudhu kache gele build hoy.
