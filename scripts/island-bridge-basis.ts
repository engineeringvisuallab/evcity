// STEP 18.2 (headless, pure numbers): DESIGN BASIS + LOADS of the island strait bridge IB (concept A, self-anchored suspension).
// Reads: SECTION_M6 (deck widths), IslandLinkData (deck levels, structure range), docs/island_link_profile.json (sea floor on the centreline).
// Changes nothing in src/. Run: npx tsx scripts/island-bridge-basis.ts <out-dir> [--set ID=value ...]
//   writes <out-dir>/STEP182_OUTPUT.txt (the sheet) and <out-dir>/island_bridge_basis.json (numbers for 18.3 and later: nothing typed twice).
// Every ASSUMPTION lives in the ASSUME table below (the game has no wind / soil / seismic / tide data). Change one with --set ID=value.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { SECTION_M6 } from '../src/roads/standards/SectionTable';
import { ISLAND_LINK_DATA as LINK } from '../src/roads/island/IslandLinkData';

const args = process.argv.slice(2);
const out = args[0] && !args[0].startsWith('--') ? args[0] : '.';
mkdirSync(out, { recursive: true });
const over: Record<string, number> = {};
for (let i = 0; i < args.length; i++) if (args[i] === '--set' && args[i + 1]) { const [k, v] = args[++i].split('='); over[k] = parseFloat(v); }

// ------------------------------------------------------------------ ASSUMPTIONS (user may change, --set ID=value)
interface A { id: string; v: number; unit: string; text: string; src: string }
const ASSUME: A[] = [
  { id: 'VB3S', v: 77.5, unit: 'm/s', text: 'design wind speed, 3-s gust at 10 m, taken as valid over the water (NO extra terrain factor is added on top)', src: 'BNBC 2020 Table 6.2.8 value for BAGERHAT (neighbour district; Khulna itself was not visible in the search snippet). It is a code design value, 1.25 x the Sidr gust: conservative. CONFIRM or lower it (--set VB3S=62).' },
  { id: 'GUST2MEAN', v: 1.52 / 1.06, unit: '-', text: '3-s gust / 10-min mean ratio (Durst: gust/hourly 1.52, 10-min/hourly 1.06)', src: 'engineering assumption (Durst curve, open terrain)' },
  { id: 'LIFE', v: 120, unit: 'yr', text: 'design working life (also the wind return period used)', src: 'HANDOFF 18.3 point 1' },
  { id: 'Z0', v: 0.003, unit: 'm', text: 'roughness length, sea / strait (EN 1991-1-4 terrain category 0)', src: 'EN 1991-1-4 Table 4.1' },
  { id: 'RHOAIR', v: 1.25, unit: 'kg/m3', text: 'air density', src: 'EN 1991-1-4 recommended' },
  { id: 'TMAX', v: 42, unit: 'C', text: 'max shade air temperature, 50-yr', src: 'ASSUMED for Khulna (no BMD record looked up in this session)' },
  { id: 'TMIN', v: 6, unit: 'C', text: 'min shade air temperature, 50-yr', src: 'ASSUMED for Khulna (no BMD record looked up in this session)' },
  { id: 'T0', v: 28, unit: 'C', text: 'bridge temperature when the structure is restrained (erection)', src: 'ASSUMED (EN 1991-1-5 leaves it to the national annex)' },
  { id: 'ZONEZ', v: 0.12, unit: 'g', text: 'seismic zone coefficient = PGA of the 475-yr event (zone 1)', src: 'BNBC 2020 Table 6.2.15 value for BAGERHAT (0.12); reading Z as the 475-yr PGA is an ASSUMPTION. CONFIRM.' },
  { id: 'GAMI', v: 1.3, unit: '-', text: 'importance factor (class III bridge, long-life landmark crossing)', src: 'EN 1998-2 recommended value for greater than average importance' },
  { id: 'SOILS', v: 1.35, unit: '-', text: 'EN 1998-1 Type 1 spectrum, ground type D (soft delta soil): S', src: 'EN 1998-1 Table 3.2 (TB 0.20, TC 0.80, TD 2.0); the soil is ASSUMED, no data in the game' },
  { id: 'XI', v: 2, unit: '%', text: 'viscous damping of the suspension system (steel, cables)', src: 'ASSUMED (5 % is the code reference value; cable bridges use 2-3 %)' },
  { id: 'SURGE', v: 1.0, unit: 'm', text: 'storm surge above the high water level in the design extreme water level', src: 'ASSUMED; BMD list shows 1 m (1971 Khulna town) to several m on the open coast. Sensitivity 0-4 m is printed.' },
  { id: 'FETCH', v: 8000, unit: 'm', text: 'effective wave fetch at the strait', src: 'ASSUMED (strait between the mainland and the island, open to the sea in the south). Sensitivity 2-30 km is printed.' },
  { id: 'UC', v: 1.5, unit: 'm/s', text: 'design tidal / river current at the piers', src: 'ASSUMED (delta channel), no data in the game' },
  { id: 'HWL', v: 1.0, unit: 'm', text: 'design high water level over sea level 0', src: 'handoff 17.1d A2 (game rule: soffit >= HWL + 6 m)' },
  { id: 'AIRGAP', v: 1.0, unit: 'm', text: 'minimum air gap soffit to wave crest (extreme water level)', src: 'ASSUMED design practice, NOT a game rule' },
  { id: 'AADT', v: 80000, unit: 'veh/day', text: 'traffic, both directions', src: 'class 80 000 AADT of 17.1b (real AADT comes from 17.4a)' },
  { id: 'HEAVY', v: 0.10, unit: '-', text: 'share of heavy vehicles (> 3.5 t)', src: 'ASSUMED (port / industry link)' },
  { id: 'SLOW', v: 0.80, unit: '-', text: 'share of the heavy vehicles of one direction that use the slow lane', src: 'ASSUMED' },
  { id: 'GSTEEL', v: 5.0, unit: 'kN/m2', text: 'PRELIMINARY steel of the deck (box girders, orthotropic plate, cross girders, cable anchorage zones)', src: 'ASSUMED about 510 kg/m2; replaced by the sized section in 18.3' },
  { id: 'TSUR', v: 0.080, unit: 'm', text: 'surfacing thickness', src: 'ASSUMED (EN 1991-1-1 asphalt 23 kN/m3)' },
  { id: 'GBAR', v: 4.0, unit: 'kN/m', text: 'edge barrier + kerb, per side (H2 class, steel / composite, not the heavy concrete placeholder)', src: 'ASSUMED' },
  { id: 'GMED', v: 8.0, unit: 'kN/m', text: 'median barrier (double sided)', src: 'ASSUMED' },
  { id: 'GSERV', v: 3.0, unit: 'kN/m', text: 'lighting, ducts, drainage pipes, SHM cables', src: 'ASSUMED' },
  { id: 'DGIRD', v: 3.0, unit: 'm', text: 'girder depth used for the wind area (the game soffit limit: deeper needs a higher road = user decision)', src: 'HANDOFF 18.1' },
  { id: 'HPAR', v: 1.1, unit: 'm', text: 'parapet / barrier height above the deck', src: 'game parapet 1.1 m (RingBridgeGeometry IB)' },
  { id: 'SETT', v: 20, unit: 'mm', text: 'differential support settlement (characteristic)', src: 'ASSUMED, no soil data' },
];
const P: Record<string, number> = {};
for (const a of ASSUME) { if (over[a.id] !== undefined) a.v = over[a.id]; P[a.id] = a.v; }

