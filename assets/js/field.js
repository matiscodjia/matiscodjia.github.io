// Home: what a depth sensor sees. A simulated depth field under a scanning time-of-flight sensor's
// field of view, drawn as its point cloud. The target is an object in the scene (your cursor, or a
// wandering point when there's none): the sensor measures its position with noise at 20 Hz and a
// constant-velocity Kalman filter tracks it, one per axis, the same model Sentinel's filter uses.
// Runs only while the home page is on screen; with reduced motion it draws one still frame.
(function () {
  "use strict";
  const page = document.getElementById("home");
  const cv = page && page.querySelector(".field");
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext("2d");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Scene, in plane units: the grid spans u, v in [-1, 1]; the sensor sits in front of it at (0, V0).
  const S = 1.5, V0 = -1.3, FOV = 0.6, METRES = 1.8, REACH = 2.35;
  const CA = Math.cos(0.6), SA = Math.sin(0.6), DIST = 4.3;  // camera pitch and distance
  let W = 0, H = 0, f = 1, cx = 0, cy = 0, cphi = 1, sphi = 0, wide = true;
  let N = 0, gu, gv, gth, gin, glow, px, py, ps, pb, order, counts;
  let styles = [], col = {}, raf = 0, running = false, stopT = 0, last = 0;
  const t0 = performance.now();

  // ── Colours from the page's own tokens ───────────────────
  const ALPHAS = [0.07, 0.15, 0.27, 0.41, 0.58, 0.78], LEVELS = 12;
  function rgb(v, fb) {
    const m = /^#([0-9a-f]{6})$/i.exec((v || "").trim());
    if (!m) return fb;
    const n = parseInt(m[1], 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  function palette() {
    const cs = getComputedStyle(document.documentElement), g = (n, fb) => rgb(cs.getPropertyValue(n), fb);
    col = { low: g("--patina", [0, 144, 125]), mid: g("--amber", [244, 164, 42]), high: g("--accent", [224, 83, 31]),
            muted: g("--muted", [140, 112, 97]), ink: g("--ink", [35, 21, 16]), ink2: g("--ink-2", [91, 67, 54]) };
    const mix = (a, b, k) => a.map((x, i) => Math.round(x + (b[i] - x) * k));
    styles = [];
    for (let c = 0; c < LEVELS; c++) {
      const k = c / (LEVELS - 1), rgbc = k < 0.5 ? mix(col.low, col.mid, k * 2) : mix(col.mid, col.high, k * 2 - 1);
      ALPHAS.forEach((a) => styles.push(`rgba(${rgbc},${a})`));
    }
    ALPHAS.forEach((a) => styles.push(`rgba(${col.muted},${a * 0.55})`));  // outside the field of view
  }
  const rgba = (c, a) => `rgba(${c},${a})`;

  // ── Geometry ─────────────────────────────────────────────
  function resize() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    if (!W || !H) return;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wide = W > 900;  // narrow: the field sits behind the text, so it goes quiet (no labels)
    f = wide ? Math.min(W * 0.5, H * 1.25) : Math.min(W * 1.05, H * 0.9);
    cx = wide ? W * 0.71 : W * 0.5;
    cy = wide ? H * 0.42 : H * 0.7;
    const NU = wide ? 78 : 46, NV = wide ? 48 : 30;
    N = NU * NV;
    gu = new Float32Array(N); gv = new Float32Array(N); gth = new Float32Array(N); gin = new Uint8Array(N); glow = new Float32Array(N);
    px = new Float32Array(N); py = new Float32Array(N); ps = new Float32Array(N); pb = new Uint16Array(N); order = new Uint32Array(N);
    counts = new Uint32Array(LEVELS * ALPHAS.length + ALPHAS.length + 1);
    for (let j = 0, i = 0; j < NV; j++) for (let k = 0; k < NU; k++, i++) {
      const u = -1 + (2 * k) / (NU - 1), v = -1 + (2 * j) / (NV - 1), th = Math.atan2(u, v - V0);
      gu[i] = u; gv[i] = v; gth[i] = th; gin[i] = Math.abs(th) < FOV ? 1 : 0;
    }
    if (!running) draw(stillT());
  }

  function project(u, v, h, out) {
    const X = u * S, Z = v * S, Y = h * S;
    const x1 = X * cphi - Z * sphi, z1 = X * sphi + Z * cphi;
    const y2 = Y * CA + z1 * SA, z2 = -Y * SA + z1 * CA + DIST;
    out[0] = cx + (f * x1) / z2; out[1] = cy - (f * y2) / z2; out[2] = z2;
    return out;
  }
  // screen → the ground plane (h = 0): where the pointer is in the scene
  function unproject(sx, sy) {
    const dy = cy - sy, den = f * SA - dy * CA;
    if (den < f * 0.08) return null;
    const z1 = (dy * DIST) / den, x1 = ((sx - cx) * (z1 * CA + DIST)) / f;
    return { u: (x1 * cphi + z1 * sphi) / S, v: (-x1 * sphi + z1 * cphi) / S };
  }

  // ── The object, the sensor, the filter ───────────────────
  let tu = 0.2, tv = 0.3, ptr = null, ptrT = -1e9, wPtr = 0;
  const kf = () => ({ p: 0, v: 0, P00: 0.2, P01: 0, P11: 0.5 });
  const kx = kf(), kz = kf(), Q = 0.9, SIGMA = 0.055, RV = SIGMA * SIGMA;
  const meas = [];
  let nextMeas = 0;
  function predict(k, dt) {
    k.p += k.v * dt;
    k.P00 += dt * (2 * k.P01 + dt * k.P11) + (Q * dt * dt * dt) / 3;
    k.P01 += dt * k.P11 + (Q * dt * dt) / 2;
    k.P11 += Q * dt;
  }
  function update(k, z) {
    const s = k.P00 + RV, k0 = k.P00 / s, k1 = k.P01 / s, y = z - k.p;
    k.p += k0 * y; k.v += k1 * y;
    k.P11 -= k1 * k.P01; k.P01 -= k0 * k.P01; k.P00 -= k0 * k.P00;
  }
  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

  function height(u, v, t) {
    const du = u - tu, dv = v - tv;
    return 0.075 * Math.sin(2.6 * u + 0.9 * t) * Math.cos(2.1 * v - 0.6 * t)
         + 0.045 * Math.sin(4.3 * (u - v) + 1.3 * t)
         + 0.028 * Math.cos(6.1 * v + 2.2 * u - 0.8 * t)
         + 0.36 * Math.exp(-(du * du + dv * dv) / 0.03);
  }

  function simulate(t, dt) {
    // where the object is: the pointer while it moves, otherwise a slow wander through the field of view
    const au = 0.6 * Math.sin(0.21 * t) + 0.16 * Math.sin(0.67 * t + 1), av = 0.22 + 0.48 * Math.sin(0.15 * t + 0.6);
    wPtr += ((ptr && t - ptrT < 2.5 ? 1 : 0) - wPtr) * Math.min(1, dt * 3);
    const pu = ptr ? ptr.u : au, pv = ptr ? ptr.v : av;
    tu = au + (pu - au) * wPtr; tv = av + (pv - av) * wPtr;
    predict(kx, dt); predict(kz, dt);
    if (t >= nextMeas) {  // the sensor reports, with noise, at 20 Hz
      const zu = tu + gauss() * SIGMA, zv = tv + gauss() * SIGMA;
      update(kx, zu); update(kz, zv);
      meas.push([zu, zv, t]);
      if (meas.length > 18) meas.shift();
      nextMeas = Math.max(nextMeas + 0.05, t - 0.05);
    }
  }

  // ── Drawing ──────────────────────────────────────────────
  const P = new Float32Array(3), Q2 = new Float32Array(3);
  function draw(t, dt = 0) {
    if (!N) return;
    const phi = 0.26 * Math.sin(t * 0.11);
    cphi = Math.cos(phi); sphi = Math.sin(phi);
    const sweep = FOV * 0.96 * Math.sin(t * 0.5), sizeK = f / 900, decay = Math.exp(-dt / 0.9);
    ctx.clearRect(0, 0, W, H);

    // points: sort by style bucket, then one fill per bucket
    counts.fill(0);
    const nA = ALPHAS.length, OUT = LEVELS * nA;
    for (let i = 0; i < N; i++) {
      const u = gu[i], v = gv[i], h = height(u, v, t);
      project(u, v, h, P);
      const fog = Math.max(0, Math.min(1, (6.1 - P[2]) / 3.2));
      let a, b;
      if (gin[i]) {
        glow[i] = Math.abs(gth[i] - sweep) < 0.035 ? 1 : glow[i] * decay;  // phosphor: lit by the sweep, fading
        a = 0.2 + 0.5 * fog + 0.45 * glow[i];
        const c = Math.max(0, Math.min(LEVELS - 1, Math.round(((h + 0.12) / 0.46) * (LEVELS - 1))));
        b = c * nA + Math.min(nA - 1, (a * nA) | 0);
        ps[i] = (0.9 + 1.7 * fog) * sizeK * (1 + glow[i] * 0.7);
      } else {
        a = 0.15 + 0.6 * fog;
        b = OUT + Math.min(nA - 1, (a * nA) | 0);
        ps[i] = (0.7 + 1.1 * fog) * sizeK;
      }
      px[i] = P[0]; py[i] = P[1]; pb[i] = b; counts[b + 1]++;
    }
    for (let b = 1; b < counts.length; b++) counts[b] += counts[b - 1];
    const fillAt = counts.slice();
    for (let i = 0; i < N; i++) order[fillAt[pb[i]]++] = i;
    for (let b = 0; b < counts.length - 1; b++) {
      if (counts[b + 1] === counts[b]) continue;
      ctx.fillStyle = styles[b];
      ctx.beginPath();
      for (let j = counts[b]; j < counts[b + 1]; j++) { const i = order[j], s = ps[i]; ctx.rect(px[i] - s / 2, py[i] - s / 2, s, s); }
      ctx.fill();
    }

    // the sensor: field-of-view edges, range rings, the sweep
    const at = (r, th, h = 0) => project(Math.sin(th) * r, V0 + Math.cos(th) * r, h, Q2);
    const sen = project(0, V0, 0, new Float32Array(3));
    ctx.lineWidth = 1;
    ctx.font = "500 10px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.fillStyle = rgba(col.muted, 0.85);
    for (let m = 1; m <= 4; m++) {
      const r = m / METRES;
      ctx.strokeStyle = rgba(col.ink2, 0.13);
      ctx.beginPath();
      for (let s = 0; s <= 28; s++) { const q = at(r, -FOV + (2 * FOV * s) / 28); s ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
      ctx.stroke();
      const q = at(r, FOV);
      if (wide) ctx.fillText(m + " m", q[0] + 6, q[1] + 3);
    }
    ctx.strokeStyle = rgba(col.high, 0.4);
    [-FOV, FOV].forEach((th) => { const q = at(REACH, th); ctx.beginPath(); ctx.moveTo(sen[0], sen[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); });
    const sw = at(REACH, sweep), gr = ctx.createLinearGradient(sen[0], sen[1], sw[0], sw[1]);
    gr.addColorStop(0, rgba(col.high, 0.75)); gr.addColorStop(1, rgba(col.mid, 0));
    ctx.strokeStyle = gr; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sen[0], sen[1]); ctx.lineTo(sw[0], sw[1]); ctx.stroke();
    ctx.fillStyle = rgba(col.high, 0.95);
    ctx.fillRect(sen[0] - 4, sen[1] - 4, 8, 8);
    ctx.fillStyle = rgba(col.ink2, 0.9);
    if (wide) ctx.fillText("ToF · 8×8 · 20 Hz", sen[0] + 10, sen[1] + 4);

    // noisy readings, newest brightest
    meas.forEach((m, i) => {
      const q = project(m[0], m[1], height(m[0], m[1], t), Q2), a = ((i + 1) / meas.length) * 0.8;
      ctx.fillStyle = rgba(col.low, a);
      ctx.beginPath(); ctx.arc(q[0], q[1], 2.2 * sizeK + 0.6, 0, 7); ctx.fill();
    });

    // the track: reticle, uncertainty ring, velocity, readout
    const eu = kx.p, ev = kz.p, e = project(eu, ev, height(eu, ev, t), new Float32Array(3));
    const ahead = project(eu + kx.v * 0.6, ev + kz.v * 0.6, height(eu + kx.v * 0.6, ev + kz.v * 0.6, t), Q2);
    ctx.setLineDash([3, 4]); ctx.strokeStyle = rgba(col.high, 0.45); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sen[0], sen[1]); ctx.lineTo(e[0], e[1]); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = rgba(col.mid, 0.9); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(e[0], e[1]); ctx.lineTo(ahead[0], ahead[1]); ctx.stroke();
    const ring = Math.max(7, (Math.sqrt(kx.P00 + kz.P00) * S * f) / e[2] * 2.2);
    ctx.strokeStyle = rgba(col.high, 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(e[0], e[1], ring, 0, 7); ctx.stroke();
    const B = 13, L = 5;
    ctx.strokeStyle = rgba(col.high, 1); ctx.lineWidth = 1.6;
    ctx.beginPath();
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
      ctx.moveTo(e[0] + sx * B, e[1] + sy * (B - L)); ctx.lineTo(e[0] + sx * B, e[1] + sy * B); ctx.lineTo(e[0] + sx * (B - L), e[1] + sy * B);
    });
    ctx.stroke();
    ctx.fillStyle = rgba(col.high, 1);
    ctx.fillRect(e[0] - 1.5, e[1] - 1.5, 3, 3);
    if (!wide) return;
    const range = Math.hypot(eu, ev - V0) * METRES, bearing = (Math.atan2(eu, ev - V0) * 180) / Math.PI;
    const speed = Math.hypot(kx.v, kz.v) * METRES;
    ctx.font = "600 10.5px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.fillStyle = rgba(col.ink, 0.95);
    ctx.fillText("TRK 01 · KALMAN", e[0] + B + 8, e[1] - 6);
    ctx.font = "500 10px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.fillStyle = rgba(col.ink2, 0.9);
    ctx.fillText(`r ${range.toFixed(2)} m  θ ${bearing >= 0 ? "+" : ""}${bearing.toFixed(0)}°`, e[0] + B + 8, e[1] + 8);
    ctx.fillText(`v ${speed.toFixed(2)} m/s`, e[0] + B + 8, e[1] + 21);
  }

  // ── Running ──────────────────────────────────────────────
  const stillT = () => 7.5;
  function frame(now) {
    raf = 0;
    if (!running) return;
    const t = (now - t0) / 1000, dt = last ? Math.min(0.05, t - last) : 1 / 60;
    last = t;
    simulate(t, dt);
    draw(t, dt);
    raf = requestAnimationFrame(frame);
  }
  function sync() {
    const on = page.classList.contains("on") && !document.hidden && !reduce;
    clearTimeout(stopT);
    if (on && !running) { running = true; last = 0; if (!raf) raf = requestAnimationFrame(frame); }
    // leaving: keep drawing while the page slides away, then stop
    if (!on && running) stopT = setTimeout(() => { running = false; }, 1100);
  }
  page.addEventListener("pointermove", (e) => {
    const r = cv.getBoundingClientRect(), q = unproject(e.clientX - r.left, e.clientY - r.top);
    if (!q) return;
    ptr = { u: Math.max(-1.05, Math.min(1.05, q.u)), v: Math.max(-0.95, Math.min(1.05, q.v)) };
    ptrT = (performance.now() - t0) / 1000;
  }, { passive: true });
  page.addEventListener("pointerleave", () => { ptrT = -1e9; });
  document.addEventListener("pagechange", sync);
  document.addEventListener("visibilitychange", sync);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { palette(); if (!running) draw(stillT()); });
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(cv); else window.addEventListener("resize", resize);

  palette();
  resize();
  if (reduce) {  // one still frame, with the filter already settled on its target
    for (let t = 0; t < stillT(); t += 1 / 60) simulate(t, 1 / 60);
    draw(stillT());
  }
  sync();
  requestAnimationFrame(() => cv.classList.add("live"));
})();
