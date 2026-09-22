// The ADALINE / LMS adaptive noise canceller, ported line for line from
// tinys/adalineDemo/src/adalineDemo/reference.py (itself the test oracle for the
// frugal_ml Rust path that runs on the STM32F446RE). Same signals, same coupling
// path, same xorshift64 noise generator, same update rule.
(function (root) {
  "use strict";

  const F_S = [60, 140, 310], A_S = [0.30, 0.15, 0.10];   // signal to keep
  const F_N = [200, 400, 600], A_N = [0.50, 0.25, 0.15];  // engine-like noise to cancel
  const NOISE_JITTER = 0.03;
  const COUPLING_DIRECT = 0.7, COUPLING_DELAYED = 0.3;
  const TWO_PI = 2 * Math.PI;
  const U64_MAX = 18446744073709551615;

  // xorshift64 on two uint32 halves (hi, lo): x ^= x<<13; x ^= x>>7; x ^= x<<17.
  function xorshift(st) {
    let hi = st.hi, lo = st.lo, h, l;
    h = ((hi << 13) | (lo >>> 19)) >>> 0; l = (lo << 13) >>> 0; hi = (hi ^ h) >>> 0; lo = (lo ^ l) >>> 0;
    l = ((lo >>> 7) | (hi << 25)) >>> 0; h = hi >>> 7;            hi = (hi ^ h) >>> 0; lo = (lo ^ l) >>> 0;
    h = ((hi << 17) | (lo >>> 15)) >>> 0; l = (lo << 17) >>> 0; hi = (hi ^ h) >>> 0; lo = (lo ^ l) >>> 0;
    st.hi = hi; st.lo = lo;
    return ((hi * 4294967296 + lo) / U64_MAX) * 2 - 1;
  }

  function run(taps, fs, lr, n, seed) {
    seed = seed === undefined ? 424242 : seed;
    const w = new Float64Array(taps), win = new Float64Array(taps);
    let bias = 0, n0Prev = 0;
    const st = { hi: Math.floor(seed / 4294967296) >>> 0, lo: seed >>> 0 };
    if (st.hi === 0 && st.lo === 0) st.lo = 1;
    const out = {
      s: new Float32Array(n), n0: new Float32Array(n), d: new Float32Array(n),
      y: new Float32Array(n), e: new Float32Array(n),
    };
    for (let i = 0; i < n; i++) {
      const t = i / fs;
      let s = 0, noise = 0;
      for (let k = 0; k < 3; k++) {
        s += A_S[k] * Math.sin(TWO_PI * F_S[k] * t);
        noise += A_N[k] * Math.sin(TWO_PI * F_N[k] * t);
      }
      noise += NOISE_JITTER * xorshift(st);
      const reference = COUPLING_DIRECT * noise + COUPLING_DELAYED * n0Prev;
      n0Prev = noise;
      const primary = s + noise;

      win.copyWithin(1, 0, taps - 1);
      win[0] = reference;
      let y = bias;
      for (let k = 0; k < taps; k++) y += w[k] * win[k];

      // d/dy of mse(y, primary) for one output: 2 (y - primary), then plain SGD.
      const grad = 2 * (y - primary);
      for (let k = 0; k < taps; k++) w[k] -= lr * grad * win[k];
      bias -= lr * grad;

      out.s[i] = s; out.n0[i] = noise; out.d[i] = primary; out.y[i] = y; out.e[i] = primary - y;
    }
    return out;
  }

  const api = { run, F_S, F_N };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ANC = api;
})(this);
