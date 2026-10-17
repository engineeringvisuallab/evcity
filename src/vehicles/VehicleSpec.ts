/** Data describing a vehicle. Adding a new vehicle = adding one more spec (Stage 9 traffic, Stage 11 trucks/cranes reuse this). */
export interface EngineSpec {
  idleRpm: number;
  redlineRpm: number;
  /** [rpm, torque in Nm] at full throttle, linearly interpolated. */
  torque: [number, number][];
  /** Closed-throttle drag torque at redline (Nm); scales with rpm. */
  engineBraking: number;
}

export interface VehicleSpec {
  id: 'sedan' | 'jeep';
  /** Player-facing name (Bangla). */
  nameBn: string;
  mass: number;
  /** Chassis collider half extents (m). */
  half: { x: number; y: number; z: number };
  /** Centre-of-mass height relative to the chassis centre (negative = lower = more stable). */
  comY: number;
  wheelRadius: number;
  wheelWidth: number;
  /** Half track width and half wheelbase (m). */
  trackHalf: number;
  wheelbaseHalf: number;
  /** Suspension mounting height (chassis-local y). */
  connY: number;
  susp: { rest: number; travel: number; stiffness: number; compression: number; relaxation: number };
  frictionSlip: number;
  sideFriction: number;
  drive: 'rwd' | 'awd';
  /** Share of the drive torque sent to the front axle when awd. */
  frontShare: number;
  engine: EngineSpec;
  /** Forward gear ratios (1st..nth). */
  gears: number[];
  reverse: number;
  finalDrive: number;
  /** Transmission efficiency 0..1. */
  efficiency: number;
  /** Brake value per wheel at full pedal (Rapier units, see calibration test). */
  brakeMax: number;
  /** Steering lock at standstill (rad). */
  maxSteer: number;
  /** Aerodynamic drag: Cd and frontal area (m^2). */
  cd: number;
  frontalArea: number;
  look: { kind: 'sedan' | 'jeep'; body: number; accent: number };
  /** Where the driver sits (chassis-local, hips) and how big he looks inside. Right-hand drive: Bangladesh drives on the LEFT. */
  seat: { x: number; y: number; z: number; scale: number };
}

export const SEDAN: VehicleSpec = {
  id: 'sedan',
  nameBn: 'সেডান গাড়ি',
  mass: 1250,
  half: { x: 0.9, y: 0.35, z: 2.15 },
  comY: -0.2,
  wheelRadius: 0.33,
  wheelWidth: 0.22,
  trackHalf: 0.8,
  wheelbaseHalf: 1.3,
  connY: -0.1,
  susp: { rest: 0.35, travel: 0.25, stiffness: 22, compression: 2.3, relaxation: 3.0 },
  frictionSlip: 9,
  sideFriction: 1,
  drive: 'rwd',
  frontShare: 0,
  engine: {
    idleRpm: 900,
    redlineRpm: 6500,
    torque: [[900, 100], [1500, 135], [2500, 165], [3500, 185], [4500, 190], [5500, 175], [6500, 145]],
    engineBraking: 45,
  },
  gears: [3.6, 2.2, 1.5, 1.13, 0.92],
  reverse: 3.4,
  finalDrive: 4.1,
  efficiency: 0.9,
  brakeMax: 55,
  maxSteer: 0.55,
  cd: 0.32,
  frontalArea: 2.1,
  look: { kind: 'sedan', body: 0xb8302a, accent: 0x222a33 },
  seat: { x: -0.42, y: -0.1, z: 0.25, scale: 0.9 },
};

export const JEEP: VehicleSpec = {
  id: 'jeep',
  nameBn: 'জিপ (৪×৪)',
  mass: 1750,
  half: { x: 0.95, y: 0.42, z: 2.0 },
  comY: -0.35,
  wheelRadius: 0.42,
  wheelWidth: 0.28,
  trackHalf: 0.9,
  wheelbaseHalf: 1.2,
  connY: -0.05,
  susp: { rest: 0.5, travel: 0.35, stiffness: 17, compression: 2.0, relaxation: 2.6 },
  frictionSlip: 11,
  sideFriction: 1,
  drive: 'awd',
  frontShare: 0.4,
  engine: {
    idleRpm: 800,
    redlineRpm: 4800,
    torque: [[800, 190], [1500, 320], [2500, 380], [3500, 350], [4200, 300], [4800, 240]],
    engineBraking: 60,
  },
  gears: [4.2, 2.5, 1.6, 1.05, 0.8],
  reverse: 4.0,
  finalDrive: 4.9,
  efficiency: 0.88,
  brakeMax: 72,
  maxSteer: 0.6,
  cd: 0.48,
  frontalArea: 2.9,
  look: { kind: 'jeep', body: 0x55703c, accent: 0x2b2b2b },
  seat: { x: -0.45, y: 0.02, z: 0.05, scale: 0.95 },
};
