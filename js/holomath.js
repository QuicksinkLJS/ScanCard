// Hologram (stage 1): the maths, without the page – where the card is on screen, where the hologram floats,
// and how far the scene moves when the phone turns (so the hologram stays above the real card).
// Pure functions, tested in Node (tests/holomath.test.mjs).

import { GAME } from './game.js';

export const CARD_MM = GAME.cardMm;

// Artwork window per card layout, as share of the card (from the game pack; same numbers as the foil areas in style.css).
export const ART_BOX = GAME.artBox;

// How to show only the artwork: a box with the artwork's shape, the card picture inside it moved and enlarged.
// Returns width : height of the box and the picture's size/position in % of the box.
export function artCrop(layout = 'normal') {
  const b = ART_BOX[layout] || ART_BOX.normal;
  const bw = b.x2 - b.x1, bh = b.y2 - b.y1;
  const pct = (v) => Math.round(v * 10000) / 100;
  return {
    aspect: Math.round(((bw * CARD_MM.w) / (bh * CARD_MM.h)) * 1000) / 1000,
    width: pct(1 / bw), height: pct(1 / bh), left: pct(-b.x1 / bw), top: pct(-b.y1 / bh),
  };
}

// A video shown with object-fit: cover on a screen of sw × sh: how video pixels map to screen pixels.
export function coverMap(vw, vh, sw, sh) {
  const scale = Math.max(sw / vw, sh / vh);
  return { scale, ox: (sw - vw * scale) / 2, oy: (sh - vh * scale) / 2 };
}

// Rotated card box (video pixels, from the card finder) → screen: centre, short side w, long side h, angle.
export function boxToScreen(b, map) {
  let { w, h, angle } = b;
  if (w > h) { [w, h] = [h, w]; angle += Math.PI / 2; }
  // keep the angle small (an upright card can be read as turned by 180°)
  while (angle > Math.PI / 2) angle -= Math.PI;
  while (angle < -Math.PI / 2) angle += Math.PI;
  return { cx: b.cx * map.scale + map.ox, cy: b.cy * map.scale + map.oy, w: w * map.scale, h: h * map.scale, angle };
}

// Of all cards found, the one meant: big and near the middle of the picture.
export function pickCard(boxes, vw, vh) {
  if (!boxes?.length) return null;
  const diag = Math.hypot(vw, vh);
  let best = null, bestScore = -1;
  for (const b of boxes) {
    const dist = Math.hypot(b.cx - vw / 2, b.cy - vh / 2) / diag;
    const score = b.w * b.h * Math.max(0.05, 1 - dist * 1.6) * (b.score ?? 1);
    if (score > bestScore) { bestScore = score; best = b; }
  }
  return best;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Where the hologram goes for a card on screen (all in screen pixels):
//   art: the floating artwork (left/top/size = width), beam: light cone from the card up to the artwork.
// The artwork floats above the card's top edge; near the top of the screen it is pushed down so it stays visible,
// and it is kept inside the screen sideways.
export function sceneLayout(card, sw, sh, { top = 0.12 } = {}) {
  const size = clamp(card.w * 2.1, Math.min(150, sw * 0.6), Math.min(sw * 0.84, sh * 0.48));
  const gap = card.w * 0.3;
  let artBottom = card.cy - card.h / 2 - gap;
  const minTop = sh * top;
  if (artBottom - size < minTop) artBottom = minTop + size;
  const x = clamp(card.cx, size / 2 + 8, sw - size / 2 - 8);
  const beamTop = artBottom - size * 0.12;
  // the beam starts just inside the card's top edge (not over the whole card, that would wash it out)
  const beamBottom = Math.max(beamTop + 20, card.cy - card.h / 2 + card.h * 0.07);
  const w0 = card.w * 0.72, w1 = size * 0.96;
  const left = Math.min(card.cx - w0 / 2, x - w1 / 2), right = Math.max(card.cx + w0 / 2, x + w1 / 2);
  const r = (v) => Math.round(v * 10) / 10;
  return {
    art: { left: r(x - size / 2), top: r(artBottom - size), size: r(size), cx: r(x) },
    beam: {
      left: r(left), top: r(beamTop), width: r(right - left), height: r(beamBottom - beamTop),
      // clip polygon inside the beam box: top edge (under the artwork) wide, bottom edge (card) narrow
      poly: [[x - w1 / 2 - left, 0], [x + w1 / 2 - left, 0], [card.cx + w0 / 2 - left, beamBottom - beamTop], [card.cx - w0 / 2 - left, beamBottom - beamTop]].map(([a, b]) => [r(a), r(b)]),
    },
  };
}

// Difference of two angles in degrees, -180..180.
export function angleDelta(a, b) {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

// Focal length in screen pixels for a phone camera (field of view across the long side of the video).
export function focalPx(vw, vh, map, fovDeg = 64) {
  return (Math.max(vw, vh) / 2 / Math.tan((fovDeg / 2) * Math.PI / 180)) * map.scale;
}

// The phone turned by d = {b, g} degrees (deviceorientation beta/gamma) since the hologram was placed:
// how far the table – and so the card – moves on screen. Turning only (no walking): shift = f · tan(angle).
// Tilting the top of the phone up (beta +) makes the camera look further ahead → the card slides down (+y);
// tilting it right (gamma +) makes the back camera look left → the card slides right (+x).
export function worldShift(d, f, { max = 0.9 } = {}) {
  const t = (deg) => Math.tan(clamp(deg, -40, 40) * Math.PI / 180);
  const lim = f * max;
  return { dx: clamp(f * t(d.g), -lim, lim), dy: clamp(f * t(d.b), -lim, lim) };
}

// 3D look of the floating artwork for a turn of d degrees: it turns a little with the phone (you look at it
// from the side), never so far that it becomes a thin line.
export function holoTilt(d, { maxX = 22, maxY = 30 } = {}) {
  const r = (v) => Math.round(v * 10) / 10 + 0;   // + 0: no -0
  return { rx: r(clamp(-d.b * 0.7, -maxX, maxX)), ry: r(clamp(d.g * 0.9, -maxY, maxY)) };
}
