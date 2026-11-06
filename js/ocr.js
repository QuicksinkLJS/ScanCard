// Image preparation and text recognition (Tesseract.js, runs on the phone).

// Grayscale + contrast stretch; `binarize` turns it hard black/white for a second attempt.
// `region` (fractions 0..1) crops part of the photo, e.g. the lower half where the set code sits.
export function prepare(source, { binarize = false, region = null, maxSide = 2400, rotate = 0 } = {}) {
  const img = rotate ? rotated(source, rotate) : source;
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  const r = region || { x: 0, y: 0, w: 1, h: 1 };
  const sx = Math.round(sw * r.x), sy = Math.round(sh * r.y);
  const cw = Math.round(sw * r.w), ch = Math.round(sh * r.h);
  const scale = Math.min(2, maxSide / Math.max(cw, ch));
  const w = Math.round(cw * scale), h = Math.round(ch * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, cw, ch, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const gray = new Float32Array(w * h);
  let min = 255, max = 0;
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    gray[j] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  const local = binarize ? localMeans(gray, w, h, Math.max(15, Math.round(Math.min(w, h) / 24))) : null;
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    // Adaptive threshold: a pixel is "ink" when it is clearly darker than its surroundings,
    // so dark text on the coloured card frame survives as well as text on the text box.
    const v = binarize ? (gray[j] < local[j] * 0.82 ? 0 : 255) : ((gray[j] - min) / range) * 255;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

// Straighten a slightly tilted photo (degrees, clockwise).
function rotated(img, deg) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2);
  return c;
}

// Mean brightness in a (2r+1)x(2r+1) window around every pixel, via an integral image.
function localMeans(gray, w, h, r) {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1]
        - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      out[y * w + x] = s / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

// The order in which the photo is read. Stops as soon as a set code is found.
export const PASSES = [
  { label: 'Reading the card', opts: { binarize: true } },
  { label: 'Looking closer at the lower half', opts: { binarize: true, region: { x: 0, y: 0.4, w: 1, h: 0.6 } } },
  { label: 'Zooming in on the set code', opts: { binarize: true, region: { x: 0.3, y: 0.55, w: 0.7, h: 0.25 } } },
  { label: 'Straightening the photo', opts: { binarize: true, rotate: -4, region: { x: 0, y: 0.4, w: 1, h: 0.6 } } },
  { label: 'Straightening the other way', opts: { binarize: true, rotate: 4, region: { x: 0, y: 0.4, w: 1, h: 0.6 } } },
  { label: 'Trying a softer contrast', opts: {} },
];

export async function createOcr(Tesseract, { onProgress, workerOptions = {} } = {}) {
  const worker = await Tesseract.createWorker('eng', 1, {
    ...workerOptions,
    logger: (m) => { if (m.status === 'recognizing text' && onProgress) onProgress(m.progress); },
  });
  // Sparse text: find small isolated text like the set code, not just paragraphs.
  await worker.setParameters({ tessedit_pageseg_mode: '11' });
  return {
    async read(canvas) {
      const { data } = await worker.recognize(canvas);
      return data.text || '';
    },
  };
}
