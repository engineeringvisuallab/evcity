// STEP 18.4 (headless, pure numbers): SUBSTRUCTURE + FOUNDATIONS of the island strait bridge IB (abutments, pylon piers, bearings, joints, piles, scour, seismic run, unbalanced saddle force).
// Reads: docs/island_bridge_basis.json (18.2), docs/island_bridge_sizing.json (18.3), docs/island_link_profile.json (sea floor), IslandLinkData (deck level). Changes nothing in src/.
// Run: npx tsx scripts/island-bridge-substructure.ts <docs-dir> [--set ID=value ...]   writes <docs-dir>/STEP184_OUTPUT.txt and <docs-dir>/island_bridge_substructure.json
// DECISION recorded: the road is NOT raised, the girder stays 3.0 m deep (18.3). The SOIL is ASSUMED (the game has no soil data). Hand formulas + small FE solvers (pile on Winkler springs).
// STATUS (2026-11-15): WORK IN PROGRESS, PARTIAL FILE. Only the header, the ASSUMPTIONS table and the inputs from 18.2 / 18.3 exist. NO check, NO output writing yet. See HANDOFF_ROAD_DESIGN.md step 18.4.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ISLAND_LINK_DATA as LINK } from '../src/roads/island/IslandLinkData';

const args = process.argv.slice(2);
const out = args[0] && !args[0].startsWith('--') ? args[0] : 'docs';
mkdirSync(out, { recursive: true });
const over: Record<string, number> = {};
for (let i = 0; i < args.length; i++) if (args[i] === '--set' && args[i + 1]) { const [k, v] = args[++i].split('='); over[k] = parseFloat(v); }
const B = JSON.parse(readFileSync(`${out}/island_bridge_basis.json`, 'utf8'));
const Z = JSON.parse(readFileSync(`${out}/island_bridge_sizing.json`, 'utf8'));
const PROF = JSON.parse(readFileSync(`${out}/island_link_profile.json`, 'utf8'));

const L: string[] = []; let pass = 0, fail = 0; const failed: string[] = [];
const pr = (s = '') => L.push(s);
const chk = (name: string, ok: boolean, val: string) => { if (ok) pass++; else { fail++; failed.push(name); } pr(`  ${ok ? 'PASS' : 'FAIL'}  ${name}   ${val}`); };
const f0 = (x: number) => x.toFixed(0), f1 = (x: number) => x.toFixed(1), f2 = (x: number) => x.toFixed(2), f3 = (x: number) => x.toFixed(3);
const G = 9.81;

