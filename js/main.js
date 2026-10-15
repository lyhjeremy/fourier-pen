// Fourier Pen. Boots the page, runs the pipeline, animates, exports.

import { toGray, canny, trace, keepFromDetail } from './edges.js';
import { buildPath } from './path.js';
import { dft, rebuildCurve, cumulativeEnergy, phaseOf, arrowsFromSlider } from './fourier.js';
import { drawScene, createStage, sceneColors } from './render.js';
import { PRESETS, DEFAULT_LINE, DEFAULT_BG, renderPNG, renderSVG, renderCSV, download, videoMimes, recordVideo, VIDEO_MAX_SIDE } from './exports.js';
import { generateFromPrompt, PROMPT_MESSAGES, PROMPT_MIN, PROMPT_MAX } from './prompt.js';
import { loadSample, SAMPLES, SAMPLE_SETTINGS } from './samples.js';
import { ui, $$, fmt, num, showStatus, hideStatus, setSkeleton, syncLabels, syncMode, initTheme, themeColors } from './ui.js';

const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);

const app = {
  source: null, model: null, curve: null, K: 300,
  t: 0, laps: 0, playing: true, follow: false, lapSec: 18,
  focus: { x: 0, y: 0 },
  colors: null,
};
const stage = createStage(ui.stage);
const chain = { X: new Float32Array(4098), Y: new Float32Array(4098) };

/* ---------- settings ---------- */
function settings() {
  return {
    keep: keepFromDetail(+ui.detail.value),
    sigma: +ui.smooth.value / 10,
    minLen: +ui.minlen.value,
    N: +ui.points.value,
    mode: ui.modeOne.checked ? 'one' : 'hop',
  };
}
function exportOpts() {
  const p = PRESETS.find((x) => x.id === ui.preset.value) || PRESETS[0];
  const custom = p.id === 'custom';
  const clamp = (v) => Math.max(256, Math.min(8192, Math.round(+v) || 2048));
  return {
    width: custom ? clamp(ui.expW.value) : p.w,
    height: custom ? clamp(ui.expH.value) : p.h,
    lineWidth: +ui.lineWidth.value / 10,
    lineColor: ui.lineColor.value,
    bgColor: ui.bgTransparent.checked ? 'transparent' : ui.bgColor.value,
    margin: +ui.margin.value / 100,
    showJumps: !ui.modeOne.checked && ui.expJumps.checked,
    showCircles: ui.vidCircles.checked,
  };
}

