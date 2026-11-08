// Summon – the maths (no browser APIs, tested in Node): cut the monster out of the artwork with the depth map,
// turn cut-out + depth into a 3D body (front and a flatter back, so it has volume from the side), and the
// small matrix helpers for the WebGL scene.
//
// Units: the card lies flat, 59 × 86 (mm), centred at the origin in the x/z plane, y is up.

// ---------- cut-out ----------
// Otsu threshold of 0..255 values: the split between far (background) and near (monster).
export function otsu(map) {
  const h = new Float64Array(256);
  for (const v of map) h[v]++;
  const n = map.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * h[i];
  let sumB = 0, wB = 0, best = 0, t = 128;
  for (let i = 0; i < 256; i++) {
    wB += h[i]; if (!wB) continue;
    const wF = n - wB; if (!wF) break;
    sumB += i * h[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; t = i; }
  }
  return t;
}

// Keep the largest connected area of 1s (4-neighbours). -> Uint8Array 0/1
export function largestComponent(bin, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  let bestId = -1, bestSize = 0, id = 0;
  for (let s = 0; s < w * h; s++) {
    if (!bin[s] || label[s] >= 0) continue;
    let top = 0, size = 0;
    stack[top++] = s; label[s] = id;
    while (top) {
      const p = stack[--top]; size++;
      const x = p % w, y = (p - x) / w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && bin[q] && label[q] < 0) { label[q] = id; stack[top++] = q; }
      }
    }
    if (size > bestSize) { bestSize = size; bestId = id; }
    id++;
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = label[i] === bestId ? 1 : 0;
  return out;
}

// Fill holes: 0s not connected to the border become 1.
export function fillHoles(bin, w, h) {
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inv[i] = bin[i] ? 0 : 1;
  const outside = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop();
    if (!inv[p] || outside[p]) continue;
    outside[p] = 1;
    const x = p % w, y = (p - x) / w;
    if (x > 0) stack.push(p - 1); if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w); if (y < h - 1) stack.push(p + w);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = bin[i] || !outside[i] ? 1 : 0;
  return out;
}

// The monster: near areas (above the Otsu split, a little towards near), largest piece, holes filled,
// soft edge (0..255). -> {mask Uint8 0..255, cut 0..255, share (of the artwork), box {x1,y1,x2,y2} 0..1, ok}
export function cutOut(depthMap, size, { bias = 0.08 } = {}) {
  const t = otsu(depthMap);
  const cut = Math.min(245, Math.round(t + (255 - t) * bias));
  let bin = new Uint8Array(size * size);
  for (let i = 0; i < bin.length; i++) bin[i] = depthMap[i] > cut ? 1 : 0;
  bin = fillHoles(largestComponent(bin, size, size), size, size);
  // soft edge: 3×3 average twice
  let soft = Float32Array.from(bin);
  for (let k = 0; k < 2; k++) {
    const o = new Float32Array(soft.length);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < size && yy < size) { s += soft[yy * size + xx]; n++; }
      }
      o[y * size + x] = s / n;
    }
    soft = o;
  }
  const mask = new Uint8Array(soft.length);
  let count = 0, x1 = size, y1 = size, x2 = -1, y2 = -1;
  for (let i = 0; i < soft.length; i++) {
    mask[i] = Math.round(soft[i] * 255);
    if (bin[i]) { count++; const x = i % size, y = (i - x) / size; if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
  }
  const share = count / bin.length;
  return {
    mask, cut, share,
    box: count ? { x1: x1 / size, y1: y1 / size, x2: (x2 + 1) / size, y2: (y2 + 1) / size } : null,
    ok: share > 0.04 && share < 0.92,   // a figure, not nothing and not everything
  };
}

