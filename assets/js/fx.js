// The page's one ornament: the surname rusts a little, quickly, the first time the home page is on
// screen. The #oxidize filter in index.html holds the animation; this only starts it once the page
// has settled. With reduced motion, or no SMIL, the rust is simply there already.
(function () {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const paged = document.documentElement.classList.contains("paged");
  const a = document.getElementById("rust-name"), home = document.getElementById("home");
  if (!a || !home) return;
  let done = false;

  function rusted() {
    a.parentNode.setAttribute("values", a.getAttribute("values").split(";").pop());
    a.remove();
  }
  function rust() {
    if (done || (paged && !home.classList.contains("on"))) return;
    done = true;
    document.removeEventListener("pagechange", rust);
    if (reduce || typeof a.beginElement !== "function") rusted();
    else setTimeout(() => a.beginElement(), 500);
  }
  rust();
  document.addEventListener("pagechange", rust);
})();
