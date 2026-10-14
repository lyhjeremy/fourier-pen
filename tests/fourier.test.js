import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dft, rebuildCurve, cumulativeEnergy, chainAt, arrowsFromSlider } from '../js/fourier.js';

function circlePath(N, r = 0.8) {
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let k = 0; k < N; k++) { const a = (2 * Math.PI * k) / N; re[k] = r * Math.cos(a); im[k] = r * Math.sin(a); }
  return { re, im };
}

test('a circle is one arrow turning once', () => {
  const N = 256, { re, im } = circlePath(N);
  const c = dft(re, im);
  assert.equal(c.length, N);
  assert.equal(c[0].f, 1);
  assert.ok(Math.abs(c[0].amp - 0.8) < 1e-9);
  assert.ok(c[1].amp < 1e-9, 'every other coefficient is zero');
});

test('rebuilding with all N arrows reproduces the path', () => {
  const N = 128, { re, im } = circlePath(N);
  // perturb so it is not a trivial circle
  for (let k = 0; k < N; k++) { re[k] += 0.1 * Math.cos(5 * (2 * Math.PI * k) / N); im[k] -= 0.07 * Math.sin(3 * (2 * Math.PI * k) / N); }
  const c = dft(re, im);
  const { X, Y } = rebuildCurve(c, N, N);
  for (let k = 0; k < N; k++) {
    assert.ok(Math.abs(X[k] - re[k]) < 1e-5 && Math.abs(Y[k] - im[k]) < 1e-5, `point ${k}`);
  }
});

test('cumulative energy is monotonic and the chain tip equals the rebuilt curve', () => {
  const N = 64, { re, im } = circlePath(N);
  for (let k = 0; k < N; k++) re[k] += 0.2 * Math.sin(2 * (2 * Math.PI * k) / N);
  const c = dft(re, im);
  const cumE = cumulativeEnergy(c);
  for (let i = 1; i < cumE.length; i++) assert.ok(cumE[i] >= cumE[i - 1]);
  const K = 5, { X, Y } = rebuildCurve(c, K, N);
  const cx = new Float32Array(K + 1), cy = new Float32Array(K + 1);
  const [tx, ty] = chainAt(c, K, 17 / N, cx, cy);
  assert.ok(Math.abs(tx - X[17]) < 1e-5 && Math.abs(ty - Y[17]) < 1e-5);
});

test('arrows slider maps 0 to 1 and 1 to N on a log scale', () => {
  assert.equal(arrowsFromSlider(0, 2048), 1);
  assert.equal(arrowsFromSlider(1, 2048), 2048);
  assert.equal(arrowsFromSlider(0.5, 4096), 64);
});
