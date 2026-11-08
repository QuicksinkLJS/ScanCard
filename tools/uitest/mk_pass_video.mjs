// Fake camera videos for t43_passport: a synthetic card on a dark table, held still and tilted (the artwork
// shines in moving colours). copyA twice (other position, noise, light) and a twin cut differently.
// Output: /home/claude/work/pass/{a1,a2,twin}.y4m (1080 × 1920, 10 fps, 30 frames, loops)
import { writeFileSync, mkdirSync, openSync, writeSync, closeSync } from 'node:fs';
import { makeCopy, photo, quadAt } from '../../tests/passsynth.mjs';
import { PASS_W, PASS_H } from '../../js/passport.js';
import { GAME } from '../../js/game.js';

const OUT = '/home/claude/work/pass', PW = 1080, PH = 1920, N = 30;
mkdirSync(OUT, { recursive: true });
const b = GAME.artBox.normal;

function shine(copy, k) {
  const c = new Uint8ClampedArray(copy);
  const x1 = Math.round(b.x1 * PASS_W), x2 = Math.round(b.x2 * PASS_W), y1 = Math.round(b.y1 * PASS_H), y2 = Math.round(b.y2 * PASS_H);
  const ph = (k / N) * Math.PI * 2;
  for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) {
    const o = (y * PASS_W + x) * 4, t = (x - x1) / (x2 - x1) + (y - y1) / (y2 - y1);
    const a = 0.5 + 0.5 * Math.sin(t * 6 + ph);
    c[o] += 70 * a * Math.sin(ph); c[o + 1] += 70 * a * Math.sin(ph + 2.1); c[o + 2] += 70 * a * Math.sin(ph + 4.2);
  }
  return c;
}

function y4m(name, copy, quad, seed, light) {
  const fd = openSync(`${OUT}/${name}.y4m`, 'w');
  writeSync(fd, `YUV4MPEG2 W${PW} H${PH} F10:1 Ip A1:1 C420jpeg\n`);
  const Y = Buffer.alloc(PW * PH), U = Buffer.alloc(PW * PH / 4), V = Buffer.alloc(PW * PH / 4);
  for (let k = 0; k < N; k++) {
    // first third: held still (no shine change); then tilting
    const img = photo(k < 10 ? copy : shine(copy, k), quad, { pw: PW, ph: PH, seed: seed * 100 + k, light });
    for (let p = 0, i = 0; p < PW * PH; p++, i += 4) Y[p] = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
    for (let y = 0; y < PH / 2; y++) for (let x = 0; x < PW / 2; x++) {
      const i = ((y * 2) * PW + x * 2) * 4;
      const r = img[i], g = img[i + 1], bl = img[i + 2];
      U[y * PW / 2 + x] = Math.max(0, Math.min(255, 128 - 0.1687 * r - 0.3313 * g + 0.5 * bl));
      V[y * PW / 2 + x] = Math.max(0, Math.min(255, 128 + 0.5 * r - 0.4187 * g - 0.0813 * bl));
    }
    writeSync(fd, 'FRAME\n'); writeSync(fd, Y); writeSync(fd, U); writeSync(fd, V);
  }
  closeSync(fd);
  console.log(`${OUT}/${name}.y4m`);
}

const A = makeCopy({ shift: [0.12, 0.05], seed: 21 });
const T = makeCopy({ shift: [0.55, -0.1], seed: 22 });
y4m('a1', A, quadAt(540, 960, { scale: 15.4, turn: 0.015, persp: 0.01 }), 1, 1);
y4m('a2', A, quadAt(545, 970, { scale: 15.2, turn: -0.02, persp: 0.02 }), 2, 0.92);
y4m('twin', T, quadAt(538, 955, { scale: 15.3, turn: 0.01, persp: 0.01 }), 3, 1);
