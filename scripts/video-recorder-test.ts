// Headless test of the PURE parts of the video recorder (src/record/VideoRecorderMeta.ts): npx tsx scripts/video-recorder-test.ts
// The browser part (src/record/VideoRecorder.ts, AudioTap.ts) needs a browser + GPU: check it by hand (record 10 s with game sound, mic and a music file; open the file).
import {
  AUDIO_BPS, MAX_VIDEO_BPS, MIN_VIDEO_BPS, aspectRatio, clockText, coverRect, estimateMbPerMinute, frameDue, h264LevelHex, mimeCandidates,
  outputSize, parseStartSeconds, percentToGain, pickMime, videoBitrate, videoFileName,
} from '../src/record/VideoRecorderMeta';
let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) < e;

// sizes
let s = outputSize('16:9', 1080, 1280, 720);
ok(s.w === 1920 && s.h === 1080, '16:9 1080 -> 1920x1080');
s = outputSize('9:16', 1080, 1280, 720);
ok(s.w === 1080 && s.h === 1920, '9:16 1080 -> 1080x1920');
s = outputSize('1:1', 1440, 1280, 720);
ok(s.w === 1440 && s.h === 1440, '1:1 1440 -> 1440x1440');
s = outputSize('4:5', 1080, 1280, 720);
ok(s.w === 1080 && s.h === 1350, '4:5 1080 -> 1080x1350');
s = outputSize('16:9', 2160, 1280, 720);
ok(s.w === 3840 && s.h === 2160, '16:9 2160 -> 3840x2160 (4K)');
s = outputSize('9:16', 2160, 1280, 720);
ok(s.h === 3840 && s.w === 2160, '9:16 2160 -> long side capped at 3840');
for (const a of ['screen', '16:9', '9:16', '1:1', '4:5'] as const) for (const side of [720, 1080, 1440, 2160]) {
  const o = outputSize(a, side, 1366, 768);
  ok(o.w % 2 === 0 && o.h % 2 === 0 && Math.max(o.w, o.h) <= 3840, `${a} ${side}: even sides, long side <= 3840 (${o.w}x${o.h})`);
}
ok(near(aspectRatio('screen', 5000, 100), 2.4) && near(aspectRatio('screen', 100, 5000), 0.5), 'screen aspect is clamped 1:2 .. 2.4:1');
ok(near(aspectRatio('screen', 0, 0), 16 / 9), 'screen aspect with zero size -> 16:9');

// centre crop: no stretching
let r = coverRect(1920, 1080, 1080, 1920); // wide source -> tall output: crop the sides
ok(near(r.sw / r.sh, 1080 / 1920) && r.sh === 1080 && near(r.sx, (1920 - r.sw) / 2) && r.sy === 0, 'cover: wide -> tall crops the sides, centred');
r = coverRect(1080, 1920, 1920, 1080); // tall source -> wide output: crop top / bottom
ok(near(r.sw / r.sh, 1920 / 1080) && r.sw === 1080 && near(r.sy, (1920 - r.sh) / 2) && r.sx === 0, 'cover: tall -> wide crops top / bottom, centred');
r = coverRect(1920, 1080, 1280, 720);
ok(near(r.sx, 0) && near(r.sy, 0) && near(r.sw, 1920) && near(r.sh, 1080), 'cover: same aspect = whole picture');

// bitrate
ok(videoBitrate(1920, 1080, 60, 'high') === Math.round(1920 * 1080 * 60 * 0.2), '1080p60 high bitrate formula (~25 Mbps)');
ok(videoBitrate(1920, 1080, 60, 'standard') < videoBitrate(1920, 1080, 60, 'high') && videoBitrate(1920, 1080, 60, 'high') < videoBitrate(1920, 1080, 60, 'max'), 'standard < high < max');
ok(videoBitrate(320, 240, 30, 'standard') === MIN_VIDEO_BPS, 'tiny picture -> minimum bitrate');
ok(videoBitrate(3840, 2160, 60, 'max') === MAX_VIDEO_BPS, '4K60 max -> capped bitrate');
ok(near(estimateMbPerMinute(8_000_000, false), 60) && near(estimateMbPerMinute(8_000_000 - AUDIO_BPS, true), 60), 'estimate: 8 Mbps = 60 MB/min, audio counted');

// H.264 level
ok(h264LevelHex(1920, 1080, 30) === '28' && h264LevelHex(1920, 1080, 60) === '2a', '1080p30 -> 4.0, 1080p60 -> 4.2');
ok(h264LevelHex(3840, 2160, 30) === '33' && h264LevelHex(3840, 2160, 60) === '34', '4K30 -> 5.1, 4K60 -> 5.2');
ok(h264LevelHex(1280, 720, 30) === '28', '720p30 -> 4.0');

// codec choice
const mp4First = mimeCandidates('auto', true);
ok(mp4First[0].startsWith('video/mp4') && mp4First[mp4First.length - 1].startsWith('video/webm'), 'auto: MP4 first, WebM last');
ok(mimeCandidates('mp4', true).every((m) => m.startsWith('video/mp4')) && mimeCandidates('webm', false).every((m) => m.startsWith('video/webm')), 'mp4 / webm lists are pure');
ok(mimeCandidates('mp4', true)[0].includes('mp4a.40.2') && !mimeCandidates('mp4', false)[0].includes('mp4a'), 'audio codec only when there is a sound track');
ok(pickMime('auto', true, 1920, 1080, 30, (m) => m.startsWith('video/webm;codecs=vp9'))?.container === 'webm', 'pickMime: browser without MP4 -> WebM');
ok(pickMime('auto', true, 1920, 1080, 30, () => true)?.container === 'mp4', 'pickMime: everything supported -> MP4');
ok(pickMime('mp4', true, 1920, 1080, 30, () => false) === null, 'pickMime: nothing supported -> null');

// names, clock, sliders, offsets, timing
ok(videoFileName(new Date(2026, 10, 19, 7, 5, 9), 'mp4') === 'evcity-video-20261119-070509.mp4', 'file name: date + time + extension');
ok(clockText(75) === '01:15' && clockText(3725) === '1:02:05' && clockText(-4) === '00:00', 'clock text');
ok(percentToGain(100) === 1 && percentToGain(0) === 0 && percentToGain(250) === 1 && percentToGain(-5) === 0 && percentToGain(NaN) === 1, 'slider -> gain 0..1');
ok(parseStartSeconds('12,5') === 12.5 && parseStartSeconds('abc') === 0 && parseStartSeconds('-3') === 0 && parseStartSeconds('999999') === 86_400, 'music start offset parsing');
ok(frameDue(1000 / 30, 0, 30) && !frameDue(10, 0, 30) && frameDue(16.7, 0, 60), 'frameDue: 30 fps and 60 fps (10 % slack)');

console.log(fails === 0 ? 'ALL PASS' : `${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
