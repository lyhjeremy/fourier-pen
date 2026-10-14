// Saving: PNG and SVG pictures at any size, a CSV of every arrow, and a WebM or MP4
// video of one full drawing. All of it runs in the browser.

import { drawScene, sceneColors } from './render.js';
import { phaseOf } from './fourier.js';

export const PRESETS = [
  { id: 'square', name: 'Square', w: 2048, h: 2048 },
  { id: 'iphone', name: 'iPhone', w: 1179, h: 2556 },
  { id: 'iphone-max', name: 'iPhone Pro Max', w: 1290, h: 2796 },
  { id: 'mba13', name: 'MacBook Air 13', w: 2560, h: 1664 },
  { id: 'mbp14', name: 'MacBook Pro 14', w: 3024, h: 1964 },
  { id: 'mbp16', name: 'MacBook Pro 16', w: 3456, h: 2234 },
  { id: 'fhd', name: 'Full HD', w: 1920, h: 1080 },
  { id: '4k', name: '4K', w: 3840, h: 2160 },
  { id: '5k', name: '5K', w: 5120, h: 2880 },
  { id: 'custom', name: 'Custom', w: 2048, h: 2048 },
];

export const DEFAULT_LINE = '#1C1E1B';
export const DEFAULT_BG = '#EDEDE7';

export function curveBounds(curve) {
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (let j = 0; j < curve.X.length; j++) {
    minx = Math.min(minx, curve.X[j]); maxx = Math.max(maxx, curve.X[j]);
    miny = Math.min(miny, curve.Y[j]); maxy = Math.max(maxy, curve.Y[j]);
  }
  return { minx, maxx, miny, maxy };
}

// Fit the curve's bounding box inside width x height minus a margin fraction, centred.
export function fitCurve(curve, width, height, marginFrac) {
  const b = curveBounds(curve);
  const bw = Math.max(b.maxx - b.minx, 1e-6), bh = Math.max(b.maxy - b.miny, 1e-6);
  const S = Math.min((width * (1 - 2 * marginFrac)) / bw, (height * (1 - 2 * marginFrac)) / bh);
  const ox = width / 2 - ((b.minx + b.maxx) / 2) * S, oy = height / 2 - ((b.miny + b.maxy) / 2) * S;
  return { S, ox, oy };
}

// opts: { width, height, lineWidth (thousandths of the shorter side), lineColor,
//         bgColor | 'transparent', margin (fraction), showJumps }
export function renderPNG(curve, jump, opts, canvas) {
  const { width, height } = opts;
  const c = canvas || document.createElement('canvas');
  c.width = width; c.height = height;
  const x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0);
  if (opts.bgColor === 'transparent') x.clearRect(0, 0, width, height);
  else { x.fillStyle = opts.bgColor; x.fillRect(0, 0, width, height); }
  const { S, ox, oy } = fitCurve(curve, width, height, opts.margin), M = curve.X.length;
  const lw = (Math.min(width, height) * opts.lineWidth) / 1000;
  x.lineJoin = 'round'; x.lineCap = 'round';
  if (opts.showJumps) {
    x.strokeStyle = opts.lineColor; x.globalAlpha = 0.3; x.lineWidth = lw * 0.55;
    x.setLineDash([lw * 2.5, lw * 3]); x.beginPath();
    for (let j = 1; j < M; j++) if (jump[j]) { x.moveTo(ox + curve.X[j - 1] * S, oy + curve.Y[j - 1] * S); x.lineTo(ox + curve.X[j] * S, oy + curve.Y[j] * S); }
    x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
  }
  x.strokeStyle = opts.lineColor; x.lineWidth = lw; x.beginPath();
  for (let j = 0; j <= M; j++) {
    const k = j % M, px = ox + curve.X[k] * S, py = oy + curve.Y[k] * S;
    if (j === 0 || jump[k]) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.stroke();
  return c;
}

