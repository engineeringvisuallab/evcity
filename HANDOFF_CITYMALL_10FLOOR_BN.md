# HANDOFF: City Mall 10 tola (atrium, lift, stair, category shajano shop, e-commerce link)

Notun chat-e evcity zip (full repo) attach kore "Part A" paste koro. Tarpor ek chat-e ek step, "Part C" theke.

**Ekhon porjonto: Step C1 done (26 Nov). NEXT: Step C2 (lift + stair).**
Note: C1 sandbox-e network chhilo na, tai `npm run test:mall` ar game-e chalano hoy ni. Sudhu tsc-er syntax check ar geometry-r hisab kora hoyeche. Age tumi `npm run test:mall` chalao, fail hole ami thik korbo.

---

## Part A: Context (prothom message-e paste koro)

```
Ami evcity game-er City Mall 10 tola korar kaj korchi. Project zip attach korlam.
Ami Banglish e likhi, tumio Banglish e, chhoto ar shohoj bhashay uttor dao. Ami coding jani na.

Age HANDOFF_CITYMALL_10FLOOR_BN.md pore nao (Part B, C, Done log). Tarpor src/mall/ (MallSite.ts, MallBuilder.ts, MallManager.ts, MallCatalog.ts, MallInteraction.ts, ProductModels.ts) pore nao.

Niyom:
- Ek chat-e ek step. Shudhu changed file dao (repo path soho, zip kore) ar HANDOFF_CITYMALL_10FLOOR_BN.md update kore dao (Done log + "Ekhon porjonto").
- Step shesh hole tsc syntax check ar scripts/mall-test.ts chalao. Network na thakle ba chalate na parle shetake spashto "chalano hoy ni" likho. Kono decision ami na bolle nijer matha theke nebe na, proshno koro.
- Notun grass/tree toiri korbe na. Mall plot / road / MallSite.ts er MALL_POLY, MALL_BUILDING, MALL_POS bodlabe na.
- Cinema/hospital er moto shob interior-e performance rule (PERFORMANCE_RULES.md) mane cholo.
```

---

## Part B: Decision gulo (ami / tumi ja thik korechho)

Tumi bolechho:
1. City Mall-er shob kichu real e-commerce website-er link-er sathe jukto. Ekhon example link; pore real site.
2. Puro mall 10 tola. Majhkhane 20 m diameter-er ekta gap (atrium), nichtola theke top floor porjonto.
3. Atrium-er upor khola rakha jabe na, glass diye dhaka (nahole bristi ashbe).
4. 2 pashe 2 ta lift, 2 pashe 2 ta stair (prottek pashe 1 lift + 1 stair).
5. Prottek tolay shundor kore jinispotro, category onujayi shajano; product onek, boro shundor kore.

Ami je design nilam (C1, tumi apotti korle bolo):
- **Podium + tower**: ager hall (glass wall road-er bend onujayi, ground concourse) thake 1 tola "podium" hishebe, ucho 4.6 m. Tar upor **tower** = 96 x 64 m block (MALL_SIZE), 10 tola x 5 m = 50 m.
- Ground floor khola (tower 40 ta column-er upor, entrance aisle z=0 te column nai). Tower-er glass wall podium-er roof level (4.6 m) theke roof (50 m) porjonto.
- Floor f-er slab: y = f*5-0.4 .. f*5. Floor 0..9. Slab 0.4 m (MALL_SLAB). Upper floor sudhu tower block-er upor (wings-er upor na).
- Atrium: gol, radius 10 m (MALL_ATRIUM_R), floor 1..9-e slab-e hole. Prottek floor-e glass balustrade + handrail (r = 10.3 m), 24 ta collider piece.
- Roof: collider puro rectangle solid (atrium-er upor-o), dekhte atrium-er hole-e **glass dome** (12 steel rib + 3 ring). Tai bristi/helicopter bhitore dhukbe na.
- `holesFor(f)` (MallBuilder.ts): slab-er hole-er list. C2 e lift/stair-er hole ekhane add korbe.
- Ground floor-e ager 12 zone (8 food, 4 fashion) ekhono ache, 4.6 m ceiling-e adjust kora. C3 e 10 tolay bhag hobe.

---

## Part C: Step prompts (ek ek kore, order-e)

### Step C1: Building shell, atrium, glass roof, floor + collision. DONE (26 Nov)
Dekho "Done log".

### Step C2: Lift + stair (2 pashe)
```
Step C2: HANDOFF_CITYMALL_10FLOOR_BN.md-er Part B ar C2 dekho. Age open proshno gulo ek message-e jiggesh koro (tappable hole bhalo), uttor pele code shuru koro. Tarpor:
1. West ar east, dui pashe (local x ~ -hx+8 ar +hx-8, aisle z=0 theke dure, entrance blocking korbe na) 1 ta stair core + 1 ta lift core. Stair: switchback, prottek tola theke tola, dekhte shiri-r dhap, collider smooth (ramp collider, MallManager.createColliders ramp support ache) + side railing.
2. holesFor(f) e stair + lift shaft-er hole (slab-e), jate upor niche jaowa jay. Hole-er pashe railing.
3. Lift: glass cabin, button (call + floor select, key / click), cabin tola tola e uthe nambe, door khole/bondho, player cabin-er sathe uthbe (cabin-er floor kinematic collider), floor number display. Player cabin-e theke porle na.
4. Floor directory board prottek lift-er pashe (ekhon "Floor N" noam, C3 te department name).
5. mall-test: stair diye walker ground theke floor 9 porjonto uthte pare, lift cabin-e uthe tola change hoy.
```
Open proshno (C2 shuru-te jiggesh): lift-er speed, stair-er wide (1.6 m dhorchi), stair/lift ke ground floor-er kon jaygay (z) rakha.

