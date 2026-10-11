/* Progression par élément (pays, départements, mers, monuments) : alimente les statistiques et les badges (page /badges.html).
   Règle : un élément est « maîtrisé » quand on le trouve 2 fois de suite en quiz (1 point par bonne réponse) ou 1 fois
   en tapant la réponse au clavier (2 points). Une erreur remet le compteur à zéro. Une fois maîtrisé, il le reste.
   - atlasMastered_v1 : { cap:[…], reg:[…], sea:[…], mon:[…], flags:[…] } — synchronisé avec le compte (voir account.js)
   - atlasProgTmp_v1  : compteurs en cours, propres à l'appareil */
(function () {
  'use strict';

  var KEY = 'atlasMastered_v1', TMP = 'atlasProgTmp_v1', NEED = 2;

  function read(k) {
    try { var o = JSON.parse(localStorage.getItem(k)); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; }
    catch (e) { return {}; }
  }
  function write(k, o) { try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) {} }

  // cat : 'cap' (pays), 'reg' (départements), 'sea' (mers), 'mon' (monuments) — kind : 'choice' (quiz) ou 'type' (clavier)
  function record(cat, name, correct, kind) {
    if (!cat || typeof name !== 'string' || !name) return;
    var m = read(KEY), list = Array.isArray(m[cat]) ? m[cat] : [];
    if (list.indexOf(name) >= 0) return;                         // déjà maîtrisé : acquis pour toujours
    var t = read(TMP), c = (t[cat] && typeof t[cat] === 'object') ? t[cat] : (t[cat] = {});
    if (!correct) {
      if (c[name]) { delete c[name]; write(TMP, t); }
      return;
    }
    var n = (c[name] || 0) + (kind === 'type' ? 2 : 1);
    if (n >= NEED) {
      delete c[name]; write(TMP, t);
      list.push(name); m[cat] = list; write(KEY, m);
      try { window.dispatchEvent(new CustomEvent('atlas:mastered', { detail: { cat: cat, name: name, count: list.length } })); } catch (e) {}
    } else {
      c[name] = n; write(TMP, t);
    }
  }

  // Marque un exploit (ex. « perfect_cap » : Défi sans aucune erreur)
  function flag(id) {
    var m = read(KEY), f = Array.isArray(m.flags) ? m.flags : [];
    if (f.indexOf(id) >= 0) return;
    f.push(id); m.flags = f; write(KEY, m);
  }

  window.AtlasProgress = {
    record: record,
    flag: flag,
    all: function () { return read(KEY); },
    KEY: KEY, TMP: TMP
  };
})();
