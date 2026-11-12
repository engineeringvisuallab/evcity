// TIMELAPSE CAMERA + OVERLAY (T16). Stub: orbit / fixed drone path, "Day N / phase / what is happening (bn)" overlay, speed control.
export interface CameraShot {
  kind: 'orbit' | 'fixed';
  fromDay: number;
  toDay: number;
}
export function defaultShots(_totalDays: number): CameraShot[] {
  throw new Error('T16 not implemented');
}
