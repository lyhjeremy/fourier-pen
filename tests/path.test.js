import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bridgeStrokes, continuousTour, buildPath, orderSegs } from '../js/path.js';

function circle(cx, cy, r, n = 80) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}
function line(x0, y0, x1, y1, n = 40) {
  const out = [];
  for (let i = 0; i < n; i++) { const u = i / (n - 1); out.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * u]); }
  return out;
}
const scene = () => [circle(60, 60, 30), circle(200, 60, 30), circle(130, 200, 30), line(100, 130, 160, 130)];

// The prototype's recursive tour, kept here as the parity oracle for the iterative port.
function recursiveTour(segs, edges) {
  const n = segs.length, adj = Array.from({ length: n }, () => []);
  for (const e of edges) { adj[e.a].push({ i: e.ia, to: e.b, j: e.ib }); adj[e.b].push({ i: e.ib, to: e.a, j: e.ia }); }
  const seen = new Uint8Array(n), px = [], py = [];
  const put = (p) => { px.push(p[0]); py.push(p[1]); };
  const visit = (s, e) => {
    seen[s] = 1;
    const att = new Map();
    for (const c of adj[s]) if (!seen[c.to]) { let l = att.get(c.i); if (!l) att.set(c.i, (l = [])); l.push(c); }
    const seg = segs[s], L = seg.length, order = [];
    for (let i = e; i < L; i++) order.push(i);
    for (let i = L - 2; i >= 0; i--) order.push(i);
    for (let i = 1; i <= e; i++) order.push(i);
    for (const i of order) {
      put(seg[i]);
      const cs = att.get(i);
      if (cs) { att.delete(i); for (const c of cs) if (!seen[c.to]) { visit(c.to, c.j); put(seg[i]); } }
    }
  };
  visit(0, 0);
  return { px, py };
}

test('bridges connect every stroke with strokes minus one edges', () => {
  const segs = scene();
  const edges = bridgeStrokes(segs);
  assert.equal(edges.length, segs.length - 1);
});

test('continuous tour matches the recursive reference exactly', () => {
  const segs = scene();
  const edges = bridgeStrokes(segs);
  const a = continuousTour(segs, edges), b = recursiveTour(segs, edges);
  assert.deepEqual(a.px, b.px);
  assert.deepEqual(a.py, b.py);
});

test('continuous tour matches the reference on 300 random strokes', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const segs = [];
  for (let s = 0; s < 300; s++) {
    const x0 = rnd() * 360, y0 = rnd() * 360, len = 3 + Math.floor(rnd() * 30), ang = rnd() * 6.28;
    const seg = [];
    for (let i = 0; i < len; i++) seg.push([x0 + Math.cos(ang) * i, y0 + Math.sin(ang) * i]);
    segs.push(seg);
  }
  const edges = bridgeStrokes(segs);
  assert.equal(edges.length, segs.length - 1);
  const a = continuousTour(segs, edges), b = recursiveTour(segs, edges);
  assert.deepEqual(a.px, b.px);
  assert.deepEqual(a.py, b.py);
});

test('continuous mode draws every stroke twice and has no jumps', () => {
  const segs = scene();
  const path = buildPath(segs, 1024, 'one');
  assert.ok(path);
  assert.equal(path.links, 3);
  assert.equal(path.jump.reduce((s, v) => s + v, 0), 0);
  // every stroke is walked out and back, so the tour visits about 2x the points
  const edges = bridgeStrokes(segs);
  const { px } = continuousTour(segs, edges);
  const total = segs.reduce((s, g) => s + g.length, 0);
  assert.ok(px.length >= 2 * total - segs.length && px.length <= 2 * total + 2 * edges.length);
});

test('hop mode threads strokes with jumps between them', () => {
  const segs = scene();
  const path = buildPath(segs, 1024, 'hop');
  assert.ok(path);
  assert.equal(path.links, 4);
  assert.ok(path.jump.reduce((s, v) => s + v, 0) > 0);
  assert.equal(orderSegs(segs).length, 4);
});

test('buildPath normalises the longer side to span -1 to 1', () => {
  const path = buildPath(scene(), 2048, 'one');
  const maxAbs = Math.max(...path.re.map(Math.abs), ...path.im.map(Math.abs));
  assert.ok(Math.abs(maxAbs - 1) < 1e-9, `max abs ${maxAbs}`);
  assert.equal(path.re.length, 2048);
});

test('buildPath returns null when there is nothing to draw', () => {
  assert.equal(buildPath([[[1, 1]]], 64, 'one'), null);
});
