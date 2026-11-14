(() => {
  'use strict';
  const screen = document.querySelector('#boot-screen');
  const loading = document.querySelector('#boot-loading');
  const message = document.querySelector('#boot-message');
  const percent = document.querySelector('#boot-percent');
  const progress = document.querySelector('#boot-progress');
  const play = document.querySelector('#boot-play');
  const retry = document.querySelector('#boot-retry');
  const title = document.querySelector('#main-screen h1').cloneNode(true);
  document.querySelector('#boot-title').append(title);
  const stages = { physics: 0, code: 0, scene: 0, music: 0, fonts: 0 };
  const weights = { physics: 10, code: 15, scene: 45, music: 20, fonts: 10 };
  let ready = false, presentationDone = false, failed = false;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  function update(key, value) {
    stages[key] = Math.max(stages[key], Math.min(1, value));
    const valueNow = ready ? 100 : Math.min(99, Math.floor(Object.keys(stages).reduce((n, k) => n + stages[k] * weights[k], 0)));
    percent.textContent = valueNow + '%';
    progress.setAttribute('aria-valuenow', String(valueNow));
    progress.firstElementChild.style.width = valueNow + '%';
    if (!failed) message.textContent = ready ? 'Todo está listo.' : stages.scene < 1 ? 'Preparando el encuentro…' : 'Cargando el ambiente…';
    play.hidden = !(ready && presentationDone && !failed);
    play.disabled = !ready || !presentationDone || failed;
  }
  function fail(error) {
    if (failed || document.body.dataset.booting !== 'true') return;
    failed = true;
    console.error('Q-bits: no se pudo preparar el juego.', error);
    screen.dataset.stage = 'loading';loading.hidden = false;
    message.textContent = /WebGL|tarjeta gráfica/i.test(error?.message || '') ? 'No se pudo iniciar la vista 3D. Activa la aceleración gráfica y reintenta.' : /fuentes/i.test(error?.message || '') ? 'No se pudieron cargar las fuentes del juego. Reintenta la carga.' : 'No se pudo completar la carga. Revisa la conexión y los archivos de música, y reintenta.';
    play.hidden = true;play.disabled = true;retry.hidden = false;
    retry.focus({preventScroll:true});
  }
  retry.addEventListener('click', () => location.reload());
  window.addEventListener('error', event => fail(event.error || new Error(event.message)));
  function loadScript(path) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = path + '?v=20261114-10';
      script.onload = resolve;
      script.onerror = () => reject(new Error('No se pudo cargar ' + path));
      document.head.append(script);
    });
  }
  async function loadTypography() {
    if (!document.fonts) throw new Error('Este navegador no puede preparar las fuentes del juego.');
    const faces = await Promise.all([
      document.fonts.load('20px Tengoku', '¿Cómo estás, Q-bit?'),
      document.fonts.load('14px "Spaceman UI"', '¿Qué? ¡Sí! Q-bits'),
      document.fonts.load('90px "LED Calculator"', 'Q-bits')
    ]);
    if (faces.some(list => !list.length)) throw new Error('No se pudieron cargar las fuentes del juego.');
    update('fonts', 1);
  }
  async function presentation() {
    // These timings belong only to the cinematic. They never advance the load bar.
    await wait(250);if(failed)return;
    screen.dataset.stage = 'credit-visible';
    await wait(3100);if(failed)return;
    screen.dataset.stage = 'black';
    await wait(2900);if(failed)return;
    await typographyReady;if(failed)return;
    screen.dataset.stage = 'title';
    await wait(1600);if(failed)return;
    screen.dataset.stage = 'loading';loading.hidden = false;presentationDone = true;
    update('scene', stages.scene);
    if (ready) play.focus({preventScroll:true});
  }
  function musicControls() {
    for (const id of ['main-screen', 'pause-screen']) {
      const row = document.createElement('div');row.className = 'music-settings';
      const mute = document.createElement('button');mute.type = 'button';
      const label = document.createElement('label');label.textContent = 'Volumen ';
      const volume = document.createElement('input');volume.type = 'range';volume.min = '0';volume.max = '100';volume.step = '1';volume.setAttribute('aria-label', 'Volumen de música');
      label.append(volume);row.append(mute, label);document.getElementById(id).append(row);
      mute.addEventListener('click', () => QBitsMusic.setMuted(!QBitsMusic.getState().muted));
      volume.addEventListener('input', () => QBitsMusic.setVolume(Number(volume.value) / 100));
      QBitsMusic.subscribe(state => {
        mute.textContent = state.muted ? 'Música: apagada' : 'Música: encendida';
        mute.setAttribute('aria-pressed', String(!state.muted));volume.value = String(Math.round(state.volume * 100));
        row.hidden = state.trackCount === 0;
      });
    }
  }
  play.addEventListener('click', () => {
    if (!ready || !presentationDone || failed || play.disabled) return;
    play.disabled = true;
    // Keep media playback in this user gesture, as browsers require.
    QBitsMusic.start();
    document.body.dataset.booting = 'false';
    QBitsGame.play();screen.classList.add('leaving');
    setTimeout(() => {screen.hidden = true;document.querySelector('#room').focus({preventScroll:true});}, 850);
  });
  const typographyReady = loadTypography();
  presentation().catch(fail);
  Promise.all([
    typographyReady,
    (async () => {
      await loadScript('assets/js/cannon.min.js');update('physics', 1);
      await loadScript('assets/js/radial-menu.js');
      await loadScript('assets/js/game.js');update('code', 1);
      if (!window.QBitsGame) throw new Error('El motor no pudo iniciarse.');
      await QBitsGame.prepare(value => update('scene', value));
    })(),
    (async () => {
      await loadScript('assets/js/music.js');
      await QBitsMusic.preload({onProgress: event => update('music', event.progress)});
      update('music', 1);musicControls();
    })()
  ]).then(() => {
    if(failed)return;
    ready = true;update('scene', 1);
    if(presentationDone)play.focus({preventScroll:true});
  }).catch(fail);
})();
