/* A draft changes only the preview. Save applies a validated snapshot atomically. */
(function(){'use strict';
 const P=window.QBitsPreferences,C=window.QBitsControls,S=window.QBitsSubtitles;
 window.QBitsSettings={init(hooks){
  const tx=P.transaction(hooks.storage||localStorage),screen=document.querySelector('#settings-screen'),fields=document.querySelector('#settings-fields'),confirm=document.querySelector('#settings-confirm'),status=document.querySelector('#settings-status');
  let tab='look',returnMode='menu',returnFocus=null,open=false,capture=null,padFrame=0,lastPadStatus=0;
  const reset=document.querySelector('#settings-reset');
  const clone=value=>JSON.parse(JSON.stringify(value));
  const changed=()=>{status.textContent=tx.dirty?'Cambios sin guardar':'Configuración guardada';};
  const profileKeys=new Set(Object.keys(P.styles.clean));
  const tabs={look:[
   ['style','Estilo visual','select',[['clean','Original · sala blanca'],['psx','PSX'],['neon','Dithering + neón'],['cel','Cel shading']]],
   ['outlineColor','Color de delineado y marcador','color'],['outlineWidth','Grosor del delineado','range',1,6,.5,' px'],['pathColor','Color de trayectoria','color'],['cableColor','Color del cable eléctrico','color'],['pathWidth','Grosor de trayectorias y cables','range',1,6,.5,' ×'],
   ['markers','Marcadores de selección','check'],['markerMotion','Flotación suave del marcador','check'],
   ['dither','Dithering','range',0,100,1,' %'],['bits','Profundidad de color','range',3,8,1,' bits/canal'],['jitter','Temblor de vértices PSX','range',0,100,1,' %'],['warp','Deformación de textura PSX','range',0,100,1,' %'],['cel','Bandas de cel shading','range',0,8,1,''],['bloom','Bloom','check'],['bloomStrength','Intensidad de bloom','range',0,100,1,' %']
  ],performance:[
   ['quality','Calidad predefinida','select',[['low','Rendimiento'],['balanced','Equilibrado'],['high','Alta'],['custom','Personalizado']]],
   ['culling','Descartar fuera de cámara (culling)','check'],
   ['physicsHz','Pasos de simulación por segundo','select',[[240,'240 · Predeterminado'],[120,'120 · Prueba'],[60,'60 · Prueba']]],
   ['resolution','Escala de resolución','range',50,150,5,' %'],['sampling','Muestreo de imagen','select',[[1,'1×'],[1.5,'1,5×'],[2,'2×']]],['textureScale','Escalado de textura','select',[[.25,'25 %'],[.5,'50 %'],[1,'100 %'],[2,'200 %'],[4,'400 %']]],
   ['filter','Filtrado de textura','select',[['nearest','Píxel / vecino más cercano'],['linear','Bilineal'],['trilinear','Trilineal']]],['anisotropy','Filtrado anisotrópico','select',[[1,'Desactivado'],[2,'2×'],[4,'4×'],[8,'8×'],[16,'16×']]],['shadows','Sombras','select',[['off','Desactivadas'],['soft','Suaves'],['sharp','Alta · contorno definido']]],['lighting','Iluminación mejorada','range',0,100,1,' %'],['fps','Límite de fotogramas','select',[[0,'Frecuencia de pantalla'],[30,'30 FPS'],[60,'60 FPS'],[120,'120 FPS']]]
  ],audio:[['music','Música ambiental','check'],['volume','Volumen de música','range',0,100,1,' %'],['guideVoice','Voz del guía','check'],['guideVolume','Volumen del guía','range',0,100,1,' %'],['footsteps','Pisadas de los Q-bits','check'],['footstepVolume','Volumen de pisadas','range',0,100,1,' %'],['joinSounds','Unión de bloques','check'],['joinVolume','Volumen de uniones','range',0,100,1,' %']]};
  function field(holder,key,title,type,args=[],options={}){
   const row=document.createElement('div');row.className='settings-row';
   const label=document.createElement('label');label.htmlFor='pref-'+(options.prefix||'')+key;label.textContent=title;
   const control=document.createElement('div');control.className='settings-control';
   const input=document.createElement(type==='select'?'select':'input');input.id=label.htmlFor;
   if(type==='select')for(const [value,text]of args[0]){const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option);}
   else input.type=type==='check'?'checkbox':type;
   if(type==='range'){[input.min,input.max,input.step]=args;const output=document.createElement('output');output.htmlFor=input.id;output.textContent=holder[key]+(args[3]||'');control.append(output);input.addEventListener('input',()=>{output.textContent=input.value+(args[3]||'');});}
   if(type==='check')input.checked=holder[key];else input.value=holder[key];
   if(options.note){const small=document.createElement('small');small.textContent=options.note;label.append(small);}
   if(key==='anisotropy'){
    const max=hooks.capabilities?.anisotropy||1;for(const opt of input.options)if(Number(opt.value)>max)opt.disabled=true;
    const note=document.createElement('small');note.textContent=max>1?'Disponible en este equipo: hasta '+max+'×.':'No disponible en esta GPU.';label.append(note);input.disabled=max<=1;
   }
   input.addEventListener(type==='range'||type==='color'?'input':'change',()=>{
    holder[key]=type==='check'?input.checked:typeof holder[key]==='number'?Number(input.value):input.value;
    options.onChange?.(input.value);changed();
   });
   control.append(input);row.append(label,control);fields.append(row);return input;
  }
  function note(text){const p=document.createElement('p');p.className='settings-note';p.textContent=text;fields.append(p);return p;}
  function clearCapture(){if(capture){const {device,action}=capture,button=document.querySelector('#bind-'+device+'-'+action),value=tx.draft.controls[device].bindings[action];if(button)button.textContent=value===null||value===undefined?'Sin asignar':device==='keyboard'?C.keyLabel(value):C.buttonLabels[value]||('Botón '+value);}capture=null;screen.dataset.bindingCapture='';}
  function finishBinding(value){
   if(!capture)return;const {device,action}=capture,result=C.assignBinding(tx.draft.controls,device,action,value);
   if(!result){status.textContent='Esa asignación está reservada. Elige otra o pulsa Esc para cancelar.';return;}
   const other=C.actions.find(item=>item.id===result.swapped);clearCapture();render();changed();
   if(other&&value!==null)status.textContent='Asignación intercambiada con «'+other.label+'» · cambios sin guardar';
  }
  function padSnapshot(){
   try{return Array.from(navigator.getGamepads?.()||[]).filter(Boolean);}catch{return [];}
  }
  function captureBinding(device,action){
   clearCapture();capture={device,action,previous:new Map(padSnapshot().map(pad=>[pad.index,pad.buttons.map(button=>!!button.pressed||button.value>.5)]))};
   screen.dataset.bindingCapture=device;status.textContent=device==='keyboard'?'Pulsa una tecla o botón del ratón · Esc cancela':'Pulsa un botón del mando · Esc cancela';
   const button=document.querySelector('#bind-'+device+'-'+action);if(button)button.textContent='Esperando…';
  }
  function renderControls(device){
   const holder=tx.draft.controls[device],presets=device==='keyboard'?C.keyboardPresets:C.gamepadPresets;
   field(holder,'preset','Distribución','select',[[...Object.entries(presets).map(([value,preset])=>[value,preset.label]),['custom','Personalizada']]],{prefix:device+'-',onChange:value=>{if(value!=='custom')C.setPreset(tx.draft.controls,device,value);render();}});
   if(device==='gamepad'){
    field(holder,'enabled','Usar mando','check',[],{prefix:'gamepad-'});
    const connection=document.createElement('p');connection.id='settings-pad-status';connection.className='settings-pad-status';connection.setAttribute('role','status');connection.textContent='Conecta el mando y pulsa un botón para detectarlo.';fields.append(connection);
    note('DualShock 4 / PS4 y mandos con distribución estándar. Stick izquierdo: caminar. Stick derecho: mirar. En menús: cruceta, × aceptar y ○ volver. Mantén el acceso al mostrador y usa la cruceta para elegir una miniatura.');
    field(holder,'deadzone','Zona muerta de sticks','range',[.05,.4,.01,''],{prefix:'gamepad-'});
   }else note('Pulsa una asignación y después la nueva tecla o botón del ratón. Las teclas repetidas intercambian sus acciones. Esc cancela la captura; la pausa conserva siempre Esc como salida de seguridad.');
   field(holder,'sensitivity',device==='keyboard'?'Sensibilidad del ratón':'Sensibilidad de cámara','range',[.25,3,.05,'×'],{prefix:device+'-'});
   field(holder,'invertY','Invertir cámara vertical','check',[],{prefix:device+'-'});
   for(const action of C.actions){
    const row=document.createElement('div');row.className='settings-row settings-binding-row';
    const label=document.createElement('label');label.textContent=action.label;label.htmlFor='bind-'+device+'-'+action.id;
    const group=document.createElement('div');group.className='settings-binding-actions';
    const button=document.createElement('button');button.type='button';button.id=label.htmlFor;
    const value=holder.bindings[action.id];button.textContent=value===null||value===undefined?'Sin asignar':device==='keyboard'?C.keyLabel(value):C.buttonLabels[value]||('Botón '+value);
    button.setAttribute('aria-label',action.label+': '+button.textContent);button.addEventListener('click',()=>captureBinding(device,action.id));
    const clear=document.createElement('button');clear.type='button';clear.className='settings-binding-clear';clear.textContent='×';clear.title='Quitar asignación';clear.setAttribute('aria-label','Quitar asignación de '+action.label);clear.addEventListener('click',()=>{C.assignBinding(tx.draft.controls,device,action.id,null);clearCapture();render();changed();});
    group.append(button,clear);row.append(label,group);fields.append(row);
   }
   note('Los cambios de controles se aplican al guardar. Las acciones sin asignar siguen disponibles desde sus menús cuando corresponda.');
  }
  function renderSubtitles(){
   note('NPC y Q-bits tienen estilos independientes. Ocultar sus textos no elimina las opciones de diálogo ni los botones para avanzar.');
   for(const [channel,title]of [['npc','NPC'],['qbits','Q-bits']]){
    const holder=tx.draft.subtitles[channel],heading=document.createElement('h3');heading.className='settings-section-title';heading.textContent=title;fields.append(heading);
    let sample;
    const refresh=()=>{if(!sample)return;Object.assign(sample.style,S.styleObject(holder));sample.style.opacity=holder.enabled?'1':'.4';sample.textContent=holder.enabled?(channel==='npc'?'Cada pieza cuenta. Tú decides el siguiente paso.':'¡Hola! ¿Nos llevas contigo?'):'Subtítulos desactivados';};
    for(const [key,label,type,args]of [['enabled','Mostrar subtítulos','check',[]],['color','Color del texto','color',[]],['size','Tamaño del texto','range',[12,32,1,' px']],['background','Color del contenedor','color',[]],['opacity','Opacidad del contenedor','range',[0,100,1,' %']]])field(holder,key,label,type,args,{prefix:channel+'-',onChange:refresh});
    sample=document.createElement('p');sample.className='settings-subtitle-sample';sample.id='settings-subtitle-preview-'+channel;fields.append(sample);refresh();
   }
  }
  function renderGameplay(){
   field(tx.draft,'invertObjectDistance','Invertir rueda al acercar y alejar objetos','check');
   note('Por defecto: rueda hacia abajo acerca; rueda hacia arriba aleja.');
   field(tx.draft,'invertPieceRotation','Invertir giro de las piezas','check');
   const input=field(tx.draft,'grabSpeed','Velocidad al mover piezas','select',[[[1,'Lento · Actual (×1)'],[2,'Normal · ×2'],[3.5,'Rápido · ×3,5']]]);
   const help=note('Se aplica a las piezas sujetas y a los conjuntos seleccionados, tanto con teclado y ratón como con mando. No cambia la velocidad al caminar ni la del giro, que tiene su propio control.');help.id='settings-grab-help';
   const warning=note('Con velocidades altas, los choques pueden lanzar las piezas cercanas. Mueve con cuidado.');warning.id='settings-grab-warning';
   input.setAttribute('aria-describedby','settings-grab-help settings-grab-warning');
  }
  function render(){
   fields.replaceChildren();
   if(tab==='keyboard'||tab==='mando')renderControls(tab==='keyboard'?'keyboard':'gamepad');
   else if(tab==='game')renderGameplay();
   else if(tab==='subtitles')renderSubtitles();
   else for(const [key,title,type,...args]of tabs[tab]){
    const holder=profileKeys.has(key)?tx.draft.profiles[tx.draft.style]:tx.draft;
    field(holder,key,title,type,args,{note:key==='culling'?'Omite el dibujo fuera del campo de visión. La física, la energía y las máquinas siguen funcionando.':key==='physicsHz'?'Se aplica al guardar y mantiene la velocidad del juego. Si aparecen temblores o piezas que se atraviesan, vuelve a 240.':undefined,onChange:value=>{
     if(key==='quality'){P.setQuality(tx.draft,value);render();}
     else if(key==='style')render();
     else if(tab==='performance'&&key!=='culling'&&key!=='physicsHz'){tx.draft.quality='custom';const select=document.querySelector('#pref-quality');if(select)select.value='custom';}
    }});
   }
   if(tab==='performance'){
    note('En la sala: 7 del teclado numérico muestra la vista externa y el campo de visión del jugador; / alterna el culling. En P están las mediciones y la comparación A/B de una escena fija.');
    const row=document.createElement('div');row.className='settings-row';const label=document.createElement('label');label.textContent='Sincronización vertical · VSync';label.htmlFor='pref-vsync';const input=document.createElement('select');input.id='pref-vsync';input.disabled=true;const option=document.createElement('option');option.textContent='Automática · navegador';input.append(option);row.append(label,input);fields.append(row);
   }
   if(['look','performance','audio'].includes(tab))note(tab==='performance'?'VSync: automático, gestionado por el navegador. La iluminación añade rebote y reflejos aproximados; no es ray tracing RTX. Las texturas son procedurales. El muestreo y la resolución se limitan a 4,5 MP para proteger la memoria.':tab==='audio'?'La música, la voz del guía, las pisadas y las uniones tienen volúmenes independientes. Los cambios se aplican al guardar.':'Cada estilo conserva sus propios colores, grosores y efectos. La vista previa muestra los cambios antes de guardarlos.');
   reset.textContent=tab==='look'?'Restaurar estilo':tab==='performance'?'Restaurar rendimiento':tab==='game'?'Restaurar juego':tab==='audio'?'Restaurar audio':tab==='keyboard'?'Restaurar teclado':tab==='mando'?'Restaurar mando':'Restaurar subtítulos';
   for(const button of screen.querySelectorAll('[data-settings-tab]')){button.setAttribute('aria-selected',String(button.dataset.settingsTab===tab));button.tabIndex=button.dataset.settingsTab===tab?0:-1;}
  }
  function pollPad(time){
   padFrame=0;if(!open)return;
   if(tab==='mando'){
    const pads=padSnapshot(),pad=pads.find(item=>item.mapping==='standard');
    if(time-lastPadStatus>=200||!lastPadStatus){lastPadStatus=time;const node=document.querySelector('#settings-pad-status');if(node){const pressed=pad?pad.buttons.map((button,index)=>button.pressed||button.value>.5?C.buttonLabels[index]||('Botón '+index):null).filter(Boolean):[];node.textContent=pad?'Mando conectado · '+(pressed.length?pressed.join(' + '):'listo'):pads.length?'Mando detectado sin distribución estándar compatible.':'Sin mando conectado · conecta y pulsa un botón.';}}
    if(capture?.device==='gamepad')for(const item of pads.filter(item=>item.mapping==='standard')){
     const current=item.buttons.map(button=>!!button.pressed||button.value>.5),before=capture.previous.get(item.index)||current;
     const index=current.findIndex((pressed,i)=>pressed&&!before[i]&&i<C.buttonLabels.length);
     capture.previous.set(item.index,current);if(index>=0){finishBinding(index);break;}
    }
   }
   padFrame=requestAnimationFrame(pollPad);
  }
  document.addEventListener('keydown',event=>{
   if(!open||!capture)return;event.preventDefault();event.stopImmediatePropagation?.();event.stopPropagation();
   if(event.code==='Escape'){clearCapture();render();changed();return;}
   if(capture.device==='keyboard'&&!event.repeat){if(C.validKey(event.code))finishBinding(event.code);else status.textContent='Esa tecla está reservada por el navegador. Elige otra o pulsa Esc.';}
  },true);
  document.addEventListener('pointerdown',event=>{
   if(!open||capture?.device!=='keyboard')return;
   if(event.target?.id==='settings-back'||event.target?.id==='settings-reset'){clearCapture();render();return;}
   const token='Mouse'+event.button;if(!C.validKey(token))return;event.preventDefault();event.stopImmediatePropagation?.();event.stopPropagation();finishBinding(token);
  },true);
  function close(){clearCapture();if(padFrame)cancelAnimationFrame(padFrame);padFrame=0;open=false;confirm.hidden=true;screen.hidden=true;hooks.close(returnMode);returnFocus?.focus({preventScroll:true});}
  function save(exit=false){clearCapture();try{const saved=tx.save();hooks.apply(saved);status.textContent='Configuración guardada';if(exit)close();else render();return true;}catch{status.textContent='No se pudo guardar. Revisa el almacenamiento del navegador; tus cambios siguen aquí.';return false;}}
  function requestClose(){clearCapture();changed();if(tx.dirty){confirm.hidden=false;document.querySelector('#settings-keep').focus();}else close();}
  const api={get isOpen(){return open;},get draft(){return P.effective(tx.draft);},requestClose,open(mode){returnFocus=document.activeElement;returnMode=mode;tx.begin();open=true;clearCapture();if(!padFrame)padFrame=requestAnimationFrame(pollPad);hooks.open();screen.hidden=false;confirm.hidden=true;status.textContent='Configuración guardada';render();document.querySelector('#settings-back').focus();}};
  for(const button of screen.querySelectorAll('[data-settings-tab]'))button.addEventListener('click',()=>{clearCapture();tab=button.dataset.settingsTab;render();changed();});
  document.querySelector('#settings-save').addEventListener('click',()=>save(false));
  document.querySelector('#settings-back').addEventListener('click',requestClose);
  reset.addEventListener('click',()=>{clearCapture();const defaults=P.defaults();if(tab==='look')tx.draft.profiles[tx.draft.style]=clone(P.styles[tx.draft.style]);else if(tab==='performance'){P.setQuality(tx.draft,'balanced');tx.draft.textureScale=1;tx.draft.culling=defaults.culling;tx.draft.physicsHz=defaults.physicsHz;}else if(tab==='game'){for(const key of ['grabSpeed','invertObjectDistance','invertPieceRotation'])tx.draft[key]=defaults[key];}else if(tab==='audio'){tx.draft.music=defaults.music;tx.draft.volume=defaults.volume;tx.draft.guideVoice=defaults.guideVoice;tx.draft.guideVolume=defaults.guideVolume;tx.draft.footsteps=defaults.footsteps;tx.draft.footstepVolume=defaults.footstepVolume;tx.draft.joinSounds=defaults.joinSounds;tx.draft.joinVolume=defaults.joinVolume;}else if(tab==='subtitles')tx.draft.subtitles=defaults.subtitles;else tx.draft.controls[tab==='keyboard'?'keyboard':'gamepad']=defaults.controls[tab==='keyboard'?'keyboard':'gamepad'];render();changed();});
  document.querySelector('#settings-keep').addEventListener('click',()=>{confirm.hidden=true;document.querySelector('#settings-back').focus();});
  document.querySelector('#settings-discard').addEventListener('click',()=>{tx.discard();close();});
  document.querySelector('#settings-confirm-save').addEventListener('click',()=>save(true));
  screen.addEventListener('keydown',event=>{
   if(event.target?.dataset.settingsTab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
    event.preventDefault();const names=[...screen.querySelectorAll('[data-settings-tab]')].map(button=>button.dataset.settingsTab),at=names.indexOf(tab);clearCapture();tab=event.key==='Home'?names[0]:event.key==='End'?names.at(-1):names[(at+(event.key==='ArrowRight'?1:names.length-1))%names.length];render();changed();screen.querySelector('[data-settings-tab="'+tab+'"]').focus();
   }
   if(event.code==='Escape'){event.preventDefault();event.stopPropagation();if(!confirm.hidden){confirm.hidden=true;document.querySelector('#settings-back').focus();}else requestClose();}
   if(event.key==='Tab'){const scope=confirm.hidden?screen:confirm,nodes=[...scope.querySelectorAll('button,input,select')].filter(el=>!el.disabled&&el.offsetParent!==null),first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  });
  window.addEventListener('beforeunload',event=>{if(open&&tx.dirty){event.preventDefault();event.returnValue='';}});
  return api;
 }};
})();