// ------------------------------------------------------------------ output helpers
const L: string[] = [];
const pr = (s = '') => { L.push(s); console.log(s); };
const f0 = (v: number) => v.toFixed(0), f1 = (v: number) => v.toFixed(1), f2 = (v: number) => v.toFixed(2), f3 = (v: number) => v.toFixed(3);
let pass = 0, fail = 0;
const chk = (name: string, ok: boolean, info: string) => { if (ok) pass++; else fail++; pr(`  ${ok ? 'PASS' : 'FAIL'}  ${name}   ${info}`); };
const G = 9.81, RHOW = 1030;
const J: Record<string, unknown> = {};

pr('ISLAND STRAIT BRIDGE IB, concept A (self-anchored suspension, leaning twin-sail pylon pair, continuous box girder, cables anchored in the deck)');
pr('STEP 18.2: DESIGN BASIS + LOADS (calculation sheet). Everything below is a number from code; "ASSUMED" marks data the game does not have.');
pr('Overrides used: ' + (Object.keys(over).length ? Object.entries(over).map(([k, v]) => `${k}=${v}`).join(', ') : 'none'));

// ================================================================== 0. assumptions table
pr('\n0. ASSUMPTIONS (the user can change any of them: --set ID=value, then rerun)');
pr('   ID         value   unit      meaning  [source / status]');
for (const a of ASSUME) pr(`   ${a.id.padEnd(9)} ${String(+a.v.toPrecision(4)).padStart(7)}  ${a.unit.padEnd(8)}  ${a.text}  [${a.src}]`);

// ================================================================== 1. game numbers
pr('\n1. GAME NUMBERS THE DESIGN MUST MATCH (read from the project, not typed)');
const S = SECTION_M6;
const medHalf = S.elements.find((e) => e.kind === 'median')!.to;
const pe = S.pavementEdge;
const deckClear = 2 * pe;                        // between parapet faces
const parapetBase = 0.9;                         // IB.parapet base width in RingBridgeGeometry.ts (handoff 17.1g-b: 33.8 m over the parapets)
const deckTotal = deckClear + 2 * parapetBase;
const carriageHalf = pe - medHalf;               // one carriageway incl. both shoulders (median excluded)
const [sA, sB] = LINK.structs[0];
const structLen = sB - sA;
const inS = LINK.s.map((s, i) => ({ s, y: LINK.ys[i] })).filter((p) => p.s >= sA && p.s <= sB);
const yMin = Math.min(...inS.map((p) => p.y)), yMax = Math.max(...inS.map((p) => p.y));
const prof = JSON.parse(readFileSync(`${out}/island_link_profile.json`, 'utf8')) as { stations: number[][]; curveS: number };
const sea = prof.stations.filter((r) => r[0] >= sA && r[0] <= sB).map((r) => ({ s: r[0], h: r[1] }));   // column 1 = ground / sea floor on the centreline
const deepest = Math.min(...sea.map((p) => p.h));
const wet = sea.filter((p) => p.h < 0);
const wetLen = wet.length ? wet[wet.length - 1].s - wet[0].s : 0;
pr(`   road M6-1, section pavement edge ${f2(pe)} m, median ${f1(2 * medHalf)} m, lanes ${S.lanesPerDir} + ${S.lanesPerDir}; deck between parapet faces ${f1(deckClear)} m, over the parapets ${f1(deckTotal)} m (parapet base ${parapetBase} m from IB, typed: RingBridgeGeometry.ts)`);
pr(`   structure range design s ${f1(sA)} - ${f1(sB)} = ${f1(structLen)} m in the data (the game structure is 382.5 m on its 8 m grid, abutments at both ends)`);
const inWet = inS.filter((p) => p.s >= (sea.filter((q) => q.h < 0)[0]?.s ?? 0) && p.s <= (sea.filter((q) => q.h < 0).slice(-1)[0]?.s ?? 0));
const yWetMin = Math.min(...inWet.map((p) => p.y)), yWetMax = Math.max(...inWet.map((p) => p.y));
pr(`   road level over the whole structure ${f2(yMin)} - ${f2(yMax)} m (the ends sit on the embankment), over the water ${f2(yWetMin)} - ${f2(yWetMax)} m (option A); sea floor on the centreline: deepest ${f2(deepest)} m, wet part s ${f1(wet[0]?.s ?? 0)} - ${f1(wet[wet.length - 1]?.s ?? 0)} = ${f1(wetLen)} m (5 m samples)`);
pr(`   user rule: soffit >= HWL ${P.HWL} m + 6 m = ${f2(P.HWL + 6)} m over sea level; girder deeper than ${P.DGIRD} m needs a higher road (USER decision, not changed here)`);
chk('structure range of the data is the 384 m of 17.1g-a (within the 8 m grid of the 382.5 m game structure)', Math.abs(structLen - 382.5) <= 8, `${f1(structLen)} m vs 382.5 m`);
chk('deck between parapets is 32.0 m, over them 33.8 m (handoff 18.1)', Math.abs(deckClear - 32.0) < 1e-6 && Math.abs(deckTotal - 33.8) < 1e-6, `${f2(deckClear)} / ${f2(deckTotal)}`);
chk('deepest sea floor on the line is about -7.4 m (handoff 18.1, tolerance 0.3 m)', Math.abs(deepest + 7.4) <= 0.3, `${f2(deepest)} m (the 5 m samples may miss the very lowest point)`);
const zDeck = yMax;                              // wind height reference, highest deck level over the water
const depthDeepest = P.HWL - deepest;           // water depth at HWL at the deepest point
J.game = { deckClear, deckTotal, carriageHalf, medianWidth: 2 * medHalf, structLen, yMin, yMax, deepest, depthDeepest, wetLen };

