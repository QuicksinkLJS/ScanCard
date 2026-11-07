// Recognises a card by its artwork, on the phone.
//
// 1. cut the artwork out of the (upright) card image
// 2. the trained model turns it into a fingerprint (768 numbers)
// 3. compare with the fingerprints of all ~14,700 artworks; the most similar one wins
//
// Files (made by tools/pack_model.py): models/ygo/model.onnx, fingerprints.i8, cards.json

import { normName } from './parse.js';

const ORT_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/ort.min.js';
const SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
// Where the artwork sits on an upright card (fractions of width/height).
export const ART_BOX = { x0: 0.115, y0: 0.18, x1: 0.885, y1: 0.705 };

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total || !onProgress) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(got / total);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// Draw part of a source canvas into a SIZE x SIZE canvas, optionally rotated by 180 degrees.
function cropView(src, box, rotate180) {
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (rotate180) { ctx.translate(SIZE, SIZE); ctx.rotate(Math.PI); }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, SIZE, SIZE);
  return c;
}

// Even out the light before the fingerprint: grey-world white balance (warm lamp vs daylight)
// and a gentle auto contrast (1 % / 99 % of the brightness). Works on the canvas in place.
export function evenLight(c) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const px = img.data;
  const n = px.length / 4;
  let r = 0, g = 0, b = 0;
  const hist = new Uint32Array(256);
  for (let j = 0; j < px.length; j += 4) {
    r += px[j]; g += px[j + 1]; b += px[j + 2];
    hist[(px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8]++;
  }
  const grey = (r + g + b) / 3;
  // only half of the colour cast is removed: foil and red/blue artworks have a real cast of their own
  const k = [r, g, b].map((v) => 1 + 0.5 * (grey / Math.max(1, v) - 1));
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.01) { hi = v; break; } }
  // stretch at most to double contrast, so a dark artwork stays dark
  const span = Math.max(hi - lo, 128);
  const mid = (hi + lo) / 2;
  const lut = new Uint8ClampedArray(256 * 3);
  for (let ch = 0; ch < 3; ch++) for (let v = 0; v < 256; v++) lut[ch * 256 + v] = (v * k[ch] - mid) * (255 / span) + 127.5;
  for (let j = 0; j < px.length; j += 4) {
    px[j] = lut[px[j]]; px[j + 1] = lut[256 + px[j + 1]]; px[j + 2] = lut[512 + px[j + 2]];
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function toTensorData(canvases) {
  const n = canvases.length;
  const data = new Float32Array(n * 3 * SIZE * SIZE);
  const plane = SIZE * SIZE;
  canvases.forEach((c, k) => {
    const px = c.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
    const off = k * 3 * plane;
    for (let i = 0, j = 0; i < plane; i++, j += 4) {
      data[off + i] = (px[j] / 255 - MEAN[0]) / STD[0];
      data[off + plane + i] = (px[j + 1] / 255 - MEAN[1]) / STD[1];
      data[off + 2 * plane + i] = (px[j + 2] / 255 - MEAN[2]) / STD[2];
    }
  });
  return data;
}

// Options (defaults = what the app uses; tools/uitest/t14_recog_eval.py compares them):
//   light: 'off' | 'on' (even the light of every view) | 'extra' (both, the better one counts)
//   extra: more artwork cuts (slightly tighter / looser / shifted) for unsure cards
//   minScore, minMargin: when a guess counts as sure
export function createRecognizer({ base = 'models/ygo', onStatus = () => {}, light = 'on', extra = true, minScore = 0.55, minMargin = 0.08, learned = null } = {}) {
  let loading = null;

  async function load() {
    if (!window.ort) await loadScript(ORT_URL);
    const ort = window.ort;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    const meta = await fetch(`${base}/cards.json`).then((r) => r.json());
    onStatus('Downloading the card recogniser (first time only)…', 0);
    const fp = new Int8Array((await fetchWithProgress(`${base}/fingerprints.i8`, (p) => onStatus('Downloading card fingerprints (first time only)…', p * 0.3))).buffer);
    const model = await fetchWithProgress(`${base}/model.onnx`, (p) => onStatus('Downloading the card recogniser (first time only)…', 0.3 + p * 0.7));
    onStatus('Starting the recogniser…', 1);
    const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    const all = await withExtra(meta, fp);
    return { ort, meta: all.meta, fp: all.fp, session };
  }

  // Extra fingerprints from CardTrader pictures (artworks YGOPRODeck has no picture of, e.g. YAC1 manga style).
  // Optional: tools/build_extra_fingerprints.py, same int8 scale. Appended to the main list.
  async function withExtra(meta, fp) {
    try {
      const ex = await fetch(`${base}/extra.json?h=${Math.floor(Date.now() / 3.6e6)}`).then((r) => (r.ok ? r.json() : null));
      if (!ex?.count || ex.dim !== meta.dim) return { meta, fp };
      const buf = await fetch(`${base}/extra.i8?n=${ex.count}&d=${ex.date}`).then((r) => (r.ok ? r.arrayBuffer() : null));
      if (!buf || buf.byteLength !== ex.count * ex.dim) return { meta, fp };
      const names = [...meta.names];
      const index = new Map(names.map((n, i) => [n, i]));
      const nameIdx = [...meta.nameIdx];
      for (const n of ex.names) {
        if (!index.has(n)) { index.set(n, names.length); names.push(n); }
        nameIdx.push(index.get(n));
      }
      const all = new Int8Array(fp.length + buf.byteLength);
      all.set(fp, 0);
      all.set(new Int8Array(buf), fp.length);
      return { meta: { ...meta, names, nameIdx, ids: [...meta.ids, ...ex.ids.map((id) => `ct${id}`)], count: meta.count + ex.count, extra: ex.count }, fp: all };
    } catch (e) {
      console.warn('no extra fingerprints', e);
      return { meta, fp };
    }
  }

  function ready() {
    if (!loading) {
      loading = load();
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

  async function embed(engine, canvases) {
    const { ort, session } = engine;
    const input = new ort.Tensor('float32', toTensorData(canvases), [canvases.length, 3, SIZE, SIZE]);
    const out = await session.run({ pixel_values: input });
    return out.embedding.data; // n x dim, already unit length
  }

  // Best similarity per artwork over all views.
  function scoreAll(engine, emb, nViews) {
    const { meta, fp } = engine;
    const dim = meta.dim;
    const count = meta.count;
    const scores = new Float32Array(count).fill(-1);
    for (let v = 0; v < nViews; v++) {
      const q = emb.subarray(v * dim, (v + 1) * dim);
      for (let a = 0, off = 0; a < count; a++, off += dim) {
        let s = 0;
        for (let d = 0; d < dim; d++) s += fp[off + d] * q[d];
        s *= meta.scale;
        if (s > scores[a]) scores[a] = s;
      }
    }
    return scores;
  }

  // allow: optional Set of normalised names (pack mode: only cards of one set)
  function ranked(engine, scores, k = 6, allow = null) {
    const { meta } = engine;
    const order = Array.from(scores.keys()).sort((a, b) => scores[b] - scores[a]);
    const out = [];
    const seen = new Set();
    for (const i of order) {
      const name = meta.names[meta.nameIdx[i]];
      if (seen.has(name)) continue;
      if (allow && !allow.has(normName(name))) continue;
      seen.add(name);
      out.push({ name, score: scores[i], artworkId: meta.ids[i], index: i });
      if (out.length >= k) break;
    }
    return out;
  }

  const artBox = (W, H, scale = 1, dx = 0, dy = 0) => {
    const aw = (ART_BOX.x1 - ART_BOX.x0) * W * scale, ah = (ART_BOX.y1 - ART_BOX.y0) * H * scale;
    const cx = (ART_BOX.x0 + ART_BOX.x1) / 2 * W + dx * W, cy = (ART_BOX.y0 + ART_BOX.y1) / 2 * H + dy * H;
    return { x: cx - aw / 2, y: cy - ah / 2, w: aw, h: ah };
  };
  // Upside-down cards: the artwork box of a rotated card sits mirrored, so cut it from there.
  const flip = (b, W, H) => ({ x: W - b.x - b.w, y: H - b.y - b.h, w: b.w, h: b.h });
  const prep = (c) => (light === 'on' ? [evenLight(c)] : light === 'extra' ? [c, evenLight(cloneCanvas(c))] : [c]);
  function cloneCanvas(c) {
    const d = document.createElement('canvas');
    d.width = c.width; d.height = c.height;
    d.getContext('2d').drawImage(c, 0, 0);
    return d;
  }

  // The artwork of a card, as it lies and turned upside down (the finder can't tell up from down).
  // Returns [views upright..., views upside down...] (same count each).
  function views2(card) {
    const W = card.width, H = card.height;
    const b = artBox(W, H);
    return [...prep(cropView(card, b, false)), ...prep(cropView(card, flip(b, W, H), true))];
  }

  // A closer look for unsure cards: tighter, looser and shifted cuts (sleeves, toploaders, cut-off edges),
  // in the orientation that fitted better.
  function viewsMore(card, upsideDown) {
    const W = card.width, H = card.height;
    const boxes = [artBox(W, H, 0.86), artBox(W, H, 1.1), artBox(W, H, 0.94, 0, -0.025), artBox(W, H, 0.94, 0, 0.025)];
    return boxes.flatMap((b) => prep(cropView(card, upsideDown ? flip(b, W, H) : b, upsideDown)));
  }

  function judge(top) {
    const margin = top.length > 1 ? top[0].score - top[1].score : 1;
    return { top, confident: top[0].score >= minScore && margin >= minMargin };
  }

  // card: an upright card image (canvas), roughly 59:86. Returns best guesses, best first.
  async function identify(card, opts) {
    return (await identifyMany([card], opts))[0];
  }

  // Fingerprints learned from the user's corrections: {name, emb: Float32Array}[] (see learn.js)
  function learnedBoost(scores, engine, e, nViews) {
    const list = learned?.() || [];
    if (!list.length) return null;
    const dim = engine.meta.dim;
    const extraScore = new Map();
    for (const l of list) {
      let best = -1;
      for (let v = 0; v < nViews; v++) {
        let s = 0;
        for (let d = 0; d < dim; d++) s += l.emb[d] * e[v * dim + d];
        if (s > best) best = s;
      }
      if (best > (extraScore.get(l.name) ?? -1)) extraScore.set(l.name, best);
    }
    return extraScore;
  }

  function rankWith(engine, scores, allow, extraScore) {
    let top = allow ? ranked(engine, scores, 12, allow) : [];
    if (!top.length) top = ranked(engine, scores, 12); // nothing from that set looks like it: ignore the filter
    if (extraScore) {
      for (const [name, s] of extraScore) {
        if (allow && !allow.has(normName(name))) continue;
        const t = top.find((x) => x.name === name);
        if (t) { if (s > t.score) { t.score = s; t.learned = true; } } else if (s > (top[top.length - 1]?.score ?? -1)) top.push({ name, score: s, artworkId: null, index: -1, learned: true });
      }
      top.sort((a, b) => b.score - a.score);
    }
    return top.slice(0, 6);
  }

  // Several cards in one go (faster than one by one).
  async function identifyMany(cards, { onEach = () => {}, allow = null, closer = extra } = {}) {
    const engine = await ready();
    const dim = engine.meta.dim;
    const out = [];
    const embs = [];
    const per = views2(cards[0] || document.createElement('canvas')).length; // views per card
    const batch = 4;
    for (let i = 0; i < cards.length; i += batch) {
      const part = cards.slice(i, i + batch);
      const emb = await embed(engine, part.flatMap((c) => views2(c)));
      part.forEach((_, k) => {
        const e = emb.subarray(k * per * dim, (k + 1) * per * dim);
        const scores = scoreAll(engine, e, per);
        const top = rankWith(engine, scores, allow, learnedBoost(scores, engine, e, per));
        const result = judge(top);
        // which way round did the best match fit? (needed to read the set code in the right place)
        const half = per / 2;
        let s0 = -9, s1 = -9;
        const ref = result.top[0].index >= 0 ? engine.fp.subarray(result.top[0].index * dim, (result.top[0].index + 1) * dim) : null;
        if (ref) {
          for (let v = 0; v < per; v++) {
            let s = 0;
            for (let d = 0; d < dim; d++) s += ref[d] * e[v * dim + d];
            if (v < half) s0 = Math.max(s0, s); else s1 = Math.max(s1, s);
          }
        }
        result.upsideDown = s1 > s0;
        embs[i + k] = { e: Float32Array.from(e.subarray(result.upsideDown ? half * dim : 0, (result.upsideDown ? half + 1 : 1) * dim)), scores };
        out.push(result);
        onEach(i + k, result);
      });
    }
    // closer look at the unsure ones
    if (closer) {
      const unsure = out.map((r, i) => i).filter((i) => !out[i].confident);
      for (let u = 0; u < unsure.length; u += 2) {
        const idx = unsure.slice(u, u + 2);
        const vs = idx.map((i) => viewsMore(cards[i], out[i].upsideDown));
        const n = vs[0].length;
        const emb = await embed(engine, vs.flat());
        idx.forEach((i, k) => {
          const e = emb.subarray(k * n * dim, (k + 1) * n * dim);
          const more = scoreAll(engine, e, n);
          const scores = embs[i].scores;
          for (let a = 0; a < scores.length; a++) if (more[a] > scores[a]) scores[a] = more[a];
          const res = judge(rankWith(engine, scores, allow, learnedBoost(scores, engine, e, n)));
          res.upsideDown = out[i].upsideDown;
          out[i] = res;
        });
      }
    }
    out.forEach((r, i) => { r.embedding = embs[i].e; });
    return out;
  }

  return { ready, identify, identifyMany };
}
