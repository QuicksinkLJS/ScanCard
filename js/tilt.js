// Tilt scan (prototype): a short series of frames of ONE card being tilted under a light.
// Foil shines and changes colour with the angle, printed ink does not. From where the card
// changes (name, artwork, frame) and how (broad sheen vs. fine glitter) we guess the rarity.
//
// Everything here is pure (no DOM) so it can be tested in node with synthetic frames.
//
// Frames: RGBA arrays of size CAP_W x CAP_H = the card (GRID_W x GRID_H) plus MARGIN pixels
// on every side, so the card may move a little while it is tilted.

export const GRID_W = 72, GRID_H = 105;            // card analysis size (59 x 86 mm)
export const MARGIN = 10;
export const CAP_W = GRID_W + 2 * MARGIN, CAP_H = GRID_H + 2 * MARGIN;
export const CELL = 4;
const CW = Math.floor(GRID_W / CELL), CH = Math.floor(GRID_H / CELL);   // 18 x 26 cells

// Card areas as fractions of the card (normal layout), same as the holo effects in style.css.
const AREAS = {
  name: (x, y) => x > 0.07 && x < 0.84 && y > 0.045 && y < 0.105,
  art: (x, y) => x > 0.13 && x < 0.87 && y > 0.19 && y < 0.70,
  text: (x, y) => x > 0.09 && x < 0.91 && y > 0.765 && y < 0.9,
  frame: (x, y) => (x < 0.06 || x > 0.94) && y > 0.12 && y < 0.92,
};

const luma = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

function lumaPlane(rgba, w, h) {
  const out = new Float32Array(w * h);
  for (let p = 0, i = 0; p < out.length; p++, i += 4) out[p] = luma(rgba, i);
  return out;
}

// Edge strength (|dx| + |dy|), lightly blurred so that 1 px offsets do not matter much.
export function gradMap(rgba, w, h) {
  const l = lumaPlane(rgba, w, h);
  const g = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      g[p] = Math.abs(l[p + 1] - l[p - 1]) + Math.abs(l[p + w] - l[p - w]);
    }
  }
  const b = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      b[p] = (g[p] * 4 + g[p - 1] + g[p + 1] + g[p - w] + g[p + w]) / 8;
    }
  }
  return b;
}

function bilinear(plane, w, h, x, y) {
  if (x < 0 || y < 0 || x > w - 1.001 || y > h - 1.001) return -1;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, p = y0 * w + x0;
  return (plane[p] * (1 - fx) + plane[p + 1] * fx) * (1 - fy) + (plane[p + w] * (1 - fx) + plane[p + w + 1] * fx) * fy;
}

// Where does card pixel (u, v) sit in a frame moved by t = {dx, dy, sx, sy}?
const CX = GRID_W / 2, CY = GRID_H / 2;
const place = (t, u, v) => [MARGIN + CX + (u - CX) * t.sx + t.dx, MARGIN + CY + (v - CY) * t.sy + t.dy];

function cost(gRef, gImg, t, step) {
  let sum = 0, n = 0;
  for (let v = 3; v < GRID_H - 3; v += step) {
    for (let u = 3; u < GRID_W - 3; u += step) {
      const [x, y] = place(t, u, v);
      const a = bilinear(gImg, CAP_W, CAP_H, x, y);
      if (a < 0) { sum += 60; n++; continue; }
      sum += Math.abs(gRef[(v + MARGIN) * CAP_W + u + MARGIN] - a); n++;
    }
  }
  return sum / n;
}

// Find how a frame is moved/squeezed against the reference frame (coarse to fine).
export function findMotion(gRef, gImg, max = MARGIN - 2) {
  let best = { dx: 0, dy: 0, sx: 1, sy: 1 }, bestC = cost(gRef, gImg, best, 3);
  for (let dy = -max; dy <= max; dy += 2) {
    for (let dx = -max; dx <= max; dx += 2) {
      const t = { dx, dy, sx: 1, sy: 1 }, c = cost(gRef, gImg, t, 3);
      if (c < bestC) { bestC = c; best = t; }
    }
  }
  // refine: shift to 1 px, then squeeze (tilting makes the card narrower or shorter), then 0.5 px
  const tries = (around, list) => {
    for (const t of list(around)) { const c = cost(gRef, gImg, t, 2); if (c < bestC) { bestC = c; best = t; } }
  };
  bestC = cost(gRef, gImg, best, 2);
  tries(best, (b) => [-1, 0, 1].flatMap((ox) => [-1, 0, 1].map((oy) => ({ ...b, dx: b.dx + ox, dy: b.dy + oy }))));
  const SCALES = [0.94, 0.96, 0.98, 1, 1.02, 1.04, 1.06];
  const near = (b, f) => [-1, 0, 1].flatMap((ox) => [-1, 0, 1].map((oy) => ({ ...b, ...f, dx: b.dx + ox, dy: b.dy + oy })));
  for (const sx of SCALES) { const b = best; tries(b, () => near(b, { sx })); }
  for (const sy of SCALES) { const b = best; tries(b, () => near(b, { sy })); }
  const b2 = best;
  tries(b2, (b) => [-0.5, 0, 0.5].flatMap((ox) => [-0.5, 0, 0.5].map((oy) => ({ ...b, dx: b.dx + ox, dy: b.dy + oy }))));
  return { ...best, cost: bestC };
}

