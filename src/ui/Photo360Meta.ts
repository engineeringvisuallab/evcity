// 360 photo: the PURE parts (no three.js, no DOM): output sizes, the equirectangular direction maths, GPano XMP metadata and JPEG injection.
// Unit-tested in scripts/photo360-test.ts. The GPU part is src/ui/Photo360.ts.

export type PanoQuality = 'low' | 'mid' | 'high';
export interface PanoSize { w: number; h: number; face: number; }

/** Output = 2:1 picture, cube face = width / 4 (every output pixel row is at most one cube texel high at the equator). */
export const PANO_SIZES: Record<PanoQuality, PanoSize> = {
  low: { w: 4096, h: 2048, face: 1024 },
  mid: { w: 6144, h: 3072, face: 1536 },
  high: { w: 8192, h: 4096, face: 2048 },
};

/** The wanted size, or the biggest smaller one the GPU (maxTextureSize) and the 2D canvas (maxCanvasWidth) can hold. Never below 'low' (then the caller reports the failure). */
export function pickSize(want: PanoQuality, maxTextureSize: number, maxCanvasWidth = 16384): PanoSize {
  const order: PanoQuality[] = ['high', 'mid', 'low'];
  for (let i = order.indexOf(want); i < order.length; i++) {
    const s = PANO_SIZES[order[i]];
    if (s.face <= maxTextureSize && s.w <= maxCanvasWidth) return s;
  }
  return PANO_SIZES.low;
}

/**
 * Yaw angle `a` so that the CENTRE of the picture looks where the camera looks (forward = fx, fz on the ground plane, world axes: x east, z south).
 * lookup(d) = (d.x cos a + d.z sin a, d.y, -d.x sin a + d.z cos a): (0,0,-1) -> (-sin a, 0, -cos a) = (fx, fz) for a = atan2(-fx, -fz).
 */
export function headingAngle(fx: number, fz: number): number {
  if (Math.hypot(fx, fz) < 1e-6) return 0;
  return Math.atan2(-fx, -fz);
}

/**
 * Direction (world axes, y up) seen by pixel (u, v), u, v in 0..1, v = 0 is the TOP row. Centre of the picture (0.5, 0.5) = forward; u grows to the RIGHT of
 * the viewer (+x when forward is -z), so the picture is not mirrored. The GLSL in Photo360.ts uses the same formula.
 */
export function equirectDir(u: number, v: number, heading = 0): [number, number, number] {
  const lon = (u - 0.5) * 2 * Math.PI;
  const lat = (0.5 - v) * Math.PI;
  const dx = Math.sin(lon) * Math.cos(lat), dy = Math.sin(lat), dz = -Math.cos(lon) * Math.cos(lat);
  const c = Math.cos(heading), s = Math.sin(heading);
  return [dx * c + dz * s, dy, -dx * s + dz * c];
}

export interface PanoMeta { width: number; height: number; headingDeg?: number; }

/** GPano XMP packet: Facebook, Google Photos, Google Street View and most viewers recognise the picture as a 360 photo from it. */
export function buildXmp(m: PanoMeta): string {
  return `<?xpacket begin="\u{FEFF}" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="EVCity">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:GPano="http://ns.google.com/photos/1.0/panorama/">
   <GPano:UsePanoramaViewer>True</GPano:UsePanoramaViewer>
   <GPano:ProjectionType>equirectangular</GPano:ProjectionType>
   <GPano:CaptureSoftware>EVCity</GPano:CaptureSoftware>
   <GPano:FullPanoWidthPixels>${m.width}</GPano:FullPanoWidthPixels>
   <GPano:FullPanoHeightPixels>${m.height}</GPano:FullPanoHeightPixels>
   <GPano:CroppedAreaImageWidthPixels>${m.width}</GPano:CroppedAreaImageWidthPixels>
   <GPano:CroppedAreaImageHeightPixels>${m.height}</GPano:CroppedAreaImageHeightPixels>
   <GPano:CroppedAreaLeftPixels>0</GPano:CroppedAreaLeftPixels>
   <GPano:CroppedAreaTopPixels>0</GPano:CroppedAreaTopPixels>
   <GPano:InitialViewHeadingDegrees>${Math.round(m.headingDeg ?? 0)}</GPano:InitialViewHeadingDegrees>
   <GPano:PoseHeadingDegrees>0</GPano:PoseHeadingDegrees>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

const XMP_NS = 'http://ns.adobe.com/xap/1.0/\0';

/** Inserts the XMP APP1 segment into a JPEG: after SOI, and after a JFIF APP0 if there is one (the spec wants APP0 first). Throws if it is not a JPEG. */
export function injectXmp(jpeg: Uint8Array, m: PanoMeta): Uint8Array {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('not a JPEG (no SOI)');
  const enc = new TextEncoder();
  const payload = enc.encode(XMP_NS + buildXmp(m));
  const segLen = payload.length + 2; // the length field counts itself
  if (segLen > 65535) throw new Error('XMP too long');
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + ((jpeg[4] << 8) | jpeg[5]); // skip APP0 (JFIF)
  const out = new Uint8Array(jpeg.length + 4 + payload.length);
  out.set(jpeg.subarray(0, at), 0);
  out[at] = 0xff; out[at + 1] = 0xe1; out[at + 2] = (segLen >> 8) & 255; out[at + 3] = segLen & 255;
  out.set(payload, at + 4);
  out.set(jpeg.subarray(at), at + 4 + payload.length);
  return out;
}

export function photoFileName(d: Date, tag: string): string {
  const p = (x: number): string => String(x).padStart(2, '0');
  return `evcity-360-${tag}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`;
}
