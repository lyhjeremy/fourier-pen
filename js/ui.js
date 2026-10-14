// DOM lookups, labels, status messages, theme. No maths here.

export const $ = (s) => document.querySelector(s);
export const $$ = (s) => Array.from(document.querySelectorAll(s));
export const fmt = (n) => n.toLocaleString('en-US');
export const MINUS = '−';
export const num = (v, d) => (v < 0 ? MINUS : '') + Math.abs(v).toFixed(d);

export const ui = {
  file: $('#file'), drop: $('#drop'), prompt: $('#prompt'), promptGo: $('#promptGo'), promptHint: $('#promptHint'),
  srcPrev: $('#srcPrev'), edgePrev: $('#edgePrev'), srcSkel: $('#srcSkel'), edgeSkel: $('#edgeSkel'),
  modeOne: $('#modeOne'), modeHop: $('#modeHop'), modeHint: $('#modeHint'),
  detail: $('#detail'), smooth: $('#smooth'), minlen: $('#minlen'), points: $('#points'),
  arrows: $('#arrows'), speed: $('#speed'), circles: $('#circles'), jumps: $('#jumps'), jumpsRow: $('#jumpsRow'),
  eq: $('#eq'), coefBody: $('#coefBody'),
  stEdges: $('#stEdges'), stStrokes: $('#stStrokes'), stLinkLabel: $('#stLinkLabel'), stLinks: $('#stLinks'),
  stPoints: $('#stPoints'), stArrows: $('#stArrows'), stEnergy: $('#stEnergy'), stTime: $('#stTime'),
  preset: $('#preset'), sizeOut: $('#sizeOut'), customRow: $('#customRow'), expW: $('#expW'), expH: $('#expH'),
  lineWidth: $('#lineWidth'), lineWidthOut: $('#lineWidthOut'), lineColor: $('#lineColor'), bgColor: $('#bgColor'),
  bgTransparent: $('#bgTransparent'), expJumps: $('#expJumps'), expJumpsRow: $('#expJumpsRow'), vidCircles: $('#vidCircles'),
  swapColors: $('#swapColors'), margin: $('#margin'), marginOut: $('#marginOut'),
  expPrev: $('#expPrev'), expSummary: $('#expSummary'),
  savePng: $('#savePng'), saveSvg: $('#saveSvg'), saveCsv: $('#saveCsv'), saveWebm: $('#saveWebm'), saveMp4: $('#saveMp4'),
  webmNote: $('#webmNote'), saveMsg: $('#saveMsg'),
  stage: $('#stage'), status: $('#status'), statusText: $('#statusText'), play: $('#play'), restart: $('#restart'),
  follow: $('#follow'), readout: $('#readout'), progress: $('#progress'), theme: $('#theme'),
};

export function showStatus(text) { ui.statusText.textContent = text; ui.status.hidden = false; }
export function hideStatus() { ui.status.hidden = true; }

export function setSkeleton(on) { ui.srcSkel.hidden = !on; ui.edgeSkel.hidden = !on; }

export function syncLabels() {
  $('#detailOut').textContent = ui.detail.value;
  $('#smoothOut').textContent = (+ui.smooth.value / 10).toFixed(1) + ' px';
  $('#minlenOut').textContent = ui.minlen.value + ' px';
  $('#speedOut').textContent = ui.speed.value + ' s';
  ui.lineWidthOut.textContent = (+ui.lineWidth.value / 10).toFixed(1);
  ui.marginOut.textContent = ui.margin.value + '%';
}

export function syncMode() {
  const one = ui.modeOne.checked;
  ui.jumpsRow.hidden = one;
  ui.expJumpsRow.hidden = one;
  ui.stLinkLabel.textContent = one ? 'Bridges added' : 'Pen jumps';
  ui.modeHint.textContent = one
    ? 'Strokes are joined by the shortest bridges, and the pen backtracks over its own ink instead of jumping.'
    : 'The pen finishes a stroke, then cuts straight across to the nearest unfinished one.';
}

// Theme: system, light, dark. Stored per browser; everything else follows the OS.
const THEME_KEY = 'fourier-pen-theme';
export function initTheme() {
  const root = document.documentElement;
  const read = () => root.getAttribute('data-theme') || 'system';
  const render = () => {
    const v = read();
    ui.theme.textContent = 'Theme: ' + v;
    ui.theme.setAttribute('aria-pressed', String(v !== 'system'));
  };
  ui.theme.addEventListener('click', () => {
    const next = { system: 'light', light: 'dark', dark: 'system' }[read()];
    if (next === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', next);
    try { if (next === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, next); } catch (e) {}
    render();
    document.dispatchEvent(new CustomEvent('themechange'));
  });
  render();
}

// Resolve the current CSS tokens to hex strings for the canvas.
export function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const get = (n) => cs.getPropertyValue(n).trim();
  return { paper: get('--paper'), panel: get('--panel'), ink: get('--ink'), ink2: get('--ink-2'), rule: get('--rule'), edge: get('--edge'), signal: get('--signal'), signal2: get('--signal-2') };
}