// Cut the card out of a frame (bilinear, RGB as float).
function warp(rgba, t) {
  const planes = [0, 1, 2].map((c) => {
    const p = new Float32Array(CAP_W * CAP_H);
    for (let i = 0, j = c; i < p.length; i++, j += 4) p[i] = rgba[j];
    return p;
  });
  const out = [new Float32Array(GRID_W * GRID_H), new Float32Array(GRID_W * GRID_H), new Float32Array(GRID_W * GRID_H)];
  for (let v = 0; v < GRID_H; v++) {
    for (let u = 0; u < GRID_W; u++) {
      const [x, y] = place(t, u, v);
      for (let c = 0; c < 3; c++) {
        const a = bilinear(planes[c], CAP_W, CAP_H, Math.min(Math.max(x, 0), CAP_W - 1.01), Math.min(Math.max(y, 0), CAP_H - 1.01));
        out[c][v * GRID_W + u] = a;
      }
    }
  }
  return out;
}

const pct = (arr, q) => {
  const s = Array.from(arr).sort((a, b) => a - b);
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const median = (arr) => pct(arr, 0.5);
const spread = (arr) => pct(arr, 0.9) - pct(arr, 0.1);

// Box sums in O(1): integral image of a GRID_W x GRID_H plane.
function integral(plane) {
  const W = GRID_W + 1, out = new Float64Array(W * (GRID_H + 1));
  for (let y = 0; y < GRID_H; y++) {
    let row = 0;
    for (let x = 0; x < GRID_W; x++) {
      row += plane[y * GRID_W + x];
      out[(y + 1) * W + x + 1] = out[y * W + x + 1] + row;
    }
  }
  return out;
}
const boxSum = (I, x0, y0, x1, y1) => { const W = GRID_W + 1; return I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0]; };

// One frame, prepared for cell lookups: R, G, B and fine detail (glitter shows up as detail that comes and goes).
function prepare([R, G, B]) {
  const n = GRID_W * GRID_H, lum = new Float32Array(n), hf = new Float32Array(n), ha = new Float32Array(n);
  for (let p = 0; p < n; p++) lum[p] = 0.299 * R[p] + 0.587 * G[p] + 0.114 * B[p];
  for (let y = 1; y < GRID_H - 1; y++) {
    for (let x = 1; x < GRID_W - 1; x++) {
      const p = y * GRID_W + x;
      const d = lum[p] - (lum[p - 1] + lum[p + 1] + lum[p - GRID_W] + lum[p + GRID_W]) / 4;
      hf[p] = Math.max(0, d); ha[p] = Math.abs(d);
    }
  }
  return { R: integral(R), G: integral(G), B: integral(B), H: integral(hf), A: integral(ha) };
}

// Mean brightness (0..1), two colour axes and fine detail of the cell at (cx, cy), shifted by (ox, oy) px.
function cellAt(f, cx, cy, ox, oy) {
  const x0 = Math.min(Math.max(cx * CELL + ox, 0), GRID_W - CELL), y0 = Math.min(Math.max(cy * CELL + oy, 0), GRID_H - CELL);
  const x1 = x0 + CELL, y1 = y0 + CELL, k = CELL * CELL;
  const r = boxSum(f.R, x0, y0, x1, y1), g = boxSum(f.G, x0, y0, x1, y1), b = boxSum(f.B, x0, y0, x1, y1);
  const s = r + g + b + 1, q = k * 255;
  return {
    r: r / q, g: g / q, b: b / q, L: (0.299 * r + 0.587 * g + 0.114 * b) / q, C2: (b - (r + g) / 2) / s,
    HF: boxSum(f.H, x0, y0, x1, y1) / q, HA: boxSum(f.A, x0, y0, x1, y1) / q,
  };
}

const LOCAL = 2;   // each cell may sit up to 2 px off after lining up the whole card

// Which cells belong to which area.
const CELL_AREAS = (() => {
  const m = {};
  for (const k of Object.keys(AREAS)) m[k] = [];
  for (let cy = 0; cy < CH; cy++) {
    for (let cx = 0; cx < CW; cx++) {
      const x = (cx + 0.5) * CELL / GRID_W, y = (cy + 0.5) * CELL / GRID_H;
      for (const [k, f] of Object.entries(AREAS)) if (f(x, y)) m[k].push(cy * CW + cx);
    }
  }
  return m;
})();

