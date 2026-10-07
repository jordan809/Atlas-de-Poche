(function () {
  'use strict';

  var CLIENT_ID = '2342cc59405443a3b77235176bcf8351';
  var REDIRECT   = 'https://atlas-de-poche.web.app/spotify-callback.html';
  var SCOPES     = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state user-read-currently-playing';

  var player       = null;
  var deviceId     = null;
  var pollTimer    = null;
  var volDragging  = false;
  var volDragTimer = null;

  var SP_LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>';

  // ── PKCE ──────────────────────────────────────────────────────────────────
  function b64url(bytes) {
    return btoa(String.fromCharCode.apply(null, bytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
  function genVerifier() {
    var a = new Uint8Array(32); crypto.getRandomValues(a); return b64url(a);
  }
  async function genChallenge(v) {
    var d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
    return b64url(new Uint8Array(d));
  }

  // ── Storage ───────────────────────────────────────────────────────────────
  function sGet(k)   { try { return JSON.parse(localStorage.getItem('sp_' + k)); } catch { return null; } }
  function sSet(k,v) { try { localStorage.setItem('sp_' + k, JSON.stringify(v)); } catch {} }
  function sDel(k)   { try { localStorage.removeItem('sp_' + k); } catch {} }

  // ── Tokens ────────────────────────────────────────────────────────────────
  function getTokens() { return sGet('tok'); }

  async function getToken() {
    var t = getTokens();
    if (!t) return null;
    if ((Date.now() - t.ts) / 1000 < t.expires_in - 60) return t.access_token;
    try {
      var r = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: CLIENT_ID })
      });
      if (!r.ok) { sDel('tok'); return null; }
      var d = await r.json();
      sSet('tok', Object.assign({}, d, { refresh_token: d.refresh_token || t.refresh_token, ts: Date.now() }));
      return d.access_token;
    } catch { return null; }
  }

  async function api(method, path, body) {
    var token = await getToken();
    if (!token) return null;
    var opts = { method: method, headers: { Authorization: 'Bearer ' + token } };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    try {
      var r = await fetch('https://api.spotify.com/v1' + path, opts);
      if (r.status === 204 || r.status === 202) return {};
      if (r.status === 401) { sDel('tok'); updateUI(false); return null; }
      if (r.ok) return r.json().catch(function() { return {}; });
    } catch {}
    return null;
  }

  // ── CSS ───────────────────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('sp-css')) return;
    var s = document.createElement('style');
    s.id = 'sp-css';
    s.textContent =
      '#spBtn{width:42px;height:42px;border:none;border-radius:50%;cursor:pointer;' +
      'background:rgba(255,255,255,0.25);backdrop-filter:blur(6px);' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.2);transition:transform .2s,background .2s;' +
      'display:flex;align-items:center;justify-content:center;flex-shrink:0;' +
      'color:rgba(255,255,255,0.8);}' +
      '#spBtn:hover{transform:scale(1.12);background:rgba(255,255,255,.4);}' +
      '#spBtn.connected{color:#1db954;}' +
      'html.dark #spBtn{background:rgba(0,0,0,.35);}' +
      'html.dark #spBtn:hover{background:rgba(0,0,0,.5);}' +
      '#spStrip{display:none;align-items:center;gap:0;height:42px;padding:0 11px;' +
      'background:rgba(255,255,255,0.25);backdrop-filter:blur(6px);border-radius:21px;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.2);}' +
      '#spStrip.on{display:flex;}' +
      'html.dark #spStrip{background:rgba(0,0,0,.35);}' +
      '.sp-c{border:none;background:transparent;cursor:pointer;font-size:.9rem;' +
      'padding:4px 6px;color:#fff;opacity:.85;transition:opacity .15s,transform .15s;line-height:1;}' +
      '.sp-c:hover{opacity:1;transform:scale(1.18);}' +
      '.sp-vol-wrap{position:relative;display:flex;align-items:center;margin:0 4px;}' +
      '#spVol{width:52px;height:3px;accent-color:#1db954;cursor:pointer;}' +
      '#spVolTip{position:absolute;bottom:calc(100% + 7px);left:50%;transform:translateX(-50%);' +
      'background:rgba(0,0,0,0.75);color:#fff;font-size:.68rem;font-weight:700;' +
      'padding:2px 7px;border-radius:6px;pointer-events:none;white-space:nowrap;' +
      'opacity:0;transition:opacity .1s;}' +
      '.sp-vol-wrap:hover #spVolTip,.sp-vol-wrap.tip-on #spVolTip{opacity:1;}' +
      '#spTrack{font-size:.7rem;font-weight:700;color:rgba(255,255,255,.9);' +
      'max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-left:6px;}' +
      '.sp-div{width:1px;height:18px;background:rgba(255,255,255,.3);margin:0 3px;flex-shrink:0;}';
    document.head.appendChild(s);
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  function buildUI() {
    var wrap = document.querySelector('.top-right-btns');
    if (!wrap || document.getElementById('spBtn')) return;

    var savedVol = sGet('vol');
    if (savedVol === null) savedVol = 50;

    var strip = document.createElement('div');
    strip.id = 'spStrip';
    strip.innerHTML =
      '<button class="sp-c" id="spPrev" title="Précédent">⏮</button>' +
      '<button class="sp-c" id="spPlay" title="Lecture / Pause">▶</button>' +
      '<button class="sp-c" id="spNext" title="Suivant">⏭</button>' +
      '<div class="sp-div"></div>' +
      '<div class="sp-vol-wrap">' +
        '<input type="range" id="spVol" min="0" max="100" value="' + savedVol + '">' +
        '<div id="spVolTip">' + savedVol + '%</div>' +
      '</div>' +
      '<span id="spTrack">—</span>';

    var btn = document.createElement('button');
    btn.id = 'spBtn';
    btn.title = 'Connecter Spotify';
    btn.innerHTML = SP_LOGO;

    wrap.insertBefore(btn, wrap.firstChild);
    wrap.insertBefore(strip, wrap.firstChild);

    btn.onclick = function() { getTokens() ? logout() : login(); };
    document.getElementById('spPrev').onclick = function() { prev(); };
    document.getElementById('spPlay').onclick = function() { togglePlay(); };
    document.getElementById('spNext').onclick = function() { next(); };

    var volEl   = document.getElementById('spVol');
    var volTip  = document.getElementById('spVolTip');
    var volWrap = volEl.parentElement;
    var vt;

    volEl.oninput = function(e) {
      var val = parseInt(e.target.value, 10);
      sSet('vol', val);
      volTip.textContent = val + '%';
      volWrap.classList.add('tip-on');
      volDragging = true;
      clearTimeout(vt);
      clearTimeout(volDragTimer);
      vt = setTimeout(function() {
        setVol(val);
        volWrap.classList.remove('tip-on');
        volDragTimer = setTimeout(function() { volDragging = false; }, 1500);
      }, 120);
    };
  }

  function updateUI(on) {
    var btn   = document.getElementById('spBtn');
    var strip = document.getElementById('spStrip');
    if (!btn) return;
    btn.classList.toggle('connected', on);
    btn.title = on ? 'Déconnecter Spotify' : 'Connecter Spotify';
    if (strip) strip.classList.toggle('on', on);
  }

  function setTrackUI(name, playing) {
    var t = document.getElementById('spTrack');
    var p = document.getElementById('spPlay');
    if (t) t.textContent = name || '—';
    if (p) { p.innerHTML = playing ? '⏸' : '▶'; p.title = playing ? 'Pause' : 'Lecture'; }
  }

  function setVolUI(pct) {
    if (volDragging) return;
    var volEl  = document.getElementById('spVol');
    var volTip = document.getElementById('spVolTip');
    if (volEl)  volEl.value = pct;
    if (volTip) volTip.textContent = pct + '%';
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  async function login() {
    var v = genVerifier();
    var c = await genChallenge(v);
    sSet('v', v);
    sSet('ret', location.href);
    var params = new URLSearchParams({
      client_id: CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT,
      scope: SCOPES, code_challenge_method: 'S256', code_challenge: c
    });
    var url = 'https://accounts.spotify.com/authorize?' + params;
    var popup = window.open(url, 'sp-auth', 'width=460,height=620,popup=1');
    if (!popup || popup.closed) { location.href = url; return; }
    window._spDone = async function(code) {
      if (!popup.closed) popup.close();
      await exchange(code);
      await initPlayer();
    };
  }

  async function exchange(code) {
    var r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code: code, redirect_uri: REDIRECT,
        client_id: CLIENT_ID, code_verifier: sGet('v')
      })
    });
    if (!r.ok) return;
    var d = await r.json();
    sSet('tok', Object.assign({}, d, { ts: Date.now() }));
    sDel('v');
  }

  function logout() {
    sDel('tok');
    if (player) { try { player.disconnect(); } catch {} player = null; deviceId = null; }
    clearInterval(pollTimer); pollTimer = null;
    updateUI(false);
    setTrackUI(null, false);
  }

  // ── SDK ───────────────────────────────────────────────────────────────────
  function loadSDK() {
    if (document.getElementById('sp-sdk') || window.Spotify) return;
    var s = document.createElement('script');
    s.id = 'sp-sdk';
    s.src = 'https://sdk.scdn.co/spotify-player.js';
    document.head.appendChild(s);
  }

  async function initPlayer() {
    var token = await getToken();
    if (!token) { updateUI(false); return; }
    updateUI(true);
    window.onSpotifyWebPlaybackSDKReady = createPlayer;
    loadSDK();
    if (window.Spotify) createPlayer();
  }

  function createPlayer() {
    if (player) return;
    var savedVol = (sGet('vol') || 50) / 100;

    player = new Spotify.Player({
      name: 'Atlas de poche 🗺️',
      getOAuthToken: function(cb) { getToken().then(cb); },
      volume: savedVol
    });

    player.addListener('ready', async function(ref) {
      deviceId = ref.device_id;
      await api('PUT', '/me/player', { device_ids: [deviceId], play: false });
      await syncState();
      clearInterval(pollTimer);
      pollTimer = setInterval(syncState, 6000);
    });

    player.addListener('player_state_changed', function(state) {
      if (!state) return;
      var t = state.track_window && state.track_window.current_track;
      if (t) setTrackUI(t.name + (t.artists[0] ? '  •  ' + t.artists[0].name : ''), !state.paused);
    });

    player.addListener('not_ready', function() { deviceId = null; });
    player.addListener('authentication_error', function() { logout(); });
    player.addListener('account_error', function() {
      alert('Spotify Premium requis pour la lecture dans le navigateur.');
      logout();
    });

    player.connect();
  }

  async function syncState() {
    if (!player) return;
    try {
      var state = await player.getCurrentState();
      if (!state) return;
      var t = state.track_window && state.track_window.current_track;
      if (t) setTrackUI(t.name + (t.artists[0] ? '  •  ' + t.artists[0].name : ''), !state.paused);
      if (!volDragging) {
        var v = await player.getVolume();
        setVolUI(Math.round(v * 100));
      }
    } catch {}
  }

  // ── Controls ──────────────────────────────────────────────────────────────
  function togglePlay() {
    if (player) { player.togglePlay(); return; }
    getToken().then(function(tok) {
      if (!tok) return;
      fetch('https://api.spotify.com/v1/me/player', { headers: { Authorization: 'Bearer ' + tok } })
        .then(function(r) { return r.json(); })
        .then(function(s) { api('PUT', s.is_playing ? '/me/player/pause' : '/me/player/play'); });
    });
  }
  function next() { if (player) player.nextTrack(); else api('POST', '/me/player/next'); }
  function prev() { if (player) player.previousTrack(); else api('POST', '/me/player/previous'); }
  function setVol(v) {
    var frac = v / 100;
    if (player) {
      player.setVolume(frac).catch(function() {
        api('PUT', '/me/player/volume?volume_percent=' + Math.round(v));
      });
    } else {
      api('PUT', '/me/player/volume?volume_percent=' + Math.round(v));
    }
  }

  // ── Pending code (same-tab fallback) ──────────────────────────────────────
  async function checkPendingCode() {
    var code = localStorage.getItem('sp_pending_code');
    if (!code) return;
    localStorage.removeItem('sp_pending_code');
    await exchange(code);
    await initPlayer();
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async function() {
    injectCSS();
    buildUI();
    await checkPendingCode();
    if (getTokens()) await initPlayer();
  });

})();
