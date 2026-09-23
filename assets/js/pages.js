// Pages: one section on screen at a time, side by side on a horizontal track.
// The wheel scrolls a page as usual; once it's at its end, a little more wheel pulls the next
// page in from the right (at its top, the previous one from the left). Touch: swipe sideways.
// ← and → turn the page too. The URL hash names the page, so links, the back button and
// bookmarks all work. Loaded before the demos and independent of them; they listen for
// "pagechange" to pause what goes off screen.
//
// Motion: one number, pos (where the track is, in pages), follows goal on a spring. Everything
// that moves reads it: the track, each page's parallax layers, the scan line on the seam between
// two pages, the progress trace under the masthead, the graticule behind.
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const main = $(".wrap"), track = $(".track");
  const list = track ? $$(":scope > .page", track) : [];
  if (!list.length) return;
  // Only now does the layout switch to pages: if this script never runs, the page reads top to bottom.
  document.documentElement.classList.add("paged");

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mast = $(".mast"), nav = $(".mast nav"), links = $$("a", nav);
  const seam = $(".seam"), progress = $(".mast-progress"), grat = $(".graticule"), ambient = $(".ambient");
  const names = {};
  links.forEach((a) => { names[a.getAttribute("href").slice(1)] = a.textContent; });
  const title = document.title;
  const PULL = 240;   // px of wheel past a page's end before the next page comes in (about 3 notches)
  let at = -1, current = null, via = null;

  // ── Parallax layers ───────────────────────────────────────
  // While pages slide, their layers travel at different speeds: the rail hangs back, the blocks of a
  // page fan out behind its header, the home page's depth field drifts slowest. Each layer moves by
  // d × k × viewport width, d being how far its page is from the screen, in pages. Transforms are
  // written on the layers themselves, so a slide restyles a few elements, not whole pages.
  const FAN = [0.03, 0.07, 0.11, 0.15];
  list.forEach((p) => {
    const L = [];
    const add = (el, k, fade) => { if (el) L.push({ el, k, fade }); };
    $$(".sheet > .rail", p).forEach((el) => add(el, -0.14, 0.85));
    [".sheet > .main > *", ".front > div > *", ".system > *"].forEach((sel) =>
      $$(sel, p).forEach((el, i) => add(el, FAN[Math.min(i, FAN.length - 1)], 0.6)));
    add($(":scope > .legend-strip", p), 0.18, 0.6);
    add($(":scope > .field-cap", p), 0.1, 0.6);
    add($(":scope > .field", p), -0.26, 0);
    p._layers = L;
  });
  function layers(p, d) {
    const vw = window.innerWidth, ad = Math.abs(d);
    for (const l of p._layers) {
      l.el.style.transform = d ? `translate3d(${(d * l.k * vw).toFixed(1)}px, 0, 0)` : "";
      if (l.fade) l.el.style.opacity = d ? (1 - ad * l.fade).toFixed(3) : "";
    }
  }

  // ── The spring ────────────────────────────────────────────
  // Stiff enough to feel quick, a touch under critical damping so a page lands with the faintest give.
  const STIFF = 64, DAMP = 2 * Math.sqrt(STIFF) * 0.86;
  let pos = 0, vel = 0, goal = 0, raf = 0, lastT = 0, dragging = false;

  function render() {
    track.style.setProperty("--pos", pos.toFixed(5));
    if (!reduce) list.forEach((p, k) => {
      const d = Math.max(-1.2, Math.min(1.2, k - pos));
      if (p._d === d) return;  // pages far away stay put
      p._d = d;
      layers(p, d);
    });
    // the seam between the two pages on screen, lit while it crosses
    const f = pos - Math.floor(pos);
    if (seam) {
      seam.style.transform = `translate3d(${((1 - f) * main.clientWidth).toFixed(1)}px, 0, 0)`;
      seam.style.opacity = f > 0.001 && !reduce ? Math.min(1, Math.sin(Math.PI * f) * 1.6).toFixed(3) : 0;
    }
    if (progress) progress.style.setProperty("--p", ((pos + 1) / list.length).toFixed(4));
    if (grat) grat.style.transform = `translate3d(${(-((pos * 96) % 28)).toFixed(1)}px, 0, 0)`;
  }
  function tick(t) {
    const dt = lastT ? Math.min(0.034, (t - lastT) / 1000) : 1 / 60;
    lastT = t;
    if (!dragging) {
      vel += (-STIFF * (pos - goal) - DAMP * vel) * dt;
      pos += vel * dt;
      if (Math.abs(pos - goal) < 0.0003 && Math.abs(vel) < 0.003) { pos = goal; vel = 0; render(); raf = 0; lastT = 0; return; }
    }
    render();
    raf = requestAnimationFrame(tick);
  }
  function kick() {
    if (reduce) { pos = goal; vel = 0; render(); return; }
    if (!raf) { lastT = 0; raf = requestAnimationFrame(tick); }
  }
  // How far the neighbouring page peeks in while the wheel or a finger pulls, as a fraction of a page.
  const peekFrac = () => Math.min(160, main.clientWidth * 0.12) / (main.clientWidth || 1);
  function pull(frac) { if (reduce) return; goal = at + frac; kick(); }
  const settling = () => Math.abs(pos - at) > 0.18;
  const syncMast = () => mast.classList.toggle("scrolled", !!current && current.scrollTop > 8);

  function show(id, how) {
    let i = list.findIndex((p) => p.id === id);
    if (i < 0) i = 0;
    if (i === at) { goal = at; kick(); return; }
    const back = i < at, first = at < 0;
    at = i;
    current = list[i];
    list.forEach((p, k) => { p.classList.toggle("on", k === i); if (p.inert !== (k !== i)) p.inert = k !== i; });
    // Scrolling up into a page lands on its end, as if it were one long page; anything else starts at its top.
    current.scrollTop = how === "wheel" && back ? current.scrollHeight : 0;
    goal = i;
    if (first) { pos = i; vel = 0; render(); } else kick();

    links.forEach((a) => {
      const on = a.getAttribute("href") === "#" + current.id;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      // on a narrow screen the nav scrolls sideways: bring the current entry to its middle
      if (on) { const ar = a.getBoundingClientRect(), nr = nav.getBoundingClientRect(); nav.scrollLeft += ar.left + ar.width / 2 - (nr.left + nr.width / 2); }
    });
    // the ambient light takes the colour of the page's own icon
    const ico = $(".rail .ico, .ico", current);
    if (ambient) ambient.style.setProperty("--mood", (ico && ico.style.getPropertyValue("--h")) || "var(--amber)");
    document.title = names[current.id] ? `${names[current.id]} · ${title}` : title;
    if (window.C) window.C.untip();
    syncMast();
    current.focus({ preventScroll: true });  // so the keyboard scrolls the page on screen
    document.dispatchEvent(new CustomEvent("pagechange", { detail: current.id }));
  }

  function go(step, how) {
    const p = list[at + step];
    if (!p) return false;
    via = how;
    goal = at + step;  // start moving now; the hashchange confirms it
    kick();
    location.hash = p.id;
    return true;
  }
  window.addEventListener("hashchange", () => { show(decodeURIComponent(location.hash.slice(1)), via || "link"); via = null; });
  list.forEach((p) => p.addEventListener("scroll", () => { if (p === current) syncMast(); }, { passive: true }));
  // The current page's own nav entry scrolls it back to its top.
  links.forEach((a) => a.addEventListener("click", () => {
    if (current && a.getAttribute("href") === "#" + current.id) current.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }));
  window.addEventListener("resize", () => { list.forEach((p) => { p._d = null; }); render(); });

  // True when something under the pointer can still scroll that way, so the wheel belongs to it.
  function scrolls(el, dx, dy) {
    for (; el && el !== main; el = el.parentElement) {
      const s = getComputedStyle(el);
      if (dy && /auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1
          && (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0)) return true;
      if (dx && /auto|scroll/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1
          && (dx > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0)) return true;
    }
    return false;
  }

  // ── Wheel: scroll the page, then a little more to turn it ──
  // A gesture is a run of wheel events without a pause. One that scrolled the page can't also
  // turn it (a trackpad's momentum would fly through pages): stop at the end, then pull again.
  let acc = 0, dir = 0, last = -1e9, spent = false, owned = false, relax = 0;
  function release() { acc = 0; dir = 0; clearTimeout(relax); if (Math.abs(goal - at) < 0.5) { goal = at; kick(); } }
  main.addEventListener("wheel", (e) => {
    if (e.ctrlKey) return;  // pinch-zoom on a trackpad
    if (e.timeStamp - last > 180) { spent = false; owned = false; }
    last = e.timeStamp;
    const k = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? main.clientHeight : 1;
    const dx = e.deltaX * k, dy = e.deltaY * k, sideways = Math.abs(dx) > Math.abs(dy), d = sideways ? dx : dy;
    if (!d) return;
    // The rest of the gesture that turned the page, and anything while it slides, doesn't scroll the new page.
    if (owned || settling()) { e.preventDefault(); spent = true; return; }
    if (scrolls(e.target, sideways ? d : 0, sideways ? 0 : d)) { spent = true; if (acc) release(); return; }
    if (spent) return;
    const s = Math.sign(d);
    if (!list[at + s]) { if (acc) release(); return; }
    e.preventDefault();
    if (s !== dir) { acc = 0; dir = s; }
    // A mouse-wheel notch counts at least 90 px; a trackpad counts what it moves.
    const wd = Math.abs((sideways ? e.wheelDeltaX : e.wheelDeltaY) || 0);
    acc += e.deltaMode !== 0 || (wd >= 120 && wd % 120 === 0) ? Math.max(Math.abs(d), 90) : Math.abs(d);
    clearTimeout(relax);
    if (acc >= PULL) { owned = true; acc = 0; dir = 0; go(s, sideways ? "swipe" : "wheel"); return; }
    const t = acc / PULL;
    pull(s * peekFrac() * (1 - (1 - t) * (1 - t)));
    relax = setTimeout(release, 600);  // let go, and the page settles back
  }, { passive: false });

  // ── Touch: the track follows a sideways swipe ─────────────
  let touch = null;
  main.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    touch = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: e.timeStamp, lx: t.clientX, lt: e.timeStamp, v: 0, axis: null, el: e.target } : null;
  }, { passive: true });
  main.addEventListener("touchmove", (e) => {
    if (!touch || e.touches.length !== 1) return;
    const t = e.touches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    if (!touch.axis) {
      if (Math.hypot(dx, dy) < 10) return;
      const sideways = Math.abs(dx) > Math.abs(dy) * 1.3 && !touch.el.closest("input, select, textarea, .chart") && !scrolls(touch.el, -dx, 0);
      touch.axis = sideways ? "x" : "y";
    }
    if (touch.axis !== "x" || settling() || reduce) return;
    const w = main.clientWidth || 1, edge = !list[at + (dx < 0 ? 1 : -1)];
    const dt = Math.max(1, e.timeStamp - touch.lt);
    touch.v = (t.clientX - touch.lx) / dt; touch.lx = t.clientX; touch.lt = e.timeStamp;
    dragging = true;
    pos = at - (edge ? dx / 4 : dx) / w;  // resist past the first and last page
    vel = 0;
    kick();
  }, { passive: true });
  main.addEventListener("touchend", (e) => {
    if (!touch) return;
    const t = e.changedTouches[0], dx = t.clientX - touch.x;
    const speed = Math.abs(dx) / Math.max(1, e.timeStamp - touch.t);
    const swiped = touch.axis === "x" && (Math.abs(dx) > main.clientWidth * 0.2 || (speed > 0.45 && Math.abs(dx) > 40));
    if (dragging) vel = -touch.v * 1000 / (main.clientWidth || 1);  // hand the finger's speed to the spring
    dragging = false;
    touch = null;
    if (!(swiped && go(dx < 0 ? 1 : -1, "swipe"))) { goal = at; kick(); }
  });
  main.addEventListener("touchcancel", () => { touch = null; dragging = false; goal = at; kick(); });

  // ── Keyboard: ← and →, unless a control is using the arrow keys ──
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (e.target.closest && e.target.closest("input, select, textarea, [contenteditable]")) return;
    if (go(e.key === "ArrowRight" ? 1 : -1, "key")) e.preventDefault();
  });

  show(decodeURIComponent(location.hash.slice(1)), "load");
})();
