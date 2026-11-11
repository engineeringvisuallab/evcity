# EVLab Step 13: Lake-er pani realistic

## Ki holo
Ager sadharon Phong plane bad. Notun `src/evlab/EVLabLakeWater.ts`: ekta plane (4 vertex), ekta shader, extra render pass nei.
- **Wave:** 2 / 4 / 5 ta chalu wave (14 m theke 0.9 m), gotir hisab deep-water physics (w = sqrt(g k)). Normal tilt kore, mesh nore na. Slope max ~0.2-er niche, tai pani shanto.
- **Reflection / fresnel:** dekhar kon onujayi akash (din/raat-er gradient) ar sun/moon-er glint beshi dekha jay, nijer sobuj-nil rong kom. Ghonta (`hours`) onujayi sun purbo -> dokkhin -> poshchim, raate halka chand.
- **Depth:** quay ar bank-er kache halka ar beshi swochho, majhkhane gobhir ar gaorho.
- **Ripple:** island-er quay ar bairer bank theke ring uthe dure jay ar mishe jay. 4 bridge-er duto pashe-o ripple (high tier). Quay-te halka foam rekha.
- **Performance:** `Q.evlabWater` 0/1/2. Low: 2 wave + fresnel. Medium: 4 wave + quay ripple + foam. High: 5 wave + bridge ripple. Planar reflection / depth pass nei.

## Changed / notun file
- notun: `src/evlab/EVLabLakeWater.ts`, `scripts/evlab-lake-test.ts`
- changed: `src/evlab/EVLabGrounds.ts` (water onsho: plane -> `buildLakeWater`, `setSun`, `setWaterDetail`), `src/evlab/EVLabManager.ts` (2 call), `src/core/Quality.ts` (`evlabWater`, CRLF), `package.json` (`test:evlab-lake`), `HANDOFF_EVLAB.md`
- Step 12-er CRLF file (`Quality.ts`, `Placements.ts`, `placements-test.ts`) ekhane CRLF-e phire deya (age-er zip-e vul kore LF hoye gechhilo, ei zip-e thik).

## Test
- `npm run test:evlab-lake` all ok (wave, ripple, sun, material, uniform, shader balance). GLSL vertex + fragment `glslangValidator` (GLSL ES 3.00, three-er fog/colorspace chunk soho) diye pass.
- `test:evlab-sitters/benches/cyclists/audience/arrivals` ok, `tsc --noEmit` clean, `npm run build` ok.
- `test:placements`: ager theke thaka ekta FAIL ("all 53 spots": cinema, upazila_complex, city_hall) ei step-er sathe somporko nei.

## Browser-e dekho
- Lake-er pani-te halka dheu, quay-r kache ripple, bridge-er pashe ripple, dur theke akash-er mirror, sondhyay/raate rong.
- Sun-er glint ghonta onujayi jaiga bodlay kina.
- Jodi pani beshi stark/dhushor lage: `LAKE_WAVES` amp ba `RIPPLE.slope` komao, `body` rong shader-e.
- Shader browser-e compile na hole console-e error ta pathao.
