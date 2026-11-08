// Fake-camera videos for t39_tiltscan: a synthetic card (tests/tiltsynth.mjs: Ultra Rare / Common) lying
// in the tilt sheet's card frame of a 1080 × 1920 camera picture and really tilted in perspective –
// to one side, the other side, forwards, backwards – while its foil shines (the guided tilt scan reads
// the tilt from the card's shape). 40 frames at 10 fps, loops.
// Usage: node tools/uitest/mk_tilt_video.mjs [outdir]   (default /home/claude/work/tilt)
import { mkdirSync, openSync, writeSync, closeSync } from 'node:fs';
import { cardPixel, LOOKS } from '../../tests/tiltsynth.mjs';
import { homography, warpPerspective } from '../../js/passport.js';
import { GRID_W, GRID_H } from '../../js/tilt.js';

const out = process.argv[2] || '/home/claude/work/tilt';
mkdirSync(out, { recursive: true });
const PW = 1080, PH = 1920, N = 40, K = 4, CW = GRID_W * K, CH = GRID_H * K;
const D = 94, MM = 13.9;   // camera distance (mm) and pixels per mm at the card's centre

function tiltAt(k) {
  const ramp = (a, b) => (k >= a && k < b ? Math.sin(((k - a) / (b - a)) * Math.PI) : 0);
  return { yaw: 12 * ramp(6, 14) - 12 * ramp(14, 22), pitch: 12 * ramp(22, 30) - 12 * ramp(30, 38) };
}
function quad({ yaw, pitch }) {
  const a = yaw * Math.PI / 180, b = pitch * Math.PI / 180, f = MM * D;
  return [[-29.5, -43], [29.5, -43], [29.5, 43], [-29.5, 43]].map(([X, Y]) => {
    let x = X * Math.cos(a), z = X * Math.sin(a), y = Y;
    const y2 = y * Math.cos(b), z2 = z + y * Math.sin(b);
    return [PW / 2 + (f * x) / (D + z2), PH / 2 + (f * y2) / (D + z2)];
  });
}

for (const kind of ['ultra', 'common']) {
  const fd = openSync(`${out}/${kind}.y4m`, 'w');
  writeSync(fd, `YUV4MPEG2 W${PW} H${PH} F10:1 Ip A1:1 C420jpeg\n`);
  const Y = Buffer.alloc(PW * PH), U = Buffer.alloc(PW * PH / 4), V = Buffer.alloc(PW * PH / 4);
  for (let k = 0; k < N; k++) {
    const card = new Uint8ClampedArray(CW * CH * 4);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const c = cardPixel((x + 0.5) / K, (y + 0.5) / K, k, LOOKS[kind], 3);
      const o = (y * CW + x) * 4;
      card[o] = c[0]; card[o + 1] = c[1]; card[o + 2] = c[2]; card[o + 3] = 255;
    }
    const q = quad(tiltAt(k));
    const H = homography(q, [[0, 0], [CW, 0], [CW, CH], [0, CH]]);
    const img = warpPerspective(card, CW, CH, H, PW, PH);
    const gain = 1 + 0.08 * Math.sin(k * 0.9);
    for (let p = 0, i = 0; p < PW * PH; p++, i += 4) {
      const n = ((p * 2654435761 + k * 97) >>> 0) % 7 - 3;
      if (img[i + 3]) { img[i] = img[i] * gain + n; img[i + 1] = img[i + 1] * gain + n; img[i + 2] = img[i + 2] * gain + n; }
      else { img[i] = 40 + n; img[i + 1] = 36 + n; img[i + 2] = 34 + n; }
      Y[p] = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
    }
    for (let y = 0; y < PH / 2; y++) for (let x = 0; x < PW / 2; x++) {
      const i = ((y * 2) * PW + x * 2) * 4, r = img[i], g = img[i + 1], bl = img[i + 2];
      U[y * PW / 2 + x] = Math.max(0, Math.min(255, 128 - 0.1687 * r - 0.3313 * g + 0.5 * bl));
      V[y * PW / 2 + x] = Math.max(0, Math.min(255, 128 + 0.5 * r - 0.4187 * g - 0.0813 * bl));
    }
    writeSync(fd, 'FRAME\n'); writeSync(fd, Y); writeSync(fd, U); writeSync(fd, V);
  }
  closeSync(fd);
  console.log(`${out}/${kind}.y4m`);
}
