# U key: pura game-er map (full-screen)

## Ki holo
- `U` chaple full-screen map khole (pura world, tomar marker shoho). Abar `U` / `Esc` / ✕ chaple bondho.
- Mouse wheel = zoom (cursor-er jayga dhore). Wheel-click ba left-click chepe tene = map sorano.
- Phone: dui angul = pinch zoom, ek angul = tana. 📍 button = tomar jaygay ferot.
- Khola obosthay mouse lock chhere dey, bondho hole abar lock nei.
- `Shift+U` = ager minimap zoom cycle (Settings-er button-o ache). `M` = mute, kichu bodlay ni.

## File
- `src/ui/Minimap.ts`: full map ALADA canvas-e (`fullCanvas`). Chhoto minimap ager moto shob somoy thake, U chaple bondho hoy na. Ekoi drawing code duibar chole (`paint`). Marker size span theke ber hoy (`zl`).
- `src/core/Engine.ts`: U = toggle, Shift+U = zoom cycle, mouse lock handoff.
- `src/ui/SettingsMenu.ts`, `src/input/TouchControls.ts`: shudhu label.
- Chhuini: Config.ts, RoadNetwork.ts, rail, ring, J1.

## Check
- tsc (offline, node_modules chhara): amar edit-kora file/jayga-e error 0. Baki error shob "module nai" (three/rapier install nai), amar noy.
- Headless run: NOT RUN. Browser-e chokhe dekha: NOT RUN. Pinch/wheel/middle-drag: NOT RUN.
- Note: map-er base chhobi 1024px, tai onek zoom in korle blur dekhabe; road vector tai sharp thakbe.
