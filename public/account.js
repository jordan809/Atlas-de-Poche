/* Comptes Atlas de poche — Firebase Authentication (e-mail + mot de passe), appelé directement en HTTPS :
   aucune bibliothèque à charger. La session est gardée dans le navigateur (localStorage).
   Utilisé par la page /compte.html et par le menu de toutes les pages (« Créer un compte » / pseudo). */
(function () {
  'use strict';

  // Clé « web » du projet Firebase : publique par conception (la même que dans /__/firebase/init.json).
  var API_KEY   = 'AIzaSyB2jJR5HZFH2fS9kEkNuz8-HCbR1yXPWsA';
  var STORE     = 'atlas_account';
  var ID_API    = 'https://identitytoolkit.googleapis.com/v1/accounts:';
  var TOKEN_API = 'https://securetoken.googleapis.com/v1/token';

  // ── Session ──────────────────────────────────────────────────────────────
  function load()  { try { return JSON.parse(localStorage.getItem(STORE)); } catch (e) { return null; } }
  function save(s) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {} }
  function clear() { try { localStorage.removeItem(STORE); } catch (e) {} }

  // ── Messages d'erreur (en français) ─────────────────────────────────────
  var MESSAGES = {
    EMAIL_EXISTS: 'Un compte existe déjà avec cet e-mail. Connecte-toi plutôt !',
    INVALID_EMAIL: "Cette adresse e-mail n'est pas valide.",
    MISSING_EMAIL: "Écris ton adresse e-mail.",
    WEAK_PASSWORD: 'Mot de passe trop court : 6 caractères minimum.',
    MISSING_PASSWORD: 'Écris ton mot de passe.',
    EMAIL_NOT_FOUND: 'E-mail ou mot de passe incorrect.',
    INVALID_PASSWORD: 'E-mail ou mot de passe incorrect.',
    INVALID_LOGIN_CREDENTIALS: 'E-mail ou mot de passe incorrect.',
    USER_DISABLED: 'Ce compte est désactivé.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Trop d\'essais. Réessaie dans quelques minutes.',
    OPERATION_NOT_ALLOWED: 'Les comptes ne sont pas encore activés sur ce site. Réessaie plus tard.',
    CONFIGURATION_NOT_FOUND: 'Les comptes ne sont pas encore activés sur ce site. Réessaie plus tard.',
    PASSWORD_LOGIN_IS_DISABLED: 'Les comptes ne sont pas encore activés sur ce site. Réessaie plus tard.',
    CREDENTIAL_TOO_OLD_LOGIN_AGAIN: 'Reconnecte-toi pour continuer.',
    TOKEN_EXPIRED: 'Ta session a expiré. Reconnecte-toi.',
    INVALID_ID_TOKEN: 'Ta session a expiré. Reconnecte-toi.',
    USER_NOT_FOUND: 'Ce compte n\'existe plus.',
    NOT_SIGNED_IN: 'Tu n\'es pas connecté.',
    NETWORK: 'Erreur réseau. Vérifie ta connexion et réessaie !'
  };
  function fail(code) {
    var key = String(code || '').split(/[\s:]/)[0];      // « WEAK_PASSWORD : Password should… » -> WEAK_PASSWORD
    var e = new Error(MESSAGES[key] || 'Une erreur est survenue. Réessaie !');
    e.code = key;
    return e;
  }

  // ── Appels HTTPS ─────────────────────────────────────────────────────────
  function request(url, opts) {
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw fail(j && j.error && (j.error.message || j.error.status));
        return j;
      });
    }, function () { throw fail('NETWORK'); });
  }
  function call(method, body) {
    return request(ID_API + method + '?key=' + API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
  }

  // ── Menu : « 👤 Créer un compte » devient « 👤 pseudo » une fois connecté ──
  function updateMenu() {
    var s = load();
    var links = document.querySelectorAll('.menu-panel a[href="/compte.html"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (!a.dataset.label) a.dataset.label = a.textContent;
      a.textContent = s ? '👤 ' + s.name : a.dataset.label;
    }
  }

  function remember(j, name, email) {
    var s = {
      uid: j.localId || j.user_id,
      email: email || j.email || '',
      name: name || j.displayName || String(email || j.email || '').split('@')[0] || 'Joueur',
      idToken: j.idToken || j.id_token,
      refreshToken: j.refreshToken || j.refresh_token,
      exp: Date.now() + (parseInt(j.expiresIn || j.expires_in, 10) || 3600) * 1000
    };
    save(s);
    updateMenu();
    return s;
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  function signUp(name, email, password) {
    return call('signUp', { email: email, password: password, returnSecureToken: true }).then(function (j) {
      // le pseudo est enregistré comme « nom affiché » du compte
      return call('update', { idToken: j.idToken, displayName: name, returnSecureToken: true }).then(function (u) {
        return remember({ localId: j.localId, idToken: u.idToken || j.idToken, refreshToken: u.refreshToken || j.refreshToken,
                          expiresIn: u.expiresIn || j.expiresIn }, name, email);
      }, function () { return remember(j, name, email); });   // le compte existe même si le pseudo n'a pas pu être enregistré
    });
  }

  function signIn(email, password) {
    return call('signInWithPassword', { email: email, password: password, returnSecureToken: true }).then(function (j) {
      return remember(j, j.displayName, email);
    });
  }

  // Déconnexion : dernière synchronisation, puis on efface la progression de CET appareil (elle reste dans le compte)
  // pour qu'un autre compte utilisé sur le même appareil ne la récupère pas. Si la synchronisation échoue, on garde tout.
  function signOut() {
    return sync().then(function (r) { if (r.synced) { clearProgress(); return true; } return false; }, function () { return false; })
      .then(function (cleared) { clear(); updateMenu(); return cleared; });
  }

  function resetPassword(email) {
    return call('sendOobCode', { requestType: 'PASSWORD_RESET', email: email });
  }

  // Jeton valide (renouvelé si besoin) pour les actions sensibles
  function freshToken() {
    var s = load();
    if (!s) return Promise.reject(fail('NOT_SIGNED_IN'));
    if (s.exp - Date.now() > 60000) return Promise.resolve(s.idToken);
    return request(TOKEN_API + '?key=' + API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(s.refreshToken)
    }).then(function (j) { return remember(j, s.name, s.email).idToken; });
  }

  function deleteAccount() {
    var s = load();
    return freshToken().then(function (t) {
      // on efface d'abord les données du compte, puis le compte lui-même
      return dbProtected(s).then(function (ok) {
        // données du compte supprimées seulement si la base est protégée (sinon rien n'y a été envoyé)
        return ok ? request(dbUrl(s.uid, '', t), { method: 'DELETE' }).catch(function () {}) : null;
      }).then(function () { return call('delete', { idToken: t }); });
    }).then(function () { clear(); updateMenu(); });
  }

  // ── Synchronisation de la progression (records, erreurs à revoir, préférences) ─────────────
  // Les données restent dans le navigateur (localStorage) ; quand on est connecté, une copie est gardée dans le compte
  // (base de données, nœud users/{uid}/sync) et fusionnée entre les appareils.
  var DB = 'https://atlas-de-poche-default-rtdb.europe-west1.firebasedatabase.app';
  // clé locale -> règle de fusion : 'max' = records (on garde le meilleur) ; 'lww' = la modification la plus récente gagne
  var SYNC_KEYS = {
    capitales_records_v1: 'max', regions_records_v1: 'max', atlasMastered_v1: 'max',
    atlasTypeErrors: 'lww', atlasTableErrors: 'lww', regionsTypeErrors: 'lww',
    darkMode: 'lww', soundOn: 'lww', lang: 'lww'
  };
  var PREF_KEYS = { darkMode: 1, soundOn: 1, lang: 1 };      // gardées sur l'appareil à la déconnexion
  var TS = 'atlas_sync_t:';                                   // horodatage local de la dernière modification de chaque clé
  var rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
  var applying = false, dirty = {}, pushTimer = null, running = null, queued = null, lastSyncAt = 0;
  var securedAt = 0;    // dernier moment où la base a été vue protégée (lecture sans connexion refusée)

  function dbUrl(uid, path, token) {
    return DB + '/users/' + encodeURIComponent(uid) + (path ? '/' + path : '') + '.json?auth=' + encodeURIComponent(token);
  }
  function lget(k)  { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lts(k)   { return parseInt(lget(TS + k), 10) || 0; }
  function setTs(k, t) { try { rawSet.call(localStorage, TS + k, String(t)); } catch (e) {} }
  function applyLocal(k, v, t) {
    applying = true;
    try { if (v === null) rawRemove.call(localStorage, k); else rawSet.call(localStorage, k, v); setTs(k, t); } catch (e) {}
    applying = false;
  }
  function clearProgress() {
    applying = true;
    try {
      Object.keys(SYNC_KEYS).forEach(function (k) {
        if (PREF_KEYS[k]) return;
        rawRemove.call(localStorage, k); rawRemove.call(localStorage, TS + k);
      });
      rawRemove.call(localStorage, 'atlasProgTmp_v1');
    } catch (e) {}
    applying = false;
  }

  // Fusion des données « max » (records, éléments maîtrisés) : nombres -> plus grande valeur, listes -> union,
  // objets -> champ par champ. La fusion ne fait donc jamais perdre de progression.
  function parseObj(v) { try { var o = JSON.parse(v); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : null; } catch (e) { return null; } }
  function canon(v) {                       // forme canonique : clés triées, listes triées (pour comparer sans tenir compte de l'ordre)
    if (Array.isArray(v)) return v.map(canon).sort(function (x, y) { x = JSON.stringify(x); y = JSON.stringify(y); return x < y ? -1 : x > y ? 1 : 0; });
    if (v && typeof v === 'object') { var r = {}; Object.keys(v).sort().forEach(function (k) { r[k] = canon(v[k]); }); return r; }
    return v;
  }
  function same(a, b) {
    var x = parseObj(a), y = parseObj(b);
    return (x && y) ? JSON.stringify(canon(x)) === JSON.stringify(canon(y)) : a === b;
  }
  function mergeVal(a, b) {
    if (a === undefined) return b;
    if (b === undefined) return a;
    if (typeof a === 'number' && typeof b === 'number') return Math.max(a, b);
    if (Array.isArray(a) && Array.isArray(b)) {
      var out = a.slice();
      b.forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); });
      return out;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      var o = {}, k;
      for (k in a) o[k] = a[k];
      for (k in b) o[k] = mergeVal(a[k], b[k]);
      return o;
    }
    return a;                                // formats différents : on garde la valeur locale
  }
  function mergeMax(lv, rv) {
    var a = parseObj(lv), b = parseObj(rv);
    if (!a && !b) return lv !== null ? lv : rv;
    if (!a) return rv;
    if (!b) return lv;
    var m = mergeVal(a, b);
    return JSON.stringify(canon(m)) === JSON.stringify(canon(a)) ? lv : JSON.stringify(m);   // inchangé : on garde la chaîne d'origine
  }

  // La progression n'est envoyée que si les règles de la base refusent l'accès aux visiteurs non connectés à ce compte :
  // une lecture sans jeton doit être refusée. Sinon (base ouverte à tous), la synchronisation reste en pause.
  function dbProtected(s) {
    if (Date.now() - securedAt < 600000) return Promise.resolve(true);
    return fetch(DB + '/users/' + encodeURIComponent(s.uid) + '/sync.json').then(function (r) {
      var ok = (r.status === 401 || r.status === 403);
      if (ok) securedAt = Date.now();
      return ok;
    }, function () { return false; });
  }

  // Compare avec le compte et met tout à jour dans les deux sens. Résout { changed, synced } : changed = cet appareil a reçu des changements ; synced = false si la synchronisation est en pause.
  function sync() {
    var s = load();
    if (!s) return Promise.resolve({ changed: false, synced: false });
    if (running) {
      // une synchronisation est déjà en cours : on en refait une juste après, pour inclure les dernières modifications
      if (!queued) queued = running.catch(function () {}).then(function () { queued = null; return sync(); });
      return queued;
    }
    running = dbProtected(s).then(function (ok) {
      if (!ok) return null;
      return freshToken();
    }).then(function (tok) {
      if (!tok) return null;                                        // base non protégée : on n'envoie rien
      return request(dbUrl(s.uid, 'sync', tok)).then(function (remote) {
        remote = remote || {};
        var pushes = {}, any = false, changed = false;
        Object.keys(SYNC_KEYS).forEach(function (k) {
          var r = remote[k], lv = lget(k), lt = lts(k);
          if (lv !== null && !lt) lt = 1;                              // valeur antérieure à la synchronisation : la plus ancienne
          var rv = (r && typeof r.v === 'string') ? r.v : null, rt = (r && r.t) ? r.t : 0;
          if (SYNC_KEYS[k] === 'max') {
            var merged = mergeMax(lv, rv);
            if (merged !== null && !same(merged, lv)) { applyLocal(k, merged, Date.now()); changed = true; }
            if (merged !== null && !same(merged, rv)) { pushes[k] = { v: merged, t: Date.now() }; any = true; }
          } else if (rt > lt) {                                        // le compte est plus récent
            if (rv !== lv) { applyLocal(k, rv, rt); changed = true; } else setTs(k, rt);
          } else if (lt > rt && lv !== rv) {                           // cet appareil est plus récent
            var t = lt === 1 ? Date.now() : lt;
            if (lt === 1) setTs(k, t);
            pushes[k] = (lv === null) ? { t: t } : { v: lv, t: t };
            any = true;
          }
        });
        if (!any) return changed;
        return request(dbUrl(s.uid, 'sync', tok), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pushes)
        }).then(function () { return changed; });
      });
    }).then(function (changed) {
      running = null;
      if (changed === null) return { changed: false, synced: false };
      dirty = {}; lastSyncAt = Date.now();
      return { changed: changed, synced: true };
    }, function (e) { running = null; throw e; });
    return running;
  }

  // Toute modification locale d'une clé suivie : horodatage + envoi différé vers le compte
  function touched(k) {
    setTs(k, Date.now());
    if (!load()) return;
    dirty[k] = 1;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { sync().catch(function () {}); }, 1500);
  }
  try {
    Storage.prototype.setItem = function (k, v) {
      var isLocal = (this === localStorage) && !applying && SYNC_KEYS[k];
      var before = isLocal ? lget(k) : null;
      rawSet.apply(this, arguments);
      if (isLocal && lget(k) !== before) touched(k);
    };
    Storage.prototype.removeItem = function (k) {
      var isLocal = (this === localStorage) && !applying && SYNC_KEYS[k];
      var before = isLocal ? lget(k) : null;
      rawRemove.apply(this, arguments);
      if (isLocal && before !== null) touched(k);
    };
  } catch (e) {}

  // Fermeture de la page : on envoie tout de suite les modifications en attente (préférences, erreurs)
  function flush() {
    var s = load(), keys = Object.keys(dirty).filter(function (k) { return SYNC_KEYS[k] === 'lww'; });
    if (!s || !keys.length || s.exp - Date.now() < 5000) return;
    var body = {};
    keys.forEach(function (k) { var v = lget(k); body[k] = v === null ? { t: lts(k) } : { v: v, t: lts(k) }; });
    try {
      fetch(dbUrl(s.uid, 'sync', s.idToken), { method: 'PATCH', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      dirty = {};
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
    else if (load() && Date.now() - lastSyncAt > 20000) sync().catch(function () {});
  });
  window.addEventListener('pagehide', flush);

  // À l'ouverture d'une page : on récupère les changements faits sur un autre appareil.
  // Si la page vient juste de s'ouvrir, on la recharge une fois pour qu'elle affiche les données reçues.
  function initialSync() {
    if (!load()) return;
    sync().then(function (r) {
      if (!r.changed || performance.now() > 6000) return;
      var last = 0;
      try { last = parseInt(sessionStorage.getItem('atlas_sync_reload'), 10) || 0; } catch (e) {}
      if (Date.now() - last < 15000) return;
      try { sessionStorage.setItem('atlas_sync_reload', String(Date.now())); } catch (e) {}
      location.reload();
    }).catch(function () {});
  }

  // ── Bouton « Voir mes badges » : à gauche des boutons du haut ─────────────
  function badgesButton() {
    var wrap = document.querySelector('.top-right-btns');
    if (!wrap || document.getElementById('badgesBtn')) return;
    if (/\/(badges|globe)(\.html)?$/.test(location.pathname)) return;   // pas sur la page des badges (on y est) ni sur le globe interactif
    if (!document.getElementById('badgesBtnCss')) {
      var st = document.createElement('style');
      st.id = 'badgesBtnCss';
      st.textContent =
        '#badgesBtn{order:-10;display:flex;align-items:center;gap:7px;height:42px;padding:0 16px;border-radius:21px;' +
        'text-decoration:none;font-family:"Baloo 2",cursive;font-weight:700;font-size:.92rem;letter-spacing:.02em;color:#fff;' +
        'white-space:nowrap;flex-shrink:0;background:rgba(255,255,255,.25);backdrop-filter:blur(6px);' +
        'box-shadow:0 4px 12px rgba(0,0,0,.2);transition:transform .2s,background .2s;}' +
        '#badgesBtn:hover{transform:scale(1.06);background:rgba(255,255,255,.4);}' +
        'html.dark #badgesBtn{background:rgba(0,0,0,.35);}' +
        'html.dark #badgesBtn:hover{background:rgba(0,0,0,.5);}' +
        '#badgesBtn .bb-short{display:none;}' +
        '@media(max-width:720px){#badgesBtn .bb-long{display:none;}#badgesBtn .bb-short{display:inline;}}' +
        '@media(max-width:520px){#badgesBtn{height:38px;padding:0 12px;font-size:.82rem;gap:5px;}}';
      document.head.appendChild(st);
    }
    var a = document.createElement('a');
    a.id = 'badgesBtn';
    a.href = '/badges.html';
    a.title = 'Voir mes badges';
    a.innerHTML = '<span aria-hidden="true">🏅</span><span class="bb-long">Voir mes badges</span><span class="bb-short">Badges</span>';
    wrap.insertBefore(a, wrap.firstChild);
  }

  window.AtlasAccount = {
    sync: sync, lastSync: function () { return lastSyncAt; },
    user: function () { var s = load(); return s ? { uid: s.uid, email: s.email, name: s.name } : null; },
    signUp: signUp, signIn: signIn, signOut: signOut, resetPassword: resetPassword, deleteAccount: deleteAccount,
    updateMenu: updateMenu
  };

  window.addEventListener('storage', function (e) { if (e.key === STORE) updateMenu(); });   // connexion/déconnexion dans un autre onglet
  // Ancienne intégration Spotify retirée : on efface ses données restées dans le navigateur
  function cleanOldSpotify() {
    try {
      Object.keys(localStorage).filter(function (k) { return k.indexOf('sp_') === 0; })
        .forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
  }

  // ── Liens légaux : pied de page de chaque page (sauf le globe plein écran) et menu ──
  function legalLinks() {
    // menu : Confidentialité et Mentions légales sous les liens existants
    var panels = document.querySelectorAll('.menu-panel');
    for (var i = 0; i < panels.length; i++) {
      var p = panels[i];
      if (p.querySelector('a[href="/confidentialite.html"]')) continue;
      var mk = function (href, label) { var a = document.createElement('a'); a.href = href; a.textContent = label; return a; };
      p.appendChild(mk('/confidentialite.html', '🔒 Confidentialité'));
      p.appendChild(mk('/mentions-legales.html', '⚖️ Mentions légales'));
    }
    // pied de page
    if (document.getElementById('legalLinks') || /\/globe(\.html)?$/.test(location.pathname)) return;
    if (!document.getElementById('legalCss')) {
      var st = document.createElement('style');
      st.id = 'legalCss';
      st.textContent =
        'body{position:relative;min-height:100vh;}' +
        '#legalLinks{position:absolute;left:0;right:0;bottom:0;z-index:1;text-align:center;padding:0 14px 30px;' +
        'font:700 .82rem/1.8 "Nunito",system-ui,-apple-system,"Segoe UI",sans-serif;color:rgba(255,255,255,.9);}' +
        '#legalLinks a{color:#fff;text-decoration:underline;text-underline-offset:3px;margin:0 6px;white-space:nowrap;}' +
        '#legalLinks a:hover{opacity:.8;}';
      document.head.appendChild(st);
    }
    var d = document.createElement('div');
    d.id = 'legalLinks';
    d.innerHTML = '<a href="/confidentialite.html">Confidentialité</a>' +
      '<a href="/mentions-legales.html">Mentions légales</a>' +
      '<a href="/a-propos.html">À propos</a>' +
      '<a href="/contact.html">Contact</a>' +
      '<a href="#" id="cookieLink">Gérer mes cookies</a>';
    document.body.appendChild(d);
    // place réservée en bas de page pour que le contenu ne passe jamais sous les liens
    var pb = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
    if (pb < 96) document.body.style.paddingBottom = '96px';
    var c = document.getElementById('cookieLink');
    c.onclick = function (e) { e.preventDefault(); if (window.AtlasConsent) AtlasConsent.open(); };
  }

  function boot() { cleanOldSpotify(); updateMenu(); badgesButton(); legalLinks(); initialSync(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
