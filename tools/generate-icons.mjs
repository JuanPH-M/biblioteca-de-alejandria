// Genera los íconos PNG de la app (templo dorado sobre degradado violeta).
// Uso: node tools/generate-icons.mjs   (sin dependencias, solo Node)
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BG1 = hex('#1e1446'), BG2 = hex('#6d28d9'), G1 = hex('#fde68a'), G2 = hex('#f59e0b');

function inRoundRect(x, y, r) {
  const dx = Math.max(r - x, 0, x - (1 - r)), dy = Math.max(r - y, 0, y - (1 - r));
  return dx * dx + dy * dy <= r * r;
}
function inTri(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const s = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = s(px, py, ax, ay, bx, by), d2 = s(px, py, bx, by, cx, cy), d3 = s(px, py, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
const rect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

function temple(x, y) {
  if (inTri(x, y, [0.5, 0.17], [0.17, 0.36], [0.83, 0.36])) {
    // hueco interior del frontón
    return !inTri(x, y, [0.5, 0.235], [0.3, 0.335], [0.7, 0.335]) || inCircle(x, y, 0.5, 0.3, 0.025);
  }
  if (rect(x, y, 0.2, 0.385, 0.8, 0.435)) return true;
  for (const cx of [0.285, 0.43, 0.57, 0.715]) {
    if (rect(x, y, cx - 0.035, 0.465, cx + 0.035, 0.7)) return true;
    if (rect(x, y, cx - 0.05, 0.455, cx + 0.05, 0.475)) return true;
  }
  if (rect(x, y, 0.19, 0.715, 0.81, 0.755)) return true;
  if (rect(x, y, 0.14, 0.775, 0.86, 0.82)) return true;
  return false;
}
function inCircle(x, y, cx, cy, r) { return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; }

function render(size, { maskable = false, radius = 0.22 } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const SS = 4;
  const scale = maskable ? 0.72 : 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let acc = [0, 0, 0, 0];
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size;
      if (!maskable && !inRoundRect(u, v, radius)) continue;
      const t = Math.min(1, Math.max(0, (u + v) / 2));
      let c = mix(BG1, BG2, t);
      // halo suave detrás del templo
      const glow = Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.45) / 0.5);
      c = mix(c, hex('#a78bfa'), glow * 0.25);
      const tu = (u - 0.5) / scale + 0.5, tv = (v - 0.5) / scale + 0.5;
      if (temple(tu, tv)) c = mix(G1, G2, Math.min(1, Math.max(0, (tv - 0.15) / 0.7)));
      acc = [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2], acc[3] + 255];
    }
    const n = SS * SS, i = (y * size + x) * 4;
    const a = acc[3] / n;
    const cov = acc[3] / 255 || 1;
    px[i] = acc[0] / cov; px[i + 1] = acc[1] / cov; px[i + 2] = acc[2] / cov; px[i + 3] = a;
  }
  return png(size, px);
}

const out = new URL('../icons/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), render(192));
writeFileSync(new URL('icon-512.png', out), render(512));
writeFileSync(new URL('maskable-512.png', out), render(512, { maskable: true }));
writeFileSync(new URL('apple-touch-icon.png', out), render(180, { maskable: true }));
writeFileSync(new URL('favicon-32.png', out), render(32, { radius: 0.18 }));
console.log('Íconos generados en /icons');