/* ---------- previews ---------- */
function fitDraw(canvas, img, w, h) {
  const c = canvas.getContext('2d'), S = canvas.width;
  c.fillStyle = app.colors.paper; c.fillRect(0, 0, S, S);
  const sc = Math.min(S / w, S / h);
  c.drawImage(img, (S - w * sc) / 2, (S - h * sc) / 2, w * sc, h * sc);
}
let lastEdges = null;
function drawEdgePreview(edges, W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), id = x.createImageData(W, H);
  const ink = hexBytes(app.colors.ink), paper = hexBytes(app.colors.paper);
  for (let i = 0; i < W * H; i++) {
    const o = 4 * i, col = edges[i] ? ink : paper;
    id.data[o] = col[0]; id.data[o + 1] = col[1]; id.data[o + 2] = col[2]; id.data[o + 3] = 255;
  }
  x.putImageData(id, 0, 0);
  fitDraw(ui.edgePrev, c, W, H);
}
function hexBytes(hex) { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

/* ---------- pipeline ---------- */
let lastGray = null;
function run() {
  if (!app.source) return;
  const s = settings();
  const t0 = performance.now();
  const { g, W, H, canvas } = toGray(app.source);
  lastGray = { canvas, W, H };
  fitDraw(ui.srcPrev, canvas, W, H);
  const edges = canny(g, W, H, s.sigma, s.keep);
  lastEdges = { edges, W, H };
  drawEdgePreview(edges, W, H);
  const { segs, edgeCount } = trace(edges, W, H, s.minLen);
  ui.stEdges.textContent = fmt(edgeCount);
  const path = segs.length ? buildPath(segs, s.N, s.mode) : null;
  if (!path) {
    app.model = null; app.curve = null;
    showStatus('No outlines found. Raise Detail, lower the stroke cut-off, or try a picture with more contrast.');
    renderNumbers(); syncSave(); updateExportPreview();
    ui.stStrokes.textContent = '0'; ui.stLinks.textContent = '–'; ui.stPoints.textContent = '–';
    ui.stArrows.textContent = '–'; ui.stEnergy.textContent = '–'; ui.stTime.textContent = '–';
    return;
  }
  hideStatus();
  const t1 = performance.now();
  const coeffs = dft(path.re, path.im);
  const t2 = performance.now();
  app.model = { N: s.N, coeffs, cumE: cumulativeEnergy(coeffs), jump: path.jump, strokes: path.strokes };
  ui.stStrokes.textContent = fmt(path.strokes);
  ui.stLinks.textContent = fmt(path.links) + ' · ' + fmt(Math.round(path.linkLen)) + ' px';
  ui.stPoints.textContent = fmt(s.N);
  ui.stTime.textContent = `${Math.round(t2 - t1)} ms DFT · ${Math.round(t2 - t0)} ms total`;
  app.t = 0; app.laps = 0;
  if (reduceMotion && !app.playing) { app.t = 0.9999; app.laps = 1; }
  applyArrows();
}

function applyArrows() {
  if (!app.model) return;
  const v = +ui.arrows.value / 1000;
  app.K = arrowsFromSlider(v, app.model.N);
  $('#arrowsOut').textContent = fmt(app.K);
  ui.stArrows.textContent = fmt(app.K) + ' of ' + fmt(app.model.N);
  const e = (app.model.cumE[app.K] / app.model.cumE[app.model.cumE.length - 1]) * 100;
  ui.stEnergy.textContent = e.toFixed(e > 99.9 ? 2 : 1) + '%';
  app.curve = rebuildCurve(app.model.coeffs, app.K, app.model.N);
  renderNumbers();
  syncSave();
  updateExportPreview();
}
const $ = (s) => document.querySelector(s);

/* ---------- the numbers ---------- */
function termHTML(c) {
  const len = c.amp.toFixed(3), ph = phaseOf(c);
  if (c.f === 0) return `${len}·e<sup>i·${num(ph, 2)}</sup>`;
  const sign = ph < 0 ? '−' : '+';
  return `${len}·e<sup>i(${num(c.f, 0)}·2πt ${sign} ${Math.abs(ph).toFixed(2)})</sup>`;
}
function renderNumbers() {
  if (!app.model) { ui.eq.textContent = 'z(t) ≈ …'; ui.coefBody.innerHTML = ''; return; }
  const K = app.K, show = Math.min(3, K);
  let html = 'z(t) ≈ ' + app.model.coeffs.slice(0, show).map(termHTML).join(' + ');
  if (K > show) html += ` + … (${fmt(K - show)} more)`;
  ui.eq.innerHTML = html;
  const top = app.model.coeffs.slice(0, Math.min(10, K)), maxA = top[0].amp || 1;
  ui.coefBody.innerHTML = top.map((c, i) =>
    `<tr><td>${i + 1}</td><td class="num">${num(c.f, 0)}</td><td class="num"><span class="bar" style="width:${Math.max(2, Math.round((c.amp / maxA) * 36))}px"></span>${c.amp.toFixed(4)}</td><td class="num">${num(phaseOf(c), 3)}</td></tr>`
  ).join('');
}

/* ---------- export ---------- */
function initExport() {
  ui.preset.innerHTML = PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
  ui.preset.value = 'square';
  const mimes = videoMimes();
  const webm = mimes.find((m) => m.ext === 'webm'), mp4 = mimes.find((m) => m.ext === 'mp4');
  app.video = { webm, mp4 };
  if (!webm && !mp4) { ui.webmNote.textContent = 'Not available in this browser'; }
  else if (!webm && mp4) { ui.saveWebm.hidden = true; }
  if (mp4) ui.saveMp4.hidden = false;
}
let prevTimer = 0;
function updateExportPreview() {
  clearTimeout(prevTimer);
  prevTimer = setTimeout(() => {
    const o = exportOpts();
    ui.customRow.hidden = ui.preset.value !== 'custom';
    ui.sizeOut.textContent = `${fmt(o.width)} × ${fmt(o.height)} px`;
    const c = ui.expPrev, maxSide = 240;
    const sc = maxSide / Math.max(o.width, o.height);
    const pw = Math.max(16, Math.round(o.width * sc)), ph = Math.max(16, Math.round(o.height * sc));
    c.width = pw; c.height = ph;
    c.style.width = pw + 'px';
    const x = c.getContext('2d');
    x.clearRect(0, 0, pw, ph);
    if (!app.curve) {
      x.fillStyle = o.bgColor === 'transparent' ? app.colors.paper : o.bgColor; x.fillRect(0, 0, pw, ph);
      ui.expSummary.textContent = 'Preview appears once a picture is loaded.';
      return;
    }
    renderPNG(app.curve, app.model.jump, { ...o, width: pw, height: ph, lineWidth: Math.max(o.lineWidth, 2.5) }, c);
    const vw = Math.round(o.width * Math.min(1, VIDEO_MAX_SIDE / Math.max(o.width, o.height)));
    const vh = Math.round(o.height * Math.min(1, VIDEO_MAX_SIDE / Math.max(o.width, o.height)));
    ui.expSummary.textContent = `${fmt(o.width)} × ${fmt(o.height)} px, line ${((Math.min(o.width, o.height) * o.lineWidth) / 1000).toFixed(1)} px, ${o.bgColor === 'transparent' ? 'transparent' : o.bgColor} on ${o.lineColor}. Video ${fmt(vw)} × ${fmt(vh)}.`;
  }, 60);
}
function syncSave() {
  const ok = !!(app.model && app.curve) && !app.recording;
  [ui.savePng, ui.saveSvg, ui.saveCsv].forEach((b) => (b.disabled = !ok));
  ui.saveWebm.disabled = !ok || !app.video.webm;
  ui.saveMp4.disabled = !ok || !app.video.mp4;
  if (ok) ui.saveMsg.textContent = 'Saves the drawing as it looks with the current number of arrows.';
  else if (!app.model) ui.saveMsg.textContent = 'Load a picture with visible outlines to save it.';
}
const baseName = () => { const o = exportOpts(); return `fourier-pen-${app.K}-arrows-${o.width}x${o.height}`; };
ui.savePng.addEventListener('click', () => {
  if (!app.curve) return;
  ui.saveMsg.textContent = 'Rendering PNG…';
  setTimeout(() => {
    const o = exportOpts();
    renderPNG(app.curve, app.model.jump, o).toBlob((b) => {
      if (!b) { ui.saveMsg.textContent = 'The PNG could not be rendered at that size. Try a smaller one.'; return; }
      download(baseName() + '.png', b);
      ui.saveMsg.textContent = `Saved ${baseName()}.png`;
    }, 'image/png');
  }, 10);
});
ui.saveSvg.addEventListener('click', () => {
  if (!app.curve) return;
  download(baseName() + '.svg', renderSVG(app.curve, app.model.jump, exportOpts()), 'image/svg+xml');
  ui.saveMsg.textContent = `Saved ${baseName()}.svg`;
});
ui.saveCsv.addEventListener('click', () => {
  if (!app.model) return;
  download('fourier-pen-arrows.csv', renderCSV(app.model.coeffs, app.K), 'text/csv');
  ui.saveMsg.textContent = 'Saved fourier-pen-arrows.csv';
});
let videoAbort = null;
async function saveVideo(kind) {
  const m = app.video[kind];
  if (!m || !app.curve || app.recording) return;
  app.recording = true; syncSave();
  videoAbort = new AbortController();
  ui.progress.hidden = false; ui.progress.firstElementChild.style.width = '0%';
  const o = { ...exportOpts(), lapSec: app.lapSec, fps: 30, mime: m.mime };
  ui.restart.textContent = 'Cancel video';
  ui.saveMsg.textContent = `Recording ${app.lapSec} s of video in real time…`;
  try {
    const blob = await recordVideo(app.model, app.curve, app.K, o, (el, total) => {
      ui.progress.firstElementChild.style.width = `${(100 * el) / total}%`;
      ui.saveMsg.textContent = `Recording ${Math.ceil(el)} of ${total} s…`;
    }, videoAbort.signal);
    download(`fourier-pen-${app.K}-arrows.${m.ext}`, blob);
    ui.saveMsg.textContent = `Saved fourier-pen-${app.K}-arrows.${m.ext} (${(blob.size / 1e6).toFixed(1)} MB).`;
  } catch (e) {
    ui.saveMsg.textContent = e && e.code === 'cancelled' ? 'Video cancelled.' : 'This browser could not record the video.';
  } finally {
    app.recording = false; videoAbort = null;
    ui.progress.hidden = true; ui.restart.textContent = 'Restart';
    syncSave();
  }
}
ui.saveWebm.addEventListener('click', () => saveVideo('webm'));
ui.saveMp4.addEventListener('click', () => saveVideo('mp4'));
ui.swapColors.addEventListener('click', () => {
  const a = ui.lineColor.value; ui.lineColor.value = ui.bgColor.value; ui.bgColor.value = a; updateExportPreview();
});
[ui.preset, ui.expW, ui.expH, ui.lineWidth, ui.lineColor, ui.bgColor, ui.bgTransparent, ui.expJumps, ui.margin, ui.vidCircles]
  .forEach((el) => el.addEventListener('input', () => { syncLabels(); updateExportPreview(); }));

/* ---------- prompt ---------- */
const PROMPT_HINT = 'An image model draws a line-art version, then the page traces it. Takes a few seconds.';
let promptNote = ''; // a result or error message that outlives the next syncPrompt
function syncPrompt() {
  const n = ui.prompt.value.trim().length;
  const ok = n >= PROMPT_MIN && n <= PROMPT_MAX && !app.prompting;
  ui.promptGo.disabled = !ok;
  if (app.prompting) return;
  if (n > 0 && n < PROMPT_MIN) ui.promptHint.textContent = `At least ${PROMPT_MIN} characters.`;
  else ui.promptHint.textContent = promptNote || PROMPT_HINT;
}
async function runPrompt() {
  const text = ui.prompt.value.trim();
  if (text.length < PROMPT_MIN || text.length > PROMPT_MAX || app.prompting) return;
  app.prompting = true; syncPrompt();
  ui.promptHint.textContent = 'Drawing your prompt…';
  setSkeleton(true);
  showStatus('Drawing your prompt…');
  try {
    const img = await generateFromPrompt(text);
    $$('.chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    app.source = img;
    setSkeleton(false);
    hideStatus();
    run();
    promptNote = `Drawn from "${text}".`;
  } catch (e) {
    setSkeleton(false);
    hideStatus();
    const msg = PROMPT_MESSAGES[e && e.code] || PROMPT_MESSAGES.unavailable;
    promptNote = msg;
    showStatus(msg);
    setTimeout(() => { if (ui.statusText.textContent === msg && app.model) hideStatus(); }, 6000);
  } finally {
    app.prompting = false; syncPrompt();
  }
}
ui.prompt.addEventListener('input', () => { promptNote = ''; syncPrompt(); });
ui.prompt.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runPrompt(); } });
ui.promptGo.addEventListener('click', runPrompt);

