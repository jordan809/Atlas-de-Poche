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

  function signOut() { clear(); updateMenu(); }

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
    return freshToken().then(function (t) { return call('delete', { idToken: t }); }).then(function () { signOut(); });
  }

  window.AtlasAccount = {
    user: function () { var s = load(); return s ? { uid: s.uid, email: s.email, name: s.name } : null; },
    signUp: signUp, signIn: signIn, signOut: signOut, resetPassword: resetPassword, deleteAccount: deleteAccount,
    updateMenu: updateMenu
  };

  window.addEventListener('storage', function (e) { if (e.key === STORE) updateMenu(); });   // connexion/déconnexion dans un autre onglet
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updateMenu);
  else updateMenu();
})();
