// MISSIONS (Stage 13): shared types. Everything the player reads or hears is English.

/** field = visit a site and answer; meeting / presentation = Q&A with people; hall = give a real presentation in the Presentation Hall (voice marks). */
export type MissionKind = 'field' | 'meeting' | 'presentation' | 'hall';

/** One question. 'number' = a calculation (tolerance or range); 'text' = a short answer checked by keyword groups. */
export interface MissionQuestion {
  /** Spoken and shown. */
  q: string;
  kind: 'number' | 'text';
  /** Who asks (meeting / presentation): shown as the speaker. */
  by?: string;
  // number
  answer?: number;
  /** Relative tolerance, 0.05 = within 5 %. Default 0.05. */
  tol?: number;
  /** Accepted range instead of answer + tol. */
  min?: number;
  max?: number;
  unit?: string;
  // text: every group is a list of alternatives; the answer must hit `need` groups (default: all)
  groups?: string[][];
  need?: number;
  hint?: string;
  /** One or two short sentences shown (and spoken) after the answer. */
  explain: string;
  formula?: string;
}

export interface MissionPlace {
  x: number;
  z: number;
  /** The player has "arrived" inside this many metres. */
  radius: number;
  label: string;
}

export interface Mission {
  id: string;
  kind: MissionKind;
  title: string;
  place: MissionPlace;
  /** Spoken when the mission is chosen. */
  brief: string;
  /** Spoken on arrival (optional). */
  arrival?: string;
  /** Site data the player can read (field missions) or slide points (presentation). */
  data?: { label: string; value: string }[];
  questions: MissionQuestion[];
  /** Share of correct answers needed to pass (0..1). */
  pass: number;
  badge: string;
  /** What the workers do after a pass (only a message: the world does not change). */
  workDone: string;
}

export interface MissionResult {
  score: number; // correct answers
  total: number;
  passed: boolean;
}

export type MissionProgress = Record<string, MissionResult>;

/** What the minimap needs for one mission. */
export interface MissionPin {
  id: string;
  x: number;
  z: number;
  kind: MissionKind;
  /** The mission being tracked: pulsing ring, dashed line and an edge arrow with the distance. */
  active: boolean;
  done: boolean;
  /** Metres from the player to the pin (only for the active one). */
  distance?: number;
}
