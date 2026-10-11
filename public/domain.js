/* Un seul domaine : atlasdepoche.com
   - Ouvert sur atlas-de-poche.web.app ou atlas-de-poche.firebaseapp.com : on redirige vers atlasdepoche.com (même page, même mode).
   - Le navigateur sépare le stockage de chaque domaine : la progression locale (records, éléments maîtrisés, erreurs,
     préférences) est transportée dans l'adresse (#atlasmigrate=…) puis récupérée côté atlasdepoche.com. */
(function () {
  'use strict';

  var CANON = 'atlasdepoche.com';
  var OLD = /^atlas-de-poche\.(web\.app|firebaseapp\.com)$/;
  var TAG = 'atlasmigrate';
  var KEYS = ['capitales_records_v1', 'regions_records_v1', 'atlasMastered_v1', 'atlasTypeErrors', 'atlasTableErrors',
              'regionsTypeErrors', 'atlasProgTmp_v1', 'darkMode', 'soundOn', 'lang'];

  function enc(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function dec(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return decodeURIComponent(escape(atob(s)));
  }

  // 1. Ancien domaine : redirection (la progression locale part avec l'adresse)
  if (OLD.test(location.hostname)) {
    var data = {}, n = 0;
    try { KEYS.forEach(function (k) { var v = localStorage.getItem(k); if (v !== null) { data[k] = v; n++; } }); } catch (e) {}
    var hash = (location.hash || '').replace(/^#/, '');
    if (n) { try { hash += (hash ? '&' : '') + TAG + '=' + enc(JSON.stringify(data)); } catch (e) {} }
    location.replace('https://' + CANON + location.pathname + location.search + (hash ? '#' + hash : ''));
    return;
  }

  // 2. Arrivée depuis l'ancien domaine : on récupère la progression (sans écraser ce qui existe déjà ici)
  var m = new RegExp('(?:^#|&)' + TAG + '=([^&]+)').exec(location.hash || '');
  if (m) {
    try {
      var d = JSON.parse(dec(m[1]));
      KEYS.forEach(function (k) {
        if (typeof d[k] === 'string' && localStorage.getItem(k) === null) localStorage.setItem(k, d[k]);
      });
    } catch (e) {}
    var rest = (location.hash || '').replace(/^#/, '').split('&')
      .filter(function (p) { return p && p.indexOf(TAG + '=') !== 0; }).join('&');
    try { history.replaceState(null, '', location.pathname + location.search + (rest ? '#' + rest : '')); } catch (e) {}
  }
})();
