# CHANGES - Mobile version (touch controls, landscape, easy driving) - 2026-11-15

Code + headless UI test done. NOT tried in the real game on a phone (no node_modules / no network in the sandbox: `tsc` of the whole project was not run;
the touch files were type-checked alone with strict + noUnusedLocals, and the UI was tested in headless Chromium at 800x360 with real touch events).

## What changed
- NEW `src/input/TouchControls.ts`: the whole mobile UI (replaces the old 4-button `createTouchControls` in InputManager).
  - On foot: floating joystick (left), push to the edge = sprint, JUMP / USE (F) / FIRE / AIM / TOOLS (B) / CROUCH / RELOAD (right).
  - Car / bike / tank / train driver: STEERING WHEEL (analog, drag to turn, springs back), GAS and BRAKE pedals, F exit, horn, reset, driver view.
    Suprim gets UP / DOWN / BOOST / FLIGHT / DIVE / FLOAT; tank gets a cannon button.
  - EASY MODE (button "AUTO 50", default ON, tap to cycle off / 30 / 50 / 80 km/h, saved in localStorage `evcity.touch.cruise`):
    the car keeps the cruise speed by itself. One thumb steers, the other only brakes. GAS gives full power, BRAKE stops (hold = reverse).
  - Helicopter / jet, boat, passenger (train / plane) and free camera each have their own layout.
  - Menu button (top left) opens every other feature: settings, vehicle call (N), map zoom, sound, day/night, graphics quality, driver view,
    free camera, gears, teleports J K L ; ', mall/farm (O), race (Enter), engineering tour (Y , .), bomb.
  - Portrait: "turn your phone" screen + one-tap button for full screen + landscape lock (Android Chrome). First touch tries it once by itself.
    iPhone Safari cannot lock the orientation: it only shows the hint (use "Add to Home Screen": the manifest asks for fullscreen + landscape).
- `src/input/InputManager.ts`: `touchDrive` (live wheel / pedal / easy-mode state), `tapKey()`, `setTouchMode()`; `?touch=1` in the URL forces the touch UI on a PC (testing).
- `src/vehicles/VehicleManager.ts` `fixedUpdate`: analog steering from the wheel (`steer = -steerAxis`), brake beats gas, easy mode throttles while
  `forwardSpeed < cruiseMps`. Keyboard play is unchanged (the block only runs when `touchDrive.active`).
- `src/core/Engine.ts`: every frame (touch only) picks the layout: free fly / car / air / boat / ride / foot.
- `src/ui/Minimap.ts`: smaller map on touch screens (min 92 px instead of 150). `src/ui/VehicleHUD.ts`: gauge is smaller and centred on touch screens.
- `index.html` + `public/manifest.webmanifest` + `public/assets/icon-192.png`, `icon-512.png`: no zoom, safe-area, fullscreen + landscape web app.

## Check in the game (please)
1. Phone in landscape: walk, enter a car (F), drive with the wheel + AUTO, brake / reverse, exit.
2. Wheel feel: `WHEEL_MAX_DEG` (110) in TouchControls.ts = rotation for full lock; lower = more sensitive.
3. Overlaps with other HUD (tour panel, mission panel, toasts) on a small phone; FPS (use `?quality=low`).
4. `npx tsc --noEmit` and `npm run build` on a normal PC.
