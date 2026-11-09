import type { Mission } from './MissionTypes';
import { ENGINEERING_BY_ID } from '../city/EngineeringZones';

/**
 * MISSIONS (data only). Add a mission = add one object here; nothing else changes.
 * All text the player reads or hears is English. Answers are computed from the numbers in `data`, never typed by hand.
 * Locations are the centres of the engineering areas, so they always lie on real, dry ground.
 */

function centre(id: string, dx = 0, dz = 0): { x: number; z: number } {
  const a = ENGINEERING_BY_ID.get(id);
  if (!a) throw new Error(`mission place: unknown engineering area ${id}`);
  return { x: Math.round((a.x0 + a.x1) / 2) + dx, z: Math.round((a.z0 + a.z1) / 2) + dz };
}

// --- 1. waterlogging: rational method
const RAIN = { C: 0.85, i: 80, A: 2, V: 1.5 };
const Q = (RAIN.C * RAIN.i * RAIN.A) / 360; // m3/s
const DRAIN_AREA = Q / RAIN.V;

// --- 2. stopping sight distance on a wet road
const SSD = { V: 60, t: 2.5, f: 0.35 };
const REACT = 0.278 * SSD.V * SSD.t;
const BRAKE = (SSD.V * SSD.V) / (254 * SSD.f);

// --- 3. simply supported beam with a uniform load
const BEAM = { L: 6, w: 12 };
const M_MAX = (BEAM.w * BEAM.L * BEAM.L) / 8;
const R_END = (BEAM.w * BEAM.L) / 2;

// --- 5. transmission line current
const LINE = { P: 5e6, V: 11000 };
const I_LINE = LINE.P / (Math.sqrt(3) * LINE.V);

