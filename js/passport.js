// Card passport (prototype): what makes ONE copy of a card this copy.
// From a sharp, straight photo of the card (out of its sleeve, on a plain surface) we
//   1. find the four cut edges precisely and straighten the card (16 px per mm),
//   2. measure where the print sits on the card (centering, in mm – every copy is cut a little differently),
//   3. read the wear along the edges (white spots), and keep a few patches of fine texture,
// and compare two such recordings: same copy, or another copy of the same card?
// The tilt scan (tilt.js) adds how the foil shines – that tells the rarity, not the copy.
//
// Pure functions (no DOM) – tested in Node with synthetic "twin" cards (tests/passport.test.mjs).
// All thresholds are first guesses and must be calibrated with real recordings (tools/passport_eval.mjs).

import { GAME } from './game.js';

export const PX_PER_MM = 16;
export const PASS_W = GAME.cardMm.w * PX_PER_MM;   // 944 for Yu-Gi-Oh!
export const PASS_H = GAME.cardMm.h * PX_PER_MM;   // 1376

// ---------- basics ----------
export function grayOf(rgba, w, h) {
  const g = new Float32Array(w * h);
  for (let p = 0, i = 0; p < g.length; p++, i += 4) g[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return g;
}

const median = (a) => { const s = Float64Array.from(a).sort(); return s.length ? s[s.length >> 1] : 0; };

// Sharpness of a gray image region (mean squared Laplacian) – picks the best still frame.
export function sharpness(g, w, h, { x0 = 0, y0 = 0, x1 = w, y1 = h, step = 2 } = {}) {
  let s = 0, n = 0;
  for (let y = Math.max(1, y0); y < Math.min(h - 1, y1); y += step) {
    for (let x = Math.max(1, x0); x < Math.min(w - 1, x1); x += step) {
      const p = y * w + x;
      const l = 4 * g[p] - g[p - 1] - g[p + 1] - g[p - w] - g[p + w];
      s += l * l; n++;
    }
  }
  return n ? s / n : 0;
}

// ---------- geometry ----------
// Homography that maps the four points src[i] -> dst[i] ([[x, y] × 4]); returns 9 numbers (h33 = 1).
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // Gaussian elimination with partial pivoting
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    if (Math.abs(A[c][c]) < 1e-12) return null;
    for (let r = c + 1; r < 8; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = new Array(8);
  for (let r = 7; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < 8; k++) s -= A[r][k] * h[k];
    h[r] = s / A[r][r];
  }
  return [...h, 1];
}

export function applyH(H, x, y) {
  const d = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d];
}

