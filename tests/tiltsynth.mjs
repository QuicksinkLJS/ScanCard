// Synthetic tilt series for tests: a card with frame, name bar, artwork and text box, moved and
// squeezed a little in every frame, with changing exposure, a glossy highlight (every real card
// has one), noise, and foil depending on the rarity.
import { GRID_W, GRID_H, MARGIN, CAP_W, CAP_H } from '../js/tilt.js';

const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const hue = (h) => {
  const f = (n) => { const k = (n + h * 6) % 6; return 1 - Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
};

const inName = (x, y) => x > 0.07 && x < 0.84 && y > 0.045 && y < 0.105;
const inArt = (x, y) => x > 0.13 && x < 0.87 && y > 0.19 && y < 0.70;
const inText = (x, y) => x > 0.09 && x < 0.91 && y > 0.765 && y < 0.9;

export const LOOKS = {
  common: {},
  rare: { name: 'silver' },
  super: { art: 'rainbow' },
  ultra: { art: 'rainbow', name: 'gold' },
  secret: { art: 'secret', name: 'silver' },
  starlight: { all: 'glitter', name: 'silver' },
};

export function cardPixel(u, v, t, look, seed) {
  const x = u / GRID_W, y = v / GRID_H;
  const ui = Math.floor(u), vi = Math.floor(v);
  let c, letter = false;
  if (inName(x, y)) {
    letter = Math.sin(u * 1.7) * Math.sin(v * 2.9) > 0.25;
    c = letter ? [35, 30, 30] : [225, 215, 195];
  } else if (inArt(x, y)) {
    const bx = Math.floor(u / 7), by = Math.floor(v / 7);
    const h = hash(bx, by, seed);
    const base = hue(h);
    const shade = 0.35 + 0.5 * hash(bx + 9, by + 3, seed) + 0.15 * Math.sin(u * 0.3 + v * 0.2);
    c = base.map((k) => 40 + 180 * k * shade);
  } else if (inText(x, y)) {
    const ink = (vi % 3 === 0) && hash(ui, vi, seed + 7) > 0.45;
    c = ink ? [60, 55, 50] : [222, 212, 178];
  } else {
    c = [196, 118, 62];
    c = c.map((k) => k + 12 * Math.sin(u * 0.8 + v * 0.5));
  }
  // glossy surface: a broad white highlight sliding over the card
  const gx = 0.5 + 0.45 * Math.sin(t * 0.33), gy = 0.5 + 0.4 * Math.cos(t * 0.27);
  const gloss = 55 * Math.exp(-((x - gx) ** 2 + (y - gy) ** 2) / 0.05);
  c = c.map((k) => k + gloss);
  const band = (s) => Math.exp(-(((x + y) * 0.9 - 0.2 - (t % 24) / 14 + s) ** 2) / 0.03);
  const rainbow = (amt) => {
    const b = band(0), col = hue((x * 1.3 + y * 0.8 + t * 0.09) % 1);
    c = c.map((k, i) => k + amt * b * (0.4 + col[i]));
  };
  const glitter = (dens, amt) => {
    const h = hash(ui, vi, seed + 99);
    if (h < dens) {
      const s = Math.max(0, Math.cos(h * 377 + t * 1.9)) ** 6;
      c = c.map((k) => k + amt * s);
    }
  };
  if (look.art && inArt(x, y)) {
    if (look.art === 'rainbow') rainbow(130);
    if (look.art === 'secret') { rainbow(70); glitter(0.3, 230); }
  }
  if (look.all) { rainbow(55); glitter(0.22, 210); }
  if (look.name && letter) {
    const f = 0.25 + 0.75 * Math.max(0, Math.sin(t * 0.7 + x * 3));
    const tone = look.name === 'gold' ? [235, 180, 60] : [195, 195, 205];
    c = c.map((k, i) => k + f * tone[i]);
  }
  return c;
}

export function synthFrames(kind, { T = 22, seed = 1, still = false, gain = true } = {}) {
  const look = LOOKS[kind];
  const frames = [];
  for (let t = 0; t < T; t++) {
    const m = still ? { dx: 0, dy: 0, sx: 1, sy: 1 } : {
      dx: 4 * Math.sin(t * 0.5), dy: 3 * Math.cos(t * 0.37),
      sx: 1 - 0.05 * Math.abs(Math.sin(t * 0.4)), sy: 1 - 0.03 * Math.abs(Math.cos(t * 0.3)),
    };
    const g = gain ? 1 + 0.12 * Math.sin(t * 0.9) : 1;
    const data = new Uint8ClampedArray(CAP_W * CAP_H * 4);
    for (let py = 0; py < CAP_H; py++) {
      for (let px = 0; px < CAP_W; px++) {
        // a camera pixel averages the light over its area (3 x 3 samples)
        const c = [0, 0, 0];
        for (const sy of [-1 / 3, 0, 1 / 3]) {
          for (const sx of [-1 / 3, 0, 1 / 3]) {
            const u = GRID_W / 2 + (px + sx - MARGIN - GRID_W / 2 - m.dx) / m.sx;
            const v = GRID_H / 2 + (py + sy - MARGIN - GRID_H / 2 - m.dy) / m.sy;
            const s = (u < 0 || v < 0 || u >= GRID_W || v >= GRID_H) ? [48, 44, 40].map((k) => k + 10 * hash(px, py, 5)) : cardPixel(u, v, t, look, seed);
            for (let k = 0; k < 3; k++) c[k] += s[k] / 9;
          }
        }
        const i = (py * CAP_W + px) * 4;
        for (let k = 0; k < 3; k++) data[i + k] = c[k] * g + (hash(px, py, t * 3 + k) - 0.5) * 8;
        data[i + 3] = 255;
      }
    }
    frames.push({ data });
  }
  return frames;
}

export const SYNTH_KINDS = Object.keys(LOOKS);
