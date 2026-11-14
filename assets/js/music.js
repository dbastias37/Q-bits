/* Q-bits music: real asset preloading, no decoded whole-playlist buffers. */
(() => {
  'use strict';
  const scriptURL = document.currentScript?.src || new URL('assets/js/music.js', document.baseURI).href;
  const manifestURL = new URL('../audio/music/playlist.json', scriptURL);
  const storageKey = 'qbits.music.v1';
  const listeners = new Set();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch (_) {}
  let volume = Number.isFinite(saved?.volume) ? Math.max(0, Math.min(1, saved.volume)) : 0.3;
  let muted = saved?.muted === true;
  let fadeSeconds = 3;
  let tracks = [], index = 0, ready = false, started = false, paused = false;
  let error = null, loading = null, fadeTimer = 0, generation = 0;
  let audio = null;
  let audioContext = null, gainNode = null;

  function getState() {
    return { ready, started, playing: !!audio && !audio.paused, paused, volume, muted,
      trackCount: tracks.length, track: tracks[index]?.title || null, error };
  }
  function notify() {
    for (const listener of listeners) {
      try { listener(getState()); } catch (err) { console.error(err); }
    }
  }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify({ volume, muted })); } catch (_) {}
  }
  function stopTimer() { clearInterval(fadeTimer); fadeTimer = 0; }
  function applyGain() {
    if (!audio) return;
    let envelope = 1;
    if (fadeSeconds > 0) {
      envelope = Math.min(1, audio.currentTime / fadeSeconds);
      if (Number.isFinite(audio.duration)) envelope = Math.min(envelope, (audio.duration - audio.currentTime) / fadeSeconds);
    }
    const value = muted ? 0 : volume * Math.max(0, envelope);
    if (gainNode && audioContext) {
      gainNode.gain.setTargetAtTime(value, audioContext.currentTime, 0.08);
    } else audio.volume = value;
  }
  function initAudioContext() {
    if (audioContext || !audio) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    try {
      audioContext = new Context();
      gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      audioContext.createMediaElementSource(audio).connect(gainNode);
      gainNode.connect(audioContext.destination);
      audio.volume = 1;
    } catch (_) {
      // Direct HTML audio remains available when Web Audio cannot initialize.
      if (audioContext) audioContext.close().catch(() => {});
      audioContext = null;
      gainNode = null;
    }
  }
  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('playing', () => {
      error = null;
      if (!fadeTimer) fadeTimer = setInterval(applyGain, 100);
      applyGain();
      notify();
    });
    audio.addEventListener('pause', () => { stopTimer(); notify(); });
    audio.addEventListener('ended', () => {
      stopTimer();
      if (!tracks.length || !started) return;
      index = (index + 1) % tracks.length;
      audio.src = tracks[index].url;
      audio.load();
      playIfAllowed();
    });
    audio.addEventListener('error', () => {
      stopTimer();
      error = 'No se pudo reproducir la pista ' + (tracks[index]?.title || '') + '.';
      notify();
    });
    return audio;
  }
  function playIfAllowed() {
    if (!ready || !started || paused || document.hidden || !tracks.length) return;
    applyGain();
    if (audioContext?.state === 'suspended') audioContext.resume().catch(() => {});
    // Keep play() in the originating click call stack for autoplay policies.
    const promise = audio.play();
    if (promise) promise.catch(err => {
      if (err.name === 'AbortError' || paused || document.hidden) return;
      error = err.name === 'NotAllowedError'
        ? 'Pulsa el control de música para activar el audio.'
        : 'No se pudo iniciar la música.';
      notify();
    });
  }
  function pausePlayback() { if (audio) audio.pause(); stopTimer(); }
  function releaseTracks() {
    pausePlayback();
    if (audio) { audio.removeAttribute('src'); audio.load(); }
    for (const track of tracks) URL.revokeObjectURL(track.url);
    tracks = [];
    index = 0;
  }
  async function fetchAsset(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('No se pudo cargar ' + decodeURIComponent(url.pathname.split('/').pop()) + ' (HTTP ' + response.status + ').');
      return await response.blob();
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('La descarga de música tardó demasiado. Comprueba la conexión y reintenta.');
      throw err;
    } finally { clearTimeout(timer); }
  }
  function waitUntilPlayable(player, run) {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        player.removeEventListener('loadeddata', loaded);
        player.removeEventListener('error', failed);
      };
      const loaded = () => { cleanup(); run === generation ? resolve() : reject(new Error('Carga cancelada.')); };
      const failed = () => { cleanup(); reject(new Error('El archivo de música ' + (tracks[index]?.title || '') + ' no es un audio compatible o está dañado.')); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('No se pudo preparar la música. Revisa su formato y reintenta.')); }, 20000);
      player.addEventListener('loadeddata', loaded, { once: true });
      player.addEventListener('error', failed, { once: true });
      player.load();
      if (player.readyState >= 2) loaded();
    });
  }
  function preload({ onProgress = () => {} } = {}) {
    if (loading) return loading;
    const run = ++generation;
    ready = false;
    error = null;
    releaseTracks();
    loading = (async () => {
      onProgress({ progress: 0, label: 'Preparando música', completed: 0, total: 1, bytesLoaded: 0 });
      let config;
      try {
        config = JSON.parse(await (await fetchAsset(manifestURL)).text());
      } catch (err) {
        throw new Error('No se pudo leer assets/audio/music/playlist.json. ' + err.message);
      }
      if (!Array.isArray(config.tracks)) throw new Error('La lista de música debe contener un arreglo tracks.');
      if (!Number.isFinite(saved?.volume) && Number.isFinite(config.volume)) volume = Math.max(0, Math.min(1, config.volume));
      if (Number.isFinite(config.fadeSeconds)) fadeSeconds = Math.max(0, Math.min(10, config.fadeSeconds));
      const total = config.tracks.length + 1;
      let bytesLoaded = 0;
      for (let n = 0; n < config.tracks.length; n++) {
        const entry = config.tracks[n];
        if (!entry || typeof entry.file !== 'string' || !entry.file.trim()) throw new Error('Cada pista debe tener un nombre de archivo file.');
        const url = new URL(entry.file, manifestURL);
        const folderURL = new URL('./', manifestURL);
        if (url.origin !== folderURL.origin || !url.pathname.startsWith(folderURL.pathname) || url.search || url.hash) {
          throw new Error('Las canciones deben estar dentro de assets/audio/music/.');
        }
        if (!/\.(mp3|ogg|m4a|wav|aac|opus)$/i.test(url.pathname)) throw new Error('Formato de música no admitido: ' + entry.file);
        onProgress({ progress: n / total, label: 'Cargando música ' + (n + 1) + ' / ' + config.tracks.length, completed: n, total, bytesLoaded });
        const blob = await fetchAsset(url);
        if (run !== generation) throw new Error('Carga cancelada.');
        if (!blob.size) throw new Error('El archivo ' + entry.file + ' está vacío.');
        bytesLoaded += blob.size;
        tracks.push({ title: typeof entry.title === 'string' ? entry.title : entry.file, url: URL.createObjectURL(blob) });
        index = n;
        const player = ensureAudio();
        player.src = tracks[n].url;
        await waitUntilPlayable(player, run);
        onProgress({ progress: (n + 1) / total, label: 'Música descargada', completed: n + 1, total, bytesLoaded });
      }
      if (tracks.length) {
        index = 0;
        const player = ensureAudio();
        player.src = tracks[0].url;
        await waitUntilPlayable(player, run);
      }
      if (run !== generation) throw new Error('Carga cancelada.');
      ready = true;
      onProgress({ progress: 1, label: tracks.length ? 'Música lista' : 'Música preparada', completed: total, total, bytesLoaded });
      notify();
      return getState();
    })().catch(err => {
      error = err.message;
      releaseTracks();
      notify();
      throw err;
    }).finally(() => { loading = null; });
    return loading;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pausePlayback(); else playIfAllowed();
  });
  window.QBitsMusic = Object.freeze({
    preload,
    start() { started = true; paused = false; initAudioContext(); playIfAllowed(); notify(); },
    setPaused(value) { paused = !!value; if (paused) pausePlayback(); else playIfAllowed(); notify(); },
    setVolume(value) { if (!Number.isFinite(value)) return; volume = Math.max(0, Math.min(1, value)); saved = { volume, muted }; save(); applyGain(); notify(); },
    setMuted(value) { muted = !!value; saved = { volume, muted }; save(); applyGain(); if (!muted) playIfAllowed(); notify(); },
    getState,
    subscribe(listener) { listeners.add(listener); listener(getState()); return () => listeners.delete(listener); },
    dispose() { ++generation; ready = started = false; releaseTracks(); notify(); }
  });
})();
