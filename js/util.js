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

// Small JPEG preview of a card canvas (for lists and the collection).
export function thumbOf(canvas, w = 120) {
  const c = document.createElement('canvas');
  c.width = w; c.height = Math.round(w * canvas.height / canvas.width);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.75);
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
