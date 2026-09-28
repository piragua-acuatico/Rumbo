// Genera los íconos PNG de Rumbo sin dependencias: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const clamp = v => Math.max(0, Math.min(1, v));
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Coordenadas normalizadas 0..1. Fondo índigo→violeta, luna creciente + check.
const TOP = [74, 86, 208];
const BOTTOM = [36, 40, 110];
const WHITE = [255, 255, 255];
const GOLD = [255, 205, 90];

function shade(u, v) {
  let c = mix(TOP, BOTTOM, clamp(v * 0.9 + u * 0.2));
  // Check blanco grueso (el “hecho”).
  const w = 0.055;
  const d = Math.min(segDist(u, v, 0.30, 0.56, 0.45, 0.71), segDist(u, v, 0.45, 0.71, 0.73, 0.40));
  const aCheck = clamp((w - d) / 0.006 + 0.5);
  // Luna creciente dorada arriba a la izquierda (la planificación nocturna).
  const moon = Math.hypot(u - 0.33, v - 0.30) - 0.1;
  const bite = Math.hypot(u - 0.375, v - 0.255) - 0.09;
  const aMoon = clamp((-Math.max(moon, -bite)) / 0.006 + 0.5);
  c = mix(c, GOLD, aMoon);
  c = mix(c, WHITE, aCheck);
  return c;
}

function render(size, ss = 3) {
  return png(size, (x, y) => {
    let acc = [0, 0, 0];
    for (let i = 0; i < ss; i++) for (let j = 0; j < ss; j++) {
      const c = shade((x + (i + 0.5) / ss) / size, (y + (j + 0.5) / ss) / size);
      acc = acc.map((v, k) => v + c[k]);
    }
    return acc.map(v => Math.round(v / (ss * ss)));
  });
}

const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  fs.writeFileSync(path.join(out, name), render(size));
  console.log('ok', name);
}
