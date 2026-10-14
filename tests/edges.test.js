import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grayFromRGBA, canny, trace, keepFromDetail } from '../js/edges.js';

function squareImage(W, H, x0, y0, side) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0;
    const inside = x >= x0 && x < x0 + side && y >= y0 && y < y0 + side;
    const v = inside ? 0 : 255;
    data[4 * i] = v; data[4 * i + 1] = v; data[4 * i + 2] = v; data[4 * i + 3] = 255;
  }
  return data;
}

test('grayFromRGBA stretches contrast to the full range', () => {
  const W = 40, H = 40;
  const g = grayFromRGBA(squareImage(W, H, 10, 10, 20), W, H);
  assert.equal(g.length, W * H);
  assert.equal(Math.min(...g), 0);
  assert.equal(Math.max(...g), 1);
});

test('a black square on white gives one closed stroke of about 4 sides', () => {
  const W = 120, H = 120, side = 60;
  const g = grayFromRGBA(squareImage(W, H, 30, 30, side), W, H);
  const edges = canny(g, W, H, 1.4, keepFromDetail(35));
  const { segs, edgeCount } = trace(edges, W, H, 10);
  assert.ok(edgeCount > 0, 'found edge pixels');
  assert.equal(segs.length, 1, 'one stroke');
  const len = segs[0].length;
  // The traced contour sits just outside or on the square's border.
  assert.ok(len > 4 * side * 0.85 && len < 4 * side * 1.3, `stroke length ${len}`);
  const [ax, ay] = segs[0][0], [bx, by] = segs[0][segs[0].length - 1];
  assert.ok(Math.hypot(ax - bx, ay - by) < 4, 'stroke closes on itself');
});

test('keepFromDetail is monotonic and within the Canny range', () => {
  let prev = 0;
  for (let d = 1; d <= 100; d++) {
    const k = keepFromDetail(d);
    assert.ok(k > prev && k > 0 && k < 0.6);
    prev = k;
  }
});
