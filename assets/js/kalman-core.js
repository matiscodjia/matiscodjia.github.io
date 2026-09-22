// sentinel-core's 9-state constant-acceleration Kalman filter (KalmanFilterFrugal)
// and sentinel-sim's trajectory scenarios, ported to JavaScript. Same F, H, Q = q·I,
// R = r·I, P0 = 1000·I, x0 = 0, dt = 0.05 s over 10 s. State: [x vx ax y vy ay z vz az].
(function (root) {
  "use strict";

  const N = 9, M = 3;

  function zeros(r, c) { return Array.from({ length: r }, () => new Float64Array(c)); }
  function eye(n, s) { const a = zeros(n, n); for (let i = 0; i < n; i++) a[i][i] = s; return a; }
  function mul(a, b) {
    const r = a.length, k = b.length, c = b[0].length, o = zeros(r, c);
    for (let i = 0; i < r; i++) for (let p = 0; p < k; p++) {
      const v = a[i][p]; if (v === 0) continue;
      for (let j = 0; j < c; j++) o[i][j] += v * b[p][j];
    }
    return o;
  }
  function tr(a) { const o = zeros(a[0].length, a.length); a.forEach((row, i) => row.forEach((v, j) => { o[j][i] = v; })); return o; }
  function add(a, b) { return a.map((row, i) => row.map((v, j) => v + b[i][j])); }
  function sub(a, b) { return a.map((row, i) => row.map((v, j) => v - b[i][j])); }
  function inv3(m) {
    const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    return [
      [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
      [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
      [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
    ].map((r) => Float64Array.from(r));
  }

  function makeFilter(dt, q, r) {
    const F = eye(N, 1), h2 = 0.5 * dt * dt;
    for (const o of [0, 3, 6]) { F[o][o + 1] = dt; F[o][o + 2] = h2; F[o + 1][o + 2] = dt; }
    const H = zeros(M, N); H[0][0] = 1; H[1][3] = 1; H[2][6] = 1;
    return { F, Ft: tr(F), H, Ht: tr(H), Q: eye(N, q), R: eye(M, r), P: eye(N, 1000), x: zeros(N, 1) };
  }
  function predict(k) {
    k.x = mul(k.F, k.x);
    k.P = add(mul(mul(k.F, k.P), k.Ft), k.Q);
  }
  function update(k, z) {
    const y = sub(z, mul(k.H, k.x));
    const S = add(mul(mul(k.H, k.P), k.Ht), k.R);
    const K = mul(mul(k.P, k.Ht), inv3(S));
    k.x = add(k.x, mul(K, y));
    k.P = mul(sub(eye(N, 1), mul(K, k.H)), k.P);
  }

  const SCENARIOS = {
    looping(t) { return [10 * t, 8 * Math.cos(1.5 * t), 20 + 8 * Math.sin(1.5 * t)]; },
    parabolic(t) { const z = 30 * t - 0.5 * 9.81 * t * t; return [10 * t, 3 * t, z > 0 ? z : 0]; },
    chaotic(t) {
      return [5 * t + 2 * Math.sin(3 * t), 5 * Math.cos(0.5 * t) * Math.sin(t), 10 + 2 * t + 3 * Math.cos(4 * t)];
    },
    linear(t) { return [10 * t, 5 * t, 10 + 2 * t]; },
  };

  // Seeded Gaussian noise (mulberry32 + Box-Muller) so a given seed redraws identically.
  function gauss(seed) {
    let a = seed >>> 0, spare = null;
    const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return () => {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let x, y, s; do { x = 2 * u() - 1; y = 2 * u() - 1; s = x * x + y * y; } while (s >= 1 || s === 0);
      const m = Math.sqrt(-2 * Math.log(s) / s); spare = y * m; return x * m;
    };
  }

  function simulate(scenario, sigma, q, seed) {
    const dt = 0.05, steps = 200, pos = SCENARIOS[scenario], g = gauss(seed);
    const kf = makeFilter(dt, q, sigma);
    const out = { t: [], truth: [], meas: [], est: [] };
    for (let i = 0; i < steps; i++) {
      const t = i * dt, p = pos(t);
      const m = p.map((v) => v + g() * sigma);
      predict(kf);
      update(kf, m.map((v) => [v]));
      out.t.push(t); out.truth.push(p); out.meas.push(m);
      out.est.push([kf.x[0][0], kf.x[3][0], kf.x[6][0]]);
    }
    return out;
  }

  function rmse(a, b, from) {
    let s = 0, n = 0;
    for (let i = from || 0; i < a.length; i++) {
      s += (a[i][0] - b[i][0]) ** 2 + (a[i][1] - b[i][1]) ** 2 + (a[i][2] - b[i][2]) ** 2; n++;
    }
    return Math.sqrt(s / n);
  }

  const api = { simulate, rmse, SCENARIOS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KALMAN = api;
})(this);
