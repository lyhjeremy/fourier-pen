// Drawing the scene: the finished line, the live trace, circles, arrows and the pen.
// drawScene works on any 2d context, so the live stage and the video exporter share it.

import { chainAt } from './fourier.js';

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// Build a colour set for the scene from a line colour and a background.
export function sceneColors(line, bg) {
  return {
    bg,
    line,
    lineDim: rgba(line, 0.18),
    jump: rgba(line, 0.3),
    arrow: rgba(line, 0.75),
    circle: line,
    tip: line,
  };
}

// scene: { model, curve, K, t, laps, follow, focus, showCircles, showJumps, colors,
//          lineWidth, showFinished, zoom }
// chain: { X: Float32Array, Y: Float32Array } scratch arrays of length >= K + 1
export function drawScene(ctx, w, h, scene, chain) {
  const { model, curve, K, t, colors } = scene;
  if (colors.bg === 'transparent') ctx.clearRect(0, 0, w, h);
  else { ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, w, h); }
  if (!model || !curve) return null;

  const [tipX, tipY] = chainAt(model.coeffs, K, t, chain.X, chain.Y);
  const zoom = scene.follow ? (scene.zoom || 6) : 1;
  const focus = scene.focus || { x: 0, y: 0 };
  if (scene.follow) { focus.x += (tipX - focus.x) * 0.2; focus.y += (tipY - focus.y) * 0.2; }
  else { focus.x += (0 - focus.x) * 0.2; focus.y += (0 - focus.y) * 0.2; }
  const S = Math.min(w, h) * (scene.scaleFrac || 0.43) * zoom, ox = w / 2, oy = h / 2;
  const X = (v) => ox + (v - focus.x) * S, Y = (v) => oy + (v - focus.y) * S;
  const lw = scene.lineWidth || 1.8;

  const M = model.N, jump = model.jump, end = Math.min(M - 1, Math.floor(t * M));
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  if (scene.showFinished && scene.laps > 0) {
    ctx.strokeStyle = colors.lineDim; ctx.lineWidth = lw * 0.7; ctx.beginPath();
    for (let j = 0; j < M; j++) {
      if (j === 0 || jump[j]) ctx.moveTo(X(curve.X[j]), Y(curve.Y[j])); else ctx.lineTo(X(curve.X[j]), Y(curve.Y[j]));
    }
    ctx.stroke();
  }
  if (scene.showJumps) {
    ctx.strokeStyle = colors.jump; ctx.lineWidth = lw * 0.55; ctx.setLineDash([3 * lw, 4 * lw]); ctx.beginPath();
    for (let j = 1; j <= end; j++) if (jump[j]) { ctx.moveTo(X(curve.X[j - 1]), Y(curve.Y[j - 1])); ctx.lineTo(X(curve.X[j]), Y(curve.Y[j])); }
    ctx.stroke(); ctx.setLineDash([]);
  }
  // live trace
  ctx.strokeStyle = colors.line; ctx.lineWidth = scene.follow ? lw * 1.3 : lw; ctx.beginPath();
  for (let j = 0; j <= end; j++) {
    if (j === 0 || jump[j]) ctx.moveTo(X(curve.X[j]), Y(curve.Y[j])); else ctx.lineTo(X(curve.X[j]), Y(curve.Y[j]));
  }
  if (!jump[Math.min(M - 1, end + 1)]) ctx.lineTo(X(tipX), Y(tipY));
  ctx.stroke();

  if (scene.showCircles) {
    ctx.lineWidth = Math.max(0.6, lw * 0.5);
    const lim = Math.min(K, 220);
    for (let n = 0; n < lim; n++) {
      const r = model.coeffs[n].amp * S;
      if (r < 1.5) continue;
      ctx.strokeStyle = rgba(colors.circle, 0.22 * (1 - n / lim) + 0.05);
      ctx.beginPath(); ctx.arc(X(chain.X[n]), Y(chain.Y[n]), r, 0, Math.PI * 2); ctx.stroke();
    }
  }
  if (scene.showArrows !== false) {
    ctx.strokeStyle = colors.arrow; ctx.fillStyle = colors.arrow; ctx.lineWidth = Math.max(0.8, lw * 0.6);
    ctx.beginPath();
    const heads = [];
    const headMax = 7 * (lw / 1.8);
    for (let n = 0; n < K; n++) {
      const x0 = X(chain.X[n]), y0 = Y(chain.Y[n]), x1 = X(chain.X[n + 1]), y1 = Y(chain.Y[n + 1]);
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 0.35) continue;
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      if (len > 9 && heads.length < 300) heads.push([x0, y0, x1, y1, len]);
    }
    ctx.stroke();
    ctx.beginPath();
    for (const [x0, y0, x1, y1, len] of heads) {
      const hh = Math.min(headMax, len * 0.28), ux = (x1 - x0) / len, uy = (y1 - y0) / len;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - ux * hh - uy * hh * 0.45, y1 - uy * hh + ux * hh * 0.45);
      ctx.lineTo(x1 - ux * hh + uy * hh * 0.45, y1 - uy * hh - ux * hh * 0.45);
      ctx.closePath();
    }
    ctx.fill();
  }
  // pen tip
  ctx.fillStyle = colors.tip; ctx.beginPath(); ctx.arc(X(tipX), Y(tipY), Math.max(2.5, lw * 1.6), 0, Math.PI * 2); ctx.fill();
  return [tipX, tipY];
}

// Keeps a canvas sized to its CSS box at device pixel ratio (capped at 2).
export function createStage(canvas) {
  const ctx = canvas.getContext('2d');
  let cssW = 0, cssH = 0, dpr = 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cssW = r.width; cssH = r.height;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();
  return {
    ctx,
    get w() { return cssW; },
    get h() { return cssH; },
    get dpr() { return dpr; },
    begin() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); },
  };
}