// Output image (ow × oh RGBA): every output pixel (u, v) takes the source at H(u, v) (bilinear).
// Pixels whose source lies outside get alpha 0.
export function warpPerspective(src, sw, sh, H, ow, oh) {
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let v = 0; v < oh; v++) {
    for (let u = 0; u < ow; u++) {
      const d = H[6] * u + H[7] * v + H[8];
      const x = (H[0] * u + H[1] * v + H[2]) / d - 0.5, y = (H[3] * u + H[4] * v + H[5]) / d - 0.5;
      const o = (v * ow + u) * 4;
      if (x < 0 || y < 0 || x >= sw - 1 || y >= sh - 1) continue;
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      for (let c = 0; c < 3; c++) {
        out[o + c] = (src[i00 + c] * (1 - fx) + src[i10 + c] * fx) * (1 - fy) + (src[i01 + c] * (1 - fx) + src[i11 + c] * fx) * fy;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

// ---------- finding the cut edges ----------
// One edge point on a line across the expected edge: the outermost strong step in brightness.
// samples: brightness along the line, from outside (background) to inside (card).
function stepOnLine(s) {
  const n = s.length, g = new Float32Array(n);
  let max = 0;
  for (let i = 2; i < n - 2; i++) { g[i] = Math.abs(s[i + 2] + s[i + 1] - s[i - 1] - s[i - 2]) / 2; if (g[i] > max) max = g[i]; }
  if (max < 10) return null;
  const thr = Math.max(10, max * 0.45);
  let i = 2;
  while (i < n - 2 && g[i] < thr) i++;
  if (i >= n - 2) return null;
  while (i + 1 < n - 2 && g[i + 1] > g[i]) i++;     // to the local peak
  const a = g[i - 1], b = g[i], c = g[i + 1], den = a - 2 * b + c;
  return i + (Math.abs(den) > 1e-6 ? 0.5 * (a - c) / den : 0);
}

const sampleG = (g, w, h, x, y) => {
  if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return 0;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, p = y0 * w + x0;
  return (g[p] * (1 - fx) + g[p + 1] * fx) * (1 - fy) + (g[p + w] * (1 - fx) + g[p + w + 1] * fx) * fy;
};

// Robust straight line through points: along = coordinate that runs along the edge.
// Returns {a, b}: across = a * along + b
function fitLine(pts) {
  let use = pts;
  let a = 0, b = 0;
  for (let it = 0; it < 3; it++) {
    const n = use.length;
    if (n < 6) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const [t, v] of use) { sx += t; sy += v; sxx += t * t; sxy += t * v; }
    const den = n * sxx - sx * sx;
    if (Math.abs(den) < 1e-9) return null;
    a = (n * sxy - sx * sy) / den; b = (sy - a * sx) / n;
    const res = pts.map(([t, v]) => Math.abs(v - (a * t + b)));
    const lim = Math.max(1.2, 2.5 * median(res));
    use = pts.filter((p, i) => res[i] <= lim);
  }
  return { a, b, used: use.length };
}

// The card's four corners in the photo (gray image), starting from a rough rectangle where the card lies
// (the guide frame the user put the card in). Corners: [top-left, top-right, bottom-right, bottom-left].
// null when the edges cannot be found (card cut off, background as bright as the card border, blur).
export function findCardQuad(g, w, h, rect, { lines = 40, band = 0.14 } = {}) {
  const sides = {};
  const bx = rect.w * band, by = rect.h * band;
  const spanX = (k) => rect.x + rect.w * (0.12 + 0.76 * k / (lines - 1));
  const spanY = (k) => rect.y + rect.h * (0.12 + 0.76 * k / (lines - 1));
  const run = (name, along, start, dir, len, horizontal) => {
    const pts = [];
    for (let k = 0; k < lines; k++) {
      const t = along(k);
      const s = new Float32Array(Math.round(len));
      for (let i = 0; i < s.length; i++) {
        const q = start + dir * i;
        // average over 3 neighbouring lines against noise
        s[i] = horizontal
          ? (sampleG(g, w, h, q, t - 1) + sampleG(g, w, h, q, t) + sampleG(g, w, h, q, t + 1)) / 3
          : (sampleG(g, w, h, t - 1, q) + sampleG(g, w, h, t, q) + sampleG(g, w, h, t + 1, q)) / 3;
      }
      const i = stepOnLine(s);
      if (i != null) pts.push([t, start + dir * i]);
    }
    sides[name] = fitLine(pts);
  };
  run('left', spanY, rect.x - bx, 1, 2 * bx, true);
  run('right', spanY, rect.x + rect.w + bx, -1, 2 * bx, true);
  run('top', spanX, rect.y - by, 1, 2 * by, false);
  run('bottom', spanX, rect.y + rect.h + by, -1, 2 * by, false);
  if (!sides.left || !sides.right || !sides.top || !sides.bottom) return null;
  // x = aV * y + bV (left/right), y = aH * x + bH (top/bottom)
  const meet = (V, Hl) => { const x = (V.a * Hl.b + V.b) / (1 - V.a * Hl.a); return [x, Hl.a * x + Hl.b]; };
  const quad = [meet(sides.left, sides.top), meet(sides.right, sides.top), meet(sides.right, sides.bottom), meet(sides.left, sides.bottom)];
  // sanity: the shape must be close to a card (aspect ratio, convex, inside the photo)
  const len = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const wTop = len(quad[0], quad[1]), wBot = len(quad[3], quad[2]), hL = len(quad[0], quad[3]), hR = len(quad[1], quad[2]);
  const ratio = ((wTop + wBot) / 2) / ((hL + hR) / 2);
  const want = GAME.cardMm.w / GAME.cardMm.h;
  if (!(Math.abs(ratio - want) / want < 0.12)) return null;
  if (quad.some(([x, y]) => !(x > -2 && y > -2 && x < w + 2 && y < h + 2))) return null;
  return { quad, inliers: Math.min(sides.left.used, sides.right.used, sides.top.used, sides.bottom.used) };
}

// Straighten the card: corners -> PASS_W × PASS_H RGBA (16 px per mm).
export function rectify(rgba, w, h, quad) {
  const dst = [[0, 0], [PASS_W, 0], [PASS_W, PASS_H], [0, PASS_H]];
  const H = homography(dst, quad);
  return H ? warpPerspective(rgba, w, h, H, PASS_W, PASS_H) : null;
}

// ---------- what makes this copy ----------
// Where a printed line lies near an expected position: position of the strongest brightness step in a
// profile summed across the edge's length. horizontal: the line is vertical (x position wanted).
function lineNear(g, W, H, { vertical, at, from, to, search }) {
  let best = -1, bi = -1;
  const prof = [];
  for (let d = -search; d <= search; d++) {
    const c = Math.round(at + d);
    let s = 0;
    for (let t = Math.round(from); t < Math.round(to); t += 2) {
      s += vertical ? Math.abs(g[t * W + c + 1] - g[t * W + c - 1]) : Math.abs(g[(c + 1) * W + t] - g[(c - 1) * W + t]);
    }
    prof.push(s);
  }
  for (let i = 1; i < prof.length - 1; i++) if (prof[i] > best) { best = prof[i]; bi = i; }
  if (bi < 1) return null;
  const a = prof[bi - 1], b = prof[bi], c = prof[bi + 1], den = a - 2 * b + c;
  return at - search + bi + (Math.abs(den) > 1e-6 ? 0.5 * (a - c) / den : 0);
}

// Centering in mm: distance from each cut edge to the printed artwork window, and how much the print is
// turned against the cut (mrad). The artwork window is the most reliable printed rectangle on the card.
export function centering(g, { W = PASS_W, H = PASS_H, box, s = PX_PER_MM } = {}) {
  const b = box || GAME.artBox.normal;
  const x1 = b.x1 * W, x2 = b.x2 * W, y1 = b.y1 * H, y2 = b.y2 * H;
  const search = Math.round(3 * s);
  const vy0 = y1 + (y2 - y1) * 0.2, vy1 = y2 - (y2 - y1) * 0.2;
  const hx0 = x1 + (x2 - x1) * 0.2, hx1 = x2 - (x2 - x1) * 0.2;
  const L = lineNear(g, W, H, { vertical: true, at: x1, from: vy0, to: vy1, search });
  const R = lineNear(g, W, H, { vertical: true, at: x2, from: vy0, to: vy1, search });
  const T = lineNear(g, W, H, { vertical: false, at: y1, from: hx0, to: hx1, search });
  const B = lineNear(g, W, H, { vertical: false, at: y2, from: hx0, to: hx1, search });
  if ([L, R, T, B].some((v) => v == null)) return null;
  // turn: left line in the upper and the lower half
  const mid = (vy0 + vy1) / 2;
  const Lu = lineNear(g, W, H, { vertical: true, at: L, from: vy0, to: mid, search: Math.round(0.6 * s) });
  const Ll = lineNear(g, W, H, { vertical: true, at: L, from: mid, to: vy1, search: Math.round(0.6 * s) });
  const turn = Lu != null && Ll != null ? Math.atan2(Ll - Lu, (vy1 - vy0) / 2) * 1000 : 0;
  const r2 = (v) => Math.round(v * 1000) / 1000;
  return { l: r2(L / s), r: r2((W - R) / s), t: r2(T / s), b: r2((H - B) / s), turn: Math.round(turn * 10) / 10 };
}

// Centering as collectors say it: "55/45" left/right and top/bottom. The artwork window sits symmetric
// left/right, but not top/bottom – top/bottom is taken against where the window should be, with the side
// margins as the scale (a perfectly cut card reads 50/50 both ways).
export function centeringText(c, layout = 'normal') {
  if (!c) return '';
  const b = GAME.artBox[layout] || GAME.artBox.normal, mm = GAME.cardMm;
  const m = (c.l + c.r) / 2;
  const t = Math.max(0.01, m + (c.t - b.y1 * mm.h)), bo = Math.max(0.01, m + (c.b - (1 - b.y2) * mm.h));
  const pct = (a, z) => Math.round((a / (a + z)) * 100);
  return `L/R ${pct(c.l, c.r)}/${100 - pct(c.l, c.r)} · T/B ${pct(t, bo)}/${100 - pct(t, bo)}`;
}

export const EDGE_SEGS = 24;
// Wear along the four edges: how much brighter the outer 0.6 mm is than the strip just inside it,
// in EDGE_SEGS pieces per side (order: top, right, bottom, left; clockwise). Whitening shows as > 0.
export function edgeProfile(g, { W = PASS_W, H = PASS_H, s = PX_PER_MM } = {}) {
  const a0 = 2, a1 = Math.round(0.6 * s), b0 = Math.round(0.9 * s), b1 = Math.round(1.8 * s);
  const out = [];
  const band = (side, k) => {
    let sa = 0, na = 0, sb = 0, nb = 0;
    const along = side === 'top' || side === 'bottom' ? W : H;
    const t0 = Math.round(along * k / EDGE_SEGS), t1 = Math.round(along * (k + 1) / EDGE_SEGS);
    for (let t = Math.max(b1, t0); t < Math.min(along - b1, t1); t++) {
      for (let d = a0; d < b1; d++) {
        let x, y;
        if (side === 'top') { x = t; y = d; } else if (side === 'bottom') { x = W - 1 - t; y = H - 1 - d; }
        else if (side === 'right') { x = W - 1 - d; y = t; } else { x = d; y = H - 1 - t; }
        const v = g[y * W + x];
        if (d < a1) { sa += v; na++; } else if (d >= b0) { sb += v; nb++; }
      }
    }
    return na && nb ? sa / na - sb / nb : 0;
  };
  for (const side of ['top', 'right', 'bottom', 'left']) for (let k = 0; k < EDGE_SEGS; k++) out.push(Math.round(band(side, k) * 10) / 10);
  return out;
}

// Patches of fine texture (print dots, ink, paper) at fixed places outside the foil areas,
// high-passed and stored as small signed numbers. Positions as share of the card.
export const PATCHES = [[0.2, 0.79], [0.5, 0.79], [0.8, 0.79], [0.2, 0.86], [0.5, 0.86], [0.8, 0.86], [0.04, 0.4], [0.96, 0.4], [0.5, 0.955]];
export const PATCH = 64;
export function texturePatches(g, { W = PASS_W, H = PASS_H } = {}) {
  const r = 3, out = [];
  for (const [fx, fy] of PATCHES) {
    const cx = Math.round(fx * W), cy = Math.round(fy * H), x0 = Math.min(W - PATCH - r - 1, Math.max(r + 1, cx - PATCH / 2)), y0 = Math.min(H - PATCH - r - 1, Math.max(r + 1, cy - PATCH / 2));
    const p = new Int8Array(PATCH * PATCH);
    for (let y = 0; y < PATCH; y++) {
      for (let x = 0; x < PATCH; x++) {
        // high pass: pixel minus the mean of a 7 × 7 box around it
        let s = 0;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) s += g[(y0 + y + dy) * W + x0 + x + dx];
        const v = g[(y0 + y) * W + x0 + x] - s / ((2 * r + 1) ** 2);
        p[y * PATCH + x] = Math.max(-127, Math.min(127, Math.round(v * 2)));
      }
    }
    out.push({ x: x0, y: y0, d: p });
  }
  return out;
}

// All copy features of a straightened card (RGBA PASS_W × PASS_H). layout: 'normal' | 'manga' | 'pendulum'
export function passFeatures(rgba, { layout = 'normal' } = {}) {
  const g = grayOf(rgba, PASS_W, PASS_H);
  return {
    v: 1, s: PX_PER_MM, layout,
    cent: centering(g, { box: GAME.artBox[layout] || GAME.artBox.normal }),
    edges: edgeProfile(g),
    tex: texturePatches(g),
  };
}

// ---------- comparing two recordings ----------
function ncc(a, b, shift = 4) {
  // best normalised cross-correlation of two patches over small shifts (remaining misalignment)
  let best = -1;
  const n = PATCH;
  for (let dy = -shift; dy <= shift; dy++) {
    for (let dx = -shift; dx <= shift; dx++) {
      let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, k = 0;
      for (let y = Math.max(0, dy); y < Math.min(n, n + dy); y++) {
        for (let x = Math.max(0, dx); x < Math.min(n, n + dx); x++) {
          const va = a[y * n + x], vb = b[(y - dy) * n + x - dx];
          sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb; k++;
        }
      }
      const cov = sab - sa * sb / k, va = saa - sa * sa / k, vb = sbb - sb * sb / k;
      const r = va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
      if (r > best) best = r;
    }
  }
  return best;
}

function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; saa += a[i] * a[i]; sbb += b[i] * b[i]; sab += a[i] * b[i]; }
  const cov = sab - sa * sb / n, va = saa - sa * sa / n, vb = sbb - sb * sb / n;
  return va > 1e-9 && vb > 1e-9 ? cov / Math.sqrt(va * vb) : 0;
}

