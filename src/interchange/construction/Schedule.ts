// CONSTRUCTION SCHEDULE (T13). Stub. Data only, no rendering.
export type PhaseId = 'clearing' | 'earthwork' | 'drainage' | 'foundation' | 'abutment' | 'deck' | 'pavement' | 'marking' | 'furniture' | 'landscape';
export interface Task {
  id: string;
  phase: PhaseId;
  /** Element of the interchange (ramp id, wall id, deck id...). */
  element: string;
  startDay: number;
  endDay: number;
  label: { en: string; bn: string };
}
export interface Schedule {
  totalDays: number;
  tasks: Task[];
}
/** progress 0..1 of one task at `day`. */
export const progressAt = (t: Task, day: number): number => Math.max(0, Math.min(1, (day - t.startDay) / Math.max(1, t.endDay - t.startDay)));
/** T13: derive the schedule from a built interchange model. */
export function buildSchedule(_model: unknown): Schedule {
  throw new Error('T13 not implemented');
}
