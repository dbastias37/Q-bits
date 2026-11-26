(() => {
 'use strict';
 const MODEL=()=>window.QBitsSceneFiles;
 const LAB_KEY='qbits.save.lab.v1', BACKUP='qbits.editor.bank-backup.v1';
 const $=id=>document.getElementById(id);
 // Recover the ordinary bank slot if a previous editor session ended unexpectedly.
 try {const raw=sessionStorage.getItem(BACKUP);if(raw!==null){const old=JSON.parse(raw);if(old.exists)localStorage.setItem(LAB_KEY,old.raw);else localStorage.removeItem(LAB_KEY);sessionStorage.removeItem(BACKUP);}}catch(e){console.error('Escena: recuperación de banco pendiente',e);}
 let active=false,selected=null,lastCheckpointRaw=null;
 let draftMarkers=[],editingMarkerId=null;
 const style=document.createElement('style');
 style.textContent=`
 #scene-editor-dialog{position:fixed;inset:0;z-index:135;background:#f8faf9f7;color:#293c36;display:grid;place-items:center;padding:16px;font:13px/1.55 var(--font-menu),Arial,sans-serif}
 #scene-editor-dialog[hidden],#scene-editor-toolbar[hidden]{display:none!important}
 .scene-editor-shell{width:min(720px,96vw);max-height:90vh;overflow:auto;background:white;border:1px solid #c9d7cd;padding:24px;box-shadow:0 18px 70px #19282029}
 .scene-editor-shell h2{font-size:22px;margin:0 0 6px}.scene-editor-shell p{margin:8px 0 13px}
 .scene-editor-shell textarea,.scene-editor-shell input[type=text]{width:100%;border:1px solid #bfcfc5;background:#fff;padding:9px;font:inherit;user-select:text}
 .scene-editor-shell textarea{height:105px;resize:vertical}
 .scene-editor-shell select,.scene-editor-shell input[type=number]{border:1px solid #bfcfc5;padding:7px;background:#fff;color:inherit;max-width:100%}
 .scene-marker-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
 #scene-editor-marker-list{max-height:155px;overflow:auto;padding:6px 0}
 #scene-editor-marker-list button{margin-left:10px;border:0;background:none;color:#a32f34;text-decoration:underline;cursor:pointer}
 .scene-editor-actions{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
 .scene-editor-actions button,#scene-editor-toolbar button{border:1px solid #b2c5b9;background:white;color:#243d32;padding:8px 12px;cursor:pointer;font:inherit}
 .scene-editor-actions button.primary{background:#36594c;color:#fff}
 #scene-editor-feedback{white-space:pre-wrap;color:#36594c;min-height:24px}
 #scene-editor-toolbar{position:fixed;bottom:20px;left:20px;z-index:32;padding:10px;background:#f9fdfaed;color:#254637;border:1px solid #bdd3c6;box-shadow:0 6px 25px #0002;max-width:min(420px,calc(100vw - 40px));font:12px var(--font-menu),Arial}
 #scene-editor-toolbar button{padding:7px;font-size:11px}
 #scene-editor-toolbar small{display:block;margin-top:6px}
 `;
 document.head.append(style);
 const entry=$('main-lab');
 if(!entry)return;
 const mainButton=document.createElement('button');
 mainButton.id='main-scene-editor';mainButton.type='button';mainButton.textContent='Editor de escenas';
 entry.after(mainButton);
 const dialog=document.createElement('section');
 dialog.id='scene-editor-dialog';dialog.hidden=true;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Editor de escenas');
 dialog.innerHTML=`<div class="scene-editor-shell">
 <p>Q-BITS / HERRAMIENTAS DE CREACIÓN</p><h2>Editor de escenas</h2>
 <p>Diseña en el banco de pruebas utilizando sus piezas, mecanismos y blueprints nativos. El archivo de escena es independiente de tus partidas y guarda el montaje completo.</p>
 <label>Biblioteca de escenas<select id="scene-editor-library" aria-label="Escenas guardadas"></select></label>
 <div class="scene-editor-actions"><button id="scene-editor-choose">Abrir versión seleccionada</button></div>
 <label>Nombre de escena<input id="scene-editor-name" type="text" maxlength="90" value="Mi escena inicial"></label>
 <label>Notas de diseño<textarea id="scene-editor-notes" placeholder="Intención, elementos iniciales, restricciones, objetivos..."></textarea></label>
 <div class="scene-editor-actions">
 <button id="scene-editor-new" class="primary">Nueva escena en el banco</button>
 <button id="scene-editor-blank">Crear escena realmente vacía</button>
 <button id="scene-editor-open">Continuar escena guardada</button>
 <button id="scene-editor-import">Importar archivo</button>
 <button id="scene-editor-close">Volver</button></div>
 <h3>Marcas del nivel</h3>
 <p>Define puntos de aparición, fuentes, destinos y receptores. Sus coordenadas se conservan aunque muevas las máquinas; las reglas futuras podrán identificarlos por código.</p>
 <label>Nombre de marca<input id="scene-marker-name" type="text" maxlength="80" placeholder="Receptor de productos"></label>
 <label>Función<select id="scene-marker-role"><option value="spawn">Inicio del jugador</option><option value="source">Origen de materia</option><option value="destination">Destino</option><option value="receiver">Recepción</option><option value="workzone">Zona de trabajo</option><option value="note">Referencia visual</option></select></label>
 <label>ID de pieza asociada (opcional)<input id="scene-marker-unit" type="number" min="1" step="1" placeholder="Ej.: 42"></label>
 <div class="scene-marker-grid"><label>X<input id="scene-marker-x" type="number" step=".1" value="0"></label><label>Y<input id="scene-marker-y" type="number" step=".1" value="0"></label><label>Z<input id="scene-marker-z" type="number" step=".1" value="0"></label></div>
 <div class="scene-editor-actions"><button id="scene-marker-from-player">Usar posición del jugador guardada</button><button id="scene-marker-add">Añadir marca</button><button id="scene-markers-save">Guardar marcas en la escena</button></div>
 <div id="scene-editor-marker-list" aria-live="polite"></div>
 <svg id="scene-editor-map" viewBox="0 0 360 220" role="img" aria-label="Plano orientativo X/Z de los marcadores" style="width:100%;max-height:240px;background:#f5f8f6;border:1px solid #d0dcd4"></svg>
 <div class="scene-editor-actions">
 <button id="scene-editor-copy">Copiar resumen e inventario</button>
 <button id="scene-editor-copy-full">Copiar código completo</button>
 <button id="scene-editor-export">Descargar escena</button></div>
 <label>Código completo recibido<textarea id="scene-editor-paste" placeholder="Pega aquí QBSCENE1:… para importar una escena sin archivo"></textarea></label>
 <div class="scene-editor-actions"><button id="scene-editor-import-code">Importar código pegado</button></div>
 <p id="scene-editor-code">Sin escena capturada</p>
 <p id="scene-editor-feedback" role="status" aria-live="polite"></p>
 <input id="scene-editor-file" type="file" accept=".json,.qbits-scene.json,application/json" hidden>
 <p><small>La escena no crea recursos en Campaña ni en el Galpón. Un identificador corto demuestra coincidencia, no contiene por sí solo todo el montaje. Para reconstrucción exacta, exporta el archivo o copia el código completo.</small></p>
 </div>`;
 document.body.append(dialog);
 const toolbar=document.createElement('div');toolbar.id='scene-editor-toolbar';toolbar.hidden=true;
 toolbar.innerHTML=`<strong>Editor de escenas · Banco 3D</strong>
 <div class="scene-editor-actions"><button id="scene-editor-capture">Capturar y guardar escena</button><button id="scene-editor-manage">Códigos / Exportar</button></div>
 <small>Coloca las piezas con los controles normales. Para una captura fiable, abre Esc → Guardar partida antes de capturar.</small>`;
 document.body.append(toolbar);
 function feedback(text){$('scene-editor-feedback').textContent=text;}
 function show(){try{selected=MODEL().read(localStorage);}catch(e){selected=null;feedback(e.message);}
 const items=MODEL().list(localStorage),select=$('scene-editor-library');select.replaceChildren();
 for(const item of items){const option=document.createElement('option');option.value=item.code;option.textContent=item.name+' · '+item.code;select.append(option);}
 if(selected&&items.some(item=>item.code===selected.code))select.value=selected.code;
 $('scene-editor-code').textContent=selected?'Versión de escena: '+selected.code+' · '+selected.inventory.pieces+' piezas':'Sin escena capturada';
 if(selected){$('scene-editor-name').value=selected.name;$('scene-editor-notes').value=selected.notes;}
 draftMarkers=(selected?.design?.markers||[]).map(m=>({...m,position:m.position.slice()}));editingMarkerId=null;renderMarkers();
 dialog.hidden=false;$('scene-editor-name').focus();}
 function close(){dialog.hidden=true;}
 function renderMarkers(){
  const list=$('scene-editor-marker-list');list.replaceChildren();
  if(!draftMarkers.length)list.textContent='Sin marcas todavía.';
  for(const mark of draftMarkers){
   const line=document.createElement('div');
   line.textContent=mark.label+' ['+mark.role+'] · '+mark.position.join(', ')+(mark.unitId?' · pieza '+mark.unitId:'')+' · '+mark.id;
   const edit=document.createElement('button');edit.textContent='Editar';edit.type='button';edit.addEventListener('click',()=>{
    editingMarkerId=mark.id;$('scene-marker-name').value=mark.label;$('scene-marker-role').value=mark.role;
    ['x','y','z'].forEach((axis,i)=>{$('scene-marker-'+axis).value=String(mark.position[i]);});
    $('scene-marker-unit').value=mark.unitId?String(mark.unitId):'';
    $('scene-marker-add').textContent='Actualizar marca';
   });
   const remove=document.createElement('button');remove.textContent='Quitar';remove.type='button';
   remove.addEventListener('click',()=>{draftMarkers=draftMarkers.filter(m=>m.id!==mark.id);if(editingMarkerId===mark.id){editingMarkerId=null;$('scene-marker-add').textContent='Añadir marca';}renderMarkers();});
   line.append(edit,remove);list.append(line);
  }
  const svg=$('scene-editor-map'),ns='http://www.w3.org/2000/svg';svg.replaceChildren();
  function node(tag,attrs,value){const el=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);if(value!==undefined)el.textContent=value;svg.append(el);return el;}
  for(let i=0;i<=8;i++){const x=20+i*40;node('path',{d:'M'+x+' 10V210',stroke:'#dbe6df','stroke-width':'1'});}
  for(let i=0;i<=5;i++){const y=10+i*40;node('path',{d:'M20 '+y+'H340',stroke:'#dbe6df','stroke-width':'1'});}
  node('path',{d:'M180 8V212 M18 110H342',stroke:'#90b1a0','stroke-width':'1'});
  node('text',{x:330,y:106,fill:'#527c68','font-size':'10'},'X+');
  node('text',{x:183,y:18,fill:'#527c68','font-size':'10'},'Z−');
  const extent=Math.max(4,...draftMarkers.flatMap(m=>[Math.abs(m.position[0]),Math.abs(m.position[2])]));
  const scale=90/extent;
  for(const mark of draftMarkers){
   const x=Math.max(20,Math.min(340,180+mark.position[0]*scale)),y=Math.max(10,Math.min(210,110+mark.position[2]*scale));
   node('circle',{cx:x,cy:y,r:5,fill:mark.role==='spawn'?'#286a99':'#a55b3a'});
   node('text',{x:x+8,y:y-7,fill:'#283e32','font-size':'10'},mark.label.slice(0,24));
  }
 }
 function getSavedBank(){const raw=localStorage.getItem(LAB_KEY);if(!raw)throw Error('Guarda una partida nueva del banco antes de continuar.');
  const obj=JSON.parse(raw);if(obj.format!=='qbits-save'||obj.mode!=='lab')throw Error('El archivo de banco no es válido.');
  const check=window.QBitsSavedGames.validate('lab',obj.data);if(!check.ok)throw Error(check.error);return {raw,data:obj.data};}
 function storeScene(data){const doc=MODEL().pack($('scene-editor-name').value,data,$('scene-editor-notes').value,{phase:'authoring',markers:draftMarkers});
  selected=MODEL().save(localStorage,doc);$('scene-editor-code').textContent=doc.code+' · '+doc.inventory.pieces+' piezas';return doc;}
 function stashBank(){
  if(sessionStorage.getItem(BACKUP)!==null)return;
  const raw=localStorage.getItem(LAB_KEY);
  sessionStorage.setItem(BACKUP,JSON.stringify({exists:raw!==null,raw}));
 }
 function restoreBank(){
  const saved=sessionStorage.getItem(BACKUP);if(!saved)return;
  const state=JSON.parse(saved);
  if(state.exists)localStorage.setItem(LAB_KEY,state.raw);else localStorage.removeItem(LAB_KEY);
  sessionStorage.removeItem(BACKUP);
  active=false;lastCheckpointRaw=null;toolbar.hidden=true;
 }
 function prepareSceneFromFile(doc){
  const time=Date.now();
  const envelope={format:'qbits-save',version:1,mode:'lab',savedAt:time,createdAt:time,data:doc.data};
  const valid=window.QBitsSavedGames.validate('lab',doc.data);
  if(!valid.ok)throw Error(valid.error);
  localStorage.setItem(LAB_KEY,JSON.stringify(envelope));
 }
 function enter(mode){
  const model=MODEL();if(!model)throw Error('Las herramientas de escena aún no están cargadas.');
  stashBank();
  if(mode==='open'){
    const doc=model.read(localStorage);
    if(!doc)throw Error('No hay escena guardada. Crea una nueva o importa un archivo.');
    prepareSceneFromFile(doc);selected=doc;
  }
  lastCheckpointRaw=localStorage.getItem(LAB_KEY);
  active=true;toolbar.hidden=false;close();
  // The native lab selection owns its existing new/continue confirmation flow.
  entry.click();
  feedback('Elige '+(mode==='open'?'Continuar':'Nueva')+' en Banco de pruebas.');
 }
 async function copy(text){
  if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);
  else {const el=document.createElement('textarea');el.value=text;document.body.append(el);el.select();const ok=document.execCommand('copy');el.remove();if(!ok)throw Error('El navegador no permitió copiar. Descarga el archivo.');}
 }
 function current(){
  const d=MODEL().read(localStorage);if(!d)throw Error('No hay escena guardada.');
  return d;
 }
 function base64(text){
  const bytes=new TextEncoder().encode(text);let bin='';
  for(let i=0;i<bytes.length;i+=16384)bin+=String.fromCharCode(...bytes.subarray(i,i+16384));
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 }
 function fromBase64(encoded){
  if(!/^[A-Za-z0-9_-]+$/.test(encoded))throw Error('El código contiene caracteres inválidos.');
  const bin=atob(encoded.replace(/-/g,'+').replace(/_/g,'/'));const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 }
 function download(doc){
  const name=doc.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'escena';
  const blob=new Blob([JSON.stringify(doc,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download=name+'.qbits-scene.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
 }
 async function act(fn){try{await fn();}catch(e){feedback(e.message||String(e));}}
 mainButton.addEventListener('click',()=>act(show));
 $('scene-editor-close').addEventListener('click',close);
 $('scene-editor-choose').addEventListener('click',()=>act(()=>{const code=$('scene-editor-library').value;if(!code)throw Error('No hay versiones en la biblioteca.');selected=MODEL().select(localStorage,code);show();feedback('Versión seleccionada: '+selected.code); }));
 $('scene-editor-new').addEventListener('click',()=>act(()=>enter('new')));
 $('scene-editor-blank').addEventListener('click',()=>act(()=>{
  const bank=getSavedBank();const data=MODEL().emptyData(bank.data);
  if(!confirm('Crear una escena vacía desde el estado del banco guardado. No modifica tu partida original. ¿Continuar?'))return;
  draftMarkers=[];const doc=storeScene(data);show();feedback('Escena vacía creada ('+doc.code+'). Selecciona Continuar escena guardada y luego Continuar en Banco de pruebas.');
 }));
 $('scene-editor-open').addEventListener('click',()=>act(()=>enter('open')));
 $('scene-editor-manage').addEventListener('click',()=>act(show));
 $('scene-editor-capture').addEventListener('click',()=>act(()=>{
  if(!active)throw Error('Abre primero el modo Editor de escenas.');
  const raw=localStorage.getItem(LAB_KEY);
  if(!raw||raw===lastCheckpointRaw)throw Error('No hay un guardado nuevo de esta edición. Usa Esc → Guardar partida y luego captura.');
  let envelope;try{envelope=JSON.parse(raw);}catch{throw Error('Guardado del banco ilegible.');}
  if(envelope.mode!=='lab'||envelope.format!=='qbits-save')throw Error('El guardado actual no corresponde al banco.');
  const doc=storeScene(envelope.data);lastCheckpointRaw=raw;
  $('scene-editor-code').textContent=selected.code+' · '+selected.inventory.pieces+' piezas';
  feedback('Escena capturada y guardada. '+selected.code);
 }));
 $('scene-marker-from-player').addEventListener('click',()=>act(()=>{const data=selected?.data||getSavedBank().data;
  const p=data.snapshot.position;if(!Array.isArray(p)||p.length!==3)throw Error('No hay posición de jugador guardada.');
  ['x','y','z'].forEach((axis,i)=>{$('scene-marker-'+axis).value=String(p[i]);});feedback('Posición de jugador recuperada del guardado.');
 }));
 $('scene-marker-add').addEventListener('click',()=>act(()=>{
  const label=$('scene-marker-name').value.trim(),role=$('scene-marker-role').value;
  const position=['x','y','z'].map(k=>{const field=$('scene-marker-'+k);return field.value.trim()===''?NaN:Number(field.value);});
  const next=1+Math.max(0,...draftMarkers.map(m=>Number(m.id.slice(2))||0));
  const marker={id:editingMarkerId||'m-'+next,role,label,position};
  const attached=$('scene-marker-unit').value.trim();
  if(attached!==''){marker.unitId=Number(attached);}
  const updated=draftMarkers.filter(m=>m.id!==marker.id).concat(marker);
  MODEL().validateDesign({phase:'authoring',markers:updated});
  draftMarkers=updated;editingMarkerId=null;$('scene-marker-add').textContent='Añadir marca';
  renderMarkers();feedback('Marca preparada. Pulsa Guardar marcas para incluirla en el archivo.');
 }));
 $('scene-markers-save').addEventListener('click',()=>act(()=>{
  const doc=current(),next=MODEL().withDesign(doc,{phase:'authoring',markers:draftMarkers});selected=MODEL().save(localStorage,next);
  show();feedback('Marcas guardadas; nuevo código '+selected.code);
 }));
 $('scene-editor-copy').addEventListener('click',()=>act(async()=>{const doc=current();await copy(MODEL().explain(doc));feedback('Resumen copiado. Puedes pegarlo en el chat.');}));
 $('scene-editor-copy-full').addEventListener('click',()=>act(async()=>{const doc=current();await copy('QBSCENE1:'+base64(JSON.stringify(doc)));feedback('Código completo copiado. Contiene la escena entera.');}));
 $('scene-editor-export').addEventListener('click',()=>act(()=>{download(current());feedback('Archivo exportado.');}));
 $('scene-editor-import').addEventListener('click',()=>$('scene-editor-file').click());
 $('scene-editor-import-code').addEventListener('click',()=>act(()=>{
  const raw=$('scene-editor-paste').value.trim();
  if(!raw.startsWith('QBSCENE1:')||raw.length>MODEL().MAX_BYTES*1.5)throw Error('Código completo inválido o demasiado grande.');
  const doc=MODEL().parse(fromBase64(raw.slice(9)));
  MODEL().save(localStorage,doc);selected=doc;show();feedback('Código importado y verificado: '+doc.code);
 }));
 $('scene-editor-file').addEventListener('change',()=>act(async()=>{
  const file=$('scene-editor-file').files[0];if(!file)return;
  if(file.size>MODEL().MAX_BYTES)throw Error('El archivo supera 8 MB.');
  const doc=MODEL().parse(await file.text());
  MODEL().save(localStorage,doc);selected=doc;show();feedback('Importada '+doc.name+' ('+doc.code+'). Pulsa Continuar escena guardada para abrirla en 3D.');
  $('scene-editor-file').value='';
 }));
 // Restore the user's independent bank checkpoint when returning to the menu.
 new MutationObserver(()=>{
  if(active&&!$('main-screen').hidden){
   try{restoreBank();}catch(e){console.error('No se pudo restaurar el guardado del banco',e);}
  }
 }).observe($('main-screen'),{attributes:true,attributeFilter:['hidden']});
 window.addEventListener('pagehide',()=>{if(active)try{restoreBank();}catch(e){console.error(e);}});
 for(const id of ['pause-main','pause-levels','main-play','main-levels']) $(id)?.addEventListener('click',()=>{if(active)try{restoreBank();}catch(e){console.error(e);}}, {capture:true});
 window.QBitsSceneEditor=Object.freeze({open:show,capture:()=>$('scene-editor-capture').click(),restoreBank});
})();