// First guesses – calibrate with real twins (tools/passport_eval.mjs prints the numbers to set).
export const LIMITS = {
  centSame: 0.15,    // mm: the same copy measured twice differs less than this
  centOther: 0.35,   // mm: more than this = another copy
  texSame: 0.85,     // fine texture correlation: the same copy reaches this
  texOther: 0.7,     // below this the fine details are of another copy
  edgeSame: 0.5,     // edge wear profiles of the same copy correlate at least this much
};

// Same copy? Returns {verdict: 'same' | 'other' | 'unsure', cent (mm, largest difference of the four
// distances), tex (mean texture correlation), edge (correlation of the wear profiles), why}
export function comparePass(a, b, L = LIMITS) {
  if (!a?.cent || !b?.cent) return { verdict: 'unsure', why: 'centering not measured', cent: null, tex: null, edge: null };
  const cent = Math.max(Math.abs(a.cent.l - b.cent.l), Math.abs(a.cent.r - b.cent.r), Math.abs(a.cent.t - b.cent.t), Math.abs(a.cent.b - b.cent.b));
  const tex = a.tex?.length && b.tex?.length ? a.tex.reduce((s, p, i) => s + ncc(p.d, b.tex[i].d), 0) / a.tex.length : null;
  const edge = a.edges && b.edges ? pearson(a.edges, b.edges) : null;
  const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
  let verdict = 'unsure', why = '';
  if (cent > L.centOther) { verdict = 'other'; why = 'the print sits differently on the card'; }
  else if (cent < L.centSame) {
    const texOk = tex != null && tex >= L.texSame, texClose = tex != null && tex >= L.texOther, edgeOk = edge != null && edge >= L.edgeSame;
    if (texOk || (texClose && edgeOk)) { verdict = 'same'; why = 'print position and fine details match'; }
    else if (tex != null && !texClose && !(edge >= 0.2)) { verdict = 'other'; why = 'same print position, but the fine details and the edges differ'; }
    else why = 'print position matches, details unclear';
  } else why = 'small difference in print position';
  return { verdict, why, cent: r3(cent), tex: r3(tex), edge: r3(edge) };
}

