// RECORDER (T16). Stub: canvas.captureStream + MediaRecorder -> .webm download.
export interface Recorder {
  start(): void;
  stop(): Promise<Blob>;
}
export function createRecorder(_canvas: unknown, _fps = 30): Recorder {
  throw new Error('T16 not implemented');
}
