// Page behaviour: provenance tooltips, git activity, the RAM figure and the four live demos.
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fix = (v, d) => (isFinite(v) ? v.toFixed(d) : "–");

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function tagHTML(kind) {
    const label = { chip: "CHIP", host: "HOST", proj: "PROJ", exact: "EXACT", sim: "SIM", web: "LIVE" }[kind];
    return `<span class="tag tag-${kind}" data-t="${kind}" title="${TAGS[kind]}">${label}</span>`;
  }
  function statusHTML(ok, textOk, textBad) {
    return ok ? `<span class="status ok"><span class="g">✓</span>${textOk}</span>`
              : `<span class="status bad"><span class="g">✕</span>${textBad}</span>`;
  }

  // ── Provenance tags ─────────────────────────────────────
  const TAGS = {
    chip: "Measured on an STM32F446RE (Cortex-M4F, 168 MHz): DWT cycle counter, read over ST-Link with probe-rs",
    host: "Measured on a laptop (Apple M4 Pro)",
    proj: "Projected: cycle counts measured on the chip, applied to a size that was not run on it",
    exact: "Exact: computed from the tensor sizes the compiler knows, no measurement involved",
    sim: "Simulation: synthetic trajectories and noise",
    web: "Computed live in your browser, now",
  };
  $$(".tag[data-t]").forEach((t) => { t.title = TAGS[t.dataset.t] || ""; });

  // ── Git activity ────────────────────────────────────────
  (function activity() {
    const A = window.ACTIVITY;
    if (!A) return;
    const fmtMonth = (iso) => { const d = new Date(iso + "T00:00:00"); return MONTHS[d.getMonth()] + " " + d.getFullYear(); };
    $$("[data-synced]").forEach((n) => { n.textContent = A.synced; });
    const byKey = Object.fromEntries(A.lanes.map((l) => [l.key, l]));
    $$("[data-first]").forEach((n) => { const l = byKey[n.dataset.first]; if (l && l.first) n.textContent = fmtMonth(l.first); });
    $$("[data-commits]").forEach((n) => { const l = byKey[n.dataset.commits]; if (l) n.textContent = l.commits; });
    $$("[data-total]").forEach((n) => { n.textContent = A.lanes.reduce((s, l) => s + l.commits, 0); });
    $$("[data-repos]").forEach((n) => { n.textContent = A.lanes.length; });

    const weeks = A.lanes[0].weeks.length, start = new Date(A.weekStart + "T00:00:00");
    const weekDate = (i) => new Date(start.getTime() + i * 7 * 864e5);
    const levels = [0, 1, 3, 6, 11];
    const alpha = [0, 0.28, 0.5, 0.75, 1];
    const level = (c) => { let k = 0; levels.forEach((t, i) => { if (c >= t) k = i; }); return k; };
    const cellStyle = (k) => (k === 0 ? "" : `background:color-mix(in srgb, var(--accent) ${Math.round(alpha[k] * 100)}%, var(--hair))`);
    const box = $("#lanes");
    const cols = `grid-template-columns:repeat(${weeks}, minmax(0, 1fr))`;
    A.lanes.forEach((l) => {
      const row = document.createElement("div");
      row.className = "lane";
      const cells = l.weeks.map((c, i) => {
        const d = weekDate(i);
        return `<i style="${cellStyle(level(c))}" title="Week of ${MONTHS[d.getMonth()]} ${d.getDate()}: ${c} commit${c === 1 ? "" : "s"}"></i>`;
      }).join("");
      row.innerHTML = `<span class="lane-name">${l.key}</span><span class="lane-cells" style="${cols}">${cells}</span><span class="lane-count">${l.commits} commit${l.commits === 1 ? "" : "s"}</span>`;
      box.appendChild(row);
    });
    const axis = document.createElement("div");
    axis.className = "lane lane-axis";
    let lastMonth = -1;
    const labels = Array.from({ length: weeks }, (_, i) => {
      const d = weekDate(i), m = d.getMonth();
      // label a month at its first week; skip a partial month at the very start
      const show = m !== lastMonth && (i > 0 || d.getDate() <= 7); lastMonth = m;
      return `<i>${show ? MONTHS[m] : ""}</i>`;
    }).join("");
    axis.innerHTML = `<span></span><span class="lane-cells" style="${cols}">${labels}</span><span></span>`;
    box.appendChild(axis);
    $("#ramp").innerHTML = [1, 2, 3, 4].map((k) => `<i style="${cellStyle(k)}"></i>`).join("");

    $("#changelog").innerHTML = A.recent.map((r) => {
      const esc = r.msg.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      return `<tr><td>${r.date}</td><td>${r.repo}</td><td>${esc}</td></tr>`;
    }).join("");
  })();

  // ── RAM figure ──────────────────────────────────────────
  (function ramChart() {
    const svg = $("#ram-chart");
    const rows = [
      { label: "Weights + gradients, naive count", kb: 50.5 },
      { label: "Stack reserved by the compiler (all layers inlined)", kb: 118.77 },
      { label: "Same network, one stack frame per layer", kb: 127.83 },
    ];
    const AVAIL = 126.4;
    C.mount(svg, 206, (s, w, h) => {
      const m = { l: 4, r: 64, t: 8, b: 26 };
      const x = C.lin(0, 136, m.l, w - m.r);
      C.axes(s, { w, h, m, x, y: () => 0, xTicks: [0, 32, 64, 96, 128], xGrid: true, xFmt: (v) => v + " KB" });
      const rowH = (h - m.t - m.b) / rows.length;
      rows.forEach((r, i) => {
        const y0 = m.t + i * rowH;
        C.text(s, m.l, y0 + 16, r.label, { class: "lbl" });
        const over = r.kb > AVAIL;
        const bw = x(r.kb) - x(0), by = y0 + 24, bh = 18;
        C.el("path", {
          d: `M${x(0)} ${by} H${x(0) + bw - 4} Q${x(0) + bw} ${by} ${x(0) + bw} ${by + 4} V${by + bh - 4} Q${x(0) + bw} ${by + bh} ${x(0) + bw - 4} ${by + bh} H${x(0)} Z`,
          fill: over ? "var(--plum)" : "var(--accent)",
        }, s);
        const label = r.kb.toFixed(1) + " KB" + (over ? " ✕ over" : "");
        if (r.kb > 80) C.text(s, x(r.kb) - 8, by + 13, label, { class: "lbl", "text-anchor": "end", style: "font-weight:600;fill:var(--ground)" });
        else C.text(s, x(r.kb) + 6, by + 13, label, { class: "lbl", style: "font-weight:600" });
      });
      const ax = Math.round(x(AVAIL)) + 0.5;
      C.el("line", { x1: ax, x2: ax, y1: m.t, y2: h - m.b, stroke: "var(--ink)", "stroke-width": 1.5 }, s);
      C.text(s, ax - 4, h - m.b - 4, "126.4 KB usable", { class: "lbl-mute", "text-anchor": "end" });
    });
  })();

  // ── Demo 1: adaptive noise cancellation ─────────────────
  (function ancDemo() {
    const tapsSel = $("#anc-taps"), fsSel = $("#anc-fs"), lrIn = $("#anc-lr"), lrOut = $("#anc-lr-out");
    const DUR = 4, CHIP_CYCLES = 575, CHIP_TAPS = 16, CHIP_HZ = 168e6;
    let run = null, audio = null, playing = null;

    const lrOf = (v) => +(0.0005 * Math.pow(100, v / 100)).toPrecision(2);
    const rms = (a, b, i0, i1) => { let s = 0; for (let i = i0; i < i1; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s / (i1 - i0)); };
    function corr(a, b, i0, i1) {
      let ma = 0, mb = 0; const n = i1 - i0;
      for (let i = i0; i < i1; i++) { ma += a[i]; mb += b[i]; }
      ma /= n; mb /= n;
      let sab = 0, saa = 0, sbb = 0;
      for (let i = i0; i < i1; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
      return sab / Math.sqrt(saa * sbb);
    }

    const convChart = C.mount($("#anc-conv"), 190, (s, w, h) => {
      if (!run) return;
      const m = { l: 40, r: 10, t: 8, b: 24 };
      const { e, s: sig } = run.out, fs = run.fs, win = Math.round(0.025 * fs);
      const ts = [], vs = [];
      for (let i = 0; i + win <= e.length; i += win) { ts.push((i + win / 2) / fs); vs.push(rms(e, sig, i, i + win)); }
      const hi = run.diverged ? 10 : Math.max(1, ...vs.filter(isFinite));
      const y = C.log(0.005, hi, h - m.b, m.t), x = C.lin(0, DUR, m.l, w - m.r);
      C.axes(s, { w, h, m, x, y, xTicks: [0, 1, 2, 3, 4], yTicks: y.ticks([1]), xFmt: (v) => v + " s", yFmt: (v) => (v >= 1 ? v.toFixed(0) : String(v)) });
      const clipped = vs.map((v) => Math.min(Math.max(v, 0.005), hi));
      C.line(s, C.path(ts.map(x), clipped.map(y)), "var(--accent)", 2.2);
      const lx = x(ts[ts.length - 1]), ly = y(clipped[clipped.length - 1]);
      C.el("circle", { cx: lx, cy: ly, r: 4.5, fill: "var(--accent)", stroke: "var(--surface-solid)", "stroke-width": 2, class: "mk" }, s);
      C.text(s, lx - 8, ly - 9, fix(vs[vs.length - 1], 3), { class: "lbl", "text-anchor": "end" });
      C.hover(s, { l: m.l, r: w - m.r, t: m.t, b: h - m.b }, (px) => {
        const i = Math.max(0, Math.min(ts.length - 1, Math.round((x.inv(px) * fs - win / 2) / win)));
        return { x: x(ts[i]), text: `t = ${ts[i].toFixed(3)} s\nRMS(e − s) = ${fix(vs[i], 4)}` };
      });
    });

    const waveChart = C.mount($("#anc-wave"), 190, (s, w, h) => {
      if (!run) return;
      const m = { l: 40, r: 10, t: 8, b: 24 };
      const { e, s: sig } = run.out, fs = run.fs, n = e.length, k = Math.round(0.04 * fs), i0 = n - k;
      let A = 0; for (let i = i0; i < n; i++) A = Math.max(A, Math.abs(sig[i]), isFinite(e[i]) ? Math.abs(e[i]) : 0);
      A = Math.min(Math.max(A * 1.1, 0.2), 3);
      const x = C.lin(0, 40, m.l, w - m.r), y = C.lin(-A, A, h - m.b, m.t);
      C.axes(s, { w, h, m, x, y, xTicks: [0, 10, 20, 30, 40], yTicks: y.ticks(4), xFmt: (v) => (v === 0 ? "3.96 s" : "+" + v + " ms"), yFmt: (v) => v.toFixed(1) });
      const xs = [], ys = [], ye = [];
      for (let i = i0; i < n; i++) { xs.push(x(((i - i0) / fs) * 1000)); ys.push(y(sig[i])); ye.push(y(Math.max(-A, Math.min(A, e[i])))); }
      C.line(s, C.path(xs, ys), "var(--ink-2)", 1.5);
      C.line(s, C.path(xs, ye), "var(--accent)", 2.2);
      C.hover(s, { l: m.l, r: w - m.r, t: m.t, b: h - m.b }, (px) => {
        const i = i0 + Math.max(0, Math.min(k - 1, Math.round((x.inv(px) / 1000) * fs)));
        return { x: x(((i - i0) / fs) * 1000), text: `e[n] = ${fix(e[i], 3)}\ns[n] = ${fix(sig[i], 3)}` };
      });
    });

    function compute() {
      stop();
      const taps = +tapsSel.value, fs = +fsSel.value, lr = lrOf(+lrIn.value);
      lrOut.textContent = lr.toFixed(4);
      const out = ANC.run(taps, fs, lr, DUR * fs);
      let diverged = false;
      for (let i = 0; i < out.e.length; i += 97) if (!isFinite(out.e[i]) || Math.abs(out.e[i]) > 1e3) { diverged = true; break; }
      run = { taps, fs, lr, out, diverged };
      audio = null;

      const n = out.e.length, early = Math.round(0.01 * fs), late = n - Math.round(0.04 * fs);
      if (diverged) {
        $("#anc-corr").innerHTML = statusHTML(false, "", "Diverged");
        $("#anc-rms").innerHTML = `<span class="status bad"><span class="g">✕</span>Learning rate too high for ${taps} taps</span>`;
      } else {
        $("#anc-corr").innerHTML = `${fix(corr(out.y, out.n0, 0, early), 2)} → ${fix(corr(out.y, out.n0, late, n), 3)} ${tagHTML("web")}`;
        $("#anc-rms").innerHTML = `${fix(rms(out.e, out.s, 0, early), 3)} → ${fix(rms(out.e, out.s, late, n), 3)} ${tagHTML("web")}`;
      }

      const cycles = CHIP_CYCLES * taps / CHIP_TAPS, us = (cycles / CHIP_HZ) * 1e6, budget = 1e6 / fs, margin = budget / us;
      const measured = taps === CHIP_TAPS;
      $("#anc-chip").innerHTML = `${us.toFixed(2)} µs <small>of ${budget < 20 ? budget.toFixed(1) : Math.round(budget)} µs</small> ${tagHTML(measured ? "chip" : "proj")}`;
      const fill = $("#anc-meter");
      fill.style.width = Math.min(100, (us / budget) * 100) + "%";
      fill.classList.toggle("over", margin < 1);
      $("#anc-chip-note").innerHTML = (margin >= 1
        ? statusHTML(true, `Keeps up, ${margin.toFixed(1)}× margin`, "")
        : statusHTML(false, "", `Can't keep up: needs ${(1 / margin).toFixed(1)}× the time it has`))
        + (measured ? "" : ` · ${Math.round(cycles)} cycles, projected`);

      convChart();
      waveChart();
    }

    // Audio: one context, one shared gain so loudness differences are real.
    let ctx = null, src = null;
    function stop() {
      if (src) { try { src.stop(); } catch (_) {} src = null; }
      playing = null;
      $$("#anc-demo [data-play]").forEach((b) => b.setAttribute("aria-pressed", "false"));
    }
    function play(which, btn) {
      if (playing === which) { stop(); return; }
      stop();
      if (!run) return;
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === "suspended") ctx.resume();
        if (!audio) {
          const { d } = run.out;
          let peak = 0; for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
          const g = 0.8 / (peak || 1);
          audio = {};
          for (const k of ["d", "e", "s"]) {
            const b = ctx.createBuffer(1, d.length, run.fs), ch = b.getChannelData(0), a = run.out[k];
            for (let i = 0; i < a.length; i++) ch[i] = Math.max(-1, Math.min(1, isFinite(a[i]) ? a[i] * g : 0));
            audio[k] = b;
          }
        }
        src = ctx.createBufferSource();
        src.buffer = audio[which];
        src.connect(ctx.destination);
        src.onended = () => { if (playing === which) stop(); };
        src.start();
        playing = which;
        btn.setAttribute("aria-pressed", "true");
      } catch (err) {
        btn.setAttribute("aria-pressed", "false");
      }
    }
    $$("#anc-demo [data-play]").forEach((b) => b.addEventListener("click", () => play(b.dataset.play, b)));
    const recompute = debounce(compute, 120);
    tapsSel.addEventListener("change", compute);
    fsSel.addEventListener("change", compute);
    lrIn.addEventListener("input", () => { lrOut.textContent = lrOf(+lrIn.value).toFixed(4); recompute(); });
    compute();
  })();

  // ── Demo 2: directConv's video lab, rendered by directConv ──
  (function videoLab() {
    const D = window.DIRECTCONV;
    const box = $("#conv-demo");
    if (!D || !box) return;
    const KINDS = ["original", "edges", "blur"];
    const figs = KINDS.map((k) => $(`#dc-vids figure[data-k="${k}"]`));
    const vids = figs.map((f) => $("video", f));
    const byId = Object.fromEntries(D.scenarios.map((s) => [s.id, s]));
    const run720 = D.runs["1280×720"];
    const numpyX = run720.numpy_ms / run720.measured["heap@720x1280"].ms_per_frame;
    const kb = (b) => (b >= 1e6 ? (b / 1e6).toFixed(1) + " MB" : (b / 1e3).toFixed(1) + " kB");
    const ms = (v) => (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)) + " ms";
    const pct = (v) => (v * 100 >= 10 ? (v * 100).toFixed(0) : (v * 100).toFixed(1)) + " %";

    // The aside's host numbers come from the same rendering run.
    $("#dc-x").textContent = Math.round(numpyX) + "×";
    $("#dc-heap-ms").textContent = run720.measured["heap@720x1280"].ms_per_frame.toFixed(2);
    $("#dc-numpy-ms").textContent = run720.numpy_ms.toFixed(1);
    $("#dc-copy").textContent = Math.round(100 * run720.numpy_breakdown.copy_share);
    $("#dc-copy-mb").textContent = Math.round(run720.numpy_breakdown.copy_mb_per_frame);

    const SAY = {
      fits: (s) => `At ${s.size.name} the whole frame, both filters and both outputs take ${kb(s.bytes)}. That fits in the chip's stack, and at ${ms(s.chip_ms)} per frame every one of the ${s.frames} frames goes through.`,
      wall: (s) => `At 1280×720 a full frame needs ${kb(s.bytes)} of tensors, ${Math.round(s.bytes / s.budget)}× what the chip's stack can hold, and the chip has no heap. Nothing can run.`,
      shrink: (s) => `The same full-frame code on the biggest frame that fits: ${s.size.name}, ${pct(s.pixels_kept)} of the pixels. Every frame goes through, ${ms(s.chip_ms)} each, but most of the detail is gone.`,
      stream: (s) => `Every pixel, but only three rows per filter held at once: ${kb(s.bytes)}. One 720p frame takes ${ms(s.chip_ms)} on the chip, so it keeps ${s.processed} of ${s.frames} frames and holds the last result in between.`,
      mac: (s) => `On a laptop the full frame simply goes on the heap: ${ms(s.host_ms)} per frame, every frame kept, outputs identical to numpy's and ${Math.round(numpyX)}× faster than numpy on the same machine.`,
    };

    let cur = null, playing = false, raf = 0, started = false;

    const strip = C.mount($("#dc-strip"), 46, (s, w, h) => {
      if (!cur) return;
      const n = D.frames, step = w / n, kept = new Set(cur.processed_indices || []);
      const g = C.el("g", {}, s);
      for (let i = 0; i < n; i++) {
        const on = kept.has(i);
        C.el("rect", { x: (i * step).toFixed(2), y: on ? 6 : 14, width: Math.max(0.8, step - (step > 3 ? 1 : 0.3)).toFixed(2), height: on ? 26 : 10, rx: 1, fill: on ? "var(--accent)" : "var(--hair-strong)" }, g);
      }
      if (!cur.strategy) C.text(s, w / 2, 42, "no frame can run on the chip at this size", { class: "lbl-mute", "text-anchor": "middle" });
      C.el("line", { id: "dc-head", x1: 0, x2: 0, y1: 0, y2: 38, stroke: "var(--ink)", "stroke-width": 2, "stroke-linecap": "round" }, s);
    });

    function head() {
      const v = vids[0], line = $("#dc-head");
      if (line && v.duration) {
        const x = (v.currentTime / v.duration) * $("#dc-strip").viewBox.baseVal.width;
        line.setAttribute("x1", x); line.setAttribute("x2", x);
      }
      // keep the three videos on one clock: the input leads
      for (let i = 1; i < vids.length; i++) {
        const o = vids[i];
        if (o.getAttribute("src") && Math.abs(o.currentTime - v.currentTime) > 0.08) o.currentTime = v.currentTime;
      }
      if (playing) raf = requestAnimationFrame(head);
    }

    function setPlaying(on) {
      playing = on;
      const btn = $("#dc-play");
      btn.setAttribute("aria-pressed", String(on));
      btn.lastElementChild.textContent = on ? "Pause" : "Play";
      const active = vids.filter((v) => v.getAttribute("src"));
      if (on) { active.forEach((v) => v.play().catch(() => {})); cancelAnimationFrame(raf); raf = requestAnimationFrame(head); }
      else { active.forEach((v) => v.pause()); cancelAnimationFrame(raf); head(); }
    }

    function show(id, withVideo = true) {
      cur = byId[id];
      $$(".scen .chip", box).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.s === id)));
      $("#dc-say").textContent = SAY[id](cur);
      const files = cur.videos || { original: byId.mac.videos.original };
      const small = cur.size && cur.size.w < 400 && cur.strategy;
      if (withVideo) $("#dc-vids").classList.add("loading");
      const waits = [];
      if (withVideo) KINDS.forEach((k, i) => {
        const v = vids[i], nope = $(".nope", figs[i]), file = files[k];
        figs[i].querySelector(".vbox").classList.toggle("px", !!small);
        if (nope) {
          nope.hidden = !!file;
          if (!file) nope.innerHTML = `<span><b>✕ Doesn't fit</b>needs ${kb(cur.bytes)} of tensors,<br>the stack holds ${kb(cur.budget)}</span>`;
        }
        if (!file) { v.removeAttribute("src"); v.load(); return; }
        const url = "media/directconv/" + file;
        if (v.getAttribute("src") !== url) { v.setAttribute("src", url); v.preload = "auto"; v.load(); }
        waits.push(v.readyState >= 3 ? Promise.resolve() : new Promise((r) => { v.addEventListener("canplay", r, { once: true }); setTimeout(r, 4000); }));
      });
      if (withVideo) Promise.all(waits).then(() => {
        vids.forEach((v) => { if (v.getAttribute("src")) v.currentTime = 0; });
        $("#dc-vids").classList.remove("loading");
        setPlaying(playing || !reduceMotion);
      });

      const chip = cur.device === "stm32";
      $("#dc-size").textContent = cur.size ? cur.size.name : "–";
      $("#dc-size-note").textContent = !cur.strategy ? "the full 720p frame" : cur.pixels_kept < 1 ? `${pct(cur.pixels_kept)} of the 1280×720 pixels` : "every pixel of the frame";
      $("#dc-mem").innerHTML = `${kb(cur.bytes)} ${tagHTML("exact")}`;
      $("#dc-mem-note").innerHTML = cur.device === "host"
        ? statusHTML(true, "on the heap: a laptop has room for it", "")
        : cur.fits ? statusHTML(true, cur.predicted ? `fits ${kb(cur.budget)}, predicted: not yet run this big on the board` : `fits the ${kb(cur.budget)} stack budget`, "")
        : statusHTML(false, "", `${Math.round(cur.bytes / cur.budget)}× the ${kb(cur.budget)} stack budget`);
      if (!cur.strategy) {
        $("#dc-time").textContent = "–";
        $("#dc-time-note").textContent = "can't run on the chip";
        $("#dc-kept").innerHTML = "<b>0 of 300 frames</b>: nothing runs";
      } else {
        const t = chip ? cur.chip_ms : cur.host_ms;
        $("#dc-time").innerHTML = `${ms(t)} ${tagHTML(chip ? "proj" : "host")}`;
        $("#dc-time-note").textContent = `${chip ? "on the STM32F446RE" : "on the laptop"} · up to ${1000 / t >= 100 ? Math.round(1000 / t).toLocaleString("en") : (1000 / t).toFixed(1)} frames per second`;
        $("#dc-kept").innerHTML = `<b>${cur.processed} of ${cur.frames} frames</b> processed at ${cur.camera_fps} fps${cur.dropped ? `, ${Math.round(cur.dropped_pct)} % dropped` : ""}`;
      }
      strip();
    }

    $$(".scen .chip", box).forEach((b) => b.addEventListener("click", () => { started = true; show(b.dataset.s); }));
    $("#dc-play").addEventListener("click", () => setPlaying(!playing));
    // Nothing downloads until the lab is on screen.
    const first = () => { if (!started) { started = true; show("stream"); } };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); first(); } }, { rootMargin: "200px" });
      io.observe(box);
    } else first();
    // Fill the text and numbers before any video loads, so the lab reads correctly at rest.
    show("stream", false);
  })();

  // ── Demo 2b: any frame size, the memory wall ───────────
  (function convDemo() {
    const KH = 3, KW = 3, K = 2, F32 = 4;
    const LADDER = [[64, 36], [96, 54], [128, 72], [160, 90], [192, 108], [256, 144], [320, 180], [426, 240], [640, 360], [854, 480], [1280, 720], [1920, 1080]];
    const STACK = 126400, BUDGET = Math.floor(STACK / 1.04), VERIFIED = 72244, HZ = 168e6;
    // Measured on the STM32F446RE (ferrite-embedded): streaming (width, cycles per row); direct (MACs, cycles per MAC).
    const STREAM = [[80, 6369], [160, 13088], [240, 18689], [320, 26819], [400, 34599], [480, 41001], [640, 54521], [800, 64543], [960, 80238], [1280, 97943]];
    const DIRECT = [[1764, 9.104], [4356, 8.947], [8100, 9.019], [12996, 8.985], [19044, 8.589], [26244, 7.977], [34596, 7.952], [44100, 7.911], [54756, 7.677], [66564, 7.808], [79524, 7.824]];
    const directBytes = (h, w) => F32 * (h * w + K * KH * KW + (h - KH + 1) * (w - KW + 1) * K);
    const streamBytes = (w) => F32 * (K * KH * w + w + K * (w - KW + 1)) + K * 2 * 4;
    function interp(pts, x) {
      let a, b;
      if (x <= pts[0][0]) { a = pts[0]; b = pts[1]; }
      else if (x >= pts[pts.length - 1][0]) { a = pts[pts.length - 2]; b = pts[pts.length - 1]; }
      else { for (let i = 1; i < pts.length; i++) if (pts[i][0] >= x) { a = pts[i - 1]; b = pts[i]; break; } }
      return Math.max(0, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]));
    }
    const chipSeconds = (kind, h, w) => {
      if (kind === "stream") return (K * h * interp(STREAM, w)) / HZ;
      const macs = (h - KH + 1) * (w - KW + 1) * KH * KW;
      return (K * macs * interp(DIRECT, macs)) / HZ;
    };
    const fmtTime = (s) => (s >= 1 ? s.toFixed(2) + " s" : (s * 1000).toFixed(s * 1000 >= 100 ? 0 : 1) + " ms");

    const sel = $("#conv-size");
    sel.innerHTML = LADDER.map(([w, h], i) => `<option value="${i}"${w === 1280 ? " selected" : ""}>${w}×${h}</option>`).join("");
    let W = 1280, H = 720;

    function numbers() {
      const db = directBytes(H, W), sb = streamBytes(W);
      $("#conv-mem-d").innerHTML = `${C.fmtBytes(db)} ${tagHTML("exact")}`;
      $("#conv-mem-s").innerHTML = `${C.fmtBytes(sb)} ${tagHTML("exact")}`;
      const fitD = db <= VERIFIED ? statusHTML(true, "Yes, sizes like this have run on the board", "")
        : db <= BUDGET ? statusHTML(true, "Predicted yes, not run on the board yet", "")
        : statusHTML(false, "", `No, ${(db / BUDGET).toFixed(db / BUDGET >= 10 ? 0 : 1)}× too big`);
      const fitS = sb <= VERIFIED ? statusHTML(true, "Yes", "") : sb <= BUDGET ? statusHTML(true, "Predicted yes", "") : statusHTML(false, "", "No");
      $("#conv-fit-d").innerHTML = fitD;
      $("#conv-fit-s").innerHTML = fitS;
      $("#conv-t-d").innerHTML = db <= BUDGET ? `${fmtTime(chipSeconds("direct", H, W))} ${tagHTML("proj")}` : `<span style="color:var(--muted)">doesn't fit, can't run</span>`;
      const ts = chipSeconds("stream", H, W);
      $("#conv-t-s").innerHTML = `${fmtTime(ts)} · ${(1 / ts).toFixed(ts > 1 ? 2 : 1)} fps ${tagHTML("proj")}`;
    }

    const wall = C.mount($("#conv-wall"), 250, (s, w, h) => {
      const m = { l: 52, r: 12, t: 12, b: 28 };
      const n = LADDER.length, step = (w - m.l - m.r) / n;
      const xi = (i) => m.l + step * (i + 0.5);
      const y = C.log(1e3, 3e7, h - m.b, m.t);
      const every = step < 44 ? 3 : step < 62 ? 2 : 1;
      C.axes(s, { w, h, m, x: xi, y, xTicks: LADDER.map((_, i) => i), yTicks: y.ticks([1]), yFmt: C.fmtBytes, xFmt: (i) => (i % every === (n - 1) % every ? `${LADDER[i][0]}×${LADDER[i][1]}` : "") });
      const cur = +sel.value;
      C.el("rect", { x: xi(cur) - step / 2, y: m.t, width: step, height: h - m.t - m.b, fill: "var(--accent-wash)" }, s);
      const line = (v, dash, label, color) => {
        const yy = Math.round(y(v)) + 0.5;
        C.el("line", { x1: m.l, x2: w - m.r, y1: yy, y2: yy, stroke: color, "stroke-width": 1.5, "stroke-dasharray": dash || null }, s);
        C.text(s, m.l + 6, yy - 5, label, { class: "lbl-mute" });
      };
      line(VERIFIED, "2 3", "", "var(--muted)");
      line(BUDGET, null, "stack limit", "var(--ink)");
      const series = [
        { f: ([ww, hh]) => directBytes(hh, ww), color: "var(--patina)", name: "full frame" },
        { f: ([ww]) => streamBytes(ww), color: "var(--accent)", name: "streaming" },
      ];
      series.forEach((sr) => {
        const vs = LADDER.map(sr.f);
        C.line(s, C.path(LADDER.map((_, i) => xi(i)), vs.map(y)), sr.color, 2.2);
        vs.forEach((v, i) => C.el("circle", { cx: xi(i), cy: y(v), r: i === cur ? 5.5 : 3.5, fill: sr.color, stroke: "var(--surface-solid)", "stroke-width": 2, class: "mk" }, s));
        const v = vs[cur], above = sr.name === "full frame";
        C.text(s, xi(cur) + (cur > n - 3 ? -8 : 8), y(v) + (above ? -9 : 16), C.fmtBytes(v), { class: "lbl", "text-anchor": cur > n - 3 ? "end" : "start", style: "font-weight:600" });
      });
      C.hover(s, { l: m.l, r: w - m.r, t: m.t, b: h - m.b }, (px) => {
        const i = Math.max(0, Math.min(n - 1, Math.floor((px - m.l) / step)));
        const [ww, hh] = LADDER[i];
        return { x: xi(i), text: `${ww}×${hh}\nfull frame  ${C.fmtBytes(directBytes(hh, ww))}\nstreaming   ${C.fmtBytes(streamBytes(ww))}\nstack limit ${C.fmtBytes(BUDGET)} (predicted)` };
      });
    });

    function load() {
      [W, H] = LADDER[+sel.value];
      numbers();
      wall();
    }
    sel.addEventListener("change", load);
    load();
  })();

  // ── Demo 3: Sentinel's Kalman filter ────────────────────
  (function kalmanDemo() {
    const scSel = $("#kf-sc"), sgIn = $("#kf-sigma"), qIn = $("#kf-q");
    const SKIP = 20, SEEDS = 8;
    let seed = 1, sim = null, sweep = null;
    const q = () => +Math.pow(10, +qIn.value).toPrecision(2);

    const plot = C.mount($("#kf-plot"), 250, (s, w, h) => {
      if (!sim) return;
      const m = { l: 40, r: 10, t: 8, b: 24 };
      const pts = sim.truth.concat(sim.meas);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      pts.forEach((p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); });
      const px = (x1 - x0) * 0.04, pz = (z1 - z0) * 0.08;
      const x = C.lin(x0 - px, x1 + px, m.l, w - m.r), y = C.lin(z0 - pz, z1 + pz, h - m.b, m.t);
      C.axes(s, { w, h, m, x, y, xTicks: x.ticks(6), yTicks: y.ticks(5), xFmt: (v) => v + " m", yFmt: (v) => v + "" });
      C.line(s, C.path(sim.truth.map((p) => x(p[0])), sim.truth.map((p) => y(p[2]))), "var(--ink-2)", 1.5);
      const g = C.el("g", { fill: "var(--patina)", opacity: 0.8, class: "mk" }, s);
      sim.meas.forEach((p) => C.el("circle", { cx: x(p[0]).toFixed(1), cy: y(p[2]).toFixed(1), r: 2.2 }, g));
      C.line(s, C.path(sim.est.slice(2).map((p) => x(p[0])), sim.est.slice(2).map((p) => y(p[2]))), "var(--accent)", 2.2);
      C.hover(s, { l: m.l, r: w - m.r, t: m.t, b: h - m.b }, (mx, my) => {
        let best = 0, bd = Infinity;
        sim.truth.forEach((p, i) => { const d = (x(p[0]) - mx) ** 2 + (y(p[2]) - my) ** 2; if (d < bd) { bd = d; best = i; } });
        const t = sim.truth[best], me = sim.meas[best], es = sim.est[best];
        const err = (a) => Math.hypot(a[0] - t[0], a[1] - t[1], a[2] - t[2]).toFixed(2);
        return { text: `t = ${sim.t[best].toFixed(2)} s\nsensor error ${err(me)} m\nfilter error ${err(es)} m` };
      });
    });

    const sweepChart = C.mount($("#kf-sweep"), 250, (s, w, h) => {
      if (!sweep) return;
      const m = { l: 40, r: 12, t: 8, b: 24 };
      const x = C.log(1e-3, 10, m.l, w - m.r);
      const hi = Math.max(sweep.raw, ...sweep.est) * 1.12;
      const y = C.lin(0, hi, h - m.b, m.t);
      C.axes(s, { w, h, m, x, y, xTicks: x.ticks([1]), yTicks: y.ticks(4), xFmt: (v) => "q " + v, yFmt: (v) => v + " m" });
      const ry = Math.round(y(sweep.raw)) + 0.5;
      C.el("line", { x1: m.l, x2: w - m.r, y1: ry, y2: ry, stroke: "var(--ink-2)", "stroke-width": 2 }, s);
      C.line(s, C.path(sweep.q.map(x), sweep.est.map(y)), "var(--accent)", 2.2);
      const cq = q(), cy = y(sweep.current);
      C.el("line", { x1: x(cq), x2: x(cq), y1: m.t, y2: h - m.b, stroke: "var(--ink)", "stroke-width": 1, opacity: 0.4 }, s);
      C.el("circle", { cx: x(cq), cy, r: 5.5, fill: "var(--accent)", stroke: "var(--surface-solid)", "stroke-width": 2, class: "mk" }, s);
      C.text(s, x(cq) + (x(cq) > w - 90 ? -9 : 9), cy - 8, sweep.current.toFixed(2) + " m", { class: "lbl", "text-anchor": x(cq) > w - 90 ? "end" : "start", style: "font-weight:600" });
      C.text(s, w - m.r - 4, ry - 6, "raw sensor " + sweep.raw.toFixed(2) + " m", { class: "lbl-mute", "text-anchor": "end" });
      C.hover(s, { l: m.l, r: w - m.r, t: m.t, b: h - m.b }, (px) => {
        const lq = Math.log10(x.inv(px));
        let i = 0; sweep.q.forEach((v, k) => { if (Math.abs(Math.log10(v) - lq) < Math.abs(Math.log10(sweep.q[i]) - lq)) i = k; });
        return { x: x(sweep.q[i]), text: `q = ${sweep.q[i].toPrecision(2)}\nfiltered ${sweep.est[i].toFixed(3)} m\nraw sensor ${sweep.raw.toFixed(3)} m` };
      });
    });

    function meanErr(sc, sigma, qq) {
      let est = 0, raw = 0;
      for (let k = 1; k <= SEEDS; k++) {
        const o = KALMAN.simulate(sc, sigma, qq, 1000 + k);
        est += KALMAN.rmse(o.est, o.truth, SKIP); raw += KALMAN.rmse(o.meas, o.truth, SKIP);
      }
      return { est: est / SEEDS, raw: raw / SEEDS };
    }
    function computeSweep() {
      const sc = scSel.value, sigma = +sgIn.value;
      const qs = [], est = [];
      let raw = 0;
      for (let e = -3; e <= 1.0001; e += 1 / 3) {
        const qq = Math.pow(10, e), r = meanErr(sc, sigma, qq);
        qs.push(qq); est.push(r.est); raw = r.raw;
      }
      sweep = { q: qs, est, raw, current: meanErr(sc, sigma, q()).est };
      sweepChart();
    }
    function computeRun() {
      const sc = scSel.value, sigma = +sgIn.value, qq = q();
      $("#kf-sigma-out").textContent = sigma.toFixed(2) + " m";
      $("#kf-q-out").textContent = qq < 0.01 ? qq.toFixed(4) : qq < 1 ? qq.toFixed(3) : qq.toFixed(1);
      sim = KALMAN.simulate(sc, sigma, qq, seed);
      const raw = KALMAN.rmse(sim.meas, sim.truth, SKIP), est = KALMAN.rmse(sim.est, sim.truth, SKIP);
      $("#kf-raw").innerHTML = `${raw.toFixed(2)} m ${tagHTML("sim")}`;
      $("#kf-est").innerHTML = `${est.toFixed(2)} m ${tagHTML("sim")}`;
      const d = (est - raw) / raw * 100;
      $("#kf-verdict").innerHTML = d <= 0 ? statusHTML(true, `${Math.abs(d).toFixed(0)} % lower than the raw sensor`, "")
                                          : statusHTML(false, "", `${d.toFixed(0)} % higher than the raw sensor`);
      plot();
      if (sweep) { sweep.current = meanErr(sc, sigma, qq).est; sweepChart(); }
    }
    const slowSweep = debounce(computeSweep, 150);
    scSel.addEventListener("change", () => { computeRun(); computeSweep(); });
    sgIn.addEventListener("input", () => { computeRun(); slowSweep(); });
    qIn.addEventListener("input", computeRun);
    $("#kf-redraw").addEventListener("click", () => { seed++; computeRun(); });
    computeRun();
    computeSweep();
  })();

  // ── Demo 4: Classifhear framing explorer ────────────────
  (function framingDemo() {
    const srcSel = $("#fr-src"), nSel = $("#fr-n"), hopSel = $("#fr-hop"), cen = $("#fr-center"), playBtn = $("#fr-play");
    let sig = null, sr = 22050, impulseAt = null, fileSig = null;

    function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1; }
    function make(kind) {
      sr = 22050; impulseAt = null;
      if (kind === "impulse") { const y = new Float32Array(sr); y[sr / 2] = 1; impulseAt = 0.5; return y; }
      if (kind === "bark") {
        const n = Math.round(sr * 1.8), y = new Float32Array(n), r = rng(3);
        [0.18, 0.62, 1.12].forEach((t0, j) => {
          const i0 = Math.round(t0 * sr), len = Math.round(0.16 * sr); let ph = 0;
          for (let i = 0; i < len && i0 + i < n; i++) {
            const t = i / sr, env = Math.min(1, t / 0.006) * Math.exp(-t / 0.045);
            ph += (2 * Math.PI * (520 - 900 * t - 30 * j)) / sr;
            y[i0 + i] += env * (0.55 * Math.sin(ph) + 0.25 * Math.sin(2 * ph) + 0.35 * r());
          }
        });
        return y;
      }
      const n = sr * 3, y = new Float32Array(n), r = rng(5); let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, f = 900 + 350 * Math.sin(2 * Math.PI * 0.8 * t);
        ph += (2 * Math.PI * f) / sr;
        y[i] = 0.45 * Math.sin(ph) + 0.12 * Math.sin(3 * ph) + 0.03 * r();
      }
      return y;
    }

    // librosa conventions: center pads N/2 on both sides (zeros for RMS, edge values for ZCR),
    // frame i is placed at t = i * hop / sr.
    function features(y, N, hop, center) {
      const pad = center ? N / 2 : 0, L = y.length;
      const nF = center ? 1 + Math.floor(L / hop) : 1 + Math.floor((L - N) / hop);
      const rmsA = new Float32Array(Math.max(0, nF)), zcrA = new Float32Array(Math.max(0, nF));
      const at = (k, edge) => (k < 0 ? (edge ? y[0] : 0) : k >= L ? (edge ? y[L - 1] : 0) : y[k]);
      for (let f = 0; f < nF; f++) {
        const s0 = f * hop - pad;
        let e = 0, z = 0, prev = at(s0, true) >= 0;
        for (let k = 0; k < N; k++) {
          const v = at(s0 + k, false); e += v * v;
          const pos = at(s0 + k, true) >= 0;
          if (k > 0 && pos !== prev) z++;
          prev = pos;
        }
        rmsA[f] = Math.sqrt(e / N); zcrA[f] = z / N;
      }
      return { rms: rmsA, zcr: zcrA, n: nF };
    }

    let feats = null;
    const chart = C.mount($("#fr-plot"), 300, (s, w, h) => {
      if (!sig || !feats) return;
      const m = { l: 46, r: 10, t: 6, b: 24 };
      const dur = sig.length / sr, x = C.lin(0, dur, m.l, w - m.r);
      const hop = +hopSel.value;
      const gap = 14, avail = h - m.t - m.b - 2 * gap;
      const panes = [
        { t: m.t, h: avail * 0.36 },
        { t: m.t + avail * 0.36 + gap, h: avail * 0.34 },
        { t: m.t + avail * 0.7 + 2 * gap, h: avail * 0.3 },
      ];
      const ticks = x.ticks(w < 420 ? 4 : 7);
      panes.forEach((p, k) => {
        const g = C.el("g", { class: "grid" }, s);
        ticks.forEach((v) => { const xx = Math.round(x(v)) + 0.5; C.el("line", { x1: xx, x2: xx, y1: p.t, y2: p.t + p.h }, g); });
        C.el("line", { class: "ax-base", x1: m.l, x2: w - m.r, y1: Math.round(p.t + p.h) + 0.5, y2: Math.round(p.t + p.h) + 0.5 }, s);
        C.text(s, m.l - 6, p.t + 10, ["wave", "RMS", "ZCR"][k], { "text-anchor": "end" });
      });
      ticks.forEach((v) => C.text(s, x(v), h - m.b + 15, v.toFixed(v < 1 && dur < 2 ? 1 : 1) + " s", { "text-anchor": "middle" }));

      // waveform as a min/max band per pixel
      const p0 = panes[0], cols = Math.max(1, Math.floor(w - m.l - m.r));
      let A = 0; for (let i = 0; i < sig.length; i++) A = Math.max(A, Math.abs(sig[i]));
      A = A || 1;
      const yw = C.lin(-A, A, p0.t + p0.h, p0.t);
      let top = "", bot = "";
      for (let c = 0; c < cols; c++) {
        const i0 = Math.floor((c / cols) * sig.length), i1 = Math.max(i0 + 1, Math.floor(((c + 1) / cols) * sig.length));
        let lo = 0, hi = 0; for (let i = i0; i < i1; i++) { lo = Math.min(lo, sig[i]); hi = Math.max(hi, sig[i]); }
        const xx = (m.l + c + 0.5).toFixed(1);
        top += (c ? "L" : "M") + xx + " " + Math.min(yw(hi), yw(0) - 0.5).toFixed(1);
        bot = "L" + xx + " " + Math.max(yw(lo), yw(0) + 0.5).toFixed(1) + bot;
      }
      C.el("path", { d: top + bot + "Z", fill: "var(--hair-strong)", class: "mk" }, s);

      const t = Array.from(feats.rms, (_, i) => (i * hop) / sr);
      const draw = (arr, pane, color) => {
        let mx = 0; for (const v of arr) mx = Math.max(mx, v);
        const y = C.lin(0, (mx || 1) * 1.1, pane.t + pane.h, pane.t);
        C.line(s, C.path(t.map(x), Array.from(arr, y)), color, 2);
        C.text(s, w - m.r - 2, pane.t + 10, "max " + (mx === 0 ? "0" : mx < 0.01 ? mx.toExponential(1) : mx.toFixed(3)), { "text-anchor": "end" });
      };
      draw(feats.rms, panes[1], "var(--accent)");
      draw(feats.zcr, panes[2], "var(--patina)");
      if (impulseAt !== null) {
        const xx = Math.round(x(impulseAt)) + 0.5;
        C.el("line", { x1: xx, x2: xx, y1: m.t, y2: h - m.b, stroke: "var(--plum)", "stroke-width": 1.5, "stroke-dasharray": "4 3" }, s);
      }
      C.hover(s, { l: m.l, r: w - m.r, t: m.t, b: h - m.b }, (px) => {
        const i = Math.max(0, Math.min(feats.n - 1, Math.round((x.inv(px) * sr) / hop)));
        return { x: x(t[i]), text: `frame ${i} at ${(t[i] * 1000).toFixed(1)} ms\nRMS ${feats.rms[i].toFixed(4)}\nZCR ${feats.zcr[i].toFixed(4)}` };
      });
    });

    function compute() {
      const N = +nSel.value, hop = +hopSel.value, center = cen.checked;
      if (!sig || sig.length < N) { feats = null; chart(); return; }
      feats = features(sig, N, hop, center);
      $("#fr-frames").textContent = feats.n.toLocaleString("en");
      $("#fr-win").innerHTML = `${(N / sr * 1000).toFixed(1)} <small>ms</small> · ${(hop / sr * 1000).toFixed(1)} <small>ms</small>`;
      $("#fr-overlap").textContent = `${(100 * (1 - hop / N)).toFixed(1)} % overlap between neighbouring frames`;
      $("#fr-mark-key").hidden = impulseAt === null;
      if (impulseAt !== null) {
        let mx = 0; feats.rms.forEach((v) => { mx = Math.max(mx, v); });
        let sum = 0, cnt = 0; feats.rms.forEach((v, i) => { if (v >= mx * 0.999) { sum += (i * hop) / sr; cnt++; } });
        const shift = (sum / cnt - impulseAt) * 1000, ok = Math.abs(shift) <= (hop / sr) * 1000;
        $("#fr-shift").innerHTML = `${shift > 0 ? "+" : ""}${shift.toFixed(1)} <small>ms</small> ${tagHTML("web")}`;
        $("#fr-shift-note").innerHTML = ok ? statusHTML(true, "Aligned, within one hop", "")
          : statusHTML(false, "", `Early by about half a frame (${(N / 2 / sr * 1000).toFixed(1)} ms)`);
      } else {
        $("#fr-shift").textContent = "–";
        $("#fr-shift-note").textContent = "Only measurable on the impulse test.";
      }
      chart();
    }

    function setSource() {
      stopAudio();
      const k = srcSel.value;
      $("#fr-file-wrap").hidden = k !== "file";
      if (k === "file") { sig = fileSig ? fileSig.y : null; if (fileSig) sr = fileSig.sr; impulseAt = null; }
      else sig = make(k);
      compute();
    }

    let actx = null, asrc = null;
    function stopAudio() { if (asrc) { try { asrc.stop(); } catch (_) {} asrc = null; } playBtn.setAttribute("aria-pressed", "false"); }
    playBtn.addEventListener("click", () => {
      if (asrc) { stopAudio(); return; }
      if (!sig) return;
      try {
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        if (actx.state === "suspended") actx.resume();
        const b = actx.createBuffer(1, sig.length, sr), ch = b.getChannelData(0);
        let A = 0; for (let i = 0; i < sig.length; i++) A = Math.max(A, Math.abs(sig[i]));
        const g = impulseAt !== null ? 0.5 : 0.8 / (A || 1);
        for (let i = 0; i < sig.length; i++) ch[i] = sig[i] * g;
        asrc = actx.createBufferSource(); asrc.buffer = b; asrc.connect(actx.destination);
        asrc.onended = stopAudio; asrc.start(); playBtn.setAttribute("aria-pressed", "true");
      } catch (_) { stopAudio(); }
    });

    $("#fr-file").addEventListener("change", async (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      try {
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        const buf = await actx.decodeAudioData(await f.arrayBuffer());
        const n = Math.min(buf.length, Math.round(buf.sampleRate * 6)), y = new Float32Array(n);
        for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) y[i] += d[i] / buf.numberOfChannels; }
        fileSig = { y, sr: buf.sampleRate };
        setSource();
      } catch (_) {
        $("#fr-frames").textContent = "Couldn't decode that file. Try a WAV or MP3.";
      }
    });
    srcSel.addEventListener("change", setSource);
    [nSel, hopSel, cen].forEach((c) => c.addEventListener("change", compute));
    setSource();
  })();


  // ── Motion: scroll reveal, masthead, active section, soft value changes ──
  (function motion() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mast = $(".mast");
    const onScroll = () => mast.classList.toggle("scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    if (!("IntersectionObserver" in window)) return;
    const links = new Map($$(".mast nav a").map((a) => [a.getAttribute("href").slice(1), a]));
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const a = links.get(e.target.id);
        if (a && e.isIntersecting) { links.forEach((l) => l.classList.remove("active")); a.classList.add("active"); }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    $$(".sheet[id]").forEach((s) => spy.observe(s));

    // Values that change under the controls settle in softly.
    const mo = new MutationObserver((muts) => {
      const seen = new Set();
      muts.forEach((m) => {
        const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        const host = t && t.closest(".ro-v, .ro-note, .compare td");
        if (!host || seen.has(host)) return;
        seen.add(host);
        // Only a value that really changed settles in; rewriting the same text stays still.
        if (host.dataset.v === host.textContent) return;
        host.dataset.v = host.textContent;
        host.classList.remove("bump"); void host.offsetWidth; host.classList.add("bump");
      });
    });
    $$(".ro-v, .ro-note, .compare td").forEach((n) => { n.dataset.v = n.textContent; mo.observe(n, { childList: true, characterData: true, subtree: true }); });

    if (reduce) return;
    // Reveal only what starts below the fold; nothing on the first screen is ever hidden.
    const groups = [".system-head", ".bd-apps", ".bd-core", ".bd-hw", ".sheet .rail", ".sheet .main", ".foot"];
    const fold = window.innerHeight;
    const items = [];
    groups.forEach((sel) => $$(sel).forEach((g) => {
      const kids = g.classList.contains("main") || g.classList.contains("bd-apps") ? Array.from(g.children) : [g];
      kids.forEach((k, i) => { if (k.getBoundingClientRect().top > fold) { k.classList.add("rv"); k.style.setProperty("--i", Math.min(i, 3)); items.push(k); } });
    }));
    if (!items.length) return;
    document.documentElement.classList.add("rv-armed");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.04 });
    items.forEach((k) => io.observe(k));
    window.addEventListener("beforeprint", () => items.forEach((k) => k.classList.add("in")));
  })();

  // ── Copy e-mail ─────────────────────────────────────────
  $$("[data-copy]").forEach((b) => b.addEventListener("click", () => {
    const n = document.getElementById(b.dataset.copy), txt = n.textContent.trim();
    const done = () => { b.textContent = "Copied"; setTimeout(() => { b.textContent = "Copy"; }, 1600); };
    const fallback = () => { const r = document.createRange(); r.selectNodeContents(n); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "Selected"; };
    try { navigator.clipboard.writeText(txt).then(done, fallback); } catch (_) { fallback(); }
  }));
})();