// ================================================================== 2. design basis
pr('\n2. DESIGN BASIS (decisions; no calculation)');
pr('   2.1 Codes (main set Eurocode, as in HANDOFF 18.3 point 1):');
pr('       EN 1990 + A1 (Annex A2 bridges)  basis of design, combinations         EN 1991-1-1 / -1-4 / -1-5 / -1-6 / -1-7 / -2   actions (self weight, wind, thermal, execution, accidental, traffic)');
pr('       EN 1992-2 concrete bridges   EN 1993-2 steel bridges   EN 1993-1-11 cables and hangers   EN 1993-1-9 fatigue   EN 1994-2 composite');
pr('       EN 1997-1 geotechnical       EN 1998-1 + EN 1998-2 seismic              AASHTO LRFD HL-93: live load CHECK only (section 3.3)');
pr('       Wave loads: NO Eurocode part exists. Morison equation with linear (Airy) waves, Wheeler stretching; fetch-limited wave growth after Young and Verhagen (1996) as given in the US Coastal Engineering Manual; scour after HEC-18 (CSU) and Sumer and Fredsoe. Local codes: BNBC 2020 gives wind and seismic zone data only (it is a BUILDING code), Bangladesh has no national bridge code (AASHTO or Eurocode are used, ICCESD 2026 paper).');
pr('   2.2 Design working life 120 years (marine, important crossing). Consequence class CC3 / reliability class RC3: beta 5.2 for a 1-year reference period, 4.3 for 50 years (EN 1990 Table B2). Execution class EXC4 (EN 1090-2) for the steel box girder, pylons and cable anchorages.');
pr('   2.3 Exposure: concrete (piers, caps, abutments) XS3 in the tidal / splash zone, XS1 above it; steel corrosivity category C5-M (ISO 12944); cable system: galvanised wire + wrapping + dehumidification (18.5).');
pr('   2.4 Limit states and combination formulas (EN 1990, Eq. 6.10 form, Annex A2 factors):');
pr('       ULS STR / GEO : sum(gG,j Gk,j) + gP P + gQ,1 Qk,1 + sum(gQ,i psi0,i Qk,i)       gG sup 1.35 / inf 1.00, gQ traffic 1.35, wind and temperature 1.50');
pr('       SLS character.: sum(Gk,j) + P + Qk,1 + sum(psi0,i Qk,i)      frequent: ... psi1,1 Qk,1 + sum(psi2,i Qk,i)      quasi-permanent: sum(psi2,i Qk,i)');
pr('       Accidental    : sum(Gk,j) + P + Ad + psi1,1 Qk,1 + sum(psi2,i Qk,i)         Seismic: sum(Gk,j) + P + AEd + sum(psi2,i Qk,i)');
pr('       Fatigue       : EN 1991-2 FLM3 (single vehicle 480 kN, 4 axles x 120 kN) with Nobs of the slow lanes (section 3.3), damage equivalent factors EN 1993-2');
pr('       psi factors (EN 1990 Table A2.1, typed from the standard, NOT re-read in this session):  traffic gr1a TS 0.75 / 0.75 / 0, UDL 0.40 / 0.40 / 0;  wind Fwk 0.6 / 0.2 / 0;  thermal Tk 0.6 / 0.6 / 0.5  (psi0 / psi1 / psi2).  Thermal: uniform and gradient together with omegaN 0.35 and omegaM 0.75 (EN 1991-1-5 6.1.5, seen in a retrieved source).');
pr('       Cable system (self-anchored): the permanent cable force is a PERMANENT action on the girder (axial compression in the deck, EN 1990 treats prestress-like cable forces as P with the factors gP chosen in 18.3 after form finding); second order effects of the pylons and the girder are checked in 18.3 / 18.4, not here.');
pr('   2.5 Items that need a USER decision or data and are NOT decided here: ship passage (D17-5: 6 m clearance, small boats; vessel collision is therefore NOT computed), pedestrian / cycle path (assumed NONE, only a maintenance walkway), soil data (assumed, 18.4), local wind / wave / current records.');
J.assumptions = ASSUME;

// ================================================================== 3. loads
pr('\n3. LOADS');
// ---- 3.1 permanent
pr('\n3.1 PERMANENT LOADS PER METRE OF DECK (PRELIMINARY: the real steel weight comes from the sized section in 18.3)');
const carriageway = 2 * carriageHalf;
const gSteel = P.GSTEEL * deckTotal;
const gSurf = 23 * P.TSUR * carriageway;
const gBar = 2 * P.GBAR + P.GMED;
const gTotal = gSteel + gSurf + gBar + P.GSERV;
pr(`   steel deck structure   ${f1(P.GSTEEL)} kN/m2 x ${f1(deckTotal)} m                  = ${f1(gSteel)} kN/m`);
pr(`   surfacing   23 kN/m3 x ${P.TSUR} m x ${f1(carriageway)} m (both carriageways incl. shoulders) = ${f1(gSurf)} kN/m`);
pr(`   barriers    2 x ${P.GBAR} + median ${P.GMED}                          = ${f1(gBar)} kN/m`);
pr(`   services                                            = ${f1(P.GSERV)} kN/m`);
pr(`   TOTAL g_k = ${f1(gTotal)} kN/m  (${f2(gTotal / deckTotal)} kN/m2 over ${f1(deckTotal)} m); over the ${f1(structLen)} m structure = ${f1(gTotal * structLen / 1000)} MN. Main cables, hangers and pylons are NOT in this number (18.3).`);
J.permanent = { gSteel, gSurf, gBar, gServ: P.GSERV, gTotal };

