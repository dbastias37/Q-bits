import { PARAMS, STORAGE_KEY, createStore, getSelection, getCapabilities, serializeDemo, restoreDemo } from './model.mjs';
import { createMechanismRenderer, createTabletShell } from './renderer.mjs';
import { buildRouteTimeline, sampleRouteTimeline } from './route-preview.mjs';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const paths = {
  build:'M4 7 12 3l8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4M12 11v10',
  control:'M5 4v16M12 4v16M19 4v16M2 9h6M9 16h6M16 8h6',
  route:'M5 17c0-8 14 3 14-10M8 17a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM22 7a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z',
  save:'M4 3h13l4 4v14H3V3h1Zm3 0v6h10V3M7 21v-8h10v8',
  select:'m5 3 14 10-7 1-3 7L5 3Z',
  move:'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  rotate:'M4 9a8 8 0 1 1 1 9M4 3v6h6',
  group:'M4 3h6v6H4ZM14 3h6v6h-6ZM4 15h6v6H4ZM14 15h6v6h-6ZM12 9v6M10 12h4',
  ungroup:'M3 3h7v7H3ZM14 14h7v7h-7ZM14 4h6v6M20 4l-6 6M4 14v6h6M4 20l6-6',
  duplicate:'M8 8h12v12H8ZM4 15H3V3h12v1',
  trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
  blueprint:'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M8 8h8v8H8Z',
  focus:'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M9 12h6M12 9v6',
  play:'m8 4 12 8-12 8V4Z',
  stop:'M5 5h14v14H5Z',
  restart:'M4 10a8 8 0 1 1 1 8M4 4v6h6M12 8v5l3 2',
  reverse:'M3 7h16l-4-4M21 17H5l4 4',
  cube:'M4 7 12 3l8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4M12 11v10',
  servo:'M3 18 12 4l9 14H3ZM12 4v14M3 18l9-5 9 5',
  rotor:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM12 1v3M12 20v3M1 12h3M20 12h3',
  battery:'M8 3h8v3h3v15H5V6h3V3ZM8 12h8M12 9v6',
  gripper:'M8 3v8l-4 4v5h5v-4l3-3 3 3v4h5v-5l-4-4V3',
  drone:'M9 9h6v6H9ZM4 4l5 5M20 4l-5 5M4 20l5-5M20 20l-5-5M1 4h6M17 4h6M1 20h6M17 20h6',
  family:'M3 7 12 3l9 4v11l-9 4-9-4V7ZM3 11l9 4 9-4M12 15v7',
  settings:'M5 5h14v14H5ZM2 9h3M19 9h3M2 15h3M19 15h3M9 2v3M15 2v3M9 19v3M15 19v3',
  close:'M5 5l14 14M19 5 5 19',
  catalog:'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  plus:'M12 5v14M5 12h14', minus:'M5 12h14', left:'m14 6-6 6 6 6', right:'m10 6 6 6-6 6',
  tablet:'M4 4h16v15H4ZM9 22h6', check:'m5 12 5 5 10-11', export:'M12 16V3M8 7l4-4 4 4M4 14v7h16v-7', import:'M12 3v13M8 12l4 4 4-4M4 14v7h16v-7',
  link:'m8 16 8-8M9 6l2-2a5 5 0 0 1 7 7l-2 2M15 18l-2 2a5 5 0 0 1-7-7l2-2',
  sensor:'M9 12a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM6 6a8 8 0 0 0 0 12M18 6a8 8 0 0 1 0 12M3 3a12 12 0 0 0 0 18M21 3a12 12 0 0 1 0 18',
  help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4M12 18h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.cube}"/></svg>`;
