// Generates build/icon.png (512x512) with no dependencies: gradient rounded square + white "W".
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const N = 512, SS = 3;
const W = [[0.2, 0.3], [0.35, 0.72], [0.5, 0.45], [0.65, 0.72], [0.8, 0.3]];
const A = [0x7c, 0x5c, 0xff], B = [0xff, 0x5c, 0x8a];

function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function inRoundedSquare(x, y, r = 0.22) {
  const dx = Math.max(0, Math.abs(x - 0.5) - (0.5 - r)), dy = Math.max(0, Math.abs(y - 0.5) - (0.5 - r));
  return dx * dx + dy * dy <= r * r;
}

const raw = Buffer.alloc(N * (N * 4 + 1));
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0;
  for (let x = 0; x < N; x++) {
    let cover = 0, white = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = (x + (sx + 0.5) / SS) / N, v = (y + (sy + 0.5) / SS) / N;
      if (!inRoundedSquare(u, v)) continue;
      cover++;
      let d = 1;
      for (let i = 0; i < W.length - 1; i++) d = Math.min(d, segDist(u, v, W[i], W[i + 1]));
      if (d <= 0.045) white++;
    }
    const a = cover / (SS * SS), w = cover ? white / cover : 0;
    const t = (x + y) / (2 * N);
    const o = y * (N * 4 + 1) + 1 + x * 4;
    for (let c = 0; c < 3; c++) {
      const grad = A[c] + (B[c] - A[c]) * t;
      raw[o + c] = Math.round(grad * (1 - w) + 255 * w);
    }
    raw[o + 3] = Math.round(a * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', png);
console.log('build/icon.png', png.length, 'bytes');