// ---- 3.2 LM1 + braking
pr('\n3.2 TRAFFIC LM1 (EN 1991-2) per carriageway, each carriageway treated alone (separated by the median barrier, EN 1991-2 4.2.3(1)a)');
const wCw = carriageHalf;                      // 14.0 m per carriageway (shoulders included, as the paved width)
const nl = Math.floor(wCw / 3), wRem = wCw - 3 * nl;
pr(`   carriageway width w = ${f1(wCw)} m (inner shoulder + ${S.lanesPerDir} lanes + outer shoulder) -> n_l = Int(w / 3) = ${nl} notional lanes of 3.0 m, remaining area ${f1(wRem)} m`);
const lane = [{ TS: 300, q: 9.0 }, { TS: 200, q: 2.5 }, { TS: 100, q: 2.5 }, { TS: 0, q: 2.5 }];
let udl = 0, ts = 0;
for (let i = 0; i < nl; i++) { udl += lane[i].q * 3; ts += lane[i].TS; pr(`   lane ${i + 1}: ${lane[i].TS ? `TS ${lane[i].TS} kN (2 axles of ${lane[i].TS / 2})` : 'no TS'}, UDL ${lane[i].q} kN/m2 x 3.0 m = ${f1(lane[i].q * 3)} kN/m`); }
udl += 2.5 * wRem;
pr(`   remaining area: UDL 2.5 kN/m2 x ${f1(wRem)} m = ${f1(2.5 * wRem)} kN/m          alpha factors = 1.0 (ASSUMED; the national annex of Bangladesh does not exist)`);
pr(`   per carriageway: UDL ${f1(udl)} kN/m, tandem systems ${ts} kN;  BOTH carriageways loaded with lane 1 on each (conservative for one deck): UDL ${f1(2 * udl)} kN/m = ${f2(2 * udl / deckTotal)} kN/m2 over the deck`);
const Lload = structLen, w1 = 3.0;
const braking = Math.min(900, Math.max(180, 0.6 * 300 * 2 + 0.10 * 9.0 * w1 * Lload));
pr(`   braking Qlk = 0.6 aQ1 (2 Q1k) + 0.10 aq1 q1k w1 L = ${f0(0.6 * 600)} + ${f0(0.10 * 9.0 * w1 * Lload)} = ${f0(0.6 * 600 + 0.10 * 9.0 * w1 * Lload)} kN, limited to 180 aQ1 .. 900 kN -> ${f0(braking)} kN (per carriageway, at deck level, over the loaded length ${f0(Lload)} m)`);
pr(`   centrifugal Qtk = 0 : the structure lies on the first straight, the horizontal curve (R 1000 m, 17.1c) starts at s ${f1(prof.curveS)}, ${f1(prof.curveS - sB)} m after the island end of the structure`);
J.traffic = { nLanes: nl, udlPerCarriageway: udl, udlBoth: 2 * udl, tsPerCarriageway: ts, braking };

// ---- 3.3 AASHTO check + fatigue
pr('\n3.3 LIVE LOAD CHECK WITH AASHTO HL-93 and FATIGUE TRAFFIC');
const designLanesAashto = Math.floor(carriageHalf / 3.6);
const mpf = [1.2, 1.0, 0.85, 0.65];
const nAll = 2 * designLanesAashto;
const mpfAll = nAll >= 4 ? mpf[3] : mpf[nAll - 1];
const aashtoUdl = nAll * 9.34 * mpfAll;
pr(`   HL-93: design lanes of 3.6 m per carriageway Int(${f1(carriageHalf)} / 3.6) = ${designLanesAashto}, ${nAll} lanes loaded, multiple presence factor ${mpfAll} (>= 4 lanes), lane load 9.34 kN/m per lane (0.64 kip/ft)`);
pr(`   HL-93 uniform part = ${nAll} x 9.34 x ${mpfAll} = ${f1(aashtoUdl)} kN/m vs EN LM1 ${f1(2 * udl)} kN/m  ->  LM1 UDL is ${f2(2 * udl / aashtoUdl)} x the HL-93 lane load;  truck 325 kN (35+145+145) with dynamic allowance 33 % = ${f0(325 * 1.33)} kN vs LM1 TS ${ts} kN per carriageway: the concentrated loads are compared again with the sized girder in 18.3. The ratio is inflated by the conservative rule above (lane 1 loaded on BOTH carriageways, shoulders counted as traffic area)`);
const nobs = P.AADT * P.HEAVY * 0.5 * P.SLOW * 365;
const cat = nobs > 2.0e6 ? 'above category 1' : nobs > 0.5e6 ? 'between category 2 (0.5e6) and category 1 (2.0e6) of EN 1991-2 Table 4.5' : 'at or below category 2 (0.5e6)';
pr(`   fatigue: heavy vehicles per slow lane and year Nobs = AADT ${f0(P.AADT)} x ${P.HEAVY} heavy x 0.5 direction x ${P.SLOW} slow lane x 365 = ${f0(nobs)}  ->  ${cat}; design with category 1, Nobs 2.0e6 per slow lane and year (the next table value above the own number, and the island link is a port / industry access: conservative); cycles in 120 years about ${(2.0e6 * P.LIFE / 1e6).toFixed(0)} million heavy vehicles per slow lane (FLM3 / FLM4)`);
J.fatigue = { nobsOwn: nobs, nobsDesign: 2.0e6 };

