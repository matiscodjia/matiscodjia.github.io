// Minimal SVG charting: scales, axes with recessive grids, paths, one shared tooltip,
// and charts that redraw at their container's real pixel width (text stays legible).
(function (root) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function text(parent, x, y, str, attrs) {
    const t = el("text", Object.assign({ x, y }, attrs || {}), parent);
    t.textContent = str;
    return t;
  }

  function lin(d0, d1, r0, r1) {
    const f = (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
    f.inv = (p) => d0 + ((p - r0) / (r1 - r0 || 1)) * (d1 - d0);
    f.ticks = (n) => {
      const span = d1 - d0, raw = span / Math.max(1, n), mag = Math.pow(10, Math.floor(Math.log10(raw)));
      const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
      const out = [];
      for (let v = Math.ceil(d0 / step - 1e-9) * step; v <= d1 + step * 1e-9; v += step) out.push(+v.toFixed(12));
      return out;
    };
    return f;
  }
  function log(d0, d1, r0, r1) {
    const l0 = Math.log10(d0), l1 = Math.log10(d1);
    const f = (v) => r0 + ((Math.log10(Math.max(v, 1e-300)) - l0) / (l1 - l0)) * (r1 - r0);
    f.inv = (p) => Math.pow(10, l0 + ((p - r0) / (r1 - r0)) * (l1 - l0));
    f.ticks = (mults) => {
      const out = [];
      for (let e = Math.floor(l0); e <= Math.ceil(l1); e++) for (const m of mults || [1]) {
        const v = m * Math.pow(10, e);
        if (v >= d0 * 0.999 && v <= d1 * 1.001) out.push(v);
      }
      return out;
    };
    return f;
  }

  function path(xs, ys) {
    let d = "", pen = false;
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i], y = ys[i];
      if (!isFinite(x) || !isFinite(y)) { pen = false; continue; }
      d += (pen ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
      pen = true;
    }
    return d;
  }

  // Gridlines + tick labels. o: {x, y, w, h, m:{l,r,t,b}, xTicks, yTicks, xFmt, yFmt}
  function axes(svg, o) {
    const g = el("g", { class: "grid" }, svg);
    const L = o.m.l, R = o.w - o.m.r, T = o.m.t, B = o.h - o.m.b;
    (o.yTicks || []).forEach((v) => {
      const y = Math.round(o.y(v)) + 0.5;
      el("line", { x1: L, x2: R, y1: y, y2: y }, g);
      text(svg, L - 6, y + 3.5, o.yFmt ? o.yFmt(v) : String(v), { "text-anchor": "end" });
    });
    (o.xTicks || []).forEach((v, i) => {
      const x = Math.round(o.x(v)) + 0.5;
      if (o.xGrid) el("line", { x1: x, x2: x, y1: T, y2: B }, g);
      const label = o.xFmt ? o.xFmt(v, i) : String(v);
      if (label !== "") text(svg, x, B + 15, label, { "text-anchor": "middle" });
    });
    el("line", { class: "ax-base", x1: L, x2: R, y1: B + 0.5, y2: B + 0.5 }, svg);
  }

  // A chart that owns an <svg>: draw(svg, width) runs now and on every resize.
  function mount(svg, height, draw) {
    let w = 0;
    const render = () => {
      w = Math.max(240, Math.floor(svg.parentNode.clientWidth - (parseFloat(getComputedStyle(svg.parentNode).paddingLeft) || 0) - (parseFloat(getComputedStyle(svg.parentNode).paddingRight) || 0)));
      const h = typeof height === "function" ? height(w) : height;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svg.setAttribute("width", w);
      svg.setAttribute("height", h);
      draw(svg, w, h);
    };
    // First time the chart is on screen, redraw it with its data lines tracing in.
    if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        svg.classList.add("drawing");
        render();
        setTimeout(() => svg.classList.remove("drawing"), 2600);
      }, { threshold: 0.35 });
      io.observe(svg);
    }
    if ("ResizeObserver" in window) {
      let last = -1;
      new ResizeObserver(() => {
        const cw = svg.parentNode.clientWidth;
        if (cw !== last) { last = cw; render(); }
      }).observe(svg.parentNode);
    } else window.addEventListener("resize", render);
    render();
    return render;
  }

  // One tooltip for the whole page.
  let tipEl = null;
  function tip(clientX, clientY, str) {
    if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tip"; tipEl.setAttribute("role", "status"); document.body.appendChild(tipEl); }
    tipEl.textContent = str;
    tipEl.hidden = false;
    const r = tipEl.getBoundingClientRect();
    let x = clientX + 14, y = clientY + 14;
    if (x + r.width > window.innerWidth - 8) x = clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = clientY - r.height - 14;
    tipEl.style.left = Math.max(8, x) + "px";
    tipEl.style.top = Math.max(8, y) + "px";
  }
  function untip() { if (tipEl) tipEl.hidden = true; }

  // Transparent hit layer over the plot; onMove(px, py) returns {x?, text} or null.
  function hover(svg, rect, onMove) {
    const guide = el("line", { x1: 0, x2: 0, y1: rect.t, y2: rect.b, stroke: "var(--ink)", "stroke-width": 1, opacity: 0, "pointer-events": "none" }, svg);
    const hit = el("rect", { x: rect.l, y: rect.t, width: Math.max(0, rect.r - rect.l), height: Math.max(0, rect.b - rect.t), fill: "transparent" }, svg);
    const move = (ev) => {
      const pt = svg.getBoundingClientRect();
      const sx = (ev.clientX - pt.left) * (svg.viewBox.baseVal.width / pt.width);
      const sy = (ev.clientY - pt.top) * (svg.viewBox.baseVal.height / pt.height);
      const res = onMove(sx, sy);
      if (!res) { guide.setAttribute("opacity", 0); untip(); return; }
      if (res.x !== undefined) { guide.setAttribute("x1", res.x); guide.setAttribute("x2", res.x); guide.setAttribute("opacity", 0.35); }
      tip(ev.clientX, ev.clientY, res.text);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { guide.setAttribute("opacity", 0); untip(); });
    return hit;
  }

  function fmtBytes(b) {
    if (b >= 1e6) return (b / 1e6).toFixed(b >= 1e8 ? 0 : 1) + " MB";
    if (b >= 1e3) return (b / 1e3).toFixed(b >= 1e5 ? 0 : 1) + " kB";
    return Math.round(b) + " B";
  }

  // A data series line: soft fade on every redraw, traced in on first view.
  function line(parent, d, stroke, width, extra) {
    return el("path", Object.assign({ d, fill: "none", stroke, "stroke-width": width || 2, "stroke-linejoin": "round", "stroke-linecap": "round", class: "ln", pathLength: 1 }, extra || {}), parent);
  }

  root.C = { el, text, lin, log, path, axes, mount, tip, untip, hover, fmtBytes, line };
})(window);
