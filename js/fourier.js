// The maths: discrete Fourier transform of the path, and rebuilding it from K arrows.

// Direct O(N^2) DFT with a cos/sin table. Returns coefficients sorted largest first,
// each { f (turns per drawing), A (re), B (im), amp }.
export function dft(re, im) {
  const N = re.length, cosT = new Float64Array(N), sinT = new Float64Array(N);
  for (let k = 0; k < N; k++) { cosT[k] = Math.cos((2 * Math.PI * k) / N); sinT[k] = Math.sin((2 * Math.PI * k) / N); }
  const out = [];
  for (let f = -N / 2; f < N / 2; f++) {
    const step = ((f % N) + N) % N;
    let sr = 0, si = 0, idx = 0;
    for (let k = 0; k < N; k++) {
      const c = cosT[idx], s = sinT[idx];
      sr += re[k] * c + im[k] * s; // z times e^(-i theta)
      si += im[k] * c - re[k] * s;
      idx += step; if (idx >= N) idx -= N;
    }
    sr /= N; si /= N;
    out.push({ f, A: sr, B: si, amp: Math.hypot(sr, si) });
  }
  out.sort((a, b) => b.amp - a.amp);
  return out;
}

// Reconstructed curve from the first K coefficients, sampled at N points.
export function rebuildCurve(coeffs, K, N) {
  const X = new Float32Array(N), Y = new Float32Array(N);
  const cosT = new Float64Array(N), sinT = new Float64Array(N);
  for (let j = 0; j < N; j++) { cosT[j] = Math.cos((2 * Math.PI * j) / N); sinT[j] = Math.sin((2 * Math.PI * j) / N); }
  for (let n = 0; n < K; n++) {
    const c = coeffs[n], step = ((c.f % N) + N) % N;
    let idx = 0;
    for (let j = 0; j < N; j++) {
      const co = cosT[idx], si = sinT[idx];
      X[j] += c.A * co - c.B * si;
      Y[j] += c.A * si + c.B * co;
      idx += step; if (idx >= N) idx -= N;
    }
  }
  return { X, Y };
}

// cumE[k] = sum of |c|^2 over the first k coefficients.
export function cumulativeEnergy(coeffs) {
  const cumE = new Float64Array(coeffs.length + 1);
  for (let i = 0; i < coeffs.length; i++) cumE[i + 1] = cumE[i] + coeffs[i].amp ** 2;
  return cumE;
}

// Positions of the arrow chain at time t in [0, 1). outX[0], outY[0] is the origin;
// outX[n + 1] is the tip of arrow n. Returns the pen tip as [x, y].
export function chainAt(coeffs, K, t, outX, outY) {
  let x = 0, y = 0; outX[0] = 0; outY[0] = 0;
  const ang = 2 * Math.PI * t;
  for (let n = 0; n < K; n++) {
    const c = coeffs[n], th = ang * c.f, co = Math.cos(th), si = Math.sin(th);
    x += c.A * co - c.B * si; y += c.A * si + c.B * co;
    outX[n + 1] = x; outY[n + 1] = y;
  }
  return [x, y];
}

export function phaseOf(c) { return Math.atan2(c.B, c.A); }

// Arrows slider value v in [0, 1] maps to K on a log scale from 1 to N.
export function arrowsFromSlider(v, N) {
  return Math.max(1, Math.min(N, Math.round(Math.pow(N, v))));
}