// ---- 3.4 wind
pr('\n3.4 WIND (EN 1991-1-4 procedure for pressures and coefficients; the site speed is ASSUMED from BNBC)');
const K = 0.2, nExp = 0.5;
const cprob = (p: number) => Math.pow((1 - K * Math.log(-Math.log(1 - p))) / (1 - K * Math.log(-Math.log(0.98))), nExp);
const vb50 = P.VB3S / P.GUST2MEAN;               // 10-min mean at 10 m
const cp = cprob(1 / P.LIFE);
const vb = vb50 * cp;                            // 10-min mean at 10 m over the water, return period LIFE
const lnRef = Math.log(10 / P.Z0);
pr(`   design gust: BNBC ${f1(P.VB3S)} m/s (3-s gust, 10 m) / ${f3(P.GUST2MEAN)} = ${f1(vb50)} m/s as 10-min mean at 10 m. The BNBC value is used AS the value over the water: no terrain-category factor (cat II -> sea would add 1.26 x) is stacked on it, because the code value is already a conservative design number.`);
pr(`   return period ${P.LIFE} yr: cprob = ((1 - K ln(-ln(1-p))) / (1 - K ln(-ln 0.98)))^n, K 0.2, n 0.5, p = 1/${P.LIFE} -> ${f3(cp)};  v_b(${P.LIFE}) = ${f1(vb)} m/s = ${f0(vb * 3.6)} km/h (10-min mean), as 3-s gust ${f1(P.VB3S * cp)} m/s = ${f0(P.VB3S * cp * 3.6)} km/h`);
pr(`   cross check with history: Cyclone Sidr (2007) coastal gust 223 km/h = ${f1(223 / 3.6)} m/s (source: icddr,b cyclone list); the design gust is ${(P.VB3S * cp / (223 / 3.6)).toFixed(2)} x that. If the user prefers a record-based speed, rerun with --set VB3S=<value>.`);
pr(`   profile over the strait / sea, z0 ${P.Z0} m: vm(z) = v_b ln(z / z0) / ln(10 / z0);  Iv(z) = 1 / ln(z / z0);  qp(z) = (1 + 7 Iv) 0.5 rho vm^2, rho ${P.RHOAIR}`);
pr('   height z over water (m)   vm (m/s)    Iv      qp (kN/m2)   gust vp = sqrt(2 qp / rho) (m/s)');
const zs = [10, 15, 20, 30, 40, 60, 80, 100];
const windTable: number[][] = [];
const vmAt = (z: number) => vb * Math.log(Math.max(z, 1) / P.Z0) / lnRef;
const qpAt = (z: number) => (1 + 7 / Math.log(Math.max(z, 1) / P.Z0)) * 0.5 * P.RHOAIR * vmAt(z) ** 2 / 1000;
for (const z of zs) { const q = qpAt(z); windTable.push([z, vmAt(z), 1 / Math.log(z / P.Z0), q]); pr(`   ${String(z).padStart(8)}               ${f1(vmAt(z)).padStart(6)}    ${f3(1 / Math.log(z / P.Z0))}   ${f2(q).padStart(8)}      ${f1(Math.sqrt(2 * q * 1000 / P.RHOAIR)).padStart(6)}`); }
const qpDeck = qpAt(zDeck);
const dNoTraffic = P.DGIRD + P.HPAR, dTraffic = P.DGIRD + 2.0;
const cfx = 1.3, cfz = 0.9, cLong = 0.25;
const Fx0 = qpDeck * cfx * dNoTraffic, Fx1 = qpDeck * cfx * dTraffic;
pr(`   deck at z = ${f1(zDeck)} m: qp = ${f2(qpDeck)} kN/m2.  Transverse force per metre F = qp cf d_tot, cf,x ${cfx} (EN 1991-1-4 Fig. 8.3 plateau for b/d_tot >= 4, here b/d = ${f1(deckTotal / dNoTraffic)}; WIND TUNNEL needed for the final deck, 18.3)`);
pr(`     without traffic: d_tot = girder ${P.DGIRD} + parapet ${P.HPAR} = ${f1(dNoTraffic)} m -> Fw,x = ${f1(Fx0)} kN/m (over ${f0(structLen)} m = ${f1(Fx0 * structLen / 1000)} MN)`);
pr(`     with traffic   : d_tot = girder ${P.DGIRD} + 2.0 m vehicles = ${f1(dTraffic)} m -> Fw,x = ${f1(Fx1)} kN/m  (EN 1990: this case is combined with traffic, wind psi0 0.6 limits apply in 18.3)`);
pr(`     vertical (up or down): Fw,z = qp cf,z b = ${f2(qpDeck)} x ${cfz} x ${f1(deckTotal)} = ${f1(qpDeck * cfz * deckTotal)} kN/m (cf,z +-0.9, EN 1991-1-4 8.3.3 recommended, without wind tunnel);  longitudinal ${f0(cLong * 100)} % of transverse (plate girder) = ${f1(cLong * Fx0)} kN/m`);
const vReqMean = 1.2 * vmAt(zDeck), vReqGust = 1.2 * Math.sqrt(2 * qpDeck * 1000 / P.RHOAIR);
pr(`   AEROELASTIC TARGETS for 18.3 (frequencies and mode shapes are not known yet, so NO flutter result is given here): required critical flutter speed >= 1.2 x design wind at deck level = 1.2 x ${f1(vmAt(zDeck))} = ${f1(vReqMean)} m/s (10-min mean basis); if the user wants the stricter gust basis: 1.2 x ${f1(Math.sqrt(2 * qpDeck * 1000 / P.RHOAIR))} = ${f1(vReqGust)} m/s. Vortex shedding: vcrit = d f / St (EN 1991-1-4 E.1.3.1), with d ${P.DGIRD} m and St about 0.11 (provisional); e.g. f 0.4 Hz gives ${f1(P.DGIRD * 0.4 / 0.11)} m/s, checked against the first vertical and torsional frequency in 18.3.`);
J.wind = { vb50, cprob: cp, vb, table: windTable, qpDeck, FwxNoTraffic: Fx0, FwxTraffic: Fx1, FwzUp: qpDeck * cfz * deckTotal, vFlutterReqMean: vReqMean, vFlutterReqGust: vReqGust };
chk('cprob(p = 0.02) = 1.000 (the 50-yr reference of EN 1991-1-4 Eq. 4.2 is reproduced)', Math.abs(cprob(0.02) - 1) < 1e-9, `${cprob(0.02).toFixed(6)}`);
chk('qp(z) rises with height', windTable.every((r, i) => i === 0 || r[3] > windTable[i - 1][3]), `${f2(windTable[0][3])} -> ${f2(windTable[windTable.length - 1][3])} kN/m2`);

