# Minimap: notun 1000 m zoom option

## Ki holo
- Minimap-e 4 ta zoom: kache (600 m) -> **1000 m (notun)** -> majhari (6 km) -> pura map. U key chaple ei order-e ghore.
- Settings menu-r "মিনিম্যাপ জুম"-e notun button "১০০০ মি" (4 ta button).
- 1000 m zoom-e real road (vector) o dekha jay (age-r road fix-er sathe).

## File
- `src/ui/Minimap.ts`: ZOOM_SPANS = [600, 1000, 6000, 10600]; vector road ekhon pura-map chhara sob zoom-e.
- `src/core/Engine.ts`: U key 4 step (age 3), + age-r minimap road fix (terrain.roads pass).
- `src/ui/HudSettings.ts`: save-kora zoom 0..3 grohon.
- `src/ui/SettingsMenu.ts`: notun button + 4 column.

## Note
- Age save kora zoom number change hote pare (purano "majhari" ekhon "১০০০ মি" dekhabe). Ekbar zoom bodle nile thik.
- Ei zip-er Minimap.ts ar Engine.ts-e age-r MINIMAP_ROADS fix o ache (cumulative).

## Check
- `npx tsc --noEmit`: PASS. Game-e chokh-e dekha: NOT RUN.
