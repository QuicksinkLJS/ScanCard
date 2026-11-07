// Small shared helpers for the screens.

export const $ = (id) => document.getElementById(id);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const eur = (v) => (v == null ? '–' : `€${v.toFixed(2)}`);

export const range = (lo, hi) => (lo == null ? '–' : (hi == null || Math.abs(lo - hi) < 0.005) ? eur(lo) : `${eur(lo)} – ${eur(hi)}`);

let toastTimer = null;
export function toast(text, ms = 2600) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// Downscale in halving steps: one big jump drops most pixels and looks grainy.
export function shrink(canvas, w) {
  let src = canvas;
  const h = Math.round(w * canvas.height / canvas.width);
  while (src.width / 2 >= w * 1.05) {
    const c = document.createElement('canvas');
    c.width = Math.round(src.width / 2); c.height = Math.round(src.height / 2);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    src = c;
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

// JPEG preview of a card canvas (lists, collection).
export function thumbOf(canvas, w = 240, quality = 0.85) {
  return shrink(canvas, w).toDataURL('image/jpeg', quality);
}

export function canvasBlob(canvas, w = 590, quality = 0.85) {
  const c = document.createElement('canvas');
  c.width = w; c.height = Math.round(w * canvas.height / canvas.width);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', quality));
}

export function rotate180(canvas) {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.translate(c.width, c.height);
  ctx.rotate(Math.PI);
  ctx.drawImage(canvas, 0, 0);
  return c;
}

export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}