/* ---------- animation ---------- */
function refreshColors() {
  app.colors = themeColors();
  app.sceneColors = sceneColors(app.colors.ink, app.colors.panel);
  app.sceneColors.tip = app.colors.signal;
  app.sceneColors.circle = app.colors.ink2;
  app.sceneColors.arrow = app.colors.ink2;
  if (lastGray) fitDraw(ui.srcPrev, lastGray.canvas, lastGray.W, lastGray.H);
  if (lastEdges) drawEdgePreview(lastEdges.edges, lastEdges.W, lastEdges.H);
}
document.addEventListener('themechange', refreshColors);
if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshColors);

let lastRead = '';
function updateReadout() {
  const txt = app.model
    ? `t = ${app.t.toFixed(3)} · <b>${fmt(app.K)}</b> arrows · drawing ${app.laps > 0 ? 'repeats' : Math.round(app.t * 100) + '% done'}`
    : '';
  if (txt !== lastRead) { ui.readout.innerHTML = txt; lastRead = txt; }
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (app.playing && app.model) { app.t += dt / app.lapSec; if (app.t >= 1) { app.t -= 1; app.laps++; } }
  stage.begin();
  drawScene(stage.ctx, stage.w, stage.h, {
    model: app.model, curve: app.curve, K: app.K, t: app.t, laps: app.laps,
    follow: app.follow, focus: app.focus, showCircles: ui.circles.checked, showJumps: !ui.modeOne.checked && ui.jumps.checked,
    colors: app.sceneColors, lineWidth: 1.8, showFinished: true,
  }, chain);
  updateReadout();
  requestAnimationFrame(frame);
}