$$('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
for (const [id, name] of Object.entries({'open-catalog':'catalog','open-display':'settings','close-tablet':'close','fit-view':'focus','orbit-left':'left','orbit-right':'right','zoom-in':'plus','zoom-out':'minus'})) {
  const el = $('#'+id); if (el.classList.contains('icon-button')) el.innerHTML = icon(name);
}
const store = createStore();
let renderer = null, shell = null, opened = true, multiple = false, routeAddMode = false, routeFrame = 0, routeStart = 0, routePausedAt = 0;
let latestMetrics = {}, noticeTimer = 0, renderCount = 0, renderTime = 0, renderMax = 0, lastScene = '', lastMeasure = null;
let routeTimeline = null;
let contextKey = '', measurement = null;
const settingsKey = 'qbits.tablet-v2.display.v1';
let display = {size:100,x:0,y:0,dock:'center',material:'glass'};
try { const saved = JSON.parse(localStorage.getItem(settingsKey)); if (saved && Number.isFinite(saved.size)) display = {...display,size:Math.max(75,Math.min(115,saved.size)),dock:['left','center','right'].includes(saved.dock)?saved.dock:'center',material:saved.material==='alloy'?'alloy':'glass'}; } catch {}
let saves = readSaves();
function readSaves(){
  try { const list = JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); return Array.isArray(list)?list.slice(0,20).filter(s=>typeof s.id==='string'&&typeof s.name==='string'&&s.name.length<=40&&typeof s.data==='string'&&s.data.length<=1000000):[]; } catch { return []; }
}
function writeSaves(next){try { localStorage.setItem(STORAGE_KEY,JSON.stringify(next));saves=next;return true;}catch{say('El navegador no puede guardar más datos. Exporta tu construcción para conservarla.');return false;}}
function say(message){ clearTimeout(noticeTimer);$('#notice').textContent=message;noticeTimer=setTimeout(()=>{if(opened)$('#notice').textContent='Explora, ajusta y prueba.';},6500); }
function act(action){const result=store.dispatch(action);if(!result.ok)say(result.reason);return result;}
function scenePieces(s){return s.pieces.filter(p=>s.scene==='drone'?p.groupId==='drone':p.groupId!=='drone');}
function makeRenderer(){
  if(renderer)return;
  renderer=createMechanismRenderer($('#mechanism'),{onSelect(id,event){if(id)act({type:'SELECT',id,additive:multiple||event.shiftKey||event.ctrlKey||event.metaKey});else if(!event?.shiftKey)act({type:'CLEAR_SELECTION'});},onMeasure(m){latestMetrics=m;if(m.available===false&&m.error)say('La vista 3D necesita reiniciarse. Cierra y vuelve a abrir la tableta.');},onSettled(id){queueMicrotask(()=>{if(store.getState().mechanisms[id]?.status==='running')act({type:'MECHANISM',command:'stop',id});});}});
  shell=createTabletShell($('#tablet-shell'),{alloy:display.material==='alloy'});
}
function rendererState(s){
  const definitions=[['rotor-1','y',['column-1','column-2','servo-1','arm-1','arm-2','servo-2','gripper-1','gripper-2']],['servo-1','y',['arm-1','arm-2','servo-2','gripper-1','gripper-2']],['servo-2','z',['gripper-1','gripper-2']]],joints=[];
  for(const groupId of new Set(s.pieces.map(p=>p.groupId))){
    const roles=new Map(s.pieces.filter(p=>p.groupId===groupId).map(p=>[p.demoRole||p.id,p]));
    for(const [role,axis,descendants] of definitions){const motor=roles.get(role);if(motor)joints.push({motorId:motor.id,pivot:motor.position,axis,drivenIds:descendants.map(role=>roles.get(role)?.id).filter(Boolean)});}
  }
  return {pieces:scenePieces(s),selectedIds:s.selectedIds,activeIds:Object.entries(s.mechanisms).filter(([,m])=>m.status==='running').map(([id])=>id),mechanisms:s.mechanisms,joints,blueprint:s.blueprint};
}
function tool(label,name,action,{disabled=false,reason='',active=false,extra=''}={}){
  return `<button class="tool-button${active?' active':''}${name==='trash'?' danger':''}" data-action="${action}" ${extra} ${disabled?'disabled':''} title="${esc(reason||label)}" ${active?'aria-pressed="true"':''}>${icon(name)}<span>${label}</span></button>`;
}
function button(label,name,action,{style='secondary',disabled=false,extra='',reason=''}={}){return `<button class="${style}-button" data-action="${action}" ${disabled?'disabled':''} ${extra} title="${esc(reason||label)}">${icon(name)}${label}</button>`;}
function numeric(key,label,value,type,extra=''){
  const p=PARAMS[type][key];return `<label><span class="field-label">${label}${p.unit?' · '+p.unit:''}</span><input type="number" data-param="${key}" value="${value}" min="${p.min}" max="${p.max}" step="${['force','capacity'].includes(key)?1:type==='servo'&&key!=='torque'?1:key==='torque'?.01:.01}" aria-label="${label}" ${extra}></label>`;
}
function preset(key,label,m,disabled=false){const p=PARAMS[m.type][key], labels=key==='speed'?['Lento','Normal','Rápido']:['Suave','Normal','Fuerte'], keys=key==='speed'?['slow','normal','fast']:['soft','normal','strong'], selected=keys.find(k=>p.presets[k]===m[key]);return `<div class="context-section"><label class="field-label">${label}${selected?'':'<small>Personalizado</small>'}</label><div class="segmented" aria-label="${label}">${keys.map((k,i)=>`<button data-preset="${key}" data-preset-value="${k}" aria-pressed="${selected===k}" ${disabled?'disabled':''}>${labels[i]}</button>`).join('')}</div>${key==='force'?'<p class="field-note">Más empuje para mover lo que has construido.</p>':''}</div>`;}
const typeNames={cube:'Q-bit',rotor:'Rotor',servo:'Servo',battery:'Batería',gripper:'Agarre',drone:'Dron',family:'Familia',pyramid:'T-bit',coupler:'Acoplador'};
function renderTools(s,c){
  let html='';
  if(s.section==='route'){
    html='<p class="eyebrow">RECORRIDO</p>'+tool('Elegir punto','select','route-select-mode',{active:!routeAddMode})+tool('Añadir punto','plus','route-add-mode',{active:routeAddMode,disabled:!c.canEditRoute||s.route.points.length>=48,reason:s.route.points.length>=48?'El recorrido admite hasta 48 puntos.':'Toca el mapa para añadir un punto.'})+tool('Quitar punto','trash','route-delete',{disabled:!c.canEditRoute||!s.route.selectedPointId,reason:!s.route.selectedPointId?'Selecciona un punto.':'Quitar el punto elegido.'})+'<div class="tool-separator"></div>'+tool('Centrar ruta','focus','route-fit')+tool('Ver funciones','catalog','catalog')+'<p class="tool-note">Trayectoria de vuelo.<br>Los puntos conservan su orden.</p>';
  }else if(s.section==='saves'){
    html='<p class="eyebrow">TU COLECCIÓN</p>'+tool('Guardar ahora','save','save')+tool('Importar','import','import')+tool('Exportar','export','export')+'<div class="tool-separator"></div>'+tool('Ejemplo inicial','restart','reset')+'<p class="tool-note">Guardados de esta demo. Las partidas del juego siguen aparte.</p>';
  }else{
    html='<p class="eyebrow">HERRAMIENTAS</p>'+tool('Seleccionar','select','tool',{active:s.tool==='select',extra:'data-tool="select"'})+tool('Mover','move','tool',{active:s.tool==='move',disabled:!c.canMove,reason:c.reason,extra:'data-tool="move"'})+tool('Girar','rotate','tool',{active:s.tool==='rotate',disabled:!c.canRotate,reason:c.reason,extra:'data-tool="rotate"'})+tool('Colocar','blueprint','tool',{active:s.tool==='blueprint',disabled:!c.canMove,reason:c.reason,extra:'data-tool="blueprint"'})+'<div class="tool-separator"></div>';
    if(c.count>1)html+=tool('Agrupar','group','group',{disabled:!c.canGroup,reason:c.reasons.group});
    if(c.type==='family')html+=tool('Retirar piezas','ungroup','ungroup',{disabled:!c.canUngroup,reason:c.reasons.ungroup});
    if(c.type!=='family')html+=tool('Duplicar','duplicate','duplicate',{disabled:!c.canDuplicate,reason:c.reasons.duplicate});
    html+=tool('Eliminar','trash','delete',{disabled:!c.canDelete,reason:c.reason})+'<div class="tool-separator"></div>'+tool('Selección múltiple','group','multiple',{active:multiple})+tool('Ver funciones','catalog','catalog');
    if(c.anyRunning||multiple)html+=`<p class="tool-note">${c.anyRunning?'Detén el mecanismo para editarlo.':'Toca varias piezas para agruparlas.'}</p>`;
  }
  $('#tools').innerHTML=html;
}
function renderPicker(s){
  const visible=scenePieces(s),important=visible.filter(p=>['servo','rotor','battery','family'].includes(p.type)||p.groupId==='loose').slice(0,7);
  $('#piece-picker').innerHTML=important.map(p=>`<button class="piece-chip" data-select="${esc(p.id)}" aria-pressed="${s.selectedIds.includes(p.id)}">${icon(p.type)}${esc(p.type==='servo'?(p.id==='servo-1'?'Brazo':'Pinza'):typeNames[p.type]||p.name)}</button>`).join('')+`<label class="all-pieces"><span class="sr-only">Todas las piezas</span><select id="all-pieces" aria-label="Todas las piezas"><option value="">Todas las piezas…</option>${visible.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>`;
}
function renderContext(s,c){
  const selected=getSelection(s),one=selected.length===1?selected[0]:null,m=one?s.mechanisms[one.id]:null;
  if(s.section==='route'){renderRouteContext(s,c);return;}
  if(s.section==='saves'){
    $('#context').innerHTML=`<p class="eyebrow">GUARDA TU PROGRESO</p><h2>Vuelve a tu idea.</h2><p class="context-description">Conserva las piezas, sus ajustes y los puntos del recorrido.</p>${button('Guardar construcción','save','save',{style:'primary',extra:'class="full"'})}<div class="context-section"><h3>Solo en este navegador</h3><p class="helper">Exporta un archivo si quieres llevar tu construcción a otro dispositivo.</p>${button('Exportar archivo','export','export')}</div><div class="advanced"><p class="field-note">Formato propio del prototipo. No sustituye los guardados de partidas ni las plantillas del banco.</p></div>`;return;
  }
  if(!selected.length){$('#context').innerHTML=`<p class="eyebrow">EMPIEZA POR UNA PIEZA</p><div class="no-selection">${icon('select')}<h2>¿Qué quieres hacer?</h2><p>Toca una pieza del mecanismo o elige su nombre debajo de la vista.</p></div>${button('Seleccionar todo','group','select-all',{style:'primary'})}<p class="helper">También puedes elegir un conjunto completo.</p>`;return;}
  const kind=one?typeNames[one.type]:'Conjunto', name=one?one.name:`${s.name}`;
  let html=`<p class="eyebrow">${c.count>1?'CONJUNTO SELECCIONADO':'PIEZA SELECCIONADA'}</p><div class="selection-identity"><span class="identity-icon">${icon(one?.type||'group')}</span><div><h2>${esc(one?.type==='servo'?(one.id==='servo-1'?'Servo del brazo':'Servo de la pinza'):one?.type==='rotor'?'Rotor de base':one?.type==='battery'?'Batería':one?.type==='cube'?'Q-bit':name)}</h2><small>${esc(kind)}${c.count>1?` · ${c.count} piezas`:''}</small></div></div>`;
  if(s.tool==='move'||s.tool==='rotate'||s.tool==='blueprint'){
    html+=`<p class="context-description">${s.tool==='rotate'?'Gira la selección en pasos.':s.tool==='blueprint'?'Ajusta la guía azul. Las piezas se mueven cuando confirmas.':'Cambia la posición de la selección en esta vista de prueba.'}</p>`;
    if(s.tool==='rotate')html+=`<div class="action-pad">${['x','y','z'].map(axis=>`<button data-rotate="${axis}" data-degrees="-15">${axis.toUpperCase()} −</button><button data-rotate="${axis}" data-degrees="15">${axis.toUpperCase()} +</button>`).join('')}</div>`;
    else html+=`<div class="action-pad"><button data-move="-1,0,0">Izquierda</button><button data-move="0,1,0">Subir</button><button data-move="1,0,0">Derecha</button><button data-move="0,0,-1">Fondo</button><button data-move="0,-1,0">Bajar</button><button data-move="0,0,1">Frente</button></div>`;
    if(s.tool==='blueprint')html+=`<div class="button-pair">${button('Confirmar','check','place',{style:'primary'})}${button('Cancelar','close','cancel-place')}</div>`;
    html+='<p class="field-note">Vista de demostración. El juego conserva su agarre, su rotación y su colocador originales.</p>';
  }else if(s.section==='build'){
    html+=`<p class="context-description">${one?.type==='family'?`Una familia con ${one.count} piezas. Recupera su contenido cuando lo necesites.`:c.count>1?'Todas estas piezas forman tu selección. Puedes moverlas, colocarlas o guardarlas en una familia.':one?.type==='battery'?'Alimenta los mecanismos de tu construcción.':'Una pieza del mecanismo. El contorno te muestra exactamente cuál estás eligiendo.'}</p>`;
    if(c.mechanismIds.length)html+=button('Controlar mecanismo','control','go-control',{style:'primary'});
    if(c.canGroup)html+=button('Agrupar en familia','group','group',{style:'primary'});
    if(c.canUngroup)html+=button('Retirar sus piezas','ungroup','ungroup',{style:'primary'});
    if(one?.type==='family')html+=`<div class="context-section"><label class="field-label" for="family-name">Nombre de familia</label><input id="family-name" data-rename value="${esc(one.name)}" maxlength="40"><label class="field-label" for="family-color" style="margin-top:15px">Color</label><input id="family-color" type="color" data-family-color value="${one.color}"></div>`;
    html+=`<div class="context-section">${button('Activar colocador','blueprint','tool',{extra:'data-tool="blueprint"',disabled:!c.canMove,reason:c.reason})}</div><details class="advanced"><summary>Más herramientas</summary><div class="advanced-body">${button('Seleccionar todo','group','select-all')}${button('Quitar selección','close','clear-selection')}${button('Guardar construcción','save','save')}</div></details>`;
  }else if(c.mechanismIds.length){
    html+=`<p class="context-description">${c.anyRunning?'El mecanismo está en marcha. Detén la prueba para cambiar sus ajustes.':m?.type==='servo'?'Dobla y extiende la articulación del brazo.':m?.type==='rotor'?'Hace girar las piezas conectadas a su eje.':'Controla los motores de la selección a la vez.'}</p>`;
    html+=`<div class="run-control">${button(c.anyRunning?'Detener':'Poner en marcha',c.anyRunning?'stop':'play',c.anyRunning?'stop':'start',{style:'primary',extra:'data-main-run'})}</div><div class="button-pair">${button('Reiniciar','restart','restart',{disabled:!c.canRestart})}${button('Sentido','reverse','reverse',{disabled:!c.canReverse,reason:c.anyRunning?'Detén la prueba para cambiar el sentido.':'Invertir sentido del movimiento'})}</div>`;
    if(m){
      html+=preset('speed','Velocidad',m,!c.canAdjust);
      if(PARAMS[m.type].force)html+=preset('force','Fuerza',m,!c.canAdjust);
      html+=`<p class="field-note direction-note">Sentido ${m.direction===1?'normal':'invertido'}${m.type==='servo'?` · ${m.mode==='repeat'?'va y vuelve':m.mode==='hold'?'mantiene su posición':'un movimiento'}`:''}.</p>`;
      const disabled=c.canAdjust?'':'disabled';
      html+=`<details class="advanced" data-detail-key="motor-${one.id}"><summary>Más ajustes</summary><div class="advanced-body">${numeric('speed','Velocidad precisa',m.speed,m.type,disabled)}${m.type!=='drone'?numeric('torque','Torque',m.torque,m.type,disabled)+numeric('capacity','Capacidad de carga',m.capacity,m.type,disabled):''}`;
      if(m.type==='servo')html+=`<div class="field-pair">${numeric('min','Desde',m.min,m.type,disabled)}${numeric('max','Hasta',m.max,m.type,disabled)}</div>${numeric('target','Posición objetivo',m.target,m.type,disabled)}<label><span class="field-label">Movimiento</span><select data-param="mode" aria-label="Modo del servo" ${disabled}>${[['once','Una vez'],['repeat','Repetir'],['hold','Mantener']].map(([v,t])=>`<option value="${v}" ${m.mode===v?'selected':''}>${t}</option>`).join('')}</select></label>`;
      html+=`<p class="field-note">${m.type==='servo'?'Ángulos relativos a la articulación. ':''}La fuerza expresa el torque del motor; no añade un segundo ajuste.</p></div></details>`;
    }else html+='<p class="helper">Selecciona un rotor o un servo para ajustar su velocidad y fuerza con precisión.</p>';
  }else if(one?.type==='battery'){
    html+=`<p class="context-description">Una reserva de energía para tus mecanismos.</p><span class="state-pill${one.enabled?' running':''}">${one.enabled?'Encendida':'Apagada'}</span><div class="context-section">${button(one.enabled?'Apagar batería':'Encender batería','battery','battery',{style:'primary'})}</div><p class="helper">${one.charge?'Con energía almacenada.':'Esta copia está vacía; conserva las reglas del banco.'}</p><details class="advanced"><summary>Más información</summary><p class="helper">${one.cells} celda. En el banco, cada celda exterior almacena hasta 1.800 J. La demo no simula consumo eléctrico.</p></details>`;
  }else if(one?.type==='family'){
    html+=`<p class="context-description">${one.count} piezas reunidas en una sola familia. Sus ajustes se conservan dentro.</p>${button('Retirar piezas','ungroup','ungroup',{style:'primary'})}<div class="context-section"><label class="field-label" for="family-name">Nombre</label><input id="family-name" data-rename value="${esc(one.name)}" maxlength="40"></div>`;
  }else html+=`<p class="context-description">${one?.type==='gripper'?'El agarre forma parte del mecanismo. Sus órdenes dependen del controlador del brazo.':'Esta pieza no necesita velocidad ni fuerza propias. Puedes seleccionarla, moverla y usarla en una construcción.'}</p>${button('Ir a Construir','build','go-build',{style:'primary'})}<div class="context-section">${button('Ver piezas y funciones','catalog','catalog')}</div>`;
  $('#context').innerHTML=html;
}
function renderRouteContext(s,c){
  const point=s.route.points.find(p=>p.id===s.route.selectedPointId),index=s.route.points.indexOf(point),disabled=c.canEditRoute?'':'disabled',speed=s.route.speed;
  let html=`<p class="eyebrow">TRAYECTORIA DE VUELO</p><h2>${point?'Punto '+(index+1):'Traza una idea.'}</h2><p class="context-description">${point?'El dron seguirá los puntos en el orden de la línea.':'Añade un punto para empezar tu recorrido.'}</p>`;
  if(point){html+=`<label class="field-label">Al llegar</label><select data-route-field="action" aria-label="Acción al llegar" ${disabled}>${[['pass','Seguir'],['wait','Esperar'],['land','Aterrizar']].map(([v,t])=>`<option value="${v}" ${point.action===v?'selected':''}>${t}</option>`).join('')}</select><div class="context-section"><label class="field-label">Altura</label><div class="segmented" aria-label="Altura del punto">${[[.35,'Baja'],[.9,'Media'],[1.8,'Alta']].map(([v,t])=>`<button data-route-height="${v}" aria-pressed="${point.height===v}" ${disabled}>${t}</button>`).join('')}</div></div>`;
    if(point.action==='wait'||point.action==='land')html+=`<div class="context-section"><label class="field-label">Espera · segundos</label><input type="number" data-route-field="wait" aria-label="Segundos de espera" value="${point.wait}" min="0" max="120" step="1" ${disabled}></div>`;
  }
  html+=`<div class="context-section"><label class="field-label">Velocidad de vuelo</label><div class="segmented">${[[.25,'Lento'],[.5,'Normal'],[1,'Rápido']].map(([v,t])=>`<button data-route-speed="${v}" aria-pressed="${speed===v}" ${disabled}>${t}</button>`).join('')}</div></div><div class="context-section"><label class="checkbox-label"><input type="checkbox" id="route-loop" ${s.route.loop?'checked':''} ${disabled}>Volver a empezar al terminar</label></div><div class="context-section run-control">${button(s.route.status==='running'?'Detener prueba':'Probar recorrido',s.route.status==='running'?'stop':'play',s.route.status==='running'?'route-stop':'route-run',{style:'primary',disabled:!s.route.points.length})}</div>`;
  if(point)html+=`<details class="advanced" data-detail-key="route-point"><summary>Más ajustes</summary><div class="advanced-body"><div class="field-pair">${['x','z'].map(k=>`<label><span class="field-label">Posición ${k.toUpperCase()} · m</span><input type="number" data-route-field="${k}" aria-label="Posición ${k.toUpperCase()} del punto" min="-28" max="28" step=".1" value="${point[k]}" ${disabled}></label>`).join('')}</div><label><span class="field-label">Altura precisa · m</span><input type="number" data-route-field="height" aria-label="Altura precisa del punto" min=".15" max="3" step=".05" value="${point.height}" ${disabled}></label><label><span class="field-label">Velocidad precisa · m/s</span><input type="number" id="route-speed-exact" aria-label="Velocidad precisa de vuelo" min="0" max="1.2" step=".05" value="${speed}" ${disabled}></label><p class="field-note">La vista representa las coordenadas del recorrido de vuelo. El mapa se ajusta para mostrar todos los puntos.</p></div></details>`;
  html+='<p class="field-note" style="margin-top:17px">Prueba visual del recorrido. El vuelo físico y la batería pertenecen al juego.</p>';
  $('#context').innerHTML=html;
}
let routeBounds={minX:-3,maxX:3,minZ:-2,maxZ:2};
function routeFit(points){const xs=points.map(p=>p.x),zs=points.map(p=>p.z);let minX=Math.min(-2.8,...xs)-.5,maxX=Math.max(2.8,...xs)+.5,minZ=Math.min(-1.8,...zs)-.4,maxZ=Math.max(1.8,...zs)+.4;const ratio=520/310;if((maxX-minX)/(maxZ-minZ)<ratio){const pad=((maxZ-minZ)*ratio-(maxX-minX))/2;minX-=pad;maxX+=pad;}else{const pad=((maxX-minX)/ratio-(maxZ-minZ))/2;minZ-=pad;maxZ+=pad;}routeBounds={minX,maxX,minZ,maxZ};}
function projectPoint(p){const b=routeBounds;return [40+(p.x-b.minX)/(b.maxX-b.minX)*520,38+(p.z-b.minZ)/(b.maxZ-b.minZ)*310];}
function mapPoint(x,y){const b=routeBounds;return {x:Math.round(Math.max(-28,Math.min(28,b.minX+(x-40)/520*(b.maxX-b.minX)))*100)/100,z:Math.round(Math.max(-28,Math.min(28,b.minZ+(y-38)/310*(b.maxZ-b.minZ)))*100)/100};}
function renderRoute(s){
  routeFit(s.route.points);
  const pts=s.route.points.map(projectPoint),path=pts.map(p=>p.join(',')).join(' ')+(s.route.loop&&pts.length?' '+pts[0].join(','):'');
  $('#route-canvas').innerHTML=`<defs><pattern id="route-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" stroke="#85baa0" stroke-opacity=".10" fill="none"/></pattern></defs><rect width="600" height="400" fill="url(#route-grid)" rx="7"/><text x="23" y="26" fill="#82a493" stroke="none" font-size="10" font-family="system-ui" letter-spacing="2">VISTA SUPERIOR</text><text x="578" y="381" fill="#739783" stroke="none" text-anchor="end" font-size="10" font-family="system-ui">${s.route.points.length} ${s.route.points.length===1?'punto':'puntos'} · dron</text><polyline id="route-line" points="${path}" fill="none" stroke="#88d6b6" stroke-width="2" stroke-dasharray="6 5"/>${s.route.points.map((p,i)=>{const [x,y]=pts[i],on=p.id===s.route.selectedPointId;return `<g class="route-point" data-point="${p.id}" role="button" tabindex="0" aria-label="Punto ${i+1}: ${p.action==='wait'?'esperar':p.action==='land'?'aterrizar':'seguir'}" aria-pressed="${on}" transform="translate(${x},${y})"><circle r="${on?24:20}" fill="none" stroke="${on?'#a1e8d4':'#73a69133'}" stroke-width="1"/><circle r="14" fill="${on?'#b9f6de':'#7cae97'}" stroke="#152e25" stroke-width="2"/><text text-anchor="middle" y="4">${i+1}</text>${p.action==='wait'?'<path d="M-4 29v7M2 29v7" stroke="#9bc9b0" stroke-width="2"/>':p.action==='land'?'<path d="M-5 33H5M0 25v8" stroke="#9bc9b0" stroke-width="2"/>':''}</g>`;}).join('')}<g id="route-traveler" ${s.route.status==='running'?'':'visibility="hidden"'}><circle r="8" fill="#e2fff3" stroke="#193b2b" stroke-width="3"/><circle r="17" fill="none" stroke="#d6ffea" opacity=".5"/></g>`;
  $('#route-map-help').textContent=routeAddMode?'Toca el mapa para añadir un punto.':s.route.status==='running'?'Prueba en marcha. Detén el dron para editar.':'Elige un punto. Arrástralo para cambiar su posición.';
  updateRouteAnimation(s);
}
function updateRouteAnimation(s){
  const running=opened&&!document.hidden&&s.section==='route'&&s.route.status==='running';
  if(!running){cancelAnimationFrame(routeFrame);routeFrame=0;if(s.route.status!=='running')routeStart=0;return;}
  if(!routeStart){routeStart=performance.now();routeTimeline=buildRouteTimeline(s.route);}
  if(!routeFrame)routeFrame=requestAnimationFrame(animateRoute);
}
function animateRoute(time){
  routeFrame=0;const s=store.getState(),r=s.route;
  if(!opened||document.hidden||s.section!=='route'||r.status!=='running'||!r.points.length)return;
  if(!routeTimeline)routeTimeline=buildRouteTimeline(r);
  const sample=sampleRouteTimeline(routeTimeline,(time-routeStart)/1000);
  if(sample.finished){act({type:'ROUTE_STOP'});say('Recorrido terminado. Puedes ajustar los puntos y volver a probar.');return;}
  const [x,y]=projectPoint(sample);
  $('#route-traveler')?.setAttribute('transform',`translate(${x},${y})`);
  if(sample.phase!=='stationary')routeFrame=requestAnimationFrame(animateRoute);
}
function renderSaves(){
  $('#saves-view').innerHTML=saves.length?saves.map(s=>`<article class="save-card"><span class="save-cube">${icon('cube')}</span><div><h3>${esc(s.name)}</h3><p>${new Date(s.date).toLocaleString('es-CL',{dateStyle:'medium',timeStyle:'short'})}</p></div><button class="icon-button" data-save-delete="${esc(s.id)}" aria-label="Eliminar guardado ${esc(s.name)}" title="Eliminar este guardado">${icon('trash')}</button><div class="button-pair">${button('Recuperar','restart','load-save',{extra:`data-save-id="${esc(s.id)}"`,style:'primary'})}${button('Exportar','export','export-save',{extra:`data-save-id="${esc(s.id)}"`})}</div></article>`).join(''):`<div class="empty-state">${icon('save')}<h3>Tu próxima idea empieza aquí.</h3><p>Guarda la construcción cuando quieras volver a ella.</p>${button('Guardar mi primera construcción','save','save',{style:'primary'})}</div>`;
}
function preservePanelState(fn,reset=false){
  const active=document.activeElement,focus=active?.id||null,data=active?.dataset,detailKeys=$$('details[open][data-detail-key]').map(el=>el.dataset.detailKey),scroll=$('#context').scrollTop;
  fn();
  if(reset){$('#context').scrollTop=0;$('#tools').scrollTop=0;return;}
  $$('details[data-detail-key]').forEach(el=>{el.open=detailKeys.includes(el.dataset.detailKey);});
  $('#context').scrollTop=scroll;
  if(focus)document.getElementById(focus)?.focus({preventScroll:true});
  else if(data?.param)$(`[data-param="${data.param}"]`)?.focus({preventScroll:true});
  else if(data?.routeField)$(`[data-route-field="${data.routeField}"]`)?.focus({preventScroll:true});
}
function render(s){
  const start=performance.now(),c=getCapabilities(s),selected=getSelection(s),isRoute=s.section==='route',isSaves=s.section==='saves';
  $$('[data-section]').forEach(el=>{if(el.dataset.section===s.section)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  $$('[data-selection-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.selectionMode===s.selectionMode)));
  $('#scene-title').textContent=isRoute?'Un camino para tu dron':isSaves?'Tus construcciones':s.name==='Brazo de pruebas'?'Brazo modular':s.name;
  $('#scene-eyebrow').textContent=isRoute?'RECORRIDO':isSaves?'GUARDADOS':'TU CONSTRUCCIÓN';
  $('#scene-description').textContent=isRoute?'Une los puntos. Decide qué pasa en cada uno.':isSaves?'Ideas listas para continuar.':`${scenePieces(s).length} piezas · cada una tiene su lugar.`;
  $('#scene-status').hidden=isSaves;$('#scene-status').textContent=isRoute?(s.route.status==='running'?'En vuelo':'Listo para probar'):(c.anyRunning?'En marcha':'En reposo');$('#scene-status').classList.toggle('running',isRoute?s.route.status==='running':c.anyRunning);
  $('#scene-toolbar').hidden=isRoute||isSaves;$('#scene-view').hidden=isRoute||isSaves;$('#route-view').hidden=!isRoute;$('#saves-view').hidden=!isSaves;$('#scene-bottom').hidden=isRoute||isSaves;
  $('#blueprint-note').hidden=!s.blueprint;
  $('#selection-summary').textContent=isRoute?`${s.route.points.length} puntos · dron de prueba`:selected.length>1?`${selected.length} piezas seleccionadas`:selected[0]?.name||'Sin selección';
  $('#interaction-hint').textContent=s.blueprint?'La guía azul muestra dónde quedará tu selección.':multiple?'Toca varias piezas. Después, agrúpalas en una familia.':s.selectionMode==='assembly'?'El contorno reúne las piezas del conjunto.':'Toca una pieza para descubrir qué puede hacer.';
  const nextContextKey=`${s.section}|${s.selectedIds.join(',')}|${isRoute?s.route.selectedPointId:''}|${s.tool}`;
  preservePanelState(()=>{renderTools(s,c);renderContext(s,c);},nextContextKey!==contextKey);contextKey=nextContextKey;
  if(isRoute)renderRoute(s);else{updateRouteAnimation(s);if(isSaves)renderSaves();else renderPicker(s);}
  if(renderer){renderer.setScene(rendererState(s));renderer.setActive(opened&&!isRoute&&!isSaves&&!document.hidden);if(lastScene!==s.scene)renderer.fit();}
  lastScene=s.scene;
  if(s.notice)say(s.notice);
  renderCount++;const elapsed=performance.now()-start;renderTime+=elapsed;renderMax=Math.max(renderMax,elapsed);
}
store.subscribe(render);

document.addEventListener('click',event=>{
  const el=event.target.closest('button');if(!el||el.disabled)return;
  if(el.dataset.section){routeAddMode=false;act({type:'SET_SECTION',section:el.dataset.section});return;}
  if(el.dataset.selectionMode){act({type:'SET_SELECTION_MODE',mode:el.dataset.selectionMode});return;}
  if(el.dataset.select){act({type:'SELECT',id:el.dataset.select,additive:multiple||event.shiftKey});return;}
  if(el.dataset.preset){act({type:'SET_PRESET',key:el.dataset.preset,preset:el.dataset.presetValue});return;}
  if(el.dataset.routeHeight){act({type:'ROUTE_UPDATE',id:store.getState().route.selectedPointId,patch:{height:Number(el.dataset.routeHeight)}});return;}
  if(el.dataset.routeSpeed){act({type:'ROUTE_SPEED',value:Number(el.dataset.routeSpeed)});return;}
  if(el.dataset.move){act({type:store.getState().tool==='blueprint'?'BLUEPRINT_MOVE':'MOVE',delta:el.dataset.move.split(',').map(v=>Number(v)*.25)});return;}
  if(el.dataset.rotate){act({type:'ROTATE',axis:el.dataset.rotate,degrees:Number(el.dataset.degrees)});return;}
  if(el.dataset.dock){display.dock=el.dataset.dock;display.x=0;display.y=0;applyDisplay();return;}
  if(el.dataset.closeDialog){document.getElementById(el.dataset.closeDialog).close();return;}
  if(el.dataset.saveDelete){const id=el.dataset.saveDelete;if(el.dataset.confirm==='true'){if(writeSaves(saves.filter(s=>s.id!==id))){renderSaves();say('Guardado eliminado.');}}else{el.dataset.confirm='true';el.innerHTML=icon('check');el.title='Pulsa de nuevo para eliminar';el.setAttribute('aria-label','Confirmar eliminación del guardado');say('Pulsa otra vez el botón para eliminar este guardado.');}return;}
  const s=store.getState(),a=el.dataset.action;
  switch(a){
    case 'tool':act({type:'SET_TOOL',tool:el.dataset.tool});break;
    case 'group':act({type:'GROUP',name:'Familia de pruebas'});break;
    case 'ungroup':act({type:'UNGROUP'});break;
    case 'duplicate':act({type:'DUPLICATE'});break;
    case 'delete':act({type:'DELETE'});break;
    case 'select-all':act({type:'SELECT_ALL'});break;
    case 'clear-selection':act({type:'CLEAR_SELECTION'});break;
    case 'multiple':multiple=!multiple;render(s);break;
    case 'place':act({type:'PLACE_BLUEPRINT'});break;
    case 'cancel-place':act({type:'CANCEL_BLUEPRINT'});break;
    case 'start':case 'stop':case 'restart':case 'reverse':act({type:'MECHANISM',command:a});break;
    case 'go-control':act({type:'SET_SECTION',section:'control'});break;
    case 'go-build':act({type:'SET_SECTION',section:'build'});break;
    case 'battery':{const p=getSelection(s)[0];if(p)act({type:'SET_BATTERY',id:p.id,enabled:!p.enabled});break;}
    case 'catalog':openCatalog();break;
    case 'route-select-mode':routeAddMode=false;render(s);break;
    case 'route-add-mode':routeAddMode=!routeAddMode;render(s);break;
    case 'route-delete':act({type:'ROUTE_DELETE'});break;
    case 'route-fit':renderRoute(s);break;
    case 'route-run':routeAddMode=false;routeStart=performance.now();routeTimeline=buildRouteTimeline(s.route);act({type:'ROUTE_RUN'});break;
    case 'route-stop':act({type:'ROUTE_STOP'});break;
    case 'save':$('#save-name').value=s.name;$('#save-dialog').showModal();$('#save-name').select();break;
    case 'load-save':{const save=saves.find(x=>x.id===el.dataset.saveId);if(save){const r=act({type:'RESTORE',data:save.data});if(r.ok)act({type:'SET_SECTION',section:'build'});}break;}
    case 'export':download(serializeDemo(s),s.name);break;
    case 'export-save':{const save=saves.find(x=>x.id===el.dataset.saveId);if(save)download(save.data,save.name);break;}
    case 'import':$('#import-file').click();break;
    case 'reset':act({type:'RESET'});say('Ejemplo inicial recuperado. Tus guardados siguen disponibles.');break;
    case 'catalog-select':$('#catalog-dialog').close();act({type:'SET_SECTION',section:'control'});act({type:'SET_SELECTION_MODE',mode:'piece'});act({type:'SELECT',id:el.dataset.pieceId});break;
    case 'catalog-route':$('#catalog-dialog').close();act({type:'SET_SECTION',section:'route'});break;
  }
});
document.addEventListener('change',event=>{
  const el=event.target,s=store.getState();
  if(el.dataset.param){const result=act({type:'SET_PARAM',key:el.dataset.param,value:el.dataset.param==='mode'?el.value:Number(el.value)});if(!result.ok)render(s);}
  if(el.dataset.routeField){const k=el.dataset.routeField,result=act({type:'ROUTE_UPDATE',id:s.route.selectedPointId,patch:{[k]:k==='action'?el.value:Number(el.value)}});if(!result.ok)render(s);}
  if(el.hasAttribute('data-rename'))act({type:'RENAME',name:el.value});
  if(el.hasAttribute('data-family-color'))act({type:'FAMILY_COLOR',color:el.value});
  if(el.id==='all-pieces'&&el.value)act({type:'SELECT',id:el.value,additive:multiple});
  if(el.id==='route-loop')act({type:'ROUTE_LOOP',loop:el.checked});
  if(el.id==='route-speed-exact')act({type:'ROUTE_SPEED',value:Number(el.value)});
  if(el.id==='tablet-material'){display.material=el.value;shell?.dispose();shell=opened?createTabletShell($('#tablet-shell'),{alloy:display.material==='alloy'}):null;applyDisplay();}
});
$('#save-form').addEventListener('submit',event=>{
  event.preventDefault();const name=$('#save-name').value.trim();if(!name||name.length>40)return;
  const state=store.getState(),data=serializeDemo({...state,name});
  if(saves.length>=20){say('Ya hay 20 guardados. Exporta o elimina uno antes de crear otro.');return;}
  if(writeSaves([{id:crypto.randomUUID(),name,date:new Date().toISOString(),data},...saves])){$('#save-dialog').close();act({type:'SET_SECTION',section:'saves'});say('Construcción guardada en este navegador.');}
});
function download(data,name){const blob=new Blob([data],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,60)+'-tablet-v2.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Archivo exportado.');}
$('#import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>1000000)throw Error('Este archivo supera el tamaño permitido de la demo.');const state=restoreDemo(await file.text());act({type:'RESTORE',data:serializeDemo(state)});act({type:'SET_SECTION',section:'build'});say('Construcción importada. Usa Guardar para conservarla.');}catch(error){say(error.message);}finally{event.target.value='';}
});
let routeDrag=null;
function svgCoordinates(e){const p=$('#route-canvas').createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform($('#route-canvas').getScreenCTM().inverse());}
$('#route-canvas').addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  const g=e.target.closest('[data-point]'),s=store.getState(),p=svgCoordinates(e);
  if(g){act({type:'ROUTE_SELECT',id:g.dataset.point});if(getCapabilities(s).canEditRoute){routeDrag={id:g.dataset.point,start:[p.x,p.y],point:s.route.points.find(pt=>pt.id===g.dataset.point),moved:false};$('#route-canvas').setPointerCapture(e.pointerId);}}
  else if(routeAddMode&&getCapabilities(s).canEditRoute){act({type:'ROUTE_ADD',point:{...mapPoint(p.x,p.y),height:.65,action:'pass',wait:0}});}
});
$('#route-canvas').addEventListener('pointermove',e=>{
  if(!routeDrag)return;const p=svgCoordinates(e);if(Math.hypot(p.x-routeDrag.start[0],p.y-routeDrag.start[1])<4&&!routeDrag.moved)return;routeDrag.moved=true;routeDrag.next=mapPoint(p.x,p.y);
  const coords=projectPoint(routeDrag.next),marker=$(`[data-point="${routeDrag.id}"]`);marker?.setAttribute('transform',`translate(${coords[0]},${coords[1]})`);
  const s=store.getState(),pts=s.route.points.map(v=>projectPoint(v.id===routeDrag.id?routeDrag.next:v));$('#route-line')?.setAttribute('points',pts.map(p=>p.join(',')).join(' ')+(s.route.loop&&pts.length?' '+pts[0].join(','):''));
});
function endRouteDrag(e){if(!routeDrag)return;const drag=routeDrag;routeDrag=null;if(e.type==='pointercancel')renderRoute(store.getState());else if(drag.moved)act({type:'ROUTE_UPDATE',id:drag.id,patch:drag.next});}
$('#route-canvas').addEventListener('pointerup',endRouteDrag);$('#route-canvas').addEventListener('pointercancel',endRouteDrag);
$('#route-canvas').addEventListener('keydown',e=>{const g=e.target.closest('[data-point]');if(!g)return;const p=store.getState().route.points.find(p=>p.id===g.dataset.point);if(!p)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();act({type:'ROUTE_SELECT',id:p.id});}const deltas={ArrowLeft:[-.1,0],ArrowRight:[.1,0],ArrowUp:[0,-.1],ArrowDown:[0,.1]};if(deltas[e.key]){e.preventDefault();const [dx,dz]=deltas[e.key];act({type:'ROUTE_UPDATE',id:p.id,patch:{x:Math.round((p.x+dx)*100)/100,z:Math.round((p.z+dz)*100)/100}});$(`[data-point="${p.id}"]`)?.focus();}});

