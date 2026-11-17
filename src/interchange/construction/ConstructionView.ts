// CONSTRUCTION VIEW (T14). Stub: draw each element at its progress; the old road stays open until the switch day.
import type { Schedule } from './Schedule';

export interface ConstructionView {
  setDay(day: number): void;
  dispose(): void;
}
export function createConstructionView(_scene: unknown, _model: unknown, _schedule: Schedule): ConstructionView {
  throw new Error('T14 not implemented');
}
