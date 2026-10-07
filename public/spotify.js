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
  // iOS Safari does not support the Web Playback SDK — use Web API remote-only mode
  var iosMode = /iP(hone|ad|od)/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

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
    // Still valid?
    if (t.access_token && (Date.now() - (t.ts || 0)) / 1000 < (t.expires_in || 3600) - 60) {
      return t.access_token;
    }
    // Refresh
    if (!t.refresh_token) { sDel('tok'); return null; }
    try {
      var r = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: t.refresh_token,
          client_id: CLIENT_ID
        })
      });
      if (!r.ok) {
        var err = await r.json().catch(function(){ return {}; });
        // Only clear tokens if the refresh token itself is truly invalid
        if (err.error === 'invalid_grant' || r.status === 400) sDel('tok');
        return null;
      }
      var d = await r.json();
      sSet('tok', Object.assign({}, d, {
        refresh_token: d.refresh_token || t.refresh_token,
        ts: Date.now()
      }));
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
      // 401 = token issue, but don't wipe tokens — let getToken handle refresh next call
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

    // Affiche le bandeau immédiatement si tokens déjà stockés (avant validation)
    if (getTokens()) updateUI(true);

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
    // Pass return URL both in localStorage and in state param (belt-and-suspenders)
    var ret = location.href;
    sSet('ret', ret);
    var params = new URLSearchParams({
      client_id: CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT,
      scope: SCOPES, code_challenge_method: 'S256', code_challenge: c,
      state: encodeURIComponent(ret)
    });
    location.href = 'https://accounts.spotify.com/authorize?' + params;
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
    if (!r.ok) return false;
    var d = await r.json();
    sSet('tok', Object.assign({}, d, { ts: Date.now() }));
    sDel('v');
    return true;
  }

  function logout() {
    sDel('tok');
    if (player) { try { player.disconnect(); } catch {} player = null; deviceId = null; }
    clearInterval(pollTimer); pollTimer = null;
    updateUI(false);
    setTrackUI(null, false);
  }

  // ── SDK (desktop only) ────────────────────────────────────────────────────
  function loadSDK() {
    if (iosMode) return;
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

    if (iosMode) {
      // iOS: Web API remote-control only (no in-browser audio)
      startPoll();
      return;
    }

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

    // On authentication error: only disconnect the SDK player, keep tokens intact
    player.addListener('authentication_error', function() {
      if (player) { try { player.disconnect(); } catch {} player = null; }
      // Retry init after a short delay (token might have refreshed)
      setTimeout(initPlayer, 3000);
    });

    player.addListener('account_error', function() {
      // Premium required for in-browser playback — fall back to remote control
      if (player) { try { player.disconnect(); } catch {} player = null; }
      startPoll();
    });

    player.connect();
  }

  // ── Polling (iOS / fallback) ───────────────────────────────────────────────
  function startPoll() {
    clearInterval(pollTimer);
    syncStateAPI();
    pollTimer = setInterval(syncStateAPI, 5000);
  }

  async function syncStateAPI() {
    var state = await api('GET', '/me/player');
    if (!state || !state.item) return;
    var t = state.item;
    setTrackUI(t.name + (t.artists[0] ? '  •  ' + t.artists[0].name : ''), state.is_playing);
    if (!volDragging && state.device) setVolUI(state.device.volume_percent);
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
    getToken().then(async function(tok) {
      if (!tok) return;
      var s = await api('GET', '/me/player');
      if (s) { await api('PUT', s.is_playing ? '/me/player/pause' : '/me/player/play'); syncStateAPI(); }
    });
  }
  function next() {
    if (player) { player.nextTrack(); return; }
    api('POST', '/me/player/next').then(function() { setTimeout(syncStateAPI, 600); });
  }
  function prev() {
    if (player) { player.previousTrack(); return; }
    api('POST', '/me/player/previous').then(function() { setTimeout(syncStateAPI, 600); });
  }
  function setVol(v) {
    if (player) {
      player.setVolume(v / 100).catch(function() {
        api('PUT', '/me/player/volume?volume_percent=' + Math.round(v));
      });
    } else {
      api('PUT', '/me/player/volume?volume_percent=' + Math.round(v));
    }
  }

  // ── Pending code (same-tab fallback) ──────────────────────────────────────
  async function checkPendingCode() {
    var code = localStorage.getItem('sp_pending_code');
    if (!code) return false;
    localStorage.removeItem('sp_pending_code');
    return await exchange(code);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async function() {
    injectCSS();
    buildUI();
    var exchanged = await checkPendingCode();
    if (exchanged || getTokens()) await initPlayer();
  });

  // Tokens arrivés depuis un autre onglet (iPad : l'app Spotify ouvre un nouvel onglet)
  window.addEventListener('storage', function(e) {
    if (e.key === 'sp_tok' && e.newValue) {
      var btn = document.getElementById('spBtn');
      if (btn && !btn.classList.contains('connected')) initPlayer();
    }
    // Code d'échange arrivé depuis un autre onglet
    if (e.key === 'sp_pending_code' && e.newValue) {
      checkPendingCode().then(function(ok) { if (ok) initPlayer(); });
    }
  });

  // Page restaurée depuis le cache navigation (retour arrière)
  window.addEventListener('pageshow', function(e) {
    if (e.persisted) {
      var btn = document.getElementById('spBtn');
      if (btn && !btn.classList.contains('connected') && getTokens()) initPlayer();
    }
  });

  // Retour sur cet onglet après avoir fait l'auth sur un autre
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      var btn = document.getElementById('spBtn');
      if (btn && !btn.classList.contains('connected') && getTokens()) initPlayer();
    }
  });

})();
