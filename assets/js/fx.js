// Small effects: mono labels that resolve out of noise like a decoded signal, each time their page
// comes on screen; and a pointer light (sheen, lit rim, tilt) on cards. Purely decorative: with
// reduced motion, or without this script, everything reads the same, just still.
(function () {
  "use strict";
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Decode: characters cycle through noise, then lock, left to right ──
  // Only mono labels, so nothing reflows while they scramble.
  const NOISE = "01<>/\\|=+*#%&$@?!^~[]{}";
  function decode(el) {
    if (el._decoding) return;
    const nodes = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue.trim()) nodes.push({ n, text: n.nodeValue });
    const total = nodes.reduce((s, x) => s + x.text.length, 0);
    if (!total) return;
    el._decoding = true;
    const t0 = performance.now(), dur = Math.min(900, 380 + total * 22);
    (function frame(now) {
      const k = (now - t0) / dur;
      let i = 0;
      nodes.forEach((x) => {
        let out = "";
        for (const ch of x.text) {
          const lock = (i++ / total) * 0.7 + 0.3;  // the first characters lock first
          out += k >= lock || !/[A-Za-z0-9]/.test(ch) ? ch : NOISE[(Math.random() * NOISE.length) | 0];
        }
        x.n.nodeValue = out;
      });
      if (k < 1) requestAnimationFrame(frame);
      else { nodes.forEach((x) => { x.n.nodeValue = x.text; }); el._decoding = false; }
    })(t0);
  }

  const LABELS = ".kicker > span, .rail-label, h3.h, .features h3, .phase h3, .demo-title, .bd-sig, .legend-strip > span:first-child";
  if (!reduce && "IntersectionObserver" in window) {
    // Decode when a label comes on screen; re-arm it once its page has gone, so the next visit decodes again.
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      const el = e.target;
      if (e.isIntersecting && !el._seen) { el._seen = true; setTimeout(() => decode(el), 120); }
    }), { threshold: 0.9 });
    $$(LABELS).forEach((el) => io.observe(el));
    document.addEventListener("pagechange", () => $$(LABELS).forEach((el) => {
      const p = el.closest(".page");
      if (p && !p.classList.contains("on")) el._seen = false;
    }));
  }

  // ── Rust: the surname and the core plate oxidise, slowly, the first time their page is on screen ──
  // The #oxidize filters in index.html hold the animation; this only starts it once the page has
  // settled. With reduced motion the metal is simply rusted already.
  const RUST = [{ page: "home", anim: "rust-name", delay: 700 }, { page: "overview", anim: "rust-plate", delay: 900 }];
  const paged = document.documentElement.classList.contains("paged");
  function rusted(a) {
    const m = a.parentNode;
    m.setAttribute("values", a.getAttribute("values").split(";").pop());
    a.remove();
  }
  function rust() {
    RUST.forEach((r) => {
      const a = document.getElementById(r.anim), p = document.getElementById(r.page);
      if (r.done || !a || !p || (paged && !p.classList.contains("on"))) return;
      r.done = true;
      if (reduce || typeof a.beginElement !== "function") rusted(a);
      else setTimeout(() => a.beginElement(), r.delay);
    });
  }
  rust();
  document.addEventListener("pagechange", rust);

  // ── Pointer light on cards ────────────────────────────────
  const LIT = ".bd-app, .fig, .phase, .ro, .limits li, .skills > div, .plan li, .contact-lines > div, .demo-cell, .code";
  const TILT = ".bd-app, .fig";
  let lit = null, px = 0, py = 0, raf = 0;
  function off(el) {
    el.classList.remove("lit");
    ["--rx", "--ry"].forEach((k) => el.style.removeProperty(k));
  }
  function apply() {
    raf = 0;
    if (!lit) return;
    const r = lit.getBoundingClientRect(), x = (px - r.left) / r.width, y = (py - r.top) / r.height;
    lit.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
    lit.style.setProperty("--my", (y * 100).toFixed(1) + "%");
    if (!reduce && lit.matches(TILT)) {
      lit.style.setProperty("--rx", ((0.5 - y) * 7).toFixed(2) + "deg");
      lit.style.setProperty("--ry", ((x - 0.5) * 9).toFixed(2) + "deg");
    }
  }
  document.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const el = e.target.closest ? e.target.closest(LIT) : null;
    if (el !== lit) { if (lit) off(lit); lit = el; if (el) el.classList.add("lit"); }
    if (!el) return;
    px = e.clientX; py = e.clientY;
    if (!raf) raf = requestAnimationFrame(apply);
  }, { passive: true });
  document.addEventListener("pointerleave", () => { if (lit) off(lit); lit = null; });
  document.addEventListener("pagechange", () => { if (lit) off(lit); lit = null; });
})();