// ---- 3.5 thermal
pr('\n3.5 THERMAL (EN 1991-1-5; steel box deck = Type 1, a composite or concrete deck would change the numbers)');
const TeMax = P.TMAX + 16, TeMin = P.TMIN - 3;
const dTexp = TeMax - P.T0, dTcon = P.T0 - TeMin;
pr(`   shade air Tmax ${P.TMAX}, Tmin ${P.TMIN} C (ASSUMED);  Type 1 steel box: Te,max = Tmax + 16 = ${TeMax} C, Te,min = Tmin - 3 = ${TeMin} C (Fig. 6.1 as I know it, not re-read; a retrieved worked example with T0 10 C and Te -21 / +50 C gives dTN con 31 and dTN exp 40 K by the same rule)`);
pr(`   T0 = ${P.T0} C:  dTN,exp = ${dTexp} K,  dTN,con = ${dTcon} K,  total range ${TeMax - TeMin} K`);
pr('   vertical difference, linear approach, 50 mm surfacing (retrieved: EN 1991-1-5 Table 6.1): dTM,heat = 18 K, dTM,cool = 13 K; surfacing 80 mm needs ksur from Table 6.2 (value not retrieved: 18 / 13 K used, to be corrected in 18.3).');
pr('   combined: 1.0 dTM + 0.35 dTN  or  0.75 dTM + 1.0 dTN (omegaN 0.35, omegaM 0.75).');
pr('   cable vs girder: main cable and hangers can differ from the girder by up to 10 K (ASSUMED, sun on the cable, shade on the box), checked in the form finding of 18.3.');
const alpha = 12e-6;
pr(`   free movement of the steel girder, alpha ${alpha * 1e6} 1e-6/K, L = ${f1(structLen)} m (this is the movement the bearings and joints must take, 18.4):`);
for (const [nm, Lf] of [['fixed at one abutment, free at the other', structLen], ['fixed at the middle, both ends move', structLen / 2]] as [string, number][])
  pr(`     ${nm.padEnd(40)} end movement: expansion ${f0(alpha * Lf * dTexp * 1000)} mm, contraction ${f0(alpha * Lf * dTcon * 1000)} mm, total range ${f0(alpha * Lf * (TeMax - TeMin) * 1000)} mm`);
J.thermal = { TeMax, TeMin, dTexp, dTcon, rangeOneEnd: alpha * structLen * (TeMax - TeMin), rangeMid: alpha * structLen / 2 * (TeMax - TeMin) };

// ---- 3.6 seismic
pr('\n3.6 SEISMIC (EN 1998-1 horizontal elastic spectrum, Type 1; the zone value is ASSUMED from BNBC, the soil is ASSUMED)');
const agR = P.ZONEZ * G, ag = P.GAMI * agR;
const S0 = P.SOILS, TB = 0.20, TC = 0.80, TD = 2.0;
const eta = Math.max(0.55, Math.sqrt(10 / (5 + P.XI)));
const Se = (T: number, a = ag, s = S0, eta_ = eta) => T <= TB ? a * s * (1 + T / TB * (eta_ * 2.5 - 1)) : T <= TC ? a * s * eta_ * 2.5 : T <= TD ? a * s * eta_ * 2.5 * (TC / T) : a * s * eta_ * 2.5 * (TC * TD / (T * T));
pr(`   a_gR = Z g = ${f2(agR)} m/s2 (${P.ZONEZ} g, 475 yr);  a_g = gamma_I a_gR = ${P.GAMI} x ${f2(agR)} = ${f2(ag)} m/s2 (${f3(ag / G)} g);  ground D: S ${S0}, TB ${TB}, TC ${TC}, TD ${TD} s;  damping ${P.XI} % -> eta = sqrt(10 / (5 + xi)) = ${f3(eta)}`);
pr('   T (s)     Se(T) 5 % damping (g)    Se(T) with the damping above (g)    spectral displacement SDe = Se (T / 2pi)^2 (m)');
const seTab: number[][] = [];
for (const T of [0, 0.2, 0.8, 1, 2, 3, 4, 5, 6]) { const s5 = Se(T, ag, S0, 1) / G, sx = Se(T) / G, sd = Se(T) * (T / (2 * Math.PI)) ** 2; seTab.push([T, s5, sx, sd]); pr(`   ${f1(T).padStart(4)}      ${f3(s5).padStart(7)}                  ${f3(sx).padStart(7)}                       ${f3(sd).padStart(7)}`); }
const avgv = 0.9 * ag;
pr(`   vertical (Type 1): avg = 0.90 ag = ${f2(avgv)} m/s2, TB 0.05, TC 0.15, TD 1.0 s (EN 1998-1 Table 3.4); at the pylon legs and the cable anchorages in 18.3.`);
pr('   NOT decided here: the response reduction / ductility (q) of pylon legs and piers, liquefaction of the delta sand (needs soil data), the seismic isolation / damper concept at the abutments (18.4). A self-anchored span has a long first period (several seconds): the displacement column is the one that matters for joints and stoppers.');
J.seismic = { agR, ag, eta, S: S0, TB, TC, TD, table: seTab };
chk('Se(T) is continuous at TB, TC and TD (EN 1998-1 3.2.2.2 Eq. 3.2-3.5)', [TB, TC, TD].every((t) => Math.abs(Se(t - 1e-9) - Se(t + 1e-9)) < 1e-6), 'jumps < 1e-6 m/s2');
chk('Se(0) = ag S (rigid structure follows the ground)', Math.abs(Se(0) - ag * S0) < 1e-9, `${f3(Se(0) / G)} g`);

// ---- 3.7 settlement
pr(`\n3.7 SETTLEMENT: differential support settlement ${P.SETT} mm (characteristic, ASSUMED: the game has no soil model), applied to one support at a time in the global analysis (18.3), factor gamma_Gset by the national annex rule in 18.4.`);

