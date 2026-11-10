# CRASH FEEL (collision physics fix), simple English

Problem (from play): a car that hits a wall or a car at speed stops at once; a tree stops it dead; even tiny trees stop it; the road median and the train
behave the same way. Not seen in the game after this change: please test (see "Check in the game").

## What changed
1. Small trees have NO collider (`Config.vegetation.passRadius` 0.16 m trunk radius, `passHeight` 1.0 m): young trees and the small median trees. People, cars and trains go through them. (`TreePhysics.ts`)
2. Medium trees (trunk radius up to `breakRadius` 0.45 m: full palms, broadleaf, slender, debdaru ...) are knocked down by a vehicle faster than `breakSpeed` 4 m/s. The box just ahead of the bumper is checked before the body arrives, the tree falls (`TreeDestruction.crashInBox`), and the vehicle loses speed by momentum (tree mass = 650 kg/m3 x trunk volume, 4 m long): a 1200 kg car keeps about 60 % of its speed after a 0.3 m trunk. Slower than 4 m/s it just bumps. (`VehicleManager.knockTrees`)
3. Thick trunks (oak, bot, shimul, koroi ...) stay solid. A hard hit there still stops the car, but it now rebounds a little, slides if it hits at an angle and takes the normal crash damage.
4. Vehicle collider: friction 0.4 -> 0.2, restitution 0.05 -> 0.25 with the "max" combine rule (`Vehicle.ts` CRASH_FRICTION / CRASH_BOUNCE). A car slides along a wall and rebounds instead of sticking.
5. Road median collider: friction 0.3 -> 0, restitution 0.2: a car that touches the median slides along it and bounces off (`MedianPhysics.ts`). Height still 0.5 m (`Config.city.median.colliderH`).
6. Trains: a moving train (> 2.5 m/s) no longer pushes a vehicle like a wall. On first touch the vehicle is thrown ahead and to the side (`blastPush`, speed 1.1 x train speed + 3 m/s, max 28) and takes heavy damage (`blast`, 35 + 5 x train speed hp, max 120): a fast train wrecks a car. One strike per 2.5 s per vehicle. Train collider friction 0.8 -> 0.1. (`Engine.checkTrainContacts`, `TrainOverlap.ts` now reports direction and car centre)

## Files
New: `scripts/crash-feel-test.ts` (`npm run test:crash`).
Changed: `core/Config.ts`, `vegetation/TreePhysics.ts`, `vegetation/TreeDestruction.ts`, `vehicles/Vehicle.ts`, `vehicles/VehicleManager.ts`, `roads/MedianPhysics.ts`, `trains/TrainPhysics.ts`, `trains/TrainOverlap.ts`, `core/EventBus.ts`, `core/Engine.ts`, `package.json`.

## Tested / not tested
- `tsc` clean. `crash-feel-test` ALL OK (tree classes, momentum). `tree-destruction-test`, `tree-climb-test`, `vehicle-test`, `median-test`, `uturn-test` pass. `train-physics-test` (3 fails) and `tree-physics-test` (2 fails) fail the same as in the zip before the change.
- NOT tested: real Rapier crashes. The feel (bounce, slide, how far a car is thrown by a train) can only be judged in the game.

## Check in the game
1. Drive 60+ km/h into a small / young tree: you should pass through. Into a palm or broadleaf: it falls, you slow down by about 40 %. Into an oak or bot: you stop, rebound, damage.
2. Hit a wall at an angle: slide, not stick. Head on: stop with a small rebound (this is still a rigid wall).
3. Hit the highway median at an angle at speed.
4. Drive in front of a moving train: the car should be thrown away and wrecked.
Tune in `Config.vegetation` (`passRadius`, `breakRadius`, `breakSpeed`, `treeLen`), `Vehicle.ts` (`CRASH_FRICTION`, `CRASH_BOUNCE`) and the train strike numbers in `Engine.ts`.

## Not done
- No real crumple (deformation) of the car body, and a head-on hit on a thick tree or a wall is still a sudden stop (only the rebound is softer). Say if you want a softer stop for those too (it needs a spring-like contact, riskier).
- Pedestrians hit by a train are unchanged.
