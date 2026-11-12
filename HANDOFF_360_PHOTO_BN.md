# HANDOFF — 360 photo (equirectangular JPEG for Facebook) (evcity)

**Onno AI/developer: age eta poro, tarpor kaj shuru koro.** Rule: Banglish kotha, English code/comment. Prottek step-e changed + notun file zip (`evcity/` path soho). Feature OFF/idle = game ager moto. Notun tsc error 0, notun test FAIL 0 (baseline noise: `docs/j6/05_RULES_AND_TESTS_BN.md`).

## User intent
User game-er 360-degree still photo chay (video na), social media (Facebook) te post korar jonno, jeno shei post-e photo ghorano jay. Chhobi interesting hote hobe (shundor jaygay, shokal/shondhya/raat/brishti, drone uchu theke).

## Status
| ID | Task | Status |
|---|---|---|
| P1 | `src/ui/Photo360.ts`: capture (CubeCamera -> equirect 2:1) + download | TODO |
| P2 | Hide HUD / minimap / toasts while capturing, restore after | TODO |
| P3 | JPEG + GPano XMP metadata (Facebook 360 detect) | TODO |
| P4 | Trigger: HUD/Toolbar button + key (check free key) + Bangla string in `src/i18n/bn.ts` | TODO |
| P5 | Options: time of day, weather, drone height (+100..200 m), EVCity watermark | TODO |
| P6 | Test (pure parts: metadata, size fallback) + doc + zip | TODO |

## Facts from the repo (verified in this zip)
- `src/core/Engine.ts`: `renderer` (WebGLRenderer, antialias, shadowMap PCFShadowMap, pixel ratio from quality `Q.maxDpr`), `scene`, `camera` (PerspectiveCamera), main `renderer.render(scene, camera)` ~line 1228. No EffectComposer / postprocessing found (grep) — still hide any overlay that is drawn on the canvas.
- Shadow map may be set `autoUpdate = false` on low quality (~line 1222): force one shadow update before the 6 faces, restore after.
- Time / weather: `Engine.setTimeMode(m)` (`environment.timeMode`), `src/weather/WeatherSystem`. Use them for the time/weather option and restore the old mode.
- Camera: `src/camera/CameraController.ts` (+ FreeFlyCamera, DriverCamera). Capture position = current camera world position (+ optional height offset); do NOT move the real camera, use a separate `THREE.CubeCamera` at that position.
- HUD: `src/ui/HUD.ts`, `HudSettings.ts`, `Minimap.ts`, `Toolbar.ts`, `Toast.ts`; watermark `src/ui/Watermark.ts` (logo `assets/evcity-logo.png`, `BASE_URL`).
- Keys: `input.wasPressed('KeyX')` in Engine. Already used there: C F J K L M P T U V (P = driver view). Grep ALL of `src/` before choosing a key (suggest `KeyO`, verify free). Also add a Toolbar button (mobile).
- World origin is floating (`world.origin`): camera position for the cube camera must be in the same local space as `scene` (use `camera.getWorldPosition`).

## Design
1. `CubeCamera(near, far, WebGLCubeRenderTarget(size, { type: HalfFloat/UnsignedByte }))`, size 2048 per face (-> 8192x4096 output) with fallback 1024 (-> 4096x2048) if `renderer.capabilities.maxTextureSize` or allocation fails. Use `cubeCamera.update(renderer, scene)`; far = same as main camera far.
2. Cube -> equirect: render a fullscreen quad with a small ShaderMaterial (samplerCube, longitude/latitude from uv) into a 2:1 `WebGLRenderTarget`, `readRenderTargetPixels` in tiles (avoid one huge read), draw to a 2D canvas, `toBlob('image/jpeg', 0.92)`. Mind sRGB / tone mapping: output must match what the player sees (set `renderer.outputColorSpace`, toneMapping same as main).
3. Flip: three.js cube maps are left-handed; check the result is not mirrored (compare against a normal screenshot: text on a sign must read correctly).
4. Metadata: insert an XMP APP1 segment into the JPEG (after SOI) with GPano: `ProjectionType=equirectangular`, `UsePanoramaViewer=True`, `FullPanoWidthPixels`, `FullPanoHeightPixels`, `CroppedAreaImageWidthPixels/HeightPixels` (= full), `CroppedAreaLeftPixels/TopPixels=0`, `InitialViewHeadingDegrees`. Also EXIF Make/Model if Facebook still does not detect (ratio must stay 2:1). Pure function `injectXmp(jpegBytes, meta)` -> unit test (SOI/APP1 layout, length <= 65533).
5. Capture flow (async, one frame at a time): hide HUD (set a `document.body` class / call existing HUD hide), pause weather particles that are screen-space if needed, update shadow, 6 faces, restore everything, even on error (try/finally).
6. Watermark: optional small "EVCity" text/logo baked near the bottom pole region only (a corner watermark is wrong in 360). Default OFF or at nadir.
7. Download: `<a download="evcity-360-<time>.jpg">`. Show Toast "Photo ready".

## Risks
- GPU memory at 2048 faces; mobile may fail: fallback + clear message.
- Floating-point / tone-mapping mismatch (too dark / bright), seam at cube edges (use `generateMipmaps=false`, linear filter).
- Instanced vegetation + LOD: far LOD may pop at the horizon; consider forcing max LOD for the capture frame (Engine quality settings).
- Game cannot be run in the dev sandbox: proof = headless tests for pure parts + user checks in browser (open the JPEG in Facebook / a 360 viewer).

## Do not
Touch game logic, physics, traffic, roads. Overwrite files from old zips (diff instead). Hand-edit generated files.
