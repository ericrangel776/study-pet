// Generates the app icons in icons/ from the pet's own pixel art.
// It runs render.js against a stand-in canvas that records pixels, crops the
// pet, and scales it up with hard pixel edges. Run with: npm run icons

import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { draw } from "../src/render.js";

const W = 64, H = 48;
const LCD = [0xB9, 0xC7, 0x9A];

// A stand-in for a canvas 2D context: just enough for render.js.
const px = new Array(W * H).fill(null);
const ctx = {
  fillStyle: "#000",
  clearRect() { px.fill(null); },
  fillRect(x, y, w, h) {
    const c = parseColor(this.fillStyle);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++)
      if (i >= 0 && i < W && j >= 0 && j < H) px[j * W + i] = c;
  }
};
function parseColor(s) {
  if (s.startsWith("#")) return [1, 3, 5].map(k => parseInt(s.slice(k, k + 2), 16)).concat(1);
  const m = s.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);
  return [+m[1], +m[2], +m[3], +m[4]];
}

// A happy teen, standing still. Motion is off so the pose is the same every run.
const long = -1e12;
draw(ctx, { now: 1300, mood: "happy", stage: 3, hearts: 0, unread: 0, hatchAt: long, growAt: long, patAt: long, rm: true });

// Crop to the pet, skipping the hearts along the top.
let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (let y = 9; y < H; y++) for (let x = 0; x < W; x++) if (px[y * W + x]) {
  x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
}
const pw = x1 - x0 + 1, ph = y1 - y0 + 1;

// `fill` is how much of the icon the pet may cover. Maskable icons get cropped
// to a circle by the system, so they keep the pet inside the middle 60%.
function icon(size, fill) {
  const scale = Math.max(1, Math.floor(size * fill / Math.max(pw, ph)));
  const ox = Math.floor((size - pw * scale) / 2), oy = Math.floor((size - ph * scale) / 2);
  const rgb = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = Math.floor((x - ox) / scale) + x0, sy = Math.floor((y - oy) / scale) + y0;
    const inside = x >= ox && y >= oy && sx <= x1 && sy <= y1;
    const c = inside ? px[sy * W + sx] : null;
    const out = c ? LCD.map((b, k) => Math.round(b + (c[k] - b) * c[3])) : LCD;
    out.forEach((v, k) => { rgb[(y * size + x) * 3 + k] = v; });
  }
  return png(size, rgb);
}

/* ---------- Minimal PNG encoder (8-bit RGB) ---------- */
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;   // 8 bits per channel, RGB
  const rows = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) rgb.copy(rows, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))
  ]);
}

mkdirSync("icons", { recursive: true });
const files = { "icon-192.png": [192, .8], "icon-512.png": [512, .8], "icon-maskable-512.png": [512, .58], "apple-touch-icon.png": [180, .7] };
for (const [name, [size, fill]] of Object.entries(files)) writeFileSync(`icons/${name}`, icon(size, fill));
console.log(`Wrote ${Object.keys(files).length} icons to icons/ (pet is ${pw}x${ph} pixels)`);