function openCatalog(){
  const groups=[
    ['Construir',[
      ['cube','Q-bits y divisiones','Cubos, T-bits y acopladores. Selección, unión, división y colocación conservan la materia.','Selección y transformación en esta demo.','cube-1'],
      ['family','Familias','Reúne hasta 100 piezas, nombra la familia, cambia su color y recupera su contenido.','Agrupar y recuperar disponibles en Construir.',null],
      ['build','Mesa de trabajo','Baterías, mejoras y cuerpos. Recetas, materiales y aplicación de adaptaciones.','Necesita inventario y mesa del juego.',null],
      ['duplicate','Plantillas y duplicado','Copias con baterías vacías y planos con sus requisitos de material.','Duplicado disponible; recetas en el juego.',null],
      ['blueprint','Colocación','La guía permite confirmar o cancelar una ubicación antes de mover el conjunto.','Guía visual disponible en Construir.',null],
      ['link','Uniones y cables','Encajes, conectores, agarres y redes eléctricas que unen la construcción.','La unión física y la red requieren el mundo 3D.',null]
    ]],
    ['Controlar',[
      ['rotor','Rotores','Encender, detener, reiniciar e invertir. Velocidad, torque y capacidad precisos.','Disponible en la vista de prueba.','rotor-1'],
      ['servo','Servos','Pivote y bisagra. Límites, objetivo, velocidad y modos mantener, una vez o repetir.','Disponible en la vista de prueba.','servo-1'],
      ['battery','Baterías','Interruptor, carga y suministro. Cada batería conserva su reserva de energía.','Interruptor demostrativo; sin consumo simulado.','battery-1'],
      ['gripper','Brazos y agarres','Home, recogida y entrega; poses, prueba de articulaciones y secuencia automática.','El controlador de brazo se conecta en la integración.',null],
      ['control','Cintas transportadoras','Arranque, parada, sentido y velocidad del controlador de cada cinta.','Su controlador propio permanece en el juego.',null],
      ['sensor','Sensores y auxiliares','Sensores, cargas, enfriadores y red eléctrica con sus opciones específicas.','Necesitan la simulación y el contexto del juego.',null]
    ]],
    ['Recorrido',[
      ['drone','Trayectoria de vuelo','Hasta 48 puntos con altura, pasar, esperar o aterrizar. Prueba y repetición.','Editor de puntos disponible.','route'],
      ['route','Movimiento terrestre','Un destino por orden. El Q-bit calcula su camino entre los obstáculos.','No es una lista editable de puntos.',null],
      ['gripper','Poses del brazo','Posición inicial, recogida y entrega. Secuencia del controlador de brazos.','Mantiene su formato original, separado del vuelo.',null]
    ]],
    ['Guardados y banco',[
      ['save','Escenas y plantillas','El banco conserva escenas; las plantillas conservan diseños reutilizables.','La demo usa guardados propios y exportación JSON.',null],
      ['settings','Banco y opciones','Dificultad, pruebas, generación de piezas, ajustes gráficos y preferencias.','Funciones originales documentadas en la matriz.',null],
      ['help','Ayuda y puzles','Catálogo, instrucciones, ensayos y acceso a los contenidos del juego.','Conservados en el juego principal.',null]
    ]]
  ];
  $('#catalog-content').innerHTML=groups.map(([title,cards])=>`<h3 class="catalog-section-title">${title}</h3><div class="catalog-grid">${cards.map(([ic,title,description,note,id])=>`<article class="catalog-card">${icon(ic)}<h3>${title}</h3><p>${description}</p><small>${note}</small>${id?(id==='route'?button('Abrir recorrido','route','catalog-route'):button('Seleccionar pieza','select','catalog-select',{extra:`data-piece-id="${id}"`,disabled:!store.getState().pieces.some(p=>p.id===id),reason:'Recupera el ejemplo inicial si esta pieza fue eliminada.'})):''}</article>`).join('')}</div>`).join('');
  $('#catalog-dialog').showModal();
}
$('#open-catalog').addEventListener('click',openCatalog);
$('#open-display').addEventListener('click',()=>{$('#tablet-size').value=display.size;$('#tablet-material').value=display.material;$('#display-dialog').showModal();$('#open-display').setAttribute('aria-expanded','true');});
$('#display-dialog').addEventListener('close',()=>$('#open-display').setAttribute('aria-expanded','false'));
$('#tablet-size').addEventListener('input',e=>{display.size=Number(e.target.value);applyDisplay();});
$('#restore-display').addEventListener('click',()=>{display={size:100,x:0,y:0,dock:'center',material:'glass'};$('#tablet-size').value=100;$('#tablet-material').value='glass';shell?.setPose?.({alloy:false});applyDisplay();say('Tamaño y posición restaurados.');});
function applyDisplay(){
  const small=innerWidth<=620,workspace=$('#workspace'),available=workspace.clientWidth-(innerWidth<=800?30:76),base=Math.min(1180,available*.94),width=small?available:Math.min(available,base*display.size/100),position=$('#device-position');
  position.style.width=width+'px';const maxX=Math.max(0,(workspace.clientWidth-width)/2-15),maxY=42;
  const dock=display.dock==='left'?-maxX:display.dock==='right'?maxX:0;
  display.x=Math.max(-maxX,Math.min(maxX,display.x));display.y=Math.max(-maxY,Math.min(maxY,display.y));
  position.style.transform=small?'none':`translate(${Math.max(-maxX,Math.min(maxX,dock+display.x))}px,${display.y}px)`;
  $('#tablet').style.transform=small?'none':`rotateX(${1.5-display.y*.018}deg) rotateY(${-2-(dock+display.x)*.022}deg)`;
  $('#tablet').dataset.material=display.material;
  $$('[data-dock]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.dock===display.dock)));
  try{localStorage.setItem(settingsKey,JSON.stringify({size:display.size,dock:display.dock,material:display.material}));}catch{}
}
let deviceDrag=null;
$('#drag-handle').addEventListener('pointerdown',e=>{if(innerWidth<=620||e.button!==0)return;deviceDrag={x:e.clientX,y:e.clientY,startX:display.x,startY:display.y};e.currentTarget.setPointerCapture(e.pointerId);});
$('#drag-handle').addEventListener('pointermove',e=>{if(!deviceDrag)return;display.x=deviceDrag.startX+e.clientX-deviceDrag.x;display.y=deviceDrag.startY+e.clientY-deviceDrag.y;applyDisplay();});
$('#drag-handle').addEventListener('pointerup',()=>{deviceDrag=null;});$('#drag-handle').addEventListener('pointercancel',()=>{deviceDrag=null;});
window.addEventListener('resize',applyDisplay);
function closeTablet(){opened=false;finishMeasurement();routePausedAt=performance.now();renderer?.dispose();renderer=null;shell?.dispose();shell=null;cancelAnimationFrame(routeFrame);routeFrame=0;$('#device-position').hidden=true;$('#reopen-tablet').hidden=false;$('#reopen-tablet').focus();}
$('#close-tablet').addEventListener('click',closeTablet);
$('#reopen-tablet').addEventListener('click',()=>{opened=true;if(routeStart&&routePausedAt)routeStart+=performance.now()-routePausedAt;routePausedAt=0;$('#device-position').hidden=false;$('#reopen-tablet').hidden=true;applyDisplay();makeRenderer();render(store.getState());$('#navigation button[aria-current="page"]').focus();});
$('#fit-view').addEventListener('click',()=>renderer?.fit());$('#orbit-left').addEventListener('click',()=>renderer?.orbit(-.25,0));$('#orbit-right').addEventListener('click',()=>renderer?.orbit(.25,0));$('#zoom-in').addEventListener('click',()=>renderer?.zoom(-.12));$('#zoom-out').addEventListener('click',()=>renderer?.zoom(.12));
function renderPerformance(){
  const m=renderer?.getMetrics()||{...latestMetrics,gpuBuffers:0,scheduledFrames:0},n=v=>Number.isFinite(v)?v.toFixed(2):'—';
  $('#performance-content').innerHTML=`<div class="metric-grid"><div class="metric"><strong>${m.physicsBodies||0}</strong><span>Cuerpos físicos en la demo</span></div><div class="metric"><strong>${m.scheduledFrames||0}</strong><span>Frames pendientes del visor</span></div><div class="metric"><strong>${n(m.cpuP50Ms)}</strong><span>ms de dibujo · mediana</span></div><div class="metric"><strong>${n(m.cpuP95Ms)}</strong><span>ms de dibujo · p95</span></div></div><p class="helper">${m.pieceCount||0} piezas en la vista · ${m.gpuBuffers||0} buffers de geometría.<br>${m.backend==='canvas2d'?'Proyección 3D por software (Canvas 2D).':'Vista con WebGL.'}<br>La vista en reposo solo dibuja cuando hay cambios. Cerrar libera los recursos 3D.</p>${lastMeasure?`<p class="helper">Última prueba: ${lastMeasure.frames} cambios de vista.<br>DOM promedio ${n(renderTime/Math.max(1,renderCount))} ms; máximo ${n(renderMax)} ms.</p>`:''}`;
}
$('#open-performance').addEventListener('click',()=>{renderPerformance();$('#performance-dialog').showModal();});
function finishMeasurement(){
  if(!measurement)return;cancelAnimationFrame(measurement.raf);clearTimeout(measurement.timeout);
  lastMeasure={frames:(renderer?.getMetrics()?.frames||measurement.before)-measurement.before};measurement=null;
  const button=$('#measure-performance');button.disabled=false;button.textContent='Medir respuesta de la vista';renderPerformance();
}
$('#measure-performance').addEventListener('click',()=>{
  if(measurement)return;const button=$('#measure-performance');button.disabled=true;button.textContent='Midiendo cambios de vista…';
  measurement={before:renderer?.getMetrics()?.frames||0,raf:0,timeout:0,count:0};
  const step=()=>{if(!measurement)return;if(!opened||document.hidden||measurement.count>=24){finishMeasurement();return;}renderer?.orbit(measurement.count%2?.015:-.015,0);measurement.count++;measurement.raf=requestAnimationFrame(step);};
  measurement.timeout=setTimeout(finishMeasurement,1800);measurement.raf=requestAnimationFrame(step);
});
$('#performance-dialog').addEventListener('close',finishMeasurement);
document.addEventListener('visibilitychange',()=>{
  renderer?.setActive(opened&&!document.hidden&&!['route','saves'].includes(store.getState().section));
  if(document.hidden){finishMeasurement();routePausedAt=performance.now();cancelAnimationFrame(routeFrame);routeFrame=0;}else{if(routeStart&&routePausedAt)routeStart+=performance.now()-routePausedAt;routePausedAt=0;updateRouteAnimation(store.getState());}
});
window.addEventListener('pagehide',()=>{finishMeasurement();renderer?.dispose();shell?.dispose();cancelAnimationFrame(routeFrame);clearTimeout(noticeTimer);});
window.addEventListener('pageshow',event=>{if(event.persisted&&opened){renderer=null;shell=null;makeRenderer();render(store.getState());}});
// Read-only diagnostic surface for reproducible browser checks; no game access.
window.QBitsTabletDemo=Object.freeze({snapshot:()=>store.getState(),metrics:()=>({renderer:renderer?.getMetrics()||{gpuBuffers:0,scheduledFrames:0,physicsBodies:0},dom:{updates:renderCount,meanMs:renderTime/Math.max(1,renderCount),maxMs:renderMax},open:opened}),storageKey:STORAGE_KEY});
applyDisplay();makeRenderer();render(store.getState());
