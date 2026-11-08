// Synthetic cards for the passport tests: the same print (shared by all copies) cut at a slightly
// different place, with its own paper/ink grain and edge wear per copy, photographed in perspective.
import { PASS_W, PASS_H, PX_PER_MM, homography, warpPerspective } from '../js/passport.js';
import { GAME } from '../js/game.js';

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// value noise with a grain of `cell` px
function grain(seed, w, h, cell = 2, amp = 10) {
  const r = rng(seed), gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
  const grid = new Float32Array(gw * gh).map(() => (r() * 2 - 1) * amp);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x / cell, gy = y / cell, x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0;
      const p = y0 * gw + x0;
      out[y * w + x] = (grid[p] * (1 - fx) + grid[p + 1] * fx) * (1 - fy) + (grid[p + gw] * (1 - fx) + grid[p + gw + 1] * fx) * fy;
    }
  }
  return out;
}

// One straightened copy (PASS_W × PASS_H RGBA).
// shift: [dx, dy] mm where the print sits against the cut; seed: this copy's grain and wear
export function makeCopy({ shift = [0, 0], seed = 1, wear = 4 } = {}) {
  const s = PX_PER_MM, W = PASS_W, H = PASS_H, b = GAME.artBox.normal;
  const out = new Uint8ClampedArray(W * H * 4);
  const noise = grain(seed * 7919, W, H, 2, 9);
  const r = rng(seed * 104729);
  const worn = [];
  for (let k = 0; k < wear; k++) worn.push({ side: Math.floor(r() * 4), at: r(), len: 0.02 + r() * 0.06 });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // print coordinates (shared by every copy)
      const px = x - shift[0] * s, py = y - shift[1] * s;
      const fx = px / W, fy = py / H;
      let c = [196, 122, 62];
      const inBox = (x1, x2, y1, y2) => fx > x1 && fx < x2 && fy > y1 && fy < y2;
      if (inBox(0.06, 0.94, 0.045, 0.105)) c = [222, 196, 150];
      if (inBox(0.07, 0.93, 0.73, 0.93)) c = [236, 222, 192];
      if (inBox(b.x1, b.x2, b.y1, b.y2)) {
        const ax = (fx - b.x1) / (b.x2 - b.x1), ay = (fy - b.y1) / (b.y2 - b.y1);
        const ring = Math.abs(Math.hypot(ax - 0.5, ay - 0.55) - 0.28) < 0.05;
        c = ring ? [120, 170, 250] : [20 + 60 * ax, 25, 50 + 80 * ay];
        // dark window border 0.5 mm
        const bw = 0.5 * s;
        if (px - b.x1 * W < bw || b.x2 * W - px < bw || py - b.y1 * H < bw || b.y2 * H - py < bw) c = [35, 25, 18];
      }
      // shared fine print pattern (text lines, halftone)
      const pat = 6 * Math.sin(px * 1.1) * Math.sin(py * 1.3) + (inBox(0.09, 0.91, 0.76, 0.9) && Math.sin(py * 0.9) > 0.6 ? -70 : 0);
      const v = noise[y * W + x] + pat;
      const o = (y * W + x) * 4;
      out[o] = c[0] + v; out[o + 1] = c[1] + v; out[o + 2] = c[2] + v; out[o + 3] = 255;
    }
  }
  // edge wear: white spots along the cut
  const ew = Math.round(0.5 * s);
  for (const wv of worn) {
    const along = wv.side % 2 === 0 ? W : H;
    const t0 = Math.round(wv.at * along), t1 = Math.min(along - 1, t0 + Math.round(wv.len * along));
    for (let t = t0; t < t1; t++) {
      for (let d = 0; d < ew; d++) {
        let x, y;
        if (wv.side === 0) { x = t; y = d; } else if (wv.side === 2) { x = t; y = H - 1 - d; } else if (wv.side === 1) { x = W - 1 - d; y = t; } else { x = d; y = t; }
        const o = (y * W + x) * 4;
        out[o] = Math.min(255, out[o] + 90); out[o + 1] = Math.min(255, out[o + 1] + 90); out[o + 2] = Math.min(255, out[o + 2] + 90);
      }
    }
  }
  return out;
}

// A photo (pw × ph) of a copy lying at the four corners `quad`, on a dark grainy table, with camera noise.
export function photo(copy, quad, { pw = 1080, ph = 1920, seed = 5, noise = 4, light = 1 } = {}) {
  const H = homography(quad, [[0, 0], [PASS_W, 0], [PASS_W, PASS_H], [0, PASS_H]]);   // photo -> card
  const warped = warpPerspective(copy, PASS_W, PASS_H, H, pw, ph);
  const r = rng(seed);
  const out = new Uint8ClampedArray(pw * ph * 4);
  for (let p = 0, o = 0; p < pw * ph; p++, o += 4) {
    const n = (r() * 2 - 1) * noise;
    if (warped[o + 3]) {
      out[o] = warped[o] * light + n; out[o + 1] = warped[o + 1] * light + n; out[o + 2] = warped[o + 2] * light + n;
    } else {
      const bg = 34 + (r() * 2 - 1) * 6;
      out[o] = bg; out[o + 1] = bg; out[o + 2] = bg + 4;
    }
    out[o + 3] = 255;
  }
  return out;
}

// corners of a card ~1500 px tall, slightly turned and in perspective, around (cx, cy)
export function quadAt(cx = 540, cy = 960, { scale = 17.5, turn = 0.03, persp = 0.02 } = {}) {
  const w = GAME.cardMm.w * scale, h = GAME.cardMm.h * scale;
  const pts = [[-w / 2 * (1 - persp), -h / 2], [w / 2 * (1 - persp), -h / 2], [w / 2 * (1 + persp), h / 2], [-w / 2 * (1 + persp), h / 2]];
  const c = Math.cos(turn), s = Math.sin(turn);
  return pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}