// ---------- foil check: does the shine fit the version? ----------
// guess: tilt.js guessRarity(); kind: holo.js holoKind(version rarity)
const KIND_TO_GUESS = { common: ['common'], rare: ['rare'], super: ['super'], ultra: ['ultra'], secret: ['secret', 'qcsr', 'prismatic'], qcsr: ['qcsr', 'secret', 'starlight'],
  starlight: ['starlight', 'qcsr'], relief: ['ultimate', 'ultra'], prismatic: ['prismatic', 'secret'], ghost: ['secret', 'ultra', 'super'], collector: ['secret', 'prismatic', 'ultra'], rainbow: ['starlight', 'secret', 'qcsr'] };
export function foilCheck(guess, kind) {
  if (!guess?.list?.length) return { state: 'none', text: 'Shine not measured' };
  const want = KIND_TO_GUESS[kind];
  if (!want) return { state: 'none', text: 'Pick the exact version to check the shine' };
  const first = guess.list[0].key, any = guess.list.slice(0, 2).map((x) => x.key);
  if (want.includes(first)) return { state: 'ok', text: 'The shine fits this version' };
  if (any.some((k) => want.includes(k)) || !guess.clear) return { state: 'unsure', text: `The shine looks more like ${guess.list[0].label} – try again under one bright lamp` };
  return { state: 'odd', text: `The shine looks like ${guess.list[0].label}, not like this version – have it checked` };
}

// Short readable id, e.g. "CP-7F3A-91C2"
export function passId(rnd = Math.random) {
  const h = () => Math.floor(rnd() * 0x10000).toString(16).toUpperCase().padStart(4, '0');
  return `CP-${h()}-${h()}`;
}

// ---------- storing features (JSON: patches as base64) ----------
const b64 = (u8) => (typeof Buffer !== 'undefined' ? Buffer.from(u8).toString('base64') : btoa(String.fromCharCode(...u8)));
const unb64 = (s) => (typeof Buffer !== 'undefined' ? new Uint8Array(Buffer.from(s, 'base64')) : Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
export function packFeatures(f) {
  return { ...f, tex: f.tex.map((p) => ({ x: p.x, y: p.y, d: b64(new Uint8Array(p.d.buffer, p.d.byteOffset, p.d.byteLength)) })) };
}
export function unpackFeatures(f) {
  if (!f) return f;
  return { ...f, tex: (f.tex || []).map((p) => ({ x: p.x, y: p.y, d: typeof p.d === 'string' ? new Int8Array(unb64(p.d).buffer) : p.d })) };
}
