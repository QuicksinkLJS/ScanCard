// Depth of a picture on the phone: Depth Anything V2 Small (Apache-2.0, int8, 27 MB, see js/depth/LICENSE-…).
// Loaded only when "Living artwork" is opened; kept by the service worker in its own cache, so it downloads
// once. Runs with onnxruntime-web (wasm), ~1–4 s on a phone for 252 × 252.

import { toTensor, cleanDepth, DEPTH_SIZE } from './livemath.js';

const ORT_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/ort.min.js';
// inside js/ so the beta channel (which takes js/ from the beta branch) has it too
const MODEL_URL = new URL('./depth/depth-anything-v2-small-int8.onnx', import.meta.url).href;
export const MODEL_MB = 27;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

let sessionP = null;
const cache = new Map();   // picture key -> {map, focus, spread, size}

// onProgress(share 0..1) while downloading
async function download(onProgress) {
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`model ${res.status}`);
  const total = Number(res.headers.get('content-length')) || MODEL_MB * 1e6;
  if (!res.body?.getReader) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    onProgress(Math.min(1, got / total));
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function loadDepthModel(onProgress = () => {}) {
  if (!sessionP) {
    sessionP = (async () => {
      if (!window.ort) await loadScript(ORT_URL);
      const ort = window.ort;
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
      const bytes = await download(onProgress);
      return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    })();
    sessionP.catch(() => { sessionP = null; });
  }
  return sessionP;
}

// Depth of a part of a picture. src: an <img>/<canvas> with readable pixels; box: {x1,y1,x2,y2} in 0..1.
// key: for the cache (same picture + box = no second run).
export async function depthOf(src, box, { key = '', onProgress } = {}) {
  if (key && cache.has(key)) return cache.get(key);
  const session = await loadDepthModel(onProgress);
  const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
  const c = document.createElement('canvas');
  c.width = c.height = DEPTH_SIZE;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, box.x1 * w, box.y1 * h, (box.x2 - box.x1) * w, (box.y2 - box.y1) * h, 0, 0, DEPTH_SIZE, DEPTH_SIZE);
  const rgba = ctx.getImageData(0, 0, DEPTH_SIZE, DEPTH_SIZE).data;
  const ort = window.ort;
  const input = new ort.Tensor('float32', toTensor(rgba), [1, 3, DEPTH_SIZE, DEPTH_SIZE]);
  const t0 = performance.now();
  const out = await session.run({ [session.inputNames[0]]: input });
  const raw = out[session.outputNames[0]].data;
  const res = { ...cleanDepth(raw), size: DEPTH_SIZE, ms: Math.round(performance.now() - t0) };
  if (key) cache.set(key, res);
  return res;
}
