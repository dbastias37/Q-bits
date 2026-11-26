(() => {
 'use strict';
 const MODEL=()=>window.QBitsSceneFiles;
 const LAB_KEY='qbits.save.lab.v1', BACKUP='qbits.editor.bank-backup.v1',RECOVERY='qbits.editor.recovery.v1';
 const $=id=>document.getElementById(id);
 // Recover the ordinary bank slot if a previous editor session ended unexpectedly.
 try {const raw=sessionStorage.getItem(BACKUP);if(raw!==null){const old=JSON.parse(raw);if(old.exists)localStorage.setItem(LAB_KEY,old.raw);else localStorage.removeItem(LAB_KEY);sessionStorage.removeItem(BACKUP);}}catch(e){console.error('Escena: recuperación de banco pendiente',e);}
 let active=false,selected=null,lastCheckpointRaw=null;
 let draftMarkers=[],editingMarkerId=null;
 const style=document.createElement('style');
 style.textContent=`
 #scene-editor-dialog{position:fixed;inset:0;z-index:135;background:#111c164d;color:#293c36;display:flex;align-items:center;justify-content:flex-end;padding:12px;font:13px/1.55 var(--font-menu),Arial,sans-serif}
 #scene-editor-dialog[hidden],#scene-editor-toolbar[hidden]{display:none!important}
 .scene-editor-shell{width:min(420px,95vw);max-height:96vh;overflow:auto;background:#fffffff5;border:1px solid #c9d7cd;padding:18px;box-shadow:0 18px 70px #19282029}
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
 <p>Comienza con una sala vacía y utiliza las piezas, mecanismos y blueprints nativos. El editor no modifica tus partidas de campaña ni de banco.</p>
 <h3>Catálogo de construcción nativa</h3>
 <p>Elige una pieza y vuelve inmediatamente a la sala. Apunta con la mira: fantasma azul = espacio libre; rojo = bloqueado. Rueda = girar; Shift = cuadrícula; clic = colocar; clic derecho/Esc = terminar.</p>
 <label>Elemento<select id="scene-editor-catalog" aria-label="Piezas y blueprints"></select></label>
 <div class="scene-editor-actions"><button id="scene-place-button" class="primary">Colocar con la mira en 3D</button></div>
 <label>Biblioteca de escenas<select id="scene-editor-library" aria-label="Escenas guardadas"></select></label>
 <div class="scene-editor-actions"><button id="scene-editor-choose">Abrir versión seleccionada</button><button id="scene-editor-recover">Recuperar último borrador</button></div>
 <label>Nombre de escena<input id="scene-editor-name" type="text" maxlength="90" value="Mi escena inicial"></label>
 <label>Notas de diseño<textarea id="scene-editor-notes" placeholder="Intención, elementos iniciales, restricciones, objetivos..."></textarea></label>
 <div class="scene-editor-actions">
 <button id="scene-editor-new" class="primary">Nueva escena vacía</button>
 <button id="scene-editor-open">Continuar escena guardada</button>
 <button id="scene-editor-import">Importar archivo</button>
 <button id="scene-editor-close">Volver</button></div>
 <h3>Marcas del nivel</h3>
 <p>Coloca también las marcas en el espacio 3D, apuntando al suelo o a una pieza. Si apuntas a una pieza, la marca se vincula automáticamente a su identidad.</p>
 <label>Nombre de marca<input id="scene-marker-name" type="text" maxlength="80" placeholder="Receptor de productos"></label>
 <label>Función<select id="scene-marker-role"><option value="spawn">Inicio del jugador</option><option value="source">Origen de materia</option><option value="destination">Destino</option><option value="receiver">Recepción</option><option value="workzone">Zona de trabajo</option><option value="note">Referencia visual</option></select></label>
 <div class="scene-editor-actions"><button id="scene-marker-add">Marcar en el mundo 3D</button><button id="scene-markers-save">Guardar marcas y montaje</button></div>
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
 toolbar.innerHTML=`<strong>Editor de escenas · Modo 3D</strong>
 <div class="scene-editor-actions"><button id="scene-editor-capture">Guardar montaje</button><button id="scene-editor-manage">F8 · Catálogo y exportar</button></div>
 <small id="scene-editor-live-hint">Camina y apunta · F8 elegir · rueda girar · clic colocar · Esc cancelar</small><small id="scene-editor-recovery-status" aria-live="polite"></small>`;
 document.body.append(toolbar);
 function feedback(text){$('scene-editor-feedback').textContent=text;}
 function show(){try{selected=MODEL().read(localStorage);}catch(e){selected=null;feedback(e.message);}
 const recovery=$('scene-editor-recover');
 try {const raw=localStorage.getItem(RECOVERY);recovery.disabled=!raw||!MODEL().parse(raw);}catch{recovery.disabled=true;}
 const catalog=$('scene-editor-catalog');catalog.replaceChildren();
 for(const item of (window.QBitsGame?.sceneEditor?.catalog?.()||[])){
  const opt=document.createElement('option');opt.value=item.id;opt.textContent=item.category+' · '+item.label;catalog.append(opt);
 }
 const items=MODEL().list(localStorage),select=$('scene-editor-library');select.replaceChildren();
 for(const item of items){const option=document.createElement('option');option.value=item.code;option.textContent=item.name+' · '+item.code;select.append(option);}
 if(selected&&items.some(item=>item.code===selected.code))select.value=selected.code;
 $('scene-editor-code').textContent=selected?'Versión de escena: '+selected.code+' · '+selected.inventory.pieces+' piezas':'Sin escena capturada';
 if(selected&&!active){$('scene-editor-name').value=selected.name;$('scene-editor-notes').value=selected.notes;}
 if(!active){draftMarkers=(selected?.design?.markers||[]).map(m=>({...m,position:m.position.slice()}));editingMarkerId=null;}
 renderMarkers();
 dialog.hidden=false;$('scene-editor-name').focus();}
 function close(){dialog.hidden=true;}
 function renderMarkers(){
  if(active)window.QBitsGame?.sceneEditor?.setMarkers?.(draftMarkers);
  const list=$('scene-editor-marker-list');list.replaceChildren();
  if(!draftMarkers.length)list.textContent='Sin marcas todavía.';
  for(const mark of draftMarkers){
   const line=document.createElement('div');
   line.textContent=mark.label+' ['+mark.role+'] · '+mark.position.join(', ')+(mark.unitId?' · pieza '+mark.unitId:'')+' · '+mark.id;
   const edit=document.createElement('button');edit.textContent='Editar';edit.type='button';edit.addEventListener('click',()=>{
    editingMarkerId=mark.id;$('scene-marker-name').value=mark.label;$('scene-marker-role').value=mark.role;
    $('scene-marker-add').textContent='Reubicar marca en 3D';
   });
   const remove=document.createElement('button');remove.textContent='Quitar';remove.type='button';
   remove.addEventListener('click',()=>{draftMarkers=draftMarkers.filter(m=>m.id!==mark.id);if(editingMarkerId===mark.id){editingMarkerId=null;$('scene-marker-add').textContent='Marcar en el mundo 3D';}renderMarkers();});
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
 function storeScene(data){const doc=MODEL().pack($('scene-editor-name').value,data,$('scene-editor-notes').value,{phase:'authoring',markers:draftMarkers});
  selected=MODEL().save(localStorage,doc);$('scene-editor-code').textContent=doc.code+' · '+doc.inventory.pieces+' piezas';return doc;}
 function restoreBank(){
  // Native editor sessions never write the original bank save slot.
  active=false;lastCheckpointRaw=null;toolbar.hidden=true;
 }
 function enter(mode){
  if(!MODEL())throw Error('Las herramientas de escena aún no están cargadas.');
  const game=window.QBitsGame?.sceneEditor;
  if(!game?.open)throw Error('El editor nativo todavía no está disponible.');
  let doc=null;
  if(mode==='open'){doc=current();selected=doc;}
  if(active&&game.isActive?.()&&!window.confirm('Vas a sustituir el montaje que está en pantalla. ¿Continuar sin capturarlo?'))return;
  const result=game.open(doc?doc.data:null);
  if(!result.ok)throw Error(result.error||'No se pudo entrar a la escena.');
  active=true;toolbar.hidden=false;
  draftMarkers=mode==='open'?(doc.design?.markers||[]).map(m=>({...m,position:m.position.slice()})):[];
  editingMarkerId=null;renderMarkers();close();
  game.resumeInput?.();
 }
 function getAuthoringData(){
  const result=window.QBitsGame?.sceneEditor?.capture?.();
  if(!result?.ok)throw Error(result?.error||'Abre una escena del editor para capturar.');
  return result.data;
 }
 async function copy(text){
  if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);
  else {const el=document.createElement('textarea');el.value=text;document.body.append(el);el.select();const ok=document.execCommand('copy');el.remove();if(!ok)throw Error('El navegador no permitió copiar. Descarga el archivo.');}
 }
 function current(){
  const d=MODEL().read(localStorage);if(!d)throw Error('No hay escena guardada.');
  return d;
 }
 function exportable(){return active&&window.QBitsGame?.sceneEditor?.isActive?.()?storeScene(getAuthoringData()):current();}
 function onWorldMarkerPlaced(point){
  try{
   const label=$('scene-marker-name').value.trim(),role=$('scene-marker-role').value;
   const nextId=()=>('m-'+Math.random().toString(36).slice(2,12)+Date.now().toString(36));
   let id=editingMarkerId||nextId();while(draftMarkers.some(m=>m.id===id)&&id!==editingMarkerId)id=nextId();
   const mark={id,role,label,position:point.position.slice()};
   if(point.unitId)mark.unitId=point.unitId;
   const candidate=draftMarkers.filter(m=>m.id!==id).concat(mark);
   MODEL().validateDesign({phase:'authoring',markers:candidate});
   draftMarkers=candidate;editingMarkerId=null;$('scene-marker-add').textContent='Marcar en el mundo 3D';
   renderMarkers();$('scene-editor-live-hint').textContent='Marca «'+label+'» colocada · F8 para revisar · Guardar montaje para conservar';
   return true;
  }catch(e){console.warn('Marca rechazada:',e);return false;}
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
 window.addEventListener('keydown',event=>{
  if(!active||event.repeat||event.ctrlKey||event.altKey||event.metaKey)return;
  if(event.code==='F8'){
   event.preventDefault();event.stopImmediatePropagation();
   document.exitPointerLock?.();show();
  }else if(event.code==='Escape'&&!dialog.hidden){
   event.preventDefault();event.stopImmediatePropagation();close();
  }
 },true);
 $('scene-editor-close').addEventListener('click',close);
 $('scene-place-button').addEventListener('click',()=>act(()=>{
  if(!active||!window.QBitsGame?.sceneEditor?.isActive?.())throw Error('Inicia primero Nueva escena vacía o Continuar escena.');
  const response=window.QBitsGame.sceneEditor.beginPlacement($('scene-editor-catalog').value);
  if(!response.ok)throw Error(response.error||'No se pudo preparar la vista previa.');
  $('scene-editor-live-hint').textContent=response.name+' · apunta para colocar · rueda: girar · clic derecho/Esc: cancelar';
  close();
 }));
 $('scene-editor-recover').addEventListener('click',()=>act(()=>{
  const raw=localStorage.getItem(RECOVERY);if(!raw)throw Error('No hay un borrador automático guardado.');
  const doc=MODEL().parse(raw);MODEL().save(localStorage,doc);selected=doc;show();feedback('Borrador validado. Pulsa Continuar escena guardada para volver a construir.');
 }));
 $('scene-editor-choose').addEventListener('click',()=>act(()=>{const code=$('scene-editor-library').value;if(!code)throw Error('No hay versiones en la biblioteca.');selected=MODEL().select(localStorage,code);show();feedback('Versión seleccionada: '+selected.code); }));
 $('scene-editor-new').addEventListener('click',()=>act(()=>enter('new')));
 $('scene-editor-open').addEventListener('click',()=>act(()=>enter('open')));
 $('scene-editor-manage').addEventListener('click',()=>act(show));
 $('scene-editor-capture').addEventListener('click',()=>act(()=>{
  if(!active)throw Error('Abre primero el Editor de escenas.');
  const data=getAuthoringData(),doc=storeScene(data);
  feedback('Escena capturada desde el motor y guardada. '+doc.code);
 }));
 $('scene-marker-add').addEventListener('click',()=>act(()=>{
  if(!active||!window.QBitsGame?.sceneEditor?.isActive?.())throw Error('Abre una escena del editor para colocar marcas en 3D.');
  const label=$('scene-marker-name').value.trim(),role=$('scene-marker-role').value;
  MODEL().validateDesign({phase:'authoring',markers:[{id:editingMarkerId||'m-preview',role,label,position:[0,0,0]}]});
  const result=window.QBitsGame.sceneEditor.beginMarker(role,label);
  if(!result.ok)throw Error(result.error||'No se pudo activar la marca.');
  $('scene-editor-live-hint').textContent='Marca '+label+' · apunta y haz clic · Esc para cancelar';
  close();
 }));
 $('scene-markers-save').addEventListener('click',()=>act(()=>{
  const doc=exportable();selected=doc;feedback('Montaje y marcas guardados: '+doc.code);
 }));
 $('scene-editor-copy').addEventListener('click',()=>act(async()=>{const doc=exportable();await copy(MODEL().explain(doc));feedback('Resumen copiado. Puedes pegarlo en el chat.');}));
 $('scene-editor-copy-full').addEventListener('click',()=>act(async()=>{const doc=exportable();await copy('QBSCENE1:'+base64(JSON.stringify(doc)));feedback('Código completo copiado. Contiene la escena entera.');}));
 $('scene-editor-export').addEventListener('click',()=>act(()=>{download(exportable());feedback('Archivo exportado.');}));
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
  if(active&&!$('main-screen').hidden)restoreBank();
 }).observe($('main-screen'),{attributes:true,attributeFilter:['hidden']});
 window.addEventListener('pagehide',()=>{if(active)restoreBank();});
 for(const id of ['pause-main','pause-levels','main-play','main-levels']) $(id)?.addEventListener('click',()=>{if(active)try{restoreBank();}catch(e){console.error(e);}}, {capture:true});
 // A separate, bounded crash-recovery copy; never writes either native game slot.
 setInterval(()=>{
  if(!active||!window.QBitsGame?.sceneEditor?.isActive?.()||document.hidden)return;
  try{
   const result=window.QBitsGame.sceneEditor.capture();if(!result?.ok)return;
   const doc=MODEL().pack($('scene-editor-name').value,result.data,$('scene-editor-notes').value,{phase:'authoring',markers:draftMarkers});
   localStorage.setItem(RECOVERY,JSON.stringify(doc));
   $('scene-editor-recovery-status').textContent='Borrador recuperable · '+doc.code;
  }catch(error){$('scene-editor-recovery-status').textContent='Recuperación automática no disponible: '+(error.message||error);}
 },60000);
 window.QBitsSceneEditor=Object.freeze({open:show,capture:()=>$('scene-editor-capture').click(),restoreBank,onWorldMarkerPlaced,getMarkers:()=>draftMarkers.map(m=>({...m,position:m.position.slice()}))});
})();