function setPlaying(p) { app.playing = p; ui.play.textContent = p ? 'Pause' : 'Play'; ui.play.setAttribute('aria-pressed', String(!p)); }
ui.play.addEventListener('click', () => setPlaying(!app.playing));
ui.restart.addEventListener('click', () => {
  if (app.recording && videoAbort) { videoAbort.abort(); return; }
  app.t = 0; app.laps = 0; setPlaying(true);
});
ui.follow.addEventListener('click', () => { app.follow = !app.follow; ui.follow.setAttribute('aria-pressed', String(app.follow)); });

/* ---------- sources ---------- */
let sampleSeq = 0;
function useSample(kind) {
  $$('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sample === kind)));
  const seq = ++sampleSeq;
  const preset = SAMPLE_SETTINGS[kind];
  if (preset) { for (const k of Object.keys(preset)) ui[k].value = preset[k]; syncLabels(); }
  return loadSample(kind).then((src) => {
    if (seq !== sampleSeq) return;
    app.source = src;
    run();
  }, () => showStatus('This example could not be loaded.'));
}
function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    showStatus('That file is not an image. Choose a JPG, PNG, WebP or GIF.'); return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    $$('.chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    app.source = img; run(); URL.revokeObjectURL(url);
  };
  img.onerror = () => { showStatus('This image could not be opened. Try another file.'); URL.revokeObjectURL(url); };
  img.src = url;
}
ui.file.addEventListener('change', (e) => loadFile(e.target.files[0]));
['dragenter', 'dragover'].forEach((ev) => ui.drop.addEventListener(ev, (e) => { e.preventDefault(); ui.drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => ui.drop.addEventListener(ev, (e) => { e.preventDefault(); ui.drop.classList.remove('over'); }));
ui.drop.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));
window.addEventListener('paste', (e) => {
  if (e.target === ui.prompt) return;
  const item = [...(e.clipboardData && e.clipboardData.items || [])].find((i) => i.type.startsWith('image/'));
  if (item) loadFile(item.getAsFile());
});
$$('.chip').forEach((b) => b.addEventListener('click', () => useSample(b.dataset.sample)));

