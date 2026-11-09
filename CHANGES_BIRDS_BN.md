# Pakhi (birds): real shape + notun jati + single pakhi

Agey pakhi chhilo ekta bipyramid body + tikon dana (4 jati, shob flock). Ekhon `src/birds` notun kore lekha: **10 ta jati**, protita ekta asol pakhir moto shape, ar **single (ekla) pakhi** ache.

## Shape (`BirdShapes.ts`, `BirdModel.ts`)
- **Body**: smooth loft -- buk, peter, gola (neck), gol matha. Rong protita jaygay alada (pith, pet, gola, matha, buk).
- **Thot (beak)**: jati onujayi -- lomba suru (bok/egret/heron), bonka (cheel, eagle, tia), mota (kingfisher), boro casque shoho (hornbill).
- **Chokh**, **lej** (forked = ababil, wedge = tia/eagle, gol = ghughu), **pa** (lomba pa pechone jhule thake = egret/heron, baki-der chhoto pa + angul).
- **Dana**: bahu + pankhor (secondaries) + coverts. Boro pakhi-der (kite, eagle, crow, dove, egret, heron, hornbill) dana-r agay **alada alada pankh (fingered primaries)**, jemon asol cheel-eagle-er dana-te dekha jay.
- Prottek vertex-er rong ache (plumage) -- instance-er rong shudhu halka tint dey, tai ek jatir pakhi ek-e rong na.

## 10 ta jati
| Jati | Dhoron | Kotha (flight) |
|---|---|---|
| Daak (house crow) | flock | kalo + dhushor gola/buk, 6-12 ta |
| Boga (great egret) | flock | shada, holud thot, pa pechone |
| Ababil (barn swallow) | flock | nil pith, morcha-rong gola, deep fork lej, druto |
| Kobutor (pigeon) | flock | nilche-dhushor, shobuj-beguni gola |
| Tia (rose-ringed parakeet) | flock | shobuj, lal bonka thot, onek lomba lej |
| **Cheel (Brahminy kite)** | **ekla** | khoyeri pankh + shada matha, uchute ghure ghure (thermal) |
| **Eagle (sea eagle)** | **ekla** | shada matha/pet/lej, dhushor pith, boro dana, ghure |
| **Machranga (kingfisher)** | **ekla** | nil pith, khoyeri matha, lomba lal thot, nichu diye druto |
| **Shada-bok / Dhushor bok (grey heron)** | **ekla** | dhushor, shada matha-gola, kalo pankh, dhire gombhir dana |
| **Dhonesh (hornbill)** | **ekla** | kalo-shada, boro holud thot, lomba shada-pranto lej |

## Flight (`BirdManager.ts`)
- Prottek jati-r nijer species mesh (shorbochcho 10 draw call). Wing flap vertex shader-e: pankh-er dogay deri hoy (asol downstroke-er moto), upor-nichu hole dana chhoto dekhay, ar glide/flap alternate kore.
- `soar` (cheel, eagle): thermal-e boro britto-e ghure, dana prai sthir, majhe majhe flap. `dart` (machranga): druto turn, nichu diye. `cruise` (heron, hornbill): shanto shoja flight. `flock`: age-r moto.
- Quality preset: flock shongkha age-r moto (4 / 8 / 12), single pakhi = prai 3/4 gun (**3 / 6 / 9**). Low preset-eo cheel, machranga, eagle thake. Tia ar heron/hornbill medium+ e ashe.
- Pahar/ground-er upor dhukbe na (age-r moto terrain follow), player-er 1.3 km-er moddhe thake.

## Notun/bodlano file
`src/birds/BirdShapes.ts` (notun), `BirdModel.ts`, `BirdManager.ts` (puro notun), `index.ts`, `scripts/bird-test.ts`, `src/core/Engine.ts` (shudhu ekta comment). `BirdManager`-er public API ager moto (`update`, `positionOf`, `total`, `flockCount`, `dispose`), shathe `soloCount`, `speciesCount`, `kindOf`.

## Test
`npm run test:birds` -- shob jati-r shape (vertex valid, wingspan 1, wing weight 0..1, ful polygon < 1400), dui pasher dana mirror, 6 minute simulation (pahar-e dhuke na, 1.5 km-er moddhe, 1 ms-er kom).