// ---------- 3D body ----------
// Grid over the monster's box in the artwork. Each vertex: position (x, y up, z towards you), artwork uv, alpha
// (from the mask), normal. Front side: depth pushes it forward; back side: the same outline, pushed back less and
// mirrored, so from the side it is a body and not a sheet. The monster stands on y = 0, centred on x = 0.
// opts: height (world units of the monster), thickness (share of its width), cols/rows (grid)
export function buildBody(depthMap, mask, size, box, { height = 70, thickness = 0.32, cols = 96, rows = 112, artAspect = 1 } = {}) {
  const bw = box.x2 - box.x1, bh = box.y2 - box.y1;
  const scale = height / bh;                        // world units per artwork unit (vertical)
  const width = bw * scale * artAspect;
  const sample = (arr, u, v) => {                   // bilinear, u/v in 0..1 of the artwork
    const x = Math.min(size - 1.001, Math.max(0, u * size - 0.5)), y = Math.min(size - 1.001, Math.max(0, v * size - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const i = y0 * size + x0;
    return (arr[i] * (1 - fx) + arr[i + 1] * fx) * (1 - fy) + (arr[i + size] * (1 - fx) + arr[i + size + 1] * fx) * fy;
  };
  // depth of the monster relative to its own farthest part
  let dmin = 255, dmax = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] > 200) { if (depthMap[i] < dmin) dmin = depthMap[i]; if (depthMap[i] > dmax) dmax = depthMap[i]; }
  const span = Math.max(8, dmax - dmin);
  const depthWorld = width * thickness;
  // how far each pixel is inside the outline (chamfer distance) -> a round profile, 0 right at the outline
  const dist = insideDistance(mask, size);
  const R = Math.max(3, 0.16 * Math.min(bw, bh) * size);
  const nV = (cols + 1) * (rows + 1);
  const pos = new Float32Array(nV * 2 * 3), uv = new Float32Array(nV * 2 * 2), alpha = new Float32Array(nV * 2), side = new Float32Array(nV * 2);
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const u = box.x1 + (c / cols) * bw, v = box.y1 + (r / rows) * bh;
      const a = sample(mask, u, v) / 255;
      const d = Math.max(0, (sample(depthMap, u, v) - dmin) / span);
      const x = ((c / cols) - 0.5) * width, y = (1 - r / rows) * height;
      // round the body off towards the outline: thinner at the edge of the cut-out
      const e = Math.min(1, sample(dist, u, v) / R);
      const zf = (0.35 + 0.65 * d) * depthWorld * Math.sqrt(1 - (1 - e) * (1 - e));
      const i = r * (cols + 1) + c;
      for (const [k, z, s] of [[i, zf * 0.5, 1], [i + nV, -zf * 0.32, 0]]) {
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
        uv[k * 2] = u; uv[k * 2 + 1] = v; alpha[k] = a; side[k] = s;
      }
    }
  }
  // triangles: front faces towards +z, back faces reversed; only cells that touch the monster
  const idx = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * (cols + 1) + c, j = i + cols + 1;
      if (Math.max(alpha[i], alpha[i + 1], alpha[j], alpha[j + 1]) < 0.05) continue;
      idx.push(i, j, i + 1, i + 1, j, j + 1);
      idx.push(nV + i, nV + i + 1, nV + j, nV + i + 1, nV + j + 1, nV + j);
    }
  }
  const index = nV * 2 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  return { pos, uv, alpha, side, index, normal: normals(pos, index), width, height, depth: depthWorld };
}

// Distance (in pixels) from each pixel inside the mask (> 127) to the outline; 0 outside. Two-pass chamfer 3-4.
// The outline itself sits half a pixel out, so pixels on the edge get 0.5.
export function insideDistance(mask, size) {
  const d = new Float32Array(mask.length);
  const BIG = 1e6;
  for (let i = 0; i < mask.length; i++) d[i] = mask[i] > 127 ? BIG : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= size || y >= size ? 0 : d[y * size + x]);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4142, at(x + 1, y - 1) + 1.4142);
  }
  for (let y = size - 1; y >= 0; y--) for (let x = size - 1; x >= 0; x--) {
    const i = y * size + x;
    if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4142, at(x - 1, y + 1) + 1.4142);
  }
  for (let i = 0; i < d.length; i++) if (d[i]) d[i] -= 0.5;
  return d;
}

// Smooth vertex normals from the triangles.
export function normals(pos, index) {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  for (let k = 0; k < n.length; k += 3) {
    const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1;
    n[k] /= l; n[k + 1] /= l; n[k + 2] /= l;
  }
  return n;
}

// ---------- matrices (column-major, like WebGL) ----------
export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
export function lookAt(eye, target, up = [0, 1, 0]) {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1]);
}
export function multiply(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
// A point through a matrix -> clip space [x, y, z, w]
export function transform(m, p) {
  return [0, 1, 2, 3].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
}

// Camera on a sphere around the monster: yaw (left/right), pitch (from above), distance.
export function orbitEye(yaw, pitch, dist, target = [0, 32, 0]) {
  return [target[0] + Math.sin(yaw) * Math.cos(pitch) * dist, target[1] + Math.sin(pitch) * dist, target[2] + Math.cos(yaw) * Math.cos(pitch) * dist];
}

// The summoning: t in seconds -> how far each part is. glow (card lights up), beam (light column),
// rise (0..1 the monster comes up out of the card), settle (its little landing bounce), done.
export function summonTimeline(t) {
  const c = (v) => Math.max(0, Math.min(1, v));
  const ease = (v) => 1 - (1 - v) ** 3;
  const rise = ease(c((t - 0.55) / 1.25));
  return {
    glow: c(t / 0.4) * (1 - 0.6 * c((t - 1.6) / 0.8)),
    beam: c((t - 0.25) / 0.3) * (1 - c((t - 1.5) / 0.9)),
    rise,
    settle: t > 1.8 ? Math.sin(c((t - 1.8) / 0.5) * Math.PI) * 0.03 : 0,
    done: t >= 2.6,
  };
}