### Step C3: 10 tolar floor plan + shop layout + catalog
```
Step C3: MallCatalog.ts FLOORS ar CATEGORIES 10 tolar jonno bhag koro (nicher proposal), MallBuilder-e 12 zone-er jaygay prottek tolay ~8 ta shop (category zone) boshao: floor patch, shop-er nam sign (4 m ceiling-e thik size), "সব পণ্য দেখুন" board, dept sign (tola-er nam), tola-r shuru-te directory. Aisle ar atrium edge ar stair/lift core khali rakho. MallManager floor visibility (+-1) thik rakho.
```
Tola bhag (proposal, tumi onumodon koro):
| Tola | Department |
|---|---|
| 0 | Supermarket ar khabar (fruits, bakery, drinks, snacks, dairy, grain, sweets, daily) |
| 1 | Nari fashion |
| 2 | Purush ar shishu fashion |
| 3 | Jutha, bag, ghori, goyna |
| 4 | Mobile ar laptop |
| 5 | TV, audio, camera, gaming |
| 6 | Home appliance ar smart home |
| 7 | Furniture ar bichana |
| 8 | Rannaghor, decor, light, bagan |
| 9 | Khelna, boi, sports, gift (+ food court option) |

### Step C4: Shop-er shajano (fixture), category onujayi
```
Step C4: prottek category-r jonno shop fixture banao (Kit-er moto small helper functions, instanced/merged, PERFORMANCE_RULES.md): khabar-e shelf + fridge + fruit crate, fashion-e hanger rail + mannequin + folded table, electronics-e glass counter + wall TV, furniture-e room set, boi-te bookshelf, ityadi. Notun ProductKind model dorkar hole ProductModels.ts-e add (fridge, mannequin, shelf unit...).
```

### Step C5: Product (onek) + example link
```
Step C5: prottek category-te ~10 ta product (ekhon 3), shob-er example link (SHOP_LINK, your-shop.example.com/product/{slug}). Shelf/rack-e product shajano (turntable sudhu hero product-er jonno). Click = notun tab (MallInteraction.accept range: same floor y +-5). Instanced model dorkar (hajar mesh na). Real site-er link: sudhu SHOP_LINK.baseUrl ar apiUrl bodlabe.
```

### Step C6: Atrium + ground floor decor + wings
```
Step C6: atrium-er ground floor-e fountain / garden island / seating, wings (podium) e plant, bench, info kiosk, entrance polish, outside tower sign, night light (emissive).
```

### Step C7: Performance + test + final
```
Step C7: draw call / triangle ginti, floor visibility (inside: +-1 floor, outside: tower shell sudhu), mobile, scripts/mall-test.ts full chalao, HANDOFF final update.
```

---

## Done log

### Step C1 (26 Nov): shell, atrium, glass roof, floors, collision
**Changed files:**
- `src/mall/MallSite.ts`: MALL_FLOORS 1 -> 10, MALL_FH 14 -> 5, notun MALL_ATRIUM_R = 10, MALL_SLAB = 0.4.
- `src/mall/MallBuilder.ts`: podium (outline wall 4.6 m, doorway 3.6 m + lintel + sign + canopy), wing roof at 5.0 m, 9 upper slab (atrium hole, tile top, trimesh collider), atrium balustrade, 40 ground column, tower glass wall (4 obb) + mullion + floor band (instanced), glass dome + rib, ceiling light (instanced) for floor 1..9, solid roof (collider) + visible roof with hole, ground floor zone sign / pole gulo 4.6 m ceiling-e adjust, `surfaceAt` multi-floor, `holesFor(f)` hook.
- `src/mall/MallManager.ts`: header + start banner text.
- `scripts/mall-test.ts`: notun assert (10 floor, podium/tower wall, roof solid over atrium, 9 floor slab, atrium open, surfaceAt, balustrade walker, floor 9 walker).

**Test:** chalano hoy ni (sandbox-e network + node_modules nai). tsc syntax check (three module bad diye) clean. Geometry hisab (dome base y = 50, railing rotation) python-e check kora.
**Janar jinis:**
- C1-e upor-er tola-e jaowar rasta nai (lift/stair C2). Tai ekhon sudhu bahir theke tower ar atrium dekha jay, ar ground floor-e atrium-er niche dariye upore tarano.
- Upper floor ekhon khali (C3-C5 te bhorbe).
- `MallManager.group.visible` 900 m-e dure gele lukay (C7-e dekhbo tower-er jonno beshi koraa lagbe kina).
- Podium (wings) puro outline-er upor 1 tola; upor-er tola sudhu tower block-er upor.