export function renderSVG(curve, jump, opts) {
  const { width, height } = opts;
  const { S, ox, oy } = fitCurve(curve, width, height, opts.margin), M = curve.X.length;
  const lw = ((Math.min(width, height) * opts.lineWidth) / 1000).toFixed(2);
  const P = (k) => (ox + curve.X[k] * S).toFixed(2) + ' ' + (oy + curve.Y[k] * S).toFixed(2);
  let d = '', dj = '';
  for (let j = 0; j <= M; j++) { const k = j % M; d += (j === 0 || jump[k] ? 'M' : 'L') + P(k) + ' '; }
  if (opts.showJumps) for (let j = 1; j < M; j++) if (jump[j]) dj += 'M' + P(j - 1) + ' L' + P(j) + ' ';
  const bg = opts.bgColor === 'transparent' ? '' : `<rect width="100%" height="100%" fill="${opts.bgColor}"/>\n`;
  const jumps = dj ? `<path d="${dj.trim()}" fill="none" stroke="${opts.lineColor}" stroke-opacity="0.3" stroke-width="${(lw * 0.55).toFixed(2)}" stroke-dasharray="${(lw * 2.5).toFixed(2)} ${(lw * 3).toFixed(2)}"/>\n` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n${bg}${jumps}<path d="${d.trim()}" fill="none" stroke="${opts.lineColor}" stroke-width="${lw}" stroke-linejoin="round" stroke-linecap="round"/>\n</svg>\n`;
}

export function renderCSV(coeffs, K) {
  const rows = ['rank,turns_n,re,im,length,start_angle_rad,used'];
  coeffs.forEach((c, i) => rows.push([i + 1, c.f, c.A.toFixed(8), c.B.toFixed(8), c.amp.toFixed(8), phaseOf(c).toFixed(6), i < K ? 1 : 0].join(',')));
  return rows.join('\n') + '\n';
}

export function download(filename, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function videoMimes() {
  if (typeof MediaRecorder === 'undefined') return [];
  const out = [];
  for (const [label, mime, ext] of [
    ['WebM', 'video/webm;codecs=vp9', 'webm'],
    ['WebM', 'video/webm', 'webm'],
    ['MP4', 'video/mp4;codecs=avc1', 'mp4'],
    ['MP4', 'video/mp4', 'mp4'],
  ]) {
    if (MediaRecorder.isTypeSupported(mime) && !out.some((o) => o.ext === ext)) out.push({ label, mime, ext });
  }
  return out;
}

export const VIDEO_MAX_SIDE = 1920;

// Record one full drawing loop in real time. opts as renderPNG plus { lapSec, fps, mime }.
// Resolves with a Blob. onProgress(seconds, total). Rejects with code 'cancelled' on abort.
export function recordVideo(model, curve, K, opts, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const scale = Math.min(1, VIDEO_MAX_SIDE / Math.max(opts.width, opts.height));
    const w = Math.max(16, Math.round(opts.width * scale) & ~1), h = Math.max(16, Math.round(opts.height * scale) & ~1);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.style.cssText = 'position:fixed;left:-20000px;top:0;pointer-events:none';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const chain = { X: new Float32Array(K + 2), Y: new Float32Array(K + 2) };
    const bg = opts.bgColor === 'transparent' ? DEFAULT_BG : opts.bgColor;
    const colors = sceneColors(opts.lineColor, bg);
    const lw = Math.max(1, (Math.min(w, h) * opts.lineWidth) / 1000);
    // scale so the fitted drawing uses the margin the picture export uses
    const fit = fitCurve(curve, w, h, opts.margin);
    const scene = {
      model, curve, K, t: 0, laps: 0, follow: false, focus: { x: 0, y: 0 },
      showCircles: opts.showCircles, showJumps: opts.showJumps, showArrows: true,
      colors, lineWidth: lw, showFinished: false, scaleFrac: fit.S / Math.min(w, h),
    };
    const fps = opts.fps || 30;
    const stream = canvas.captureStream(fps);
    let rec;
    try {
      rec = new MediaRecorder(stream, { mimeType: opts.mime, videoBitsPerSecond: Math.round(w * h * fps * 0.12) });
    } catch (e) {
      canvas.remove();
      reject(Object.assign(new Error('unsupported'), { code: 'unsupported' }));
      return;
    }
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    let cancelled = false, raf = 0;
    const finish = () => {
      cancelAnimationFrame(raf);
      canvas.remove();
      if (cancelled) reject(Object.assign(new Error('cancelled'), { code: 'cancelled' }));
      else resolve(new Blob(chunks, { type: rec.mimeType || opts.mime }));
    };
    rec.onstop = finish;
    rec.onerror = () => { cancelled = true; try { rec.stop(); } catch (e) { finish(); } };
    if (signal) signal.addEventListener('abort', () => { cancelled = true; try { rec.stop(); } catch (e) { finish(); } }, { once: true });

    const total = opts.lapSec;
    drawScene(ctx, w, h, scene, chain);
    rec.start(250);
    const start = performance.now();
    let holding = false;
    const step = (now) => {
      if (cancelled) return;
      const el = (now - start) / 1000;
      if (el < total) {
        scene.t = Math.min(0.99999, el / total);
        drawScene(ctx, w, h, scene, chain);
        onProgress && onProgress(el, total);
        raf = requestAnimationFrame(step);
      } else if (!holding) {
        holding = true;
        scene.t = 0.99999; scene.laps = 1;
        drawScene(ctx, w, h, scene, chain);
        onProgress && onProgress(total, total);
        setTimeout(() => { try { rec.stop(); } catch (e) { finish(); } }, 500);
      }
    };
    raf = requestAnimationFrame(step);
  });
}
