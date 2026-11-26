/* Mode tampilan: auto / light / dark. Dimuat di <head> supaya tidak berkedip. */
(function () {
  var K = "keuangan.tema";
  var mq = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;

  function ambil() {
    try { return JSON.parse(localStorage.getItem(K)) || "auto"; }
    catch (e) { return "auto"; }
  }

  function gelap(m) {
    return m === "dark" || (m === "auto" && !!mq && mq.matches);
  }

  function tandai(m) {
    [["tmAuto", "auto"], ["tmTerang", "light"], ["tmGelap", "dark"]].forEach(function (p) {
      var el = document.getElementById(p[0]);
      if (el) {
        el.classList.toggle("aktif", p[1] === m);
        el.setAttribute("aria-pressed", p[1] === m ? "true" : "false");
      }
    });
  }

  function terapkan(m) {
    var d = gelap(m);
    var r = document.documentElement;
    r.dataset.theme = d ? "dark" : "light";
    r.dataset.mode = m;

    var c = document.querySelector("meta[name=theme-color]");
    if (c) c.setAttribute("content", d ? "#23272f" : "#e6ebf2");

    tandai(m);
  }

  function simpan(m) {
    try { localStorage.setItem(K, JSON.stringify(m)); } catch (e) { /* abaikan */ }
    terapkan(m);
  }

  window.KTema = { ambil: ambil, set: simpan };

  terapkan(ambil());

  try {
    mq && mq.addEventListener("change", function () {
      if (ambil() === "auto") terapkan("auto");
    });
  } catch (e) { /* browser lama */ }

  document.addEventListener("DOMContentLoaded", function () { tandai(ambil()); });
})();
