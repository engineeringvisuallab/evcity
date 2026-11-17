// Headless test of the PURE parts of the 360 photo (src/ui/Photo360Meta.ts): npx tsx scripts/photo360-test.ts
// The GPU part (src/ui/Photo360.ts) needs a browser: check it by hand (take a photo, open it in Facebook / a 360 viewer).
import { PANO_SIZES, buildXmp, equirectDir, headingAngle, injectXmp, photoFileName, pickSize } from '../src/ui/Photo360Meta';
import { buildViewerHtml, escapeHtml, viewerFileName } from '../src/ui/Photo360Viewer';
let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const near = (a: number[], b: number[], e = 1e-9) => a.every((x, i) => Math.abs(x - b[i]) < e);

// sizes: always 2:1, face = width / 4, fallback goes down, never below 'low'
for (const k of ['low', 'mid', 'high'] as const) ok(PANO_SIZES[k].w === 2 * PANO_SIZES[k].h && PANO_SIZES[k].face * 4 === PANO_SIZES[k].w, `${k}: 2:1 and face = w/4`);
ok(pickSize('high', 16384).w === 8192, 'pickSize: big GPU keeps high');
ok(pickSize('high', 2048).w === 8192 && pickSize('high', 1536).w === 6144, 'pickSize: texture limit 1536 -> mid');
ok(pickSize('high', 1024).w === 4096 && pickSize('mid', 512).w === 4096, 'pickSize: small GPU -> low (never below)');
ok(pickSize('high', 16384, 6144).w === 6144, 'pickSize: canvas width limit 6144 -> mid');

// direction maths: centre = forward, right = +x, up = +y, not mirrored
ok(near(equirectDir(0.5, 0.5), [0, 0, -1]), 'centre of the picture = forward (0,0,-1)');
ok(near(equirectDir(0.75, 0.5), [1, 0, 0]), 'u = 0.75 = 90 deg to the RIGHT (+x)');
ok(near(equirectDir(0.25, 0.5), [-1, 0, 0]), 'u = 0.25 = 90 deg to the LEFT (-x)');
ok(near(equirectDir(0.0, 0.5), [0, 0, 1]) && near(equirectDir(1.0, 0.5), [0, 0, 1], 1e-9), 'left / right edge = straight BEHIND (+z), seam closes');
ok(near(equirectDir(0.3, 0.0), [0, 1, 0]) && near(equirectDir(0.3, 1.0), [0, -1, 0]), 'top row = up, bottom row = down');
// heading: the centre follows the camera forward for any yaw
for (const [fx, fz] of [[0, -1], [1, 0], [0, 1], [-1, 0], [0.6, -0.8], [-0.28, 0.96]]) {
  const d = equirectDir(0.5, 0.5, headingAngle(fx, fz));
  ok(near(d, [fx, 0, fz], 1e-9), `heading: centre looks at (${fx}, ${fz})`);
  const r = equirectDir(0.75, 0.5, headingAngle(fx, fz)); // right of the viewer = forward rotated clockwise seen from above: (-fz, fx)... in x/z axes right = (-fz, fx)
  ok(near(r, [-fz, 0, fx], 1e-9), `heading: right edge keeps the right-hand side for (${fx}, ${fz})`);
}
ok(headingAngle(0, 0) === 0, 'headingAngle: zero vector = 0 (no NaN)');

