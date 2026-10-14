// Picture to edge pixels to strokes.
// Everything here is pure except toGray, which needs a canvas to read pixels.

export const PROC = 360; // longest side of the working image, in pixels

// RGBA bytes to a contrast-stretched grayscale Float32Array in [0, 1].
export function grayFromRGBA(data, W, H) {
  const n = W * H;
  const g = new Float32Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const v = (0.299 * data[4 * i] + 0.587 * data[4 * i + 1] + 0.114 * data[4 * i + 2]) / 255;
    g[i] = v;
    hist[Math.min(255, (v * 255) | 0)]++;
  }
  // stretch contrast between the 1st and 99th percentile
  let acc = 0, lo = 0, hi = 255;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * 0.01) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= n * 0.01) { hi = i; break; } }
  if (hi - lo > 10) {
    const a = lo / 255, b = hi / 255;
    for (let i = 0; i < n; i++) g[i] = Math.min(1, Math.max(0, (g[i] - a) / (b - a)));
  }
  return g;
}

// Browser only: scale any CanvasImageSource to PROC px and return its grayscale.
export function toGray(src) {
  const w0 = src.naturalWidth || src.width, h0 = src.naturalHeight || src.height;
  const sc = PROC / Math.max(w0, h0);
  const W = Math.max(8, Math.round(w0 * sc)), H = Math.max(8, Math.round(h0 * sc));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff'; // ledger-allow: purewhite (compositing ground for transparent images, not a UI colour)
  x.fillRect(0, 0, W, H);
  x.drawImage(src, 0, 0, W, H);
  const data = x.getImageData(0, 0, W, H).data;
  return { g: grayFromRGBA(data, W, H), W, H, canvas: c };
}

// Separable Gaussian blur with edge clamping.
export function blur(src, W, H, sigma) {
  if (sigma < 0.3) return src;
  const r = Math.ceil(sigma * 3), k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (let i = -r; i <= r; i++) { const xx = Math.min(W - 1, Math.max(0, x + i)); v += src[y * W + xx] * k[i + r]; }
    tmp[y * W + x] = v;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (let i = -r; i <= r; i++) { const yy = Math.min(H - 1, Math.max(0, y + i)); v += tmp[yy * W + x] * k[i + r]; }
    out[y * W + x] = v;
  }
  return out;
}

// Canny edge detection. `keep` is the fraction of non-max-suppressed candidates
// that become strong edges; weak edges attach to strong ones by hysteresis.
export function canny(g, W, H, sigma, keep) {
  const b = blur(g, W, H, sigma);
  const mag = new Float32Array(W * H), dir = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const a00 = b[i - W - 1], a01 = b[i - W], a02 = b[i - W + 1];
    const a10 = b[i - 1], a12 = b[i + 1];
    const a20 = b[i + W - 1], a21 = b[i + W], a22 = b[i + W + 1];
    const gx = (a02 + 2 * a12 + a22) - (a00 + 2 * a10 + a20);
    const gy = (a20 + 2 * a21 + a22) - (a00 + 2 * a01 + a02);
    mag[i] = Math.hypot(gx, gy);
    let an = Math.atan2(gy, gx) * 57.29578; if (an < 0) an += 180;
    dir[i] = (an < 22.5 || an >= 157.5) ? 0 : an < 67.5 ? 1 : an < 112.5 ? 2 : 3;
  }
  const nms = new Float32Array(W * H); const vals = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, m = mag[i];
    if (m < 0.02) continue;
    let n1, n2;
    switch (dir[i]) {
      case 0: n1 = i - 1; n2 = i + 1; break;
      case 1: n1 = i - W - 1; n2 = i + W + 1; break;
      case 2: n1 = i - W; n2 = i + W; break;
      default: n1 = i - W + 1; n2 = i + W - 1;
    }
    if (m >= mag[n1] && m >= mag[n2]) { nms[i] = m; vals.push(m); }
  }
  const edges = new Uint8Array(W * H);
  if (!vals.length) return edges;
  const sorted = Float32Array.from(vals).sort();
  const high = sorted[Math.min(sorted.length - 1, Math.floor((1 - keep) * sorted.length))];
  const low = high * 0.45;
  const stack = [];
  for (let i = 0; i < W * H; i++) if (nms[i] >= high && !edges[i]) { edges[i] = 1; stack.push(i); }
  const OFF = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1];
  while (stack.length) {
    const i = stack.pop();
    for (const o of OFF) {
      const j = i + o;
      if (j >= 0 && j < W * H && !edges[j] && nms[j] >= low) { edges[j] = 1; stack.push(j); }
    }
  }
  return edges;
}

// Five-point moving average to take the pixel stair-steps out of a stroke.
export function smoothSeg(p) {
  if (p.length < 5) return p;
  const out = [p[0]];
  for (let i = 1; i < p.length - 1; i++) {
    let sx = 0, sy = 0, c = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(p.length - 1, i + 2); j++) { sx += p[j][0]; sy += p[j][1]; c++; }
    out.push([sx / c, sy / c]);
  }
  out.push(p[p.length - 1]);
  return out;
}

// Walk edge pixels greedily into polylines. Returns the longest 3,000 strokes.
export function trace(edges, W, H, minLen) {
  const vis = new Uint8Array(W * H); const segs = []; let edgeCount = 0;
  const OFF = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
  const walk = (start) => {
    const out = []; let cur = start;
    for (;;) {
      const x = cur % W, y = (cur / W) | 0; let nxt = -1;
      for (const [dx, dy] of OFF) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (edges[j] && !vis[j]) { nxt = j; break; }
      }
      if (nxt < 0) break;
      vis[nxt] = 1; out.push(nxt); cur = nxt;
    }
    return out;
  };
  for (let i = 0; i < W * H; i++) {
    if (!edges[i]) continue;
    edgeCount++;
    if (vis[i]) continue;
    vis[i] = 1;
    const fwd = walk(i), back = walk(i);
    const ids = back.reverse().concat([i], fwd);
    if (ids.length >= minLen) segs.push(smoothSeg(ids.map((j) => [j % W, (j / W) | 0])));
  }
  segs.sort((a, b) => b.length - a.length);
  return { segs: segs.slice(0, 3000), edgeCount };
}

// Map the Detail slider (1 to 100) to the Canny keep fraction.
export function keepFromDetail(detail) {
  return 0.02 + 0.55 * Math.pow(detail / 100, 1.3);
}
