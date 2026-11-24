// Generates the Android launcher/splash assets with no dependencies, in the same style as the desktop icon
// (apps/desktop/scripts/make-icon.mjs): violet->pink gradient with a white "W".
// Usage (from apps/mobile): node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const W = [[0.2, 0.3], [0.35, 0.72], [0.5, 0.45], [0.65, 0.72], [0.8, 0.3]];
const A = [0x7c, 0x5c, 0xff], B = [0xff, 0x5c, 0x8a];
const SS = 3;

function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function inRoundedSquare(x, y, r = 0.22) {
  const dx = Math.max(0, Math.abs(x - 0.5) - (0.5 - r)), dy = Math.max(0, Math.abs(y - 0.5) - (0.5 - r));
  return dx * dx + dy * dy <= r * r;
}

/**
 * shape: 'full' (full-bleed square) | 'rounded' (rounded square, transparent corners) | 'none' (transparent)
 * bg: draw the gradient; glyph: 'white' | 'none'; glyphScale: shrink the W towards the centre (adaptive-icon safe zone)
 * alpha: write an alpha channel
 */
function render(N, { shape, bg, glyph, glyphScale = 1, alpha = true }) {
  const stride = N * (alpha ? 4 : 3) + 1;
  const raw = Buffer.alloc(N * stride);
  const pts = W.map(([x, y]) => [0.5 + (x - 0.5) * glyphScale, 0.5 + (y - 0.5) * glyphScale]);
  const half = 0.045 * glyphScale;
  for (let y = 0; y < N; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < N; x++) {
      let cover = 0, white = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = (x + (sx + 0.5) / SS) / N, v = (y + (sy + 0.5) / SS) / N;
        if (shape === 'rounded' && !inRoundedSquare(u, v)) continue;
        cover++;
        if (glyph === 'none') continue;
        let d = 1;
        for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(u, v, pts[i], pts[i + 1]));
        if (d <= half) white++;
      }
      const total = SS * SS;
      const bgCov = shape === 'none' ? 0 : cover / total;
      const w = white / total; // glyph coverage (only inside the shape)
      const t = (x + y) / (2 * N);
      const o = y * stride + 1 + x * (alpha ? 4 : 3);
      // glyph pixels always lie inside the shape, so: bg on -> alpha = shape coverage, colour = gradient/white mix;
      // bg off -> alpha = glyph coverage, colour = white.
      const a = bg ? bgCov : w;
      for (let c = 0; c < 3; c++) {
        const grad = A[c] + (B[c] - A[c]) * t;
        raw[o + c] = bg ? Math.round(bgCov ? (grad * (bgCov - w) + 255 * w) / bgCov : grad) : 255;
      }
      if (alpha) raw[o + 3] = Math.round(a * 255);
    }
  }
  return encode(N, alpha ? 6 : 2, raw);
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function encode(N, colorType, raw) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = colorType;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('assets', { recursive: true });
const out = {
  // legacy / store icon: full-bleed (Android masks it), no alpha
  'icon.png': render(1024, { shape: 'full', bg: true, glyph: 'white', alpha: false }),
  // adaptive icon layers: the launcher masks the 108dp canvas, so keep the glyph inside the ~61% safe zone
  'android-icon-background.png': render(512, { shape: 'full', bg: true, glyph: 'none' }),
  'android-icon-foreground.png': render(512, { shape: 'none', bg: false, glyph: 'white', glyphScale: 0.85 }),
  // themed (monochrome) icon: alpha silhouette, the system tints it
  'android-icon-monochrome.png': render(432, { shape: 'none', bg: false, glyph: 'white', glyphScale: 0.85 }),
  // splash: same rounded-square mark as the desktop app
  'splash-icon.png': render(1024, { shape: 'rounded', bg: true, glyph: 'white' }),
  'favicon.png': render(48, { shape: 'rounded', bg: true, glyph: 'white' }),
};
for (const [name, buf] of Object.entries(out)) {
  writeFileSync(`assets/${name}`, buf);
  console.log(`assets/${name}`, buf.length, 'bytes');
}
