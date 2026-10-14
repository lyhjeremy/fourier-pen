// Strokes to one closed path: ordering, bridging, retracing, resampling.
// Pure functions over arrays of [x, y] points.

export const JUMP_WEIGHT = 0.25; // pen jumps get fewer sample points than real strokes

// Hop mode: greedy nearest-neighbour tour over stroke endpoints.
export function orderSegs(segs) {
  const rem = segs.slice();
  const out = [rem.shift()];
  let [cx, cy] = out[0][out[0].length - 1];
  while (rem.length) {
    let best = 0, bd = Infinity, rev = false;
    for (let i = 0; i < rem.length; i++) {
      const s = rem[i], a = s[0], b = s[s.length - 1];
      const d1 = (a[0] - cx) ** 2 + (a[1] - cy) ** 2;
      if (d1 < bd) { bd = d1; best = i; rev = false; }
      const d2 = (b[0] - cx) ** 2 + (b[1] - cy) ** 2;
      if (d2 < bd) { bd = d2; best = i; rev = true; }
    }
    const s = rem[best]; rem[best] = rem[rem.length - 1]; rem.pop();
    const seg = rev ? s.slice().reverse() : s;
    out.push(seg);
    [cx, cy] = seg[seg.length - 1];
  }
  return out;
}

// Kruskal over nearby point pairs, widening the search radius until every stroke is connected.
// Returns bridges { d (squared length), a, ia, b, ib }.
export function bridgeStrokes(segs) {
  const n = segs.length, par = Int32Array.from({ length: n }, (_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const edges = []; let comps = n, R = 8;
  while (comps > 1 && R < 8192) {
    const step = Math.max(2, Math.round(R / 6));
    const grid = new Map(), key = (cx, cy) => cx * 100003 + cy;
    const pts = [];
    segs.forEach((s, si) => {
      for (let i = 0; i < s.length; i += step) pts.push([si, i]);
      if ((s.length - 1) % step) pts.push([si, s.length - 1]);
    });
    for (const p of pts) {
      const q = segs[p[0]][p[1]], k = key(Math.floor(q[0] / R), Math.floor(q[1] / R));
      let cell = grid.get(k); if (!cell) grid.set(k, (cell = [])); cell.push(p);
    }
    const best = new Map();
    for (const [sa, ia] of pts) {
      const ra = find(sa), q = segs[sa][ia], gx = Math.floor(q[0] / R), gy = Math.floor(q[1] / R);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const cell = grid.get(key(gx + dx, gy + dy)); if (!cell) continue;
        for (const [sb, ib] of cell) {
          const rb = find(sb); if (rb === ra) continue;
          const o = segs[sb][ib], d = (o[0] - q[0]) ** 2 + (o[1] - q[1]) ** 2;
          if (d > R * R) continue;
          const pk = ra < rb ? ra * n + rb : rb * n + ra, cur = best.get(pk);
          if (!cur || d < cur.d) best.set(pk, { d, a: sa, ia, b: sb, ib });
        }
      }
    }
    const cands = [...best.values()].sort((x, y) => x.d - y.d);
    for (const c of cands) {
      const ra = find(c.a), rb = find(c.b);
      if (ra === rb) continue;
      par[ra] = rb; comps--; edges.push(c);
    }
    R *= 2;
  }
  return edges;
}

// Walk the tree of strokes so every stroke is drawn out and back (an Euler circuit of
// the doubled tree). Bridges are crossed once each way; everything else is retraced.
export function continuousTour(segs, edges) {
  const n = segs.length, adj = Array.from({ length: n }, () => []);
  for (const e of edges) {
    adj[e.a].push({ i: e.ia, to: e.b, j: e.ib });
    adj[e.b].push({ i: e.ib, to: e.a, j: e.ia });
  }
  const seen = new Uint8Array(n), px = [], py = [];
  const put = (p) => { px.push(p[0]); py.push(p[1]); };
  // Explicit stack instead of recursion: a photo can thread thousands of strokes.
  const visit = (s0, e0) => {
    const stack = [{ s: s0, order: null, k: 0, att: null, pending: null }];
    const begin = (fr, e) => {
      seen[fr.s] = 1;
      fr.att = new Map();
      for (const c of adj[fr.s]) if (!seen[c.to]) { let l = fr.att.get(c.i); if (!l) fr.att.set(c.i, (l = [])); l.push(c); }
      const L = segs[fr.s].length, order = [];
      for (let i = e; i < L; i++) order.push(i);
      for (let i = L - 2; i >= 0; i--) order.push(i);
      for (let i = 1; i <= e; i++) order.push(i);
      fr.order = order; fr.k = 0; fr.pending = null;
    };
    begin(stack[0], e0);
    while (stack.length) {
      const fr = stack[stack.length - 1], seg = segs[fr.s];
      if (fr.pending && fr.pending.length) {
        const c = fr.pending.shift();
        if (!seen[c.to]) {
          const child = { s: c.to };
          begin(child, c.j);
          stack.push(child);
          fr.returnPoint = seg[fr.order[fr.k - 1]];
          continue;
        }
        continue;
      }
      if (fr.pending) { fr.pending = null; }
      if (fr.k >= fr.order.length) {
        stack.pop();
        const parent = stack[stack.length - 1];
        if (parent) put(parent.returnPoint);
        continue;
      }
      const i = fr.order[fr.k++];
      put(seg[i]);
      const cs = fr.att.get(i);
      if (cs) { fr.att.delete(i); fr.pending = cs; }
    }
  };
  visit(0, 0);
  return { px, py };
}

// One closed path, resampled to N points by weighted arc length, centred and scaled
// so the longer side spans -1 to 1. Returns null if there is nothing to draw.
export function buildPath(segs, N, mode) {
  let px = [], py = [], startOf = [], links = 0, linkLen = 0;
  const strokes = segs.length;
  if (mode === 'one') {
    const edges = bridgeStrokes(segs);
    links = edges.length; linkLen = edges.reduce((s, e) => s + Math.sqrt(e.d), 0);
    ({ px, py } = continuousTour(segs, edges));
    startOf = new Array(px.length).fill(false);
  } else {
    const ordered = orderSegs(segs);
    for (const s of ordered) s.forEach((p, idx) => { startOf.push(idx === 0 && px.length > 0); px.push(p[0]); py.push(p[1]); });
    for (let k = 1; k <= px.length; k++) {
      if (k === px.length || startOf[k]) {
        const a = k - 1, b = k % px.length, d = Math.hypot(px[b] - px[a], py[b] - py[a]);
        if (d > 1.5) { links++; linkLen += d; }
      }
    }
  }
  const P = px.length;
  if (P < 2) return null;
  const cum = new Float64Array(P + 1), isJump = new Uint8Array(P + 1);
  for (let k = 1; k <= P; k++) {
    const a = k - 1, b = k % P;
    const d = Math.hypot(px[b] - px[a], py[b] - py[a]);
    const jump = (k === P || startOf[k]) && d > 1.5;
    isJump[k] = jump ? 1 : 0;
    cum[k] = cum[k - 1] + (jump ? d * JUMP_WEIGHT : d);
  }
  const L = cum[P];
  const re = new Float64Array(N), im = new Float64Array(N), jump = new Uint8Array(N);
  let k = 1;
  for (let j = 0; j < N; j++) {
    const s = (j * L) / N;
    while (k < P && cum[k] < s) k++;
    const span = cum[k] - cum[k - 1], u = span > 0 ? (s - cum[k - 1]) / span : 0;
    const a = k - 1, b = k % P;
    re[j] = px[a] + (px[b] - px[a]) * u;
    im[j] = py[a] + (py[b] - py[a]) * u;
    jump[j] = isJump[k];
  }
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (let j = 0; j < N; j++) {
    minx = Math.min(minx, re[j]); maxx = Math.max(maxx, re[j]);
    miny = Math.min(miny, im[j]); maxy = Math.max(maxy, im[j]);
  }
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, half = Math.max(maxx - minx, maxy - miny) / 2 || 1;
  for (let j = 0; j < N; j++) { re[j] = (re[j] - cx) / half; im[j] = (im[j] - cy) / half; }
  return { re, im, jump, strokes, links, linkLen };
}
