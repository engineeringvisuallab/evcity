# J6 INTERCHANGE — Part 2: design decision (Banglish)

Source: `scripts/j6-survey.ts`, `j6-dump.ts`, `j6-design.ts` (real `TerrainGenerator` + `buildInterchange`). Chhobi: `docs/interchange-preview/j6-existing-plan.png`.

## 1. J6 asole ki (frame: u = F6-r dike, v = aar-par; origin = pad J6)
- **F6** highway, 6 lane (3 + 3, laneW 3.5, median 2.4 m), 100 km/h. Heading 51.7 deg. Nijer grade **4-5 %** (pad-er kache; 33.7 m, NE-te uthche, SW-te namche).
- **S4** collector (2 lane, 50 km/h): dokkhin theke (river bridge, v = -100..-160) sojasuji **u = -68** line dhore uttore uthe F6 paar hoye pad-er **uttor stub**-e (0,+40) dhuke.
- **S5** collector: uttor-poschim theke diagonal ese F6 paar hoye pad-er **dokkhin stub**-e (0,-48) dhuke.
- Mane duto collector **ekshathe F6 paar hoy duibar** (u = -68 line-e ar pad-e) — screenshot-er X ar overlap ei jonno.
- Real cross road = **S4 (dokkhin) + S5 (uttor)**, crossing prai **u = -68**, v = 0. Pad-ta (u = 0) mojar-i bonus junction.
- Terrain: **uttore pahar** (v = +60 theke dhal uthche: +8 m at 100 m, +16 m at 150 m, +60 m at 300 m). **Dokkhine nodi-r upotyoka** (-10..-16 m, S4 bridge 32 m, clearance 3.5 m). Nearest onno pad **J57, ~475 m**.

## 2. Engineering decision
| Proshno | Siddhanto | Karon |
|---|---|---|
| Pattern | **Diamond** | Cross road = 2-lane collector (kom turning volume); uttore pahar, dokkhine nodi — cloverleaf/parclo-te cut 24-38 m (headless check), footprint boro. Diamond-er cut/fill chhoto. |
| Kon road upore | **F6 on grade (grade line obikrito)**, **cross road underpass** | F6 6 lane, grade 4-5 % — oke 6.9 m uthale 3D-B risk (sob road-er profile/pad dhonddo). Cross road dokkhin theke already F6 level-er kachakachi (S4 y 25.8 at bridge vs F6 ~31.5): underpass-e namte matro ~1.5 % lage. S4/S5 chhoto road, tai profile override sohoj. "Cross over F6" noy, karon S4-r dokkhin leg nodi-r bhetore namche (6.9 m uthale 100 m-e 13 m namte hoy). |
| Centre | **u = -68** (x = -1773.9, z = -190.4, y_F6 = 31.5) | S4 ekhane sojasuji N-S; bridge-er age porjonto jaygay thake. |
| Design speed | Ramp **50 km/h**, terminal collector **50 km/h** | Collector standard. |

## 3. Design parameter (Standards.ts formula, AASHTO kinematic; e = 0.08)
| Item | Mān | Source |
|---|---|---|
| Ramp min radius 50 km/h | 73 m (diamond ramp asole 203 m) | V^2 / 127(e+f), f=0.19 |
| Decel (100 -> 50 km/h, a = 2.5) | 116 m + taper | `decelLength` |
| Accel (50 -> 85 km/h, a = 1.2) | 152 m | `accelLength` |
| Nose / gore distance | 240 m (default), pore 200 m kora jete pare | footprintR 264 m |
| Stopping sight distance 100 km/h | 183 m | `stoppingSight` |
| Clearance | 5.5 m + deck 1.4 m = **6.9 m** F6 deck-er neeche cross road-er surface | `INTERCHANGE_DEFAULTS` (min 4.6 validator) |
| Ramp max grade | 5 % | `rampMaxGrade` |
| Cross road (underpass) grade | <= 5 % ( S4 maxGrade 10 % er niche) | |
| Terminal distance F6 axis theke | default 75 m; **J6-te ~62 m prostab** (S4 bridge v = -100-e shuru, terminal pad (~20 m) bridge-er 15-20 m age sheshe) | Part 3-e check |

## 4. Candidate check (real model, ground = real terrain)
| Candidate | Issue | Ramp cut/fill (max) | Kothin |
|---|---|---|---|
| Diamond, F6 over | none | cut 18 m / fill 9 m | flat-ground level plan F6-r asol profile theke **10.3 m** alada |
| Diamond, cross over | none | cut 12 / fill 11 m | S4 nodi-leg-e unfeasible (upore dekho) |
| Parclo | none | **cut 37 m** | pahar |
| Cloverleaf | none | **cut 38 m** | pahar |

## 5. Engine-e ekta dorkari kaj ber holo
`Levels.ts` **flat-ground** dhore (y0 ekta songkha). F6 grade 4-5 %, tai level plan asol F6/ground theke 8-10 m dure cholche. J6-te chalate hole notun **grade-following level plan** lagbe: lower (cross) road = F6 profile - 6.9 m at crossing, 5 % e ground-e fire ashe; F6 nijer profile-i thakbe. Eta handoff-e notun **Part 5a**.

## 6. Ekhono jana nai / porer part-e check
- Terminal V (62 m) bridge-er sathe fit kina (Part 3).
- Underpass-er sag-e drainage (inlet/pump) — Part 6.
- Uttor leg: S5 diagonal theke u = -68 line-e realign (curve R >= 73 m) ar pahar-er cut/retaining wall — Part 6.
- J57-er (475 m) shathe nose overlap: footprint u ∈ [-308, +172]; Part 3-e check.