// ------------------------------------------------------------------ ASSUMPTIONS (--set ID=value)
interface A { id: string; v: number; unit: string; text: string; src: string }
const ASSUME: A[] = [
  // soil: ASSUMED, no data in the game. Layers below the ORIGINAL sea floor.
  { id: 'SU1', v: 30, unit: 'kPa', text: 'layer 1 (0 to TH1 m below the sea floor): soft silty clay, undrained strength', src: 'ASSUMED typical delta clay; NO soil data in the game. A soil investigation must replace it' },
  { id: 'TH1', v: 12, unit: 'm', text: 'thickness of layer 1', src: 'ASSUMED' },
  { id: 'PHI2', v: 30, unit: 'deg', text: 'layer 2 (next TH2 m): medium dense silty sand, friction angle', src: 'ASSUMED' },
  { id: 'TH2', v: 20, unit: 'm', text: 'thickness of layer 2', src: 'ASSUMED' },
  { id: 'PHI3', v: 35, unit: 'deg', text: 'layer 3 (below): dense sand, friction angle', src: 'ASSUMED' },
  { id: 'GAM1', v: 7, unit: 'kN/m3', text: 'submerged unit weight of layer 1 (clay)', src: 'ASSUMED' },
  { id: 'GAM2', v: 9, unit: 'kN/m3', text: 'submerged unit weight of layer 2', src: 'ASSUMED' },
  { id: 'GAM3', v: 10, unit: 'kN/m3', text: 'submerged unit weight of layer 3', src: 'ASSUMED' },
  { id: 'ALPHA', v: 0.8, unit: '-', text: 'adhesion factor alpha of the clay (shaft friction = alpha su)', src: 'ASSUMED (alpha method, soft clay)' },
  { id: 'BETA2', v: 0.30, unit: '-', text: 'beta of layer 2 (shaft friction = beta sigma_v\')', src: 'ASSUMED (typical 0.2 to 0.4 for medium sand)' },
  { id: 'BETA3', v: 0.45, unit: '-', text: 'beta of layer 3', src: 'ASSUMED (dense sand)' },
  { id: 'FSMAX', v: 100, unit: 'kPa', text: 'upper limit of shaft friction in sand', src: 'ASSUMED (typical cap for driven piles)' },
  { id: 'NQ', v: 30, unit: '-', text: 'end bearing factor Nq of dense sand (q_b = Nq sigma_v\', limited)', src: 'ASSUMED (driven, phi 35)' },
  { id: 'QBMAX', v: 6000, unit: 'kPa', text: 'upper limit of the end bearing', src: 'ASSUMED' },
  { id: 'GRP', v: 1.6, unit: '-', text: 'resistance factor on the calculated pile resistance (ULS load <= R_calc / GRP)', src: 'ASSUMED (no Bangladesh national annex; typical Eurocode 7 order for no pile load test)' },
  { id: 'NH2', v: 6000, unit: 'kN/m3', text: 'horizontal subgrade modulus rate nh of layer 2 (E_py = nh z)', src: 'ASSUMED (medium dense, submerged)' },
  { id: 'NH3', v: 12000, unit: 'kN/m3', text: 'nh of layer 3', src: 'ASSUMED' },
  { id: 'EPYC', v: 150, unit: '-', text: 'E_py of the clay = EPYC x su', src: 'ASSUMED (soft clay, cyclic)' },
  { id: 'DP', v: 1.8, unit: 'm', text: 'pile outer diameter (driven or drilled-in steel tube pile, concrete filled)', src: 'DESIGN CHOICE' },
  { id: 'TP', v: 0.032, unit: 'm', text: 'pile wall thickness', src: 'DESIGN CHOICE' },
  { id: 'CORR', v: 0.003, unit: 'm', text: 'wall lost to corrosion in 120 years (total of the wall)', src: 'ASSUMED (buried / submerged zone; the splash zone is above the cap)' },
  { id: 'SPC', v: 3, unit: '-', text: 'pile spacing in pile diameters', src: 'DESIGN CHOICE (EN 1997 usual minimum 2.5 to 3 D)' },
  { id: 'EFFH', v: 0.7, unit: '-', text: 'lateral group efficiency (shadowing of the rows)', src: 'ASSUMED' },
  { id: 'CAPT', v: 3.5, unit: 'm', text: 'pile cap thickness', src: 'DESIGN CHOICE' },
  { id: 'CAPDEP', v: 2.0, unit: 'm', text: 'cap top below the ORIGINAL sea floor (cap bottom then reaches about the design scour depth)', src: 'DESIGN CHOICE; cofferdam construction' },
  { id: 'PW', v: 4.0, unit: 'm', text: 'pier shaft width along the bridge axis (faces the current and the waves)', src: 'DESIGN CHOICE (leg base 3.0 m + 0.5 m each side)' },
  { id: 'PL', v: 6.0, unit: 'm', text: 'pier shaft length across the bridge (oval, semicircular ends)', src: 'DESIGN CHOICE (leg 2.2 m across)' },
  { id: 'FCK', v: 50, unit: 'MPa', text: 'concrete cylinder strength of piers and caps (C50/60, marine XS3, 120 yr)', src: 'DESIGN CHOICE' },
  { id: 'GC', v: 1.5, unit: '-', text: 'partial factor concrete', src: 'EN 1992 recommended (typed, not re-read)' },
  { id: 'MG', v: 0.1, unit: 'm', text: 'marine growth thickness on each side of the pier (added to the width for wave and current)', src: 'ASSUMED (18.2 did not add growth)' },
  { id: 'SS', v: 2.65, unit: '-', text: 'relative density of the armour stone', src: 'ASSUMED granite / basalt' },
  { id: 'KISB', v: 1.5, unit: '-', text: 'Isbash pier factor K (round-nose pier)', src: 'typed from memory of HEC-23 (NOT re-read)' },
  { id: 'SIGB', v: 30, unit: 'MPa', text: 'average contact pressure limit of the PTFE sliding disc of the bearings', src: 'ASSUMED order of EN 1337-2 values (typed, not re-read)' },
  { id: 'MUS', v: 0.03, unit: '-', text: 'friction coefficient of the sliding bearings (for the force into the substructure)', src: 'ASSUMED (lubricated PTFE, low temperature)' },
  { id: 'JOINT', v: 0.4, unit: 'm', text: 'movement capacity of the modular expansion joint chosen (5 gaps of 80 mm)', src: 'DESIGN CHOICE, checked against the movement below' },
  { id: 'QSEIS', v: 1.0, unit: '-', text: 'behaviour factor of the substructure in the seismic run (1.0 = elastic, no ductility used)', src: 'DESIGN CHOICE (conservative, the pylon piers stay elastic)' },
  { id: 'ECAB', v: 195, unit: 'GPa', text: 'modulus of the parallel-wire cable', src: 'ASSUMED (PWS 190 to 200 GPa)' },
  { id: 'EC', v: 37, unit: 'GPa', text: 'modulus of the concrete C50/60', src: 'EN 1992-1-1 Table 3.1 value (typed, not re-read)' },
  { id: 'ABH', v: 6.0, unit: 'm', text: 'abutment height from the footing top to the bearing shelf', src: 'DESIGN CHOICE (embankment ground = road - 1.8 m at the ends, 17.1g-b)' },
  { id: 'ABF', v: 8.0, unit: 'm', text: 'abutment footing width along the bridge axis (pile supported)', src: 'DESIGN CHOICE' },
  { id: 'KO', v: 0.5, unit: '-', text: 'earth pressure coefficient of the approach embankment (at rest)', src: 'ASSUMED' },
  { id: 'GFILL', v: 19, unit: 'kN/m3', text: 'unit weight of the embankment fill behind the abutment', src: 'ASSUMED' },
  { id: 'SETA', v: 0.5, unit: '-', text: 'differential settlement as a share of the absolute pile group settlement', src: 'ASSUMED (neighbouring supports on the same soil)' },
  { id: 'SETP', v: 0.012, unit: '-', text: 'pile head settlement at working load as a share of the pile diameter', src: 'ASSUMED rule of thumb (1 to 1.5 % D for driven piles in sand / stiff clay)' },
];
const P = (id: string): number => { if (id in over) return over[id]; const a = ASSUME.find(x => x.id === id); if (!a) throw new Error('no assumption ' + id); return a.v; };

