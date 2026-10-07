// theme-boot.js — aplica tema y acento ANTES de pintar (script clásico en <head>, sin parpadeo)
(function () {
  var d = document.documentElement;
  try {
    var th = localStorage.getItem('nb_theme');
    var ac = localStorage.getItem('nb_accent');
    if (th === 'light' || th === 'dark') d.dataset.theme = th;
    if (ac) d.dataset.accent = ac;
  } catch (e) { /* sin storage */ }
})();
