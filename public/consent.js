/* Consentement aux cookies publicitaires.
   - Le stockage local du site (préférences, progression, session de compte) est nécessaire au fonctionnement : pas de consentement requis.
   - La publicité Google AdSense dépose des cookies : son script n'est chargé QU'APRÈS un « Accepter ».
   - Le choix est mémorisé (atlas_consent) et modifiable à tout moment via « Gérer mes cookies » (pied de page). */
(function () {
  'use strict';

  var KEY = 'atlas_consent';
  var ADS = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6179297154791284';
  var me = document.currentScript;
  var wantsAds = !!(me && me.hasAttribute('data-ads'));     // seules certaines pages affichaient déjà de la publicité
  var adsLoaded = false;

  function read() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function write(ads) { try { localStorage.setItem(KEY, JSON.stringify({ ads: !!ads, t: Date.now() })); } catch (e) {} }

  function loadAds() {
    if (adsLoaded || !wantsAds) return;
    adsLoaded = true;
    var s = document.createElement('script');
    s.async = true; s.src = ADS; s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
  }

  var current = read();
  if (current && current.ads) loadAds();

  // ── Bandeau ──
  function css() {
    if (document.getElementById('consentCss')) return;
    var st = document.createElement('style');
    st.id = 'consentCss';
    st.textContent =
      '#consentBar{position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:760px;margin:0 auto;' +
      'background:#fff;color:#2b2350;border-radius:18px;padding:16px 18px;box-shadow:0 14px 40px rgba(0,0,0,.35);' +
      'font:600 .92rem/1.45 "Nunito",system-ui,-apple-system,"Segoe UI",sans-serif;}' +
      'html.dark #consentBar{background:#1e1b2e;color:#e8e2ff;}' +
      '#consentBar b{font-family:"Baloo 2","Nunito",system-ui,sans-serif;font-size:1.05rem;display:block;margin-bottom:4px;}' +
      '#consentBar a{color:#6a5cff;font-weight:800;}' +
      'html.dark #consentBar a{color:#b8aeff;}' +
      '#consentBar .cb-btns{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;}' +
      '#consentBar button{flex:1 1 140px;font:800 .95rem "Baloo 2","Nunito",system-ui,sans-serif;padding:11px 18px;border-radius:30px;cursor:pointer;' +
      'border:2px solid #6a5cff;background:#fff;color:#6a5cff;}' +
      'html.dark #consentBar button{background:#2a2545;color:#b8aeff;border-color:#8b7eff;}' +
      '#consentBar button:hover{transform:translateY(-1px);}';
    document.head.appendChild(st);
  }

  function close() { var b = document.getElementById('consentBar'); if (b) b.remove(); }

  function choose(ads) {
    var before = read();
    write(ads);
    close();
    if (ads) loadAds();
    else if (before && before.ads && adsLoaded) location.reload();   // un script déjà chargé ne se retire pas : on recharge la page
  }

  function show() {
    if (document.getElementById('consentBar') || !document.body) return;
    css();
    var b = document.createElement('div');
    b.id = 'consentBar';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Cookies publicitaires');
    b.innerHTML =
      '<b>🍪 Cookies et publicité</b>' +
      "Atlas de Poche est gratuit grâce à la publicité. Les publicités Google déposent des cookies : acceptes-tu qu'ils soient utilisés ? " +
      "Le fonctionnement du site (préférences, progression) n'en a pas besoin. " +
      '<a href="/confidentialite.html">En savoir plus</a>' +
      '<div class="cb-btns"><button type="button" id="cbRefuse">Refuser</button><button type="button" id="cbAccept">Accepter</button></div>';
    document.body.appendChild(b);
    document.getElementById('cbAccept').onclick = function () { choose(true); };
    document.getElementById('cbRefuse').onclick = function () { choose(false); };
  }

  window.AtlasConsent = { open: show, get: read };

  function init() { if (!read()) show(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