// ---- 3.8 waves, current, scour
pr('\n3.8 WAVE, CURRENT AND SCOUR ON THE PIERS (Morison, linear waves; the fetch, the current and the surge are ASSUMED)');
const tanh = Math.tanh;
const disp = (T: number, d: number) => { let k = Math.pow(2 * Math.PI / T, 2) / G; for (let i = 0; i < 100; i++) k = Math.pow(2 * Math.PI / T, 2) / (G * tanh(k * d)); return k; };
const yv = (U: number, F: number, d: number) => {
  const eps = G / (U * U), del = G * d / (U * U), chi = G * F / (U * U);
  const A1 = 0.493 * Math.pow(del, 0.75), B1 = 3.13e-3 * Math.pow(chi, 0.57);
  const A2 = 0.331 * Math.pow(del, 1.01), B2 = 5.215e-4 * Math.pow(chi, 0.73);
  const e = 0.241 * Math.pow(tanh(A1) * tanh(B1 / tanh(A1)), 0.87);
  const nu = 0.133 * Math.pow(tanh(A2) * tanh(B2 / tanh(A2)), -0.37);
  return { Hs: e / eps, Tp: U / (nu * G), eps, nu };
};
// checks of the implementation
const deep = yv(30, 1e9, 1e5);
chk('Young-Verhagen in the deep, fully developed limit gives Pierson-Moskowitz Hs = 0.0246 U^2 (2 %)', Math.abs(deep.Hs / (0.0246 * 900) - 1) < 0.02, `Hs ${f2(deep.Hs)} m vs ${f2(0.0246 * 900)} m`);
chk('... and fp U / g = 0.133 (3 %)', Math.abs(deep.nu / 0.13 - 1) < 0.03, `nu ${f3(deep.nu)}`);
const kT = disp(8, 8.4);
chk('dispersion relation (omega^2 = g k tanh kd) solved to 1e-9', Math.abs(Math.pow(2 * Math.PI / 8, 2) - G * kT * tanh(kT * 8.4)) < 1e-9, `k ${f3(kT)} 1/m, L ${f1(2 * Math.PI / kT)} m (T 8 s, d 8.4 m)`);

interface Wave { d: number; Hs: number; Tp: number; Hmax: number; Hb: number; L: number; etaC: number }
const waveAt = (surge: number, F: number): Wave => {
  const d = P.HWL + surge - deepest;                     // water depth at the deepest sea floor, extreme water level
  const U = vb;                                          // 10-min mean at 10 m over water, 120-yr (conservative: no duration limit)
  const y = yv(U, F, d);
  const Nw = 3 * 3600 / (y.Tp / 1.2);                    // waves in 3 h, Tz about Tp / 1.2
  const Hmax0 = y.Hs * Math.sqrt(Math.log(Nw) / 2);
  const Hb = 0.78 * d;
  const Hmax = Math.min(Hmax0, Hb);
  return { d, Hs: y.Hs, Tp: y.Tp, Hmax, Hb, L: 2 * Math.PI / disp(y.Tp, d), etaC: 0.65 * Hmax };
};
const w0 = waveAt(P.SURGE, P.FETCH);
pr(`   design water level DEWL = HWL ${P.HWL} + surge ${P.SURGE} = +${f2(P.HWL + P.SURGE)} m; water depth at the deepest sea floor (${f2(deepest)} m) d = ${f2(w0.d)} m; wind for waves = v_b(${P.LIFE}) ${f1(vb)} m/s (10-min mean, over water, no duration limit)`);
pr(`   fetch-limited wind sea (Young and Verhagen 1996, CEM II-2): fetch ${f0(P.FETCH)} m -> Hs = ${f2(w0.Hs)} m, Tp = ${f1(w0.Tp)} s, wave length ${f0(w0.L)} m; Hmax in 3 h = Hs sqrt(ln N / 2) with N = 3 h / Tz (Tz = Tp / 1.2), limited by breaking 0.78 d = ${f2(w0.Hb)} m -> Hmax = ${f2(w0.Hmax)} m; crest above still water about 0.65 Hmax = ${f2(w0.etaC)} m (2nd order Stokes estimate, ASSUMED)`);
pr('   sensitivity of the wave to the fetch (surge as assumed):');
for (const F of [2000, 5000, 8000, 15000, 30000]) { const w = waveAt(P.SURGE, F); pr(`     fetch ${String(F).padStart(6)} m:  Hs ${f2(w.Hs)} m  Tp ${f1(w.Tp)} s  Hmax ${f2(w.Hmax)} m  (breaking limit ${f2(w.Hb)} m)`); }
// air gap
const soffitMin = P.HWL + 6;
pr(`   AIR GAP (information, NOT a game rule): lowest allowed soffit ${f2(soffitMin)} m (HWL + 6 m, user rule; the plain girder has 7.07 m).  Required: soffit >= DEWL + crest + air gap ${P.AIRGAP} m`);
pr('     surge (m)   DEWL (m)   Hmax (m)   crest top (m over sea level 0)   air gap at the 7.00 m soffit (m)   result');
const gapRows: number[][] = [];
for (const sg of [0, 1, 2, 3, 4]) { const w = waveAt(sg, P.FETCH); const top = P.HWL + sg + w.etaC; const gap = soffitMin - top; gapRows.push([sg, P.HWL + sg, w.Hmax, top, gap]); pr(`     ${f1(sg).padStart(5)}      ${f2(P.HWL + sg).padStart(6)}    ${f2(w.Hmax).padStart(6)}      ${f2(top).padStart(8)}                     ${f2(gap).padStart(8)}              ${gap >= P.AIRGAP ? 'OK' : 'LESS THAN ' + P.AIRGAP + ' m'}`); }
const gap0 = soffitMin - (P.HWL + P.SURGE + w0.etaC);
chk(`air gap at the assumed surge ${P.SURGE} m is at least ${P.AIRGAP} m (assumptions as listed in section 0)`, gap0 >= P.AIRGAP, `${f2(gap0)} m`);
// Morison
const morison = (D: number, Cd: number, Cm: number, w: Wave, Uc: number) => {
  const d = w.d, H = w.Hmax, T = w.Tp, k = disp(T, d), om = 2 * Math.PI / T;
  let Fm = 0, Mm = 0, Fi = 0;
  const nz = 400;
  for (let it = 0; it < 360; it++) {
    const th = it * Math.PI / 180, eta = 0.5 * H * Math.cos(th);
    let F = 0, M = 0;
    const dz = (d + eta) / nz;
    for (let i = 0; i < nz; i++) {
      const z = -d + (i + 0.5) * dz;                      // z from sea floor (-d) to the surface (eta), z = 0 at still water
      const zs = d * (z - eta) / (d + eta);               // Wheeler stretching
      const ch = Math.cosh(k * (zs + d)) / Math.sinh(k * d);
      const u = 0.5 * H * om * ch * Math.cos(th) + Uc, a = -0.5 * H * om * om * ch * Math.sin(th);
      const fz = 0.5 * RHOW * Cd * D * Math.abs(u) * u + RHOW * Cm * Math.PI * D * D / 4 * a;
      F += fz * dz; M += fz * dz * (z + d);
    }
    if (Math.abs(F) > Math.abs(Fm)) { Fm = F; Mm = M; }
  }
  void Fi;
  return { F: Math.abs(Fm) / 1000, M: Math.abs(Mm) / 1000 };
};
// closed form check of the inertia integral (D small drag off): F_I = rho Cm pi D^2/4 * g H/2 * tanh(kd) at theta = 90 deg without stretching, small H
{
  const d = 8.0, H = 0.05, T = 8, D = 2.0, k = disp(T, d), om = 2 * Math.PI / T;
  let num = 0; const nz = 2000; const dz = d / nz;
  for (let i = 0; i < nz; i++) { const z = -d + (i + 0.5) * dz; num += RHOW * 2 * Math.PI * D * D / 4 * (0.5 * H * om * om * Math.cosh(k * (z + d)) / Math.sinh(k * d)) * dz; }
  const closed = RHOW * 2 * Math.PI * D * D / 4 * (G * H / 2) * tanh(k * d) ;
  chk('Morison inertia integral over the depth equals the closed form rho Cm (pi D^2 / 4) (g H / 2) tanh(kd)', Math.abs(num / closed - 1) < 1e-3, `numeric ${f2(num)} N vs closed ${f2(closed)} N`);
}
pr('   Morison force on one vertical circular column over the full water depth, worst phase of the wave, current added to the wave velocity (rough: CD 1.05, CM 1.2; smooth: CD 0.65, CM 1.6; the larger is printed; marine growth is NOT added to D):');
pr('   D (m)    wave + current force (kN)   moment about the sea floor (kN m)   current only (kN)');
const morRows: number[][] = [];
for (const D of [1.5, 2.5, 4.0]) {
  const r1 = morison(D, 1.05, 1.2, w0, P.UC), r2 = morison(D, 0.65, 1.6, w0, P.UC);
  const r = r1.F >= r2.F ? r1 : r2;
  const Fc = 0.5 * RHOW * 1.05 * D * P.UC * P.UC * w0.d / 1000;
  morRows.push([D, r.F, r.M, Fc]); pr(`   ${f1(D).padStart(4)}     ${f0(r.F).padStart(10)}                  ${f0(r.M).padStart(10)}                   ${f0(Fc).padStart(8)}`);
}
// scour
pr(`   local scour at a circular pier, equilibrium: HEC-18 (CSU) ys / y1 = 2.0 K1 K2 K3 K4 (a / y1)^0.65 Fr^0.43 with K1 1.0 (round), K2 1.0 (aligned), K3 1.1 (small dunes, ASSUMED), K4 1.0; Sumer and Fredsoe live-bed current: S = 1.3 D. y1 = ${f2(w0.d)} m, V = ${P.UC} m/s, Fr = ${f3(P.UC / Math.sqrt(G * w0.d))}`);
pr('   D (m)    HEC-18 ys (m)   1.3 D (m)   design scour depth (larger) (m)   sea floor under the pier after scour (m)');
const scRows: number[][] = [];
for (const D of [1.5, 2.5, 4.0]) {
  const Fr = P.UC / Math.sqrt(G * w0.d);
  const ys = w0.d * 2.0 * 1.0 * 1.0 * 1.1 * 1.0 * Math.pow(D / w0.d, 0.65) * Math.pow(Fr, 0.43);
  const sc = Math.max(ys, 1.3 * D);
  scRows.push([D, ys, 1.3 * D, sc, deepest - sc]); pr(`   ${f1(D).padStart(4)}     ${f2(ys).padStart(8)}        ${f2(1.3 * D).padStart(6)}        ${f2(sc).padStart(10)}                        ${f2(deepest - sc).padStart(10)}`);
}
pr('   Scour protection (rock armour, mattress) and the pile length below the scoured bed are sized in 18.4; vessel collision: NOT computed (no ship data, D17-5).');
J.wave = { surge: P.SURGE, fetch: P.FETCH, depth: w0.d, Hs: w0.Hs, Tp: w0.Tp, Hmax: w0.Hmax, crest: w0.etaC, airGapTable: gapRows, morison: morRows, scour: scRows };

