// Minimal ZIP writer (STORE, no compression): enough to hand several shapefile parts to the player as ONE download. Pure, no DOM.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** files: name (ASCII, '/' for folders) -> bytes. Returns the .zip file bytes. */
export function makeZip(files: Map<string, Uint8Array>, date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const entries: { name: Uint8Array; data: Uint8Array; crc: number; offset: number }[] = [];
  let size = 0;
  for (const [name, data] of files) {
    entries.push({ name: enc.encode(name), data, crc: crc32(data), offset: size });
    size += 30 + enc.encode(name).length + data.length;
  }
  const cdStart = size;
  for (const e of entries) size += 46 + e.name.length;
  const out = new Uint8Array(size + 22);
  const v = new DataView(out.buffer);
  let o = 0;
  for (const e of entries) {
    v.setUint32(o, 0x04034b50, true);
    v.setUint16(o + 4, 20, true); // version needed
    v.setUint16(o + 6, 0x0800, true); // UTF-8 names
    v.setUint16(o + 8, 0, true); // STORE
    v.setUint16(o + 10, dosTime, true);
    v.setUint16(o + 12, dosDate, true);
    v.setUint32(o + 14, e.crc, true);
    v.setUint32(o + 18, e.data.length, true);
    v.setUint32(o + 22, e.data.length, true);
    v.setUint16(o + 26, e.name.length, true);
    v.setUint16(o + 28, 0, true);
    out.set(e.name, o + 30);
    out.set(e.data, o + 30 + e.name.length);
    o += 30 + e.name.length + e.data.length;
  }
  for (const e of entries) {
    v.setUint32(o, 0x02014b50, true);
    v.setUint16(o + 4, 20, true);
    v.setUint16(o + 6, 20, true);
    v.setUint16(o + 8, 0x0800, true);
    v.setUint16(o + 10, 0, true);
    v.setUint16(o + 12, dosTime, true);
    v.setUint16(o + 14, dosDate, true);
    v.setUint32(o + 16, e.crc, true);
    v.setUint32(o + 20, e.data.length, true);
    v.setUint32(o + 24, e.data.length, true);
    v.setUint16(o + 28, e.name.length, true);
    v.setUint32(o + 42, e.offset, true);
    out.set(e.name, o + 46);
    o += 46 + e.name.length;
  }
  v.setUint32(o, 0x06054b50, true);
  v.setUint16(o + 8, entries.length, true);
  v.setUint16(o + 10, entries.length, true);
  v.setUint32(o + 12, size - cdStart, true);
  v.setUint32(o + 16, cdStart, true);
  return out;
}