// frames: [{data: RGBA (CAP_W x CAP_H)}]. Returns where and how the card shines.
export function analyzeTilt(frames, { motions: given = null } = {}) {
  if (!frames || frames.length < 6) return null;
  const grads = frames.map((f) => gradMap(f.data, CAP_W, CAP_H));
  const ri = frames.length >> 1;
  const motions = given || frames.map((f, i) => (i === ri ? { dx: 0, dy: 0, sx: 1, sy: 1, cost: 0 } : findMotion(grads[ri], grads[i])));
  // drop frames that could not be lined up (blurred, card out of the frame)
  // costs are compared with the edge strength of the reference: a lined-up frame stays well below it,
  // a frame without the card (noise, a hand, a flat surface) does not
  const edges = grads[ri].reduce((s, v) => s + v, 0) / grads[ri].length;
  const costs = motions.filter((m, i) => i !== ri).map((m) => m.cost);
  const limit = Math.min(edges, Math.max(edges * 0.5, median(costs) * 1.8));
  const used = frames.map((f, i) => i).filter((i) => motions[i].cost <= limit);
  if (used.length < 6) return { ok: false, reason: 'moved' };

  const prep = used.map((i) => prepare(warp(frames[i].data, motions[i])));
  const T = prep.length, n = CW * CH;
  const refT = used.indexOf(ri);
  // exposure changes: divide by the card's typical brightness in each frame
  const gains = prep.map((f) => {
    const L = new Float32Array(n);
    for (let c = 0; c < n; c++) L[c] = cellAt(f, c % CW, (c / CW) | 0, 0, 0).L;
    return Math.max(0.05, median(L));
  });
  const g0 = median(gains);
  const ref = Array.from({ length: n }, (_, c) => cellAt(prep[refT], c % CW, (c / CW) | 0, 0, 0));

  const foil = new Float32Array(n), sheen = new Float32Array(n), colour = new Float32Array(n), sparkle = new Float32Array(n), contrast = new Float32Array(n);
  const tL = new Float32Array(T), tR = new Float32Array(T), tB = new Float32Array(T), tH = new Float32Array(T), tA = new Float32Array(T);
  for (let c = 0; c < n; c++) {
    const cx = c % CW, cy = (c / CW) | 0, rf = ref[c], kr = g0 / gains[refT];
    let bl = -1;
    for (let t = 0; t < T; t++) {
      const k = g0 / gains[t];
      // the nearby spot that looks most like the reference: what is left over is real change
      let best = null, bd = Infinity;
      for (let oy = -LOCAL; oy <= LOCAL; oy++) {
        for (let ox = -LOCAL; ox <= LOCAL; ox++) {
          const m = cellAt(prep[t], cx, cy, ox, oy);
          const d = Math.abs(m.r * k - rf.r * kr) + Math.abs(m.g * k - rf.g * kr) + Math.abs(m.b * k - rf.b * kr) + 0.01 * (Math.abs(ox) + Math.abs(oy));
          if (d < bd) { bd = d; best = m; }
        }
      }
      // change against the reference, split into white (gloss, also foil) and colour (foil only)
      const dr = best.r * k - rf.r * kr, dg = best.g * k - rf.g * kr, db = best.b * k - rf.b * kr, dw = (dr + dg + db) / 3;
      tL[t] = Math.min(1.6, best.L * k); tR[t] = dr - dw; tB[t] = db - dw;
      tH[t] = best.HF * k; tA[t] = best.HA * k;
      if (tL[t] > bl) { bl = tL[t]; rf.bestC2 = best.C2; }
    }
    sheen[c] = spread(tL);
    colour[c] = spread(tR) + spread(tB);
    sparkle[c] = spread(tH) / (pct(tH, 0.5) + 0.015);
    contrast[c] = spread(tA) / (pct(tA, 0.5) + 0.015);
    foil[c] = sheen[c] + 2 * colour[c];
  }

  const mean = (arr, ids) => ids.reduce((s, c) => s + arr[c], 0) / Math.max(1, ids.length);
  const area = {};
  for (const [k, ids] of Object.entries(CELL_AREAS)) {
    area[k] = {
      foil: mean(foil, ids), sheen: mean(sheen, ids), colour: mean(colour, ids),
      sparkle: mean(sparkle, ids), contrast: mean(contrast, ids),
    };
  }
  // for the picture: how much each cell changes beyond an ordinary glossy card (text box)
  const base = median(CELL_AREAS.text.map((c) => foil[c]));
  const over = Array.from(foil, (v) => Math.max(0, v - base * 1.2));
  const top = Math.max(...over, 0.15);
  return {
    ok: true, frames: T, area,
    map: over.map((v) => Math.min(1, v / top)), cols: CW, rows: CH,
    moved: Math.max(...used.map((i) => Math.hypot(motions[i].dx, motions[i].dy))),
  };
}