// ---- 3.9 execution / accidental
pr('\n3.9 EXECUTION AND ACCIDENTAL LOADS (listed, sized in the steps named)');
pr('   construction loads EN 1991-1-6 (18.6), cable erection of a self-anchored span needs a temporary girder support (falsework in 0-7.4 m of water or a stiffened lifting scheme, 18.6), vehicle impact on the parapets (class H2 or H3, 18.5), fire of a vehicle near a hanger (18.5), loss of one hanger or cable (EN 1993-1-11 Annex A, 18.3).');

// ================================================================== 4. summary
pr('\n4. WHAT THIS STEP FIXES FOR 18.3 (numbers in docs/island_bridge_basis.json)');
pr(`   deck ${f1(deckClear)} / ${f1(deckTotal)} m, permanent g_k ${f1(gTotal)} kN/m (PRELIMINARY), LM1 UDL ${f1(2 * udl)} kN/m + TS ${ts} kN per carriageway, braking ${f0(braking)} kN, wind v_b(${P.LIFE}) ${f1(vb)} m/s, qp(deck) ${f2(qpDeck)} kN/m2, Fw,x ${f1(Fx0)} / ${f1(Fx1)} kN/m, thermal Te ${TeMin} .. ${TeMax} C, a_g ${f3(ag / G)} g, Hmax ${f2(w0.Hmax)} m.`);
pr('   OPEN, needs the user: (1) wind speed, seismic zone, temperatures, tide / surge, current and fetch are ASSUMED (section 0); (2) ship passage, a path for pedestrians / cycles; (3) the air gap table 3.8 shows the 6 m clearance rule has little margin once a surge above the high water level is allowed.');
pr(`\n   ${pass} PASS, ${fail} FAIL  (these are consistency checks of the numbers and formulas, NOT a safety check of the bridge: the structure is not sized yet).`);
pr('   NOT RUN in this session: tsc --noEmit and vite build (npm install failed: no network in this container, node_modules missing), the game, any look at the bridge. src/ is unchanged by this step.');

writeFileSync(`${out}/STEP182_OUTPUT.txt`, L.join('\n') + '\n');
writeFileSync(`${out}/island_bridge_basis.json`, JSON.stringify(J, null, 1));
pr(`\nwrote ${out}/STEP182_OUTPUT.txt and ${out}/island_bridge_basis.json`);
