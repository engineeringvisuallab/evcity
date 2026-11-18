# CHANGES: P key = first person (on foot)

## Ki hoyeche
- P chaple (pa diye hete / dourai / lafai) camera player er real chokh e jay. P abar chaple orbit (third person).
- Mouse / touch drag: charidik dekha, pitch limit +-85 deg. W A S D camera er dik e chole (orbit.yaw ke FirstPersonCamera sync rakhe, tai Player ar Combat kono change charai kaj kore). Player er mukh camera yaw er dike ghore.
- Model hide: body, matha, haat, gun, chhata invisible (colorWrite / depthWrite off, material clone), shadow thake.
- Near plane 0.22 m (Config.firstPerson.near). Chokh er position: feet + 1.62 m, C (crouch) dhorle 0.5 m niche.
- Obstacle: matha theke chokh porjonto choto Rapier ray (nijer body bad), ar orbit camera r moto terrain height clamp.
- Gun: left mouse fire, right mouse aim (lens 40% narrow), accuracy ager moto (CombatSystem unchanged).
- Gari te P ager moto DriverCamera (unchanged).
- Toast Bangla (bn.camera.firstPersonOn / firstPersonSwim), touch button label "চোখের ভিউ (P)", Settings help line, README P row.

## Auto exit rule (ekta shohoj rule)
Gari / heli / boat / train / plane e uthle, free-fly (V / tour), swimming, ground loading: first person off, **orbit camera te** fire asbe. Abar chaile P chapte hobe. (Age mode mone rakha hoy na, karon onek exit path ase.)

## Changed files
src/camera/firstPersonMath.ts (new), src/camera/FirstPersonCamera.ts (new), src/camera/CameraController.ts, src/characters/Player.ts, src/characters/PlayerModel.ts, src/core/Config.ts, src/core/Engine.ts, src/i18n/bn.ts, src/input/TouchControls.ts, src/ui/SettingsMenu.ts, README.md, package.json (test:first-person), scripts/first-person-test.ts (new), CHANGES_FIRST_PERSON_BN.md

## RUN hoyeche
- scripts/first-person-test.ts (math: look dir = walk forward, pitch +-85, body heading, eye height, aim lens): 23 PASS, 0 FAIL (node --experimental-strip-types diye).

## RUN HOY NI
- npm run typecheck / npm run build: node_modules nei (three, rapier). Shudhu tsc partial check: amar file e real error nai, shudhu 2 ta "implicit any" jeta three type na thakar karone (PlayerModel traverse callback), asol project e jabe na.
- npm run test:tower, scripts/mission-test.ts: chalano hoy ni.
- Game e chalano hoy ni: camera pos = player eye, model hide + shadow, gun aim zoom, auto exit gulo tumi game e check koro.

## Tumi check koro
1. Hete P chap: chokh theke dekha, mouse ghure, WASD thik dike.
2. Dewal / pahar er kache: camera dhuke na.
3. B diye gun nao, right click aim (zoom), left click fire.
4. Gari / boat e uth: orbit e fire ase. Pani te namo: toast + orbit.
5. Shadow e player dekha jay kina (hidden body er shadow).
