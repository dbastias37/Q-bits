(() => {
  'use strict';
  const screen = document.querySelector('#boot-screen');
  const loading = document.querySelector('#boot-loading');
  const message = document.querySelector('#boot-message');
  const percent = document.querySelector('#boot-percent');
  const progress = document.querySelector('#boot-progress');
  const play = document.querySelector('#boot-play');
  const retry = document.querySelector('#boot-retry');
  const mainMenu=document.querySelector('#main-screen'),openingCanvas=document.querySelector('#opening-canvas');
  let opening, openingStarted = false, quickRequested = false, quickDone = false;
  let displayed = 0, elapsed = 0;
  const stops = [[0,0]];
  let loadTime = .2 + Math.random()*.1, loadValue = 0;
  for (let i=0;i<3;i++) {
    loadValue = Math.min(95, loadValue + 20 + Math.random()*10);
    loadTime += .45 + Math.random()*.3;stops.push([loadTime,loadValue]);
    loadTime += .12 + Math.random()*.25;stops.push([loadTime,loadValue]);
  }
  stops.push([loadTime+.45,100]);
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
    if (!failed) message.textContent = quickRequested ? 'Preparando Despertar…' : '';
    play.hidden = !canBegin;
    play.disabled = !canBegin || openingStarted;
    if (canBegin && !openingStarted) screen.dataset.stage = 'ready';
  }

  function fail(error) {
    if (failed || document.body.dataset.booting !== 'true') return;
    failed = true;
    opening?.dispose();
    mainMenu.hidden=true;mainMenu.inert=false;mainMenu.classList.remove('cube-menu');
    mainMenu.style.transform='';mainMenu.style.filter='';mainMenu.style.opacity='';openingCanvas.style.filter='';
    console.error('Q-bits: no se pudo preparar el juego.', error);
    screen.dataset.stage = 'loading';loading.hidden = false;
    message.textContent = /WebGL|tarjeta gráfica/i.test(error?.message || '') ? 'No se pudo iniciar la vista 3D. Activa la aceleración gráfica y reintenta.' : /fuentes/i.test(error?.message || '') ? 'No se pudieron cargar las fuentes del juego. Reintenta la carga.' : 'No se pudo completar la carga. Revisa la conexión y los archivos de música, y reintenta.';
    play.hidden = true;play.disabled = true;retry.hidden = false;
    retry.focus({preventScroll:true});
  }
  function jumpToWake() {
    if (!ready || failed || quickDone || !QBitsGame.quickWake()) return false;
    quickDone=true;openingStarted=true;
    opening?.skip?.();opening?.dispose();
    mainMenu.classList.remove('cube-menu');mainMenu.inert=false;
    mainMenu.style.transform='';mainMenu.style.filter='';mainMenu.style.opacity='';openingCanvas.style.filter='';
    screen.hidden=true;document.body.dataset.booting='false';
    const savedGames=document.querySelector('#saves-screen');
    if(savedGames&&!savedGames.hidden)document.querySelector('#saves-campaign-continue').focus({preventScroll:true});
    else document.querySelector('#wake-button').focus({preventScroll:true});
    // The next explicit Despertar gesture unlocks the guide voice.
    return true;
  }
  window.addEventListener('keydown', event => {
    if(document.body.dataset.booting!=='true'||failed||event.repeat||event.ctrlKey||event.altKey||event.metaKey)return;
    if(event.code!=='Backquote'&&event.key!=='º')return;
    if(['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName)||event.target?.isContentEditable)return;
    event.preventDefault();event.stopImmediatePropagation();quickRequested=true;
    if(!jumpToWake())message.textContent='Preparando Despertar…';
  },true);
  retry.addEventListener('click', () => location.reload());
  window.addEventListener('error', event => fail(event.error || new Error(event.message)));
  function loadScript(path) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = path + '?v=20261122-startup-matrix-growth-1';
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
    let amount = 100;
    for (let i = 1; i < stops.length; i++) if (elapsed < stops[i][0]) {
      const a = stops[i-1], b = stops[i];
      amount = a[1] + (b[1]-a[1]) * (elapsed-a[0]) / (b[0]-a[0]);break;
    }
    displayed = Math.max(displayed, Math.floor(amount));
    presentationDone = elapsed >= stops[stops.length-1][0];
    update('scene', stages.scene);
    if (!presentationDone) setTimeout(presentation, 80);
    else if (ready) play.focus({preventScroll:true});
  }
  play.addEventListener('click', async () => {
    if (!ready || !presentationDone || failed || openingStarted || play.disabled) return;
    openingStarted = true;play.disabled = true;
    // Unlock audio in the gesture; no NPC dialogue runs during this opening.
    QBitsMusic.start();window.QBitsGuideAudio?.unlock();window.QBitsFootsteps?.unlock();window.QBitsJoinAudio?.unlock();
    screen.dataset.stage = 'cinematic';loading.hidden = true;
    try {
      mainMenu.hidden=false;mainMenu.inert=true;mainMenu.classList.add('cube-menu');mainMenu.style.opacity='0';
      await opening.play({onFrame:({matrix,blur,opacity,progress})=>{
        mainMenu.style.transform='matrix3d('+matrix.join(',')+')';
        mainMenu.style.filter='blur('+blur+'px)';mainMenu.style.opacity=String(opacity);
        const focus=Math.max(0,Math.min(1,(progress-.65)/.35));
        openingCanvas.style.filter='blur('+(8*Math.sin(Math.PI*focus)**2)+'px)';
      }});
      if (failed || quickDone) return;
      // The landing and subtle reveal are finished. Hand off input without moving the camera.
      QBitsGame.menu();
      document.body.dataset.booting = 'false';
      mainMenu.classList.remove('cube-menu');mainMenu.inert=false;
      mainMenu.style.transform='';mainMenu.style.filter='';mainMenu.style.opacity='';openingCanvas.style.filter='';
      screen.hidden=true;opening.dispose();
      document.querySelector('#main-play').focus({preventScroll:true});
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
      await loadScript('assets/js/propeller-power.js');
      await loadScript('assets/js/campaign-reconfiguration.js');
      await loadScript('assets/js/progression.js');
      await loadScript('assets/js/campaign-automation.js');
      await loadScript('assets/js/campaign-production.js');
      await loadScript('assets/js/workshop.js');
      await Promise.all(['furniture-models','tablet-model','tablet-view'].map(name=>loadScript('assets/js/'+name+'.js')));
      await loadScript('assets/js/organizers.js');
      await loadScript('assets/js/workshop-panel.js');
      await loadScript('assets/js/robot-arm-panel.js');
      await loadScript('assets/js/conveyor-panel.js');
      await loadScript('assets/js/battery-liquid.js');
      await loadScript('assets/js/reservoir-model.js');
      await loadScript('assets/js/contact-sensors.js');
      await loadScript('assets/js/controls.js');
      await loadScript('assets/js/subtitles.js');
      await loadScript('assets/js/dialogue-timing.js');
      await loadScript('assets/js/guide-audio.js');
      await loadScript('assets/js/footsteps.js');
      await loadScript('assets/js/join-audio.js');
      // Optional clips must never gate startup; missing files remain silent.
      window.QBitsGuideAudio?.preload();window.QBitsFootsteps?.preload();window.QBitsJoinAudio?.preload();
      await loadScript('assets/js/selection-hud.js');
      await loadScript('assets/js/preferences.js');
      await loadScript('assets/js/graphics.js');
      await loadScript('assets/js/culling.js');
      await loadScript('assets/js/glass.js');
      await loadScript('assets/js/settings.js');
      await loadScript('assets/js/save-games.js');
      await loadScript('assets/js/game.js');update('code', 1);
      if (!window.QBitsGame) throw new Error('El motor no pudo iniciarse.');
      await QBitsGame.prepare(value => update('scene', value));
    })(),
    (async () => {
      await loadScript('assets/js/music.js');
      await QBitsMusic.preload({onProgress: event => update('music', event.progress)});
      update('music', 1);
    })()
  ]).then(() => {
    if(failed)return;
    QBitsGame.applyPreferences?.();
    ready = true;
    if(quickRequested&&jumpToWake())return;
    update('scene', 1);
    if(presentationDone)play.focus({preventScroll:true});
  }).catch(fail);
})();
