// Video recorder: the PURE parts (no three.js, no DOM): output sizes, centre-crop maths, bitrate, MP4 / WebM codec choice, file name, clock text.
// Unit-tested in scripts/video-recorder-test.ts. The browser part is src/record/VideoRecorder.ts, the sound capture is src/record/AudioTap.ts.

export type AspectChoice = 'screen' | '16:9' | '9:16' | '1:1' | '4:5';
export type QualityChoice = 'standard' | 'high' | 'max';
export type FormatChoice = 'auto' | 'mp4' | 'webm';
export type Container = 'mp4' | 'webm';

/** Short side of the picture in pixels (16:9 -> 1280x720, 1920x1080, 2560x1440, 3840x2160; 9:16 -> 1080x1920 ...). */
export const SHORT_SIDES = [720, 1080, 1440, 2160] as const;
export const FPS_CHOICES = [30, 60] as const;
/** Seconds; 0 = record until the user stops. */
export const AUTO_STOP_CHOICES = [0, 30, 60, 90, 180, 600] as const;

/** Bits per pixel per frame. 1080p60 -> ~15 / ~25 / ~40 Mbps. (The browser encoder is weaker than x264, so these are generous.) */
export const BITS_PER_PIXEL: Record<QualityChoice, number> = { standard: 0.12, high: 0.2, max: 0.32 };
export const MIN_VIDEO_BPS = 2_500_000;
export const MAX_VIDEO_BPS = 60_000_000;
export const AUDIO_BPS = 192_000;
const MAX_LONG_SIDE = 3840;

export interface Size { w: number; h: number; }
export interface Rect { sx: number; sy: number; sw: number; sh: number; }

const even = (x: number): number => Math.max(2, Math.round(x / 2) * 2);

/** Width / height of the wanted picture. 'screen' follows the game window (kept between 1:2 and 2.4:1 so a strange window cannot give a strange video). */
export function aspectRatio(a: AspectChoice, screenW: number, screenH: number): number {
  switch (a) {
    case '16:9': return 16 / 9;
    case '9:16': return 9 / 16;
    case '1:1': return 1;
    case '4:5': return 4 / 5;
    default: {
      const r = screenW > 0 && screenH > 0 ? screenW / screenH : 16 / 9;
      return Math.min(2.4, Math.max(0.5, r));
    }
  }
}

/** Output picture size: both sides even (H.264 needs it), the long side never above 3840. */
export function outputSize(a: AspectChoice, shortSide: number, screenW: number, screenH: number): Size {
  const r = aspectRatio(a, screenW, screenH);
  let w: number, h: number;
  if (r >= 1) { h = shortSide; w = h * r; } else { w = shortSide; h = w / r; }
  const k = Math.min(1, MAX_LONG_SIDE / Math.max(w, h));
  return { w: even(w * k), h: even(h * k) };
}

/** Centre crop of the source (the game canvas) so it fills the output with NO stretching. */
export function coverRect(srcW: number, srcH: number, dstW: number, dstH: number): Rect {
  const sr = srcW / srcH, dr = dstW / dstH;
  if (sr > dr) {
    const sw = srcH * dr;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  const sh = srcW / dr;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
}

export function videoBitrate(w: number, h: number, fps: number, q: QualityChoice): number {
  return Math.min(MAX_VIDEO_BPS, Math.max(MIN_VIDEO_BPS, Math.round(w * h * fps * BITS_PER_PIXEL[q])));
}

/** File size per minute (decimal MB) for the video + audio bitrate. */
export function estimateMbPerMinute(videoBps: number, hasAudio: boolean): number {
  return ((videoBps + (hasAudio ? AUDIO_BPS : 0)) * 60) / 8 / 1_000_000;
}

/** H.264 level (two hex digits, e.g. '2a' = 4.2) that is big enough for this size and frame rate. */
export function h264LevelHex(w: number, h: number, fps: number): string {
  const mbFrame = Math.ceil(w / 16) * Math.ceil(h / 16);
  const mbSec = mbFrame * fps;
  const levels: { mbSec: number; mbFrame: number; hex: string }[] = [
    { mbSec: 245_760, mbFrame: 8_192, hex: '28' }, // 4.0
    { mbSec: 522_240, mbFrame: 8_704, hex: '2a' }, // 4.2
    { mbSec: 589_824, mbFrame: 22_080, hex: '32' }, // 5.0
    { mbSec: 983_040, mbFrame: 36_864, hex: '33' }, // 5.1
    { mbSec: 2_073_600, mbFrame: 36_864, hex: '34' }, // 5.2
  ];
  for (const l of levels) if (mbSec <= l.mbSec && mbFrame <= l.mbFrame) return l.hex;
  return '34';
}

/** MIME types to try, best first. `hasAudio` = the stream carries a sound track. */
export function mimeCandidates(format: FormatChoice, hasAudio: boolean, w = 1920, h = 1080, fps = 30): string[] {
  const avc = `avc1.6400${h264LevelHex(w, h, fps)}`;
  const mp4 = hasAudio
    ? [`video/mp4;codecs=${avc},mp4a.40.2`, 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4']
    : [`video/mp4;codecs=${avc}`, 'video/mp4;codecs=avc1', 'video/mp4'];
  const webm = hasAudio
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=h264,opus', 'video/webm']
    : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm;codecs=h264', 'video/webm'];
  if (format === 'mp4') return mp4;
  if (format === 'webm') return webm;
  return [...mp4, ...webm]; // auto: MP4 first (Facebook / Instagram / TikTok / YouTube all take it), WebM only when the browser cannot do MP4
}

export function pickMime(format: FormatChoice, hasAudio: boolean, w: number, h: number, fps: number, isSupported: (mime: string) => boolean): { mime: string; container: Container } | null {
  for (const mime of mimeCandidates(format, hasAudio, w, h, fps)) {
    if (isSupported(mime)) return { mime, container: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
  }
  return null;
}

export function videoFileName(d: Date, container: Container): string {
  const p = (x: number): string => String(x).padStart(2, '0');
  return `evcity-video-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${container}`;
}

/** 75 -> '01:15', 3725 -> '1:02:05'. */
export function clockText(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const p = (x: number): string => String(x).padStart(2, '0');
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${p(m)}:${p(s % 60)}` : `${p(m)}:${p(s % 60)}`;
}

/** Slider value (0..100 %) -> gain 0..1.5 is NOT used: the sliders go 0..100 % and 100 % = unchanged level. */
export function percentToGain(p: number): number {
  if (!Number.isFinite(p)) return 1;
  return Math.min(1, Math.max(0, p / 100));
}

/** Music start offset typed by the user (seconds, may be empty / junk) -> 0..86400. */
export function parseStartSeconds(text: string): number {
  const v = Number.parseFloat(text.replace(',', '.'));
  return Number.isFinite(v) ? Math.min(86_400, Math.max(0, v)) : 0;
}

/** True when `now - last` is at least about one frame of the wanted fps (a little early is fine: 10 % slack so 60 fps on a 60 Hz screen is not halved by timer jitter). */
export function frameDue(now: number, last: number, fps: number): boolean {
  return now - last >= (1000 / fps) * 0.9;
}