// XMP + JPEG injection on a small fake JPEG (SOI, JFIF APP0, DQT, EOI)
const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
const rest = [0xff, 0xdb, 0x00, 0x04, 0x11, 0x22, 0xff, 0xd9];
const jpg = new Uint8Array([0xff, 0xd8, ...app0, ...rest]);
const out = injectXmp(jpg, { width: 8192, height: 4096 });
const segLen = (out[2 + app0.length + 2] << 8) | out[2 + app0.length + 3];
ok(out[0] === 0xff && out[1] === 0xd8, 'inject: SOI first');
ok(out[2] === 0xff && out[3] === 0xe0 && out[2 + app0.length] === 0xff && out[2 + app0.length + 1] === 0xe1, 'inject: APP1 (XMP) comes right after the JFIF APP0');
ok(segLen <= 65535 && out.length === jpg.length + 2 + segLen, `inject: segment length field ${segLen} matches the bytes added`);
const after = 2 + app0.length + 2 + segLen;
ok(Array.from(out.subarray(after)).join() === rest.join(), 'inject: the rest of the JPEG is unchanged');
const text = new TextDecoder().decode(out.subarray(2 + app0.length + 4, after));
ok(text.startsWith('http://ns.adobe.com/xap/1.0/\0'), 'inject: XMP namespace header');
for (const t of ['equirectangular', 'FullPanoWidthPixels>8192<', 'FullPanoHeightPixels>4096<', 'CroppedAreaImageWidthPixels>8192<', 'UsePanoramaViewer>True<']) ok(text.includes(t), `xmp has ${t}`);
ok(buildXmp({ width: 4096, height: 2048 }).includes('FullPanoHeightPixels>2048<'), 'buildXmp uses the given size');
const noJfif = injectXmp(new Uint8Array([0xff, 0xd8, ...rest]), { width: 4096, height: 2048 });
ok(noJfif[2] === 0xff && noJfif[3] === 0xe1, 'inject: no APP0 -> APP1 right after SOI');
let threw = false;
try { injectXmp(new Uint8Array([1, 2, 3, 4]), { width: 1, height: 1 }); } catch { threw = true; }
ok(threw, 'inject: not a JPEG -> error');
ok(photoFileName(new Date(2026, 10, 16, 9, 5, 7), 'day') === 'evcity-360-day-20261116-090507.jpg', 'file name');

// standalone HTML viewer (mouse-turnable)
{
  const url = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
  const html = buildViewerHtml(url, 'A <b> & "x"');
  ok(html.includes(`window.PANO_SRC="${url}"`), 'viewer: picture is embedded as a data URL');
  ok(html.includes('<title>A &lt;b&gt; &amp; &quot;x&quot;</title>'), 'viewer: title is escaped');
  ok((html.match(/<script>/g) ?? []).length === 2 && (html.match(/<\/script>/g) ?? []).length === 2, 'viewer: exactly 2 script blocks (nothing breaks out)');
  ok(!/https?:\/\/(?!www\.w3\.org)/.test(html.replace(/<[^>]*>/g, '')) , 'viewer: no network address in the code');
  const js = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  let syntax = true;
  try { new Function(js); } catch { syntax = false; }
  ok(syntax, 'viewer: inline JS parses');
  ok(js.includes('atan(d.x, -d.z)') && js.includes('lon / (2.0 * PI) + 0.5') && js.includes('0.5 - lat / PI'), 'viewer: same lon/lat maths as equirectDir');
  let bad = 0;
  for (const x of ['data:text/html;base64,AAAA', 'data:image/jpeg;base64,AA"></script>', 'nope']) { try { buildViewerHtml(x, 't'); } catch { bad++; } }
  ok(bad === 3, 'viewer: refuses anything that is not a plain JPEG data URL');
  ok(escapeHtml('<&>"') === '&lt;&amp;&gt;&quot;', 'escapeHtml');
  ok(viewerFileName('evcity-360-day-20261116-090507.jpg') === 'evcity-360-day-20261116-090507-viewer.html', 'viewer file name');
  // view direction of the centre pixel at yaw 0 / pitch 0 is forward (0,0,-1), right is +x (same as the JPEG, not mirrored)
  const [cx, , cz] = equirectDir(0.5, 0.5);
  ok(Math.abs(cx) < 1e-9 && Math.abs(cz + 1) < 1e-9, 'viewer: yaw 0 = centre of the picture = forward');
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