// Thresholds (tuned on synthetic series – to be checked with real cards).
// Values are changes of exposure-corrected brightness (0..1) and of the colour part of it.
const T_ART_COLOUR = 0.14;   // artwork changes colour = holo/foil artwork
const T_GLITTER = 0.55;      // fine detail comes and goes = glitter (secret, starlight, QCSR)
const T_NAME_SHEEN = 0.097;  // name letters flash (silver or gold)
const T_GOLD = 0.12;         // name letters change colour = gold
const T_WHOLE_TEXT = 0.085;  // even the text box and the frame shine = starlight / QCSR
const T_WHOLE_FRAME = 0.06;

// Rarity guesses, best first. q = what the version filter understands (prices.rarityQuery).
const KINDS = {
  common: { label: 'Common', q: 'c' },
  rare: { label: 'Rare', q: 'r' },
  super: { label: 'Super Rare', q: 'sr' },
  ultra: { label: 'Ultra Rare', q: 'ur' },
  secret: { label: 'Secret Rare', q: 'scr' },
  qcsr: { label: 'Quarter Century Secret Rare', q: 'qcsr' },
  prismatic: { label: 'Prismatic Secret Rare', q: 'psr' },
  starlight: { label: 'Starlight Rare', q: 'str' },
  ultimate: { label: 'Ultimate Rare', q: 'utr' },
};

export function guessRarity(r) {
  if (!r?.ok) return { clear: false, list: [], why: '' };
  const a = r.area;
  const whole = a.text.colour > T_WHOLE_TEXT && a.frame.colour > T_WHOLE_FRAME;
  const art = a.art.colour > T_ART_COLOUR;
  const glitter = a.art.sparkle > T_GLITTER;
  const gold = a.name.colour > T_GOLD;
  const name = gold || a.name.sheen > T_NAME_SHEEN;
  let keys, why;
  if (whole) { keys = ['starlight', 'qcsr', 'secret']; why = 'the whole card shines'; }
  else if (art && name) {
    if (glitter && !gold) { keys = ['secret', 'qcsr', 'prismatic', 'ultra']; why = 'artwork glitters, name shines silver'; }
    else if (gold && !glitter) { keys = ['ultra', 'secret']; why = 'artwork shines, name shines gold'; }
    else { keys = glitter ? ['secret', 'ultra', 'qcsr'] : ['ultra', 'secret', 'ultimate']; why = 'artwork and name shine'; }
  } else if (art) { keys = glitter ? ['secret', 'super'] : ['super', 'ultra']; why = glitter ? 'only the artwork shines, with glitter' : 'only the artwork shines'; }
  else if (name) { keys = ['rare', 'super']; why = 'only the name shines'; }
  else { keys = ['common', 'rare']; why = 'nothing shines'; }
  // clear when every measured value is well away from its threshold
  const dist = (v, t) => Math.abs(v - t) / t;
  const margin = Math.min(dist(a.art.colour, T_ART_COLOUR), dist(Math.max(a.name.sheen, a.name.colour * T_NAME_SHEEN / T_GOLD), T_NAME_SHEEN),
    art ? dist(a.art.sparkle, T_GLITTER) : 1, whole || a.text.colour > T_WHOLE_TEXT * 0.7 ? dist(a.text.colour, T_WHOLE_TEXT) : 1);
  return { clear: margin > 0.2, why, list: keys.map((k) => ({ key: k, ...KINDS[k] })) };
}

// Order card versions: those with a guessed rarity first (in guess order), the rest after.
export function tiltRank(opts, guess, rarityQuery) {
  if (!guess?.list?.length) return opts;
  const tests = guess.list.map((g) => rarityQuery(g.q)).filter(Boolean);
  const rank = (o) => {
    const own = (o.rarity || '').toLowerCase();
    const all = [o.rarity, ...(o.rarities || [])].filter(Boolean).map((x) => x.toLowerCase());
    for (let i = 0; i < tests.length; i++) {
      if (own && tests[i].test(own)) return i * 2;
      if (all.some((x) => tests[i].test(x))) return i * 2 + 1;
    }
    return 99;
  };
  return opts.map((o, i) => ({ o, r: rank(o), i })).sort((p, q) => p.r - q.r || p.i - q.i)
    .map(({ o, r }) => (r === 0 || r === 1 ? { ...o, tiltMatch: true } : o));
}