// ------------------------------------------------------------------ small numerics
const gauss = (A: number[][], b: number[]): number[] => {                  // solves A x = b, A is modified
  const n = b.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; if (f !== 0) for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j]; }
  }
  const x = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; } return x;
};
const interp = (xs: number[], ys: number[], x: number) => { if (x <= xs[0]) return ys[0]; for (let i = 0; i < xs.length - 1; i++) if (x <= xs[i + 1]) { const t = (x - xs[i]) / (xs[i + 1] - xs[i]); return ys[i] + t * (ys[i + 1] - ys[i]); } return ys[ys.length - 1]; };
const deckY = (s: number) => interp(LINK.s as number[], LINK.ys as number[], s);
const seaY = (s: number) => interp(PROF.stations.map((r: number[]) => r[0]), PROF.stations.map((r: number[]) => r[1]), s);

// ------------------------------------------------------------------ inputs from 18.2 / 18.3 (nothing typed twice)
const GM = Z.game, CB = Z.cable, PY = Z.pylon, LD = Z.loads, GI = Z.girder;
const Ls: number = GM.Ls, Lm: number = GM.Lm, Bdeck: number = GM.deckW, bc: number = GM.bc;
const lean = (PY.lean * Math.PI) / 180, cosL = Math.cos(lean);
const sP: number[] = GM.pylonS;
const seabed = [seaY(sP[0]), seaY(sP[1])];                                  // sea floor at the two pylons
const deckAt = [deckY(sP[0]), deckY(sP[1])];
const DEWL = B.wave.surge + 1.0;                                            // design extreme water level (HWL 1.0 + surge, 18.2)
const Hmax18: number = B.wave.Hmax, Tp: number = B.wave.Tp, UC = B.assumptions.find((a: any) => a.id === 'UC').v;
const gT: number = GI.gDeckKNm, phi: number = LD.phi;
const WPIER = 25.0;                                                         // kN/m3 reinforced concrete
const rho = 1030;
const eN = (x: number) => x;                                                // identity, keeps the lists readable
void eN;
// ---- END OF WHAT EXISTS (2026-11-15). Next: abutments, pylon piers, bearings, joints, piles, scour, seismic run, unbalanced saddle force, then write STEP184_OUTPUT.txt + island_bridge_substructure.json.
