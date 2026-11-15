(() => {
  'use strict';
  const screen = document.querySelector('#boot-screen');
  const loading = document.querySelector('#boot-loading');
  const message = document.querySelector('#boot-message');
  const percent = document.querySelector('#boot-percent');
  const progress = document.querySelector('#boot-progress');
  const play = document.querySelector('#boot-play');
  const retry = document.querySelector('#boot-retry');
  let opening, openingStarted = false;
  let displayed = 0, elapsed = 0;
  const stages = { physics: 0, code: 0, scene: 0, music: 0, fonts: 0 };
  let ready = false, presentationDone = false, failed = false;
  function update(key, value) {
    stages[key] = Math.max(stages[key], Math.min(1, value));
    const canBegin = ready && presentationDone && !failed;
    const valueNow = canBegin ? 100 : Math.min(99, displayed);
    percent.textContent = valueNow + '%';
    progress.setAttribute('aria-valuenow', String(valueNow));
    progress.firstElementChild.style.width = valueNow + '%';
    opening?.setProgress(valueNow / 100);
    opening?.setReady(canBegin);
    if (!failed) message.textContent = '';
    play.hidden = !canBegin;
    play.disabled = !canBegin || openingStarted;
    if (canBegin && !openingStarted) screen.dataset.stage = 'ready';
  }

  function fail(error) {
    if (failed || document.body.dataset.booting !== 'true') return;
    failed = true;
    opening?.dispose();
    screen.classList.remove('leaving');
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
      script.src = path + '?v=20261115-opening-1';
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
  // Deliberately paced presentation, separate from actual asset readiness.
  // Quantized jumps and small plateaus evoke an unpolished machine waking up.
  function presentation() {
    if (failed || openingStarted) return;
    if (!document.hidden) elapsed += .08;
    const stops = [[0,0],[.6,0],[1.5,17],[2,17],[3.1,38],[3.7,38],[5,68],[5.6,68],[7,91],[7.6,91],[8.4,100]];
    let amount = 100;
    for (let i = 1; i < stops.length; i++) if (elapsed < stops[i][0]) {
      const a = stops[i-1], b = stops[i];
      amount = a[1] + (b[1]-a[1]) * (elapsed-a[0]) / (b[0]-a[0]);break;
    }
    displayed = Math.max(displayed, Math.floor(amount));
    presentationDone = elapsed >= 8.4;
    update('scene', stages.scene);
    if (!presentationDone) setTimeout(presentation, 80);
    else if (ready) play.focus({preventScroll:true});
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
  play.addEventListener('click', async () => {
    if (!ready || !presentationDone || failed || openingStarted || play.disabled) return;
    openingStarted = true;play.disabled = true;
    // Unlock audio in the gesture; no NPC dialogue runs during this opening.
    QBitsMusic.start();
    screen.dataset.stage = 'cinematic';loading.hidden = true;
    try {
      await opening.play();
      if (failed) return;
      QBitsGame.menu();
      document.body.dataset.booting = 'false';
      screen.classList.add('leaving');
      setTimeout(() => {
        screen.hidden = true;opening.dispose();
        document.querySelector('#main-play').focus({preventScroll:true});
      }, 1100);
    } catch (error) { fail(error); }
  });
  try {
    opening = QBitsOpening.create(document.querySelector('#opening-canvas'));
  } catch (error) { fail(error);return; }
  screen.dataset.stage = 'loading';loading.hidden = false;
  const typographyReady = loadTypography();
  presentation();
  Promise.all([
    typographyReady,
    (async () => {
      await loadScript('assets/js/cannon.min.js');update('physics', 1);
      await loadScript('assets/js/radial-menu.js');
      await loadScript('assets/js/rotor-power.js');
      await loadScript('assets/js/campaign-reconfiguration.js');
      await loadScript('assets/js/progression.js');
      await loadScript('assets/js/campaign-automation.js');
      await loadScript('assets/js/campaign-production.js');
      await loadScript('assets/js/workshop.js');
      await loadScript('assets/js/contact-sensors.js');
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
