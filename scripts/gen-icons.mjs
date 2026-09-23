// Generates Ships icons (tray template + app icon) with zero dependencies.
// Usage: node scripts/gen-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'assets', 'icons');

/* ----------------------------- PNG encoder ----------------------------- */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------- Glyph --------------------------------- */
function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

// Returns true when normalized point (nx, ny) is inside the ship glyph.
function shipGlyph(nx, ny) {
  // hull
  if (ny >= 0.60 && ny <= 0.82) {
    const t = (ny - 0.60) / 0.22;
    const half = 0.42 * (1 - 0.45 * t);
    if (Math.abs(nx - 0.5) <= half) return true;
  }
  // mast
  if (nx >= 0.482 && nx <= 0.518 && ny >= 0.10 && ny <= 0.64) return true;
  // main sail (right)
  if (inTriangle(nx, ny, 0.53, 0.14, 0.88, 0.56, 0.53, 0.56)) return true;
  // front sail (left)
  if (inTriangle(nx, ny, 0.47, 0.24, 0.22, 0.56, 0.47, 0.56)) return true;
  return false;
}

const SUPERSAMPLE = 4;

// Returns alpha coverage [0,1] for normalized center of a pixel.
function glyphCoverage(cx, cy, size) {
  let hits = 0;
  const step = 1 / (size * SUPERSAMPLE);
  for (let sy = 0; sy < SUPERSAMPLE; sy++) {
    for (let sx = 0; sx < SUPERSAMPLE; sx++) {
      const nx = cx + (sx - (SUPERSAMPLE - 1) / 2) * step;
      const ny = cy + (sy - (SUPERSAMPLE - 1) / 2) * step;
      if (shipGlyph(nx, ny)) hits++;
    }
  }
  return hits / (SUPERSAMPLE * SUPERSAMPLE);
}

function renderGlyph(size, color) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = glyphCoverage((x + 0.5) / size, (y + 0.5) / size, size);
      const i = (y * size + x) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = Math.round(a * 255);
    }
  }
  return rgba;
}

function renderAppIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = size * 0.225; // macOS squircle-ish
  const bg = [46, 107, 252];
  const fg = [255, 255, 255];
  const inset = 0.16; // glyph padding
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded rect coverage (simple)
      const inCorner = (px, py) =>
        px > radius && px < size - radius ? true : py > radius && py < size - radius;
      let inRect = true;
      const cx = Math.min(x + 0.5, size - x - 0.5);
      const cy = Math.min(y + 0.5, size - y - 0.5);
      if (!inCorner(cx, cy)) {
        const dx = radius - cx;
        const dy = radius - cy;
        inRect = dx * dx + dy * dy <= radius * radius;
      }
      if (!inRect) continue;

      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      const gx = (nx - inset) / (1 - inset * 2);
      const gy = (ny - inset) / (1 - inset * 2);
      const isGlyph = gx >= 0 && gx <= 1 && gy >= 0 && gy <= 1 && shipGlyph(gx, gy);
      const c = isGlyph ? fg : bg;
      rgba[i] = c[0];
      rgba[i + 1] = c[1];
      rgba[i + 2] = c[2];
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

/* ------------------------------- Output -------------------------------- */
fs.mkdirSync(OUT_DIR, { recursive: true });
const black = [0, 0, 0];

const outputs = [
  ['trayTemplate.png', encodePng(18, 18, renderGlyph(18, black))],
  ['trayTemplate@2x.png', encodePng(36, 36, renderGlyph(36, black))],
  ['trayTemplate@3x.png', encodePng(54, 54, renderGlyph(54, black))],
  ['app.png', encodePng(512, 512, renderAppIcon(512))],
];

for (const [name, buf] of outputs) {
  fs.writeFileSync(path.join(OUT_DIR, name), buf);
  console.log('written', path.relative(process.cwd(), path.join(OUT_DIR, name)));
}

// macOS .icns (requires iconutil, available on macOS only)
if (process.platform === 'darwin') {
  const iconset = path.join(OUT_DIR, 'app.iconset');
  fs.rmSync(iconset, { recursive: true, force: true });
  fs.mkdirSync(iconset, { recursive: true });

  const entries = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png'],
  ];
  for (const [size, name] of entries) {
    fs.writeFileSync(path.join(iconset, name), encodePng(size, size, renderAppIcon(size)));
  }

  const icnsPath = path.join(OUT_DIR, 'icon.icns');
  execSync(`iconutil -c icns ${JSON.stringify(iconset)} -o ${JSON.stringify(icnsPath)}`);
  fs.rmSync(iconset, { recursive: true, force: true });
  console.log('written', path.relative(process.cwd(), icnsPath));
} else {
  console.warn('skip .icns generation (requires macOS iconutil)');
}
