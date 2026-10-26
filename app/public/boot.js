// Démarrage de la page, avant le chargement de l'application (chargé par index.html).
// Fichier externe et non script en ligne : la Content-Security-Policy de production (deploy/Caddyfile)
// n'autorise que les scripts servis par l'application (script-src 'self', sans 'unsafe-inline').

// Thème : appliqué tout de suite pour éviter que le fond passe du blanc au gris au chargement
// (couleurs identiques à --td-bg-color-page de theme.css).
(function () {
  // Même clé que composables/preferenceStorage.ts : WeKnora_<id utilisateur | anon>_theme,
  // puis, comme la migration de ce module, la clé « anon » et l'ancienne clé non préfixée.
  var t = null;
  try {
    var uid = 'anon';
    try {
      var u = JSON.parse(localStorage.getItem('weknora_user') || 'null');
      if (u && u.id) uid = String(u.id);
    } catch (_) {}
    t =
      localStorage.getItem('WeKnora_' + uid + '_theme') ||
      localStorage.getItem('WeKnora_anon_theme') ||
      localStorage.getItem('WeKnora_theme');
  } catch (_) {}
  if (t !== 'light' && t !== 'dark' && t !== 'system') t = 'light';
  if (t === 'system') {
    try {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (_) {
      t = 'light';
    }
  }
  var bg = t === 'dark' ? '#181818' : '#eee';
  var html = document.documentElement;
  html.setAttribute('theme-mode', t);
  html.style.background = bg;
  html.style.minHeight = '100%';
  html.style.colorScheme = t === 'dark' ? 'dark' : 'light';
  if (document.body) {
    document.body.style.background = bg;
    document.body.style.minHeight = '100%';
  }
  // Conteneur de l'application : il n'existe pas encore quand ce script s'exécute.
  document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('app');
    if (el) {
      el.style.background = bg;
      el.style.minHeight = '100%';
    }
  });
  try {
    var w = window.runtime;
    if (w) {
      if (t === 'dark') {
        if (w.WindowSetDarkTheme) w.WindowSetDarkTheme();
        if (w.WindowSetBackgroundColour) w.WindowSetBackgroundColour(24, 24, 24, 255);
      } else {
        if (w.WindowSetLightTheme) w.WindowSetLightTheme();
        if (w.WindowSetBackgroundColour) w.WindowSetBackgroundColour(238, 238, 238, 255);
      }
    }
  } catch (_) {}
})();

// Mode allégé (WeKnora) : retour à la dernière page de la plateforme.
(function () {
  try {
    if (localStorage.getItem('weknora_lite_mode') !== 'true') return;
    var saved = sessionStorage.getItem('weknora_lite_last_path');
    if (!saved || saved.indexOf('/platform/') !== 0 || saved.indexOf('/platform/organizations') === 0) return;
    var path = window.location.pathname;
    if (path !== '/' && path !== '/platform' && path !== '/platform/knowledge-bases') return;
    var target = saved.indexOf('#') >= 0 ? saved.slice(0, saved.indexOf('#')) : saved;
    if (!target) return;
    var current = window.location.pathname + window.location.search;
    if (target !== current) window.history.replaceState(window.history.state, '', target);
  } catch (e) {}
})();
