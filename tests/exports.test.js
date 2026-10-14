import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitCurve, renderSVG, renderCSV, PRESETS } from '../js/exports.js';
import { dft } from '../js/fourier.js';

const curve = { X: new Float32Array([-0.5, 0.5, 0.5, -0.5]), Y: new Float32Array([-0.25, -0.25, 0.25, 0.25]) };
const jump = new Uint8Array(4);

test('fitCurve fits the bounding box inside the margin and centres it', () => {
  const { S, ox, oy } = fitCurve(curve, 1000, 500, 0.1);
  assert.ok(Math.abs(S - 800) < 1e-9, `scale ${S}`);
  assert.ok(Math.abs(ox - 500) < 1e-9 && Math.abs(oy - 250) < 1e-9);
});

test('SVG has one path without jumps, two with, and no background when transparent', () => {
  const base = { width: 1000, height: 500, lineWidth: 1.5, lineColor: '#1C1E1B', bgColor: '#EDEDE7', margin: 0.08, showJumps: false };
  const a = renderSVG(curve, jump, base);
  assert.equal((a.match(/<path /g) || []).length, 1);
  assert.ok(a.includes('<rect'));
  assert.ok(a.includes('viewBox="0 0 1000 500"'));
  const j = new Uint8Array([0, 0, 1, 0]);
  const b = renderSVG(curve, j, { ...base, showJumps: true, bgColor: 'transparent' });
  assert.equal((b.match(/<path /g) || []).length, 2);
  assert.ok(!b.includes('<rect'));
});

test('CSV has a header plus one row per coefficient and marks the used ones', () => {
  const N = 32, re = new Float64Array(N), im = new Float64Array(N);
  for (let k = 0; k < N; k++) { re[k] = Math.cos((2 * Math.PI * k) / N); im[k] = Math.sin((2 * Math.PI * k) / N); }
  const csv = renderCSV(dft(re, im), 5);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, N + 1);
  assert.equal(lines[0], 'rank,turns_n,re,im,length,start_angle_rad,used');
  assert.equal(lines.slice(1).filter((l) => l.endsWith(',1')).length, 5);
});

test('presets are all even-sized and within the custom range', () => {
  for (const p of PRESETS) assert.ok(p.w >= 256 && p.w <= 8192 && p.h >= 256 && p.h <= 8192, p.id);
});
