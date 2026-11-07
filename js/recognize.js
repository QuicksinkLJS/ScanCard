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

export function createRecognizer({ base = 'models/ygo', onStatus = () => {} } = {}) {
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
    return { ort, meta, fp, session };
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

  // The artwork of a card, as it lies and turned upside down (the finder can't tell up from down).
  function views2(card) {
    const W = card.width, H = card.height;
    const ax = ART_BOX.x0 * W, ay = ART_BOX.y0 * H;
    const aw = (ART_BOX.x1 - ART_BOX.x0) * W, ah = (ART_BOX.y1 - ART_BOX.y0) * H;
    const full = { x: ax, y: ay, w: aw, h: ah };
    // Upside-down cards: the artwork box of a rotated card sits mirrored, so cut it from there.
    const flip = (b) => ({ x: W - b.x - b.w, y: H - b.y - b.h, w: b.w, h: b.h });
    return [cropView(card, full, false), cropView(card, flip(full), true)];
  }

  // Tested on real photos: right answers scored >= 0.62 with a clear lead; the miss scored 0.44.
  function judge(top) {
    const margin = top.length > 1 ? top[0].score - top[1].score : 1;
    return { top, confident: top[0].score >= 0.55 && margin >= 0.08 };
  }

  // card: an upright card image (canvas), roughly 59:86. Returns best guesses, best first.
  async function identify(card, opts) {
    return (await identifyMany([card], opts))[0];
  }

  // Several cards in one go (faster than one by one).
  async function identifyMany(cards, { onEach = () => {}, allow = null } = {}) {
    const engine = await ready();
    const out = [];
    const batch = 4;
    for (let i = 0; i < cards.length; i += batch) {
      const part = cards.slice(i, i + batch);
      const views = part.flatMap((c) => views2(c));
      const emb = await embed(engine, views);
      const dim = engine.meta.dim;
      part.forEach((_, k) => {
        const e = emb.subarray(k * 2 * dim, (k + 1) * 2 * dim);
        const scores = scoreAll(engine, e, 2);
        let top = allow ? ranked(engine, scores, 6, allow) : [];
        if (!top.length) top = ranked(engine, scores); // nothing from that set looks like it: ignore the filter
        const result = judge(top);
        // which way round did the best match fit? (needed to read the set code in the right place)
        const best = result.top[0].index * dim;
        let s0 = 0, s1 = 0;
        for (let d = 0; d < dim; d++) { s0 += engine.fp[best + d] * e[d]; s1 += engine.fp[best + d] * e[dim + d]; }
        result.upsideDown = s1 > s0;
        out.push(result);
        onEach(i + k, result);
      });
    }
    return out;
  }

  return { ready, identify, identifyMany };
}