export const MISSIONS: readonly Mission[] = [
  {
    id: 'drain-transport',
    kind: 'field',
    title: 'Waterlogging on the Transport Road',
    place: { ...centre('eng-transport'), radius: 60, label: 'Transport Engineering Area' },
    brief: 'Residents report that water stays on the road for hours after heavy rain. Go to the Transport Engineering Area, check the site data, and find the size of the drain.',
    arrival: 'You are at the site. Read the site data, then answer the questions.',
    data: [
      { label: 'Catchment area', value: `${RAIN.A} ha (paved)` },
      { label: 'Runoff coefficient C', value: String(RAIN.C) },
      { label: 'Design rainfall intensity', value: `${RAIN.i} mm/h` },
      { label: 'Flow velocity in the drain', value: `${RAIN.V} m/s` },
    ],
    questions: [
      {
        q: 'Use the rational method. What is the peak discharge in cubic metres per second?',
        kind: 'number', answer: Q, tol: 0.05, unit: 'm³/s',
        hint: 'Q equals C times i times A, divided by 360, with i in millimetres per hour and A in hectares.',
        formula: 'Q = C · i · A / 360',
        explain: `Q = ${RAIN.C} × ${RAIN.i} × ${RAIN.A} / 360 = ${Q.toFixed(3)} m³/s.`,
      },
      {
        q: 'Which method estimates peak runoff from a small catchment?',
        kind: 'text', groups: [['rational']],
        hint: 'It is named after the simple relation between rainfall and runoff.',
        explain: 'The rational method is used for small catchments, usually below about 50 hectares.',
      },
      {
        q: 'The drain flows full at 1.5 metres per second. What cross-section area is needed, in square metres?',
        kind: 'number', answer: DRAIN_AREA, tol: 0.05, unit: 'm²',
        hint: 'Continuity: discharge equals area times velocity.',
        formula: 'A = Q / V',
        explain: `A = ${Q.toFixed(3)} / ${RAIN.V} = ${DRAIN_AREA.toFixed(3)} m². A 0.5 m by 0.5 m drain is enough.`,
      },
    ],
    pass: 0.67,
    badge: 'Drainage Engineer',
    workDone: 'Workers are building the new drain.',
  },
  {
    id: 'ssd-vehicle',
    kind: 'field',
    title: 'Braking on a Wet Road',
    place: { ...centre('eng-vehicle'), radius: 60, label: 'Vehicle Engineering Area' },
    brief: 'Cars skid and crash on the wet test road. Go to the Vehicle Engineering Area and work out the stopping sight distance so the speed limit sign can be placed correctly.',
    arrival: 'You are at the test road. Use the data board and answer the questions.',
    data: [
      { label: 'Design speed V', value: `${SSD.V} km/h` },
      { label: 'Reaction time t', value: `${SSD.t} s` },
      { label: 'Friction on wet road f', value: String(SSD.f) },
      { label: 'Road gradient', value: 'level (0 %)' },
    ],
    questions: [
      {
        q: 'What is the reaction distance in metres?',
        kind: 'number', answer: REACT, tol: 0.05, unit: 'm',
        hint: 'Distance equals 0.278 times speed in kilometres per hour times reaction time.',
        formula: 'd₁ = 0.278 · V · t',
        explain: `d₁ = 0.278 × ${SSD.V} × ${SSD.t} = ${REACT.toFixed(1)} m.`,
      },
      {
        q: 'What is the braking distance on the wet road, in metres?',
        kind: 'number', answer: BRAKE, tol: 0.05, unit: 'm',
        hint: 'Braking distance equals V squared divided by 254 times f.',
        formula: 'd₂ = V² / (254 · f)',
        explain: `d₂ = ${SSD.V}² / (254 × ${SSD.f}) = ${BRAKE.toFixed(1)} m.`,
      },
      {
        q: 'What is the total stopping sight distance in metres?',
        kind: 'number', answer: REACT + BRAKE, tol: 0.05, unit: 'm',
        hint: 'Add the reaction distance and the braking distance.',
        formula: 'SSD = d₁ + d₂',
        explain: `SSD = ${REACT.toFixed(1)} + ${BRAKE.toFixed(1)} = ${(REACT + BRAKE).toFixed(1)} m.`,
      },
      {
        q: 'On a wet road, does the braking distance increase or decrease?',
        kind: 'text', groups: [['increase', 'longer', 'more', 'greater', 'higher']],
        explain: 'Wet pavement lowers friction, so the braking distance gets longer.',
      },
    ],
    pass: 0.75,
    badge: 'Road Safety Engineer',
    workDone: 'Workers are placing the speed limit signs at the right distance.',
  },
  {
    id: 'beam-structures',
    kind: 'field',
    title: 'Floor Beam Check',
    place: { ...centre('eng-structures'), radius: 60, label: 'Structural Engineering Area' },
    brief: 'A new floor beam is being cast at the Structural Engineering Area. Check the forces in the beam before the contractor pours concrete.',
    arrival: 'You are at the beam. Read the load data and answer the questions.',
    data: [
      { label: 'Beam type', value: 'Simply supported' },
      { label: 'Span L', value: `${BEAM.L} m` },
      { label: 'Uniform load w', value: `${BEAM.w} kN/m (including self weight)` },
    ],
    questions: [
      {
        q: 'What is the reaction at each support, in kilonewtons?',
        kind: 'number', answer: R_END, tol: 0.05, unit: 'kN',
        hint: 'The total load is shared equally by the two supports.',
        formula: 'R = w · L / 2',
        explain: `R = ${BEAM.w} × ${BEAM.L} / 2 = ${R_END} kN.`,
      },
      {
        q: 'What is the maximum bending moment, in kilonewton metres?',
        kind: 'number', answer: M_MAX, tol: 0.05, unit: 'kN·m',
        formula: 'M = w · L² / 8',
        explain: `M = ${BEAM.w} × ${BEAM.L}² / 8 = ${M_MAX} kN·m.`,
      },
      {
        q: 'Where does the maximum bending moment occur?',
        kind: 'text', groups: [['mid', 'centre', 'center', 'middle']],
        explain: 'For a uniform load on a simply supported beam, the bending moment is greatest at midspan.',
      },
    ],
    pass: 0.67,
    badge: 'Structural Engineer',
    workDone: 'The contractor is pouring the concrete.',
  },
  {
    id: 'meeting-campus',
    kind: 'meeting',
    title: 'Site Progress Meeting',
    place: { ...centre('eng-campus'), radius: 60, label: 'Engineering Campus' },
    brief: 'The Chief Engineer has called a progress meeting at the Engineering Campus. Be on time and be ready to answer her questions.',
    arrival: 'Good morning. Please take a seat. We will start with a few quick questions.',
    questions: [
      {
        by: 'Chief Engineer',
        q: 'The slab is M25 concrete. What does the number 25 mean?',
        kind: 'text', groups: [['compressive', 'strength'], ['28'], ['mpa', 'n/mm', 'newton', 'mega']], need: 2,
        hint: 'It is a strength, measured after 28 days.',
        explain: 'M25 means a characteristic compressive strength of 25 MPa at 28 days.',
      },
      {
        by: 'Chief Engineer',
        q: 'For how many days must ordinary Portland cement concrete be cured at least?',
        kind: 'number', min: 7, max: 14, unit: 'days',
        explain: 'IS 456 asks for at least 7 days of curing for ordinary Portland cement, and more in hot weather.',
      },
      {
        by: 'Safety Officer',
        q: 'Name one personal protective item every worker must wear on site.',
        kind: 'text', groups: [['helmet', 'hard hat', 'hardhat', 'boots', 'safety shoes', 'vest', 'gloves', 'goggles', 'harness', 'glasses']], need: 1,
        explain: 'A helmet, safety shoes, a high visibility vest, gloves and goggles are the basic kit.',
      },
    ],
    pass: 0.67,
    badge: 'Site Engineer',
    workDone: 'Meeting approved. The team starts the next stage tomorrow.',
  },
  {
    id: 'present-grid',
    kind: 'presentation',
    title: 'Transmission Line Presentation',
    place: { ...centre('eng-grid'), radius: 60, label: 'Power Grid Area' },
    brief: 'Present the new 11 kilovolt transmission line to the board at the Power Grid Area. The board will ask three questions.',
    arrival: 'The board is ready. Please begin your presentation.',
    data: [
      { label: 'Slide 1', value: 'Project: new 11 kV line' },
      { label: 'Slide 2', value: 'Load: 5 MW, three phase, power factor 1' },
      { label: 'Slide 3', value: 'Protection: relay and breaker at the substation' },
    ],
    questions: [
      {
        by: 'Board Member',
        q: 'Why is electric power transmitted at high voltage?',
        kind: 'text', groups: [['loss', 'losses', 'i2r', 'heating', 'heat'], ['current']], need: 1,
        hint: 'For the same power, a higher voltage means a lower current.',
        explain: 'Higher voltage means a lower current for the same power, so the I squared R loss in the line is smaller.',
      },
      {
        by: 'Board Member',
        q: 'A three phase line at 11 kilovolts carries 5 megawatts at unity power factor. What is the line current in amperes?',
        kind: 'number', answer: I_LINE, tol: 0.05, unit: 'A',
        hint: 'Power equals root three times line voltage times line current.',
        formula: 'I = P / (√3 · V)',
        explain: `I = 5 000 000 / (1.732 × 11 000) = ${I_LINE.toFixed(0)} A.`,
      },
      {
        by: 'Board Member',
        q: 'Which device opens the circuit automatically when a short circuit happens?',
        kind: 'text', groups: [['circuit breaker', 'breaker', 'relay', 'fuse']], need: 1,
        explain: 'A relay senses the fault and the circuit breaker opens the circuit.',
      },
    ],
    pass: 0.67,
    badge: 'Power Engineer',
    workDone: 'The board approved the project.',
  },
];

export const MISSION_BY_ID: ReadonlyMap<string, Mission> = new Map(MISSIONS.map((m) => [m.id, m]));