/* ---------- controls ---------- */
let timer = 0;
const runSoon = () => { clearTimeout(timer); timer = setTimeout(run, 140); };
['detail', 'smooth', 'minlen'].forEach((k) => ui[k].addEventListener('input', () => { syncLabels(); runSoon(); }));
ui.points.addEventListener('change', run);
[ui.modeOne, ui.modeHop].forEach((r) => r.addEventListener('change', () => { syncMode(); run(); }));
let arrowTimer = 0;
ui.arrows.addEventListener('input', () => {
  if (!app.model) return;
  $('#arrowsOut').textContent = fmt(arrowsFromSlider(+ui.arrows.value / 1000, app.model.N));
  clearTimeout(arrowTimer); arrowTimer = setTimeout(applyArrows, 40);
});
ui.speed.addEventListener('input', () => { app.lapSec = +ui.speed.value; syncLabels(); });

/* ---------- panel tabs ---------- */
const TAB_KEY = 'fourier-pen-tab';
const tabs = $$('.tab');
function showTab(id, focus) {
  for (const t of tabs) {
    const on = t.id === id;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    if (on && focus) t.focus();
  }
  try { localStorage.setItem(TAB_KEY, id); } catch (e) {}
  if (id === 'tab-export') updateExportPreview();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => showTab(t.id));
  t.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'Home' ? -i : e.key === 'End' ? tabs.length - 1 - i : 0;
    if (d) { e.preventDefault(); showTab(tabs[(i + d + tabs.length) % tabs.length].id, true); }
  });
});
let savedTab = null;
try { savedTab = localStorage.getItem(TAB_KEY); } catch (e) {}
showTab(tabs.some((t) => t.id === savedTab) ? savedTab : 'tab-source');

/* ---------- start ---------- */
initTheme();
refreshColors();
initExport();
syncLabels();
syncMode();
syncPrompt();
syncSave();
updateExportPreview();
if (reduceMotion) setPlaying(false);
requestAnimationFrame(frame);

// Query parameters, used for screenshots and tests: ?sample=heart&t=0.6&pause=1
const start = () => {
  const sample = params.get('sample');
  if (params.get('pause') === '1') setPlaying(false);
  if (params.get('follow') === '1') { app.follow = true; ui.follow.setAttribute('aria-pressed', 'true'); }
  useSample(SAMPLES.includes(sample) ? sample : 'word').then(() => {
    if (params.has('t')) { app.t = Math.min(0.9999, Math.max(0, +params.get('t') || 0)); }
    if (params.has('laps')) app.laps = +params.get('laps') || 0;
  });
};
(document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(start, start);

// Debug hook for screenshots and tests. Not part of the UI.
window.fourierPen = { app, setTime(t, laps) { app.t = Math.min(0.9999, Math.max(0, t)); if (laps != null) app.laps = laps; }, setPlaying };
