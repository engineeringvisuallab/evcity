# Minimap: real road dekha jay na (close zoom) - fix

## Keno dekha jaitcilo na
- Minimap-er road chhobi ekta 1024 px picture-e ek-bar aka hoy (~10 m = 1 pixel). Close zoom (600 m) e road jhapsa ar chhoto.
- Tar upore zone rong (komola / lal / shobuj) 42-53% opacity diye dhaka porto, tai road haray jaitcilo.
- Ground-level J1 (pad + 4 lane zone) road list-e nei, tai oi picture-e kono din e chhilo na.

## Ki change holo
- `src/ui/Minimap.ts`: notun `drawRoads()`. Real road (ring, R6/R4/R2, city street, bridge) vector line hishebe, asol width-e, zone rong-er UPORE draw hoy. Kalo outline + rong core (freeway komola, primary halka holud, baki sada, bridge magenta). Khub chhoto road-o minimum 2.2 px thake.
- J1-er 4 ta arm (centre theke 315 m) o ekhon dekha jay.
- Shudhu close (U key er 1st) ar medium zoom-e vector draw hoy. Whole-world zoom-e age-r moto picture (performance-er jonno).
- `src/core/Engine.ts`: Minimap-ke `terrain.roads` deya holo (1 line).

## Check
- `npx tsc --noEmit`: PASS.
- Game cholaye chokh-e dekha: NOT RUN (ei chat-e browser nei).
