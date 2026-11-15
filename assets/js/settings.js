/* A draft changes only the preview. Save applies a validated snapshot atomically. */
(function(){'use strict';
 const P=window.QBitsPreferences;
 window.QBitsSettings={init(hooks){
  const tx=P.transaction(localStorage),screen=document.querySelector('#settings-screen'),fields=document.querySelector('#settings-fields'),confirm=document.querySelector('#settings-confirm'),status=document.querySelector('#settings-status');
  let tab='look',returnMode='menu',returnFocus=null,open=false;
  const profileKeys=new Set(Object.keys(P.styles.clean));
  const tabs={look:[
   ['style','Estilo visual','select',[['clean','Original · sala blanca'],['psx','PSX'],['neon','Dithering + neón'],['cel','Cel shading']]],
   ['outlineColor','Color de delineado y marcador','color'],['outlineWidth','Grosor del delineado','range',1,6,.5,' px'],['pathColor','Color de trayectoria','color'],['pathWidth','Grosor de trayectoria','range',1,6,.5,' ×'],
   ['markers','Marcadores de selección','check'],['markerMotion','Flotación suave del marcador','check'],
   ['dither','Dithering','range',0,100,1,' %'],['bits','Profundidad de color','range',3,8,1,' bits/canal'],['jitter','Temblor de vértices PSX','range',0,100,1,' %'],['warp','Deformación de textura PSX','range',0,100,1,' %'],['cel','Bandas de cel shading','range',0,8,1,''],['bloom','Bloom','check'],['bloomStrength','Intensidad de bloom','range',0,100,1,' %']
  ],performance:[
   ['quality','Calidad predefinida','select',[['low','Rendimiento'],['balanced','Equilibrado'],['high','Alta'],['custom','Personalizado']]],
   ['resolution','Escala de resolución','range',50,150,5,' %'],['sampling','Muestreo de imagen','select',[[1,'1×'],[1.5,'1,5×'],[2,'2×']]],['textureScale','Escalado de textura','select',[[.25,'25 %'],[.5,'50 %'],[1,'100 %'],[2,'200 %'],[4,'400 %']]],
   ['filter','Filtrado de textura','select',[['nearest','Píxel / vecino más cercano'],['linear','Bilineal'],['trilinear','Trilineal']]],['anisotropy','Filtrado anisotrópico','select',[[1,'Desactivado'],[2,'2×'],[4,'4×'],[8,'8×'],[16,'16×']]],['shadows','Sombras','select',[['off','Desactivadas'],['soft','Suaves'],['sharp','Alta · contorno definido']]],['lighting','Iluminación mejorada','range',0,100,1,' %'],['fps','Límite de fotogramas','select',[[0,'Frecuencia de pantalla'],[30,'30 FPS'],[60,'60 FPS'],[120,'120 FPS']]]
  ],audio:[['music','Música ambiental','check'],['volume','Volumen de música','range',0,100,1,' %']]};
  function render(){
   fields.replaceChildren();
   for(const [key,title,type,...args]of tabs[tab]){
    const holder=profileKeys.has(key)?tx.draft.profiles[tx.draft.style]:tx.draft,row=document.createElement('div');row.className='settings-row';
    const label=document.createElement('label');label.htmlFor='pref-'+key;label.textContent=title;const control=document.createElement('div');control.className='settings-control';
    const input=document.createElement(type==='select'?'select':'input');input.id=label.htmlFor;
    if(type==='select')for(const [v,text]of args[0]){const option=document.createElement('option');option.value=v;option.textContent=text;input.append(option);}
    else input.type=type==='check'?'checkbox':type;
    if(type==='range'){[input.min,input.max,input.step]=args;const output=document.createElement('output');output.htmlFor=input.id;output.textContent=holder[key]+(args[3]||'');control.append(output);input.addEventListener('input',()=>{output.textContent=input.value+(args[3]||'');});}
    if(type==='check')input.checked=holder[key];else input.value=holder[key];
    if(key==='anisotropy'){
     const max=hooks.capabilities.anisotropy;for(const opt of input.options)if(Number(opt.value)>max)opt.disabled=true;
     const note=document.createElement('small');note.textContent=max>1?'Disponible en este equipo: hasta '+max+'×.':'No disponible en esta GPU.';label.append(note);input.disabled=max<=1;
    }
    input.addEventListener(type==='range'||type==='color'?'input':'change',()=>{
     holder[key]=type==='check'?input.checked:typeof holder[key]==='number'?Number(input.value):input.value;
     if(key==='quality'){P.setQuality(tx.draft,input.value);render();}
     else if(key==='style')render();
     else if(tab==='performance'){tx.draft.quality='custom';const select=document.querySelector('#pref-quality');if(select)select.value='custom';}
     status.textContent=tx.dirty?'Cambios sin guardar':'Configuración guardada';
    });
    control.append(input);row.append(label,control);fields.append(row);
   }
   if(tab==='performance'){
    const row=document.createElement('div');row.className='settings-row';const label=document.createElement('label');label.textContent='Sincronización vertical · VSync';label.htmlFor='pref-vsync';const input=document.createElement('select');input.id='pref-vsync';input.disabled=true;const option=document.createElement('option');option.textContent='Automática · navegador';input.append(option);row.append(label,input);fields.append(row);
   }
   const note=document.createElement('p');note.className='settings-note';
   note.textContent=tab==='performance'?'VSync: automático, gestionado por el navegador. La iluminación añade rebote y reflejos aproximados; no es ray tracing RTX. Las texturas son procedurales. El muestreo y la resolución se limitan a 4,5 MP para proteger la memoria.':tab==='audio'?'La música y su volumen se aplican al guardar.':'Cada estilo conserva sus propios colores, grosores y efectos. La vista previa muestra los cambios antes de guardarlos.';fields.append(note);
   for(const button of screen.querySelectorAll('[data-settings-tab]')){button.setAttribute('aria-selected',String(button.dataset.settingsTab===tab));button.tabIndex=button.dataset.settingsTab===tab?0:-1;}
  }
  function close(){open=false;confirm.hidden=true;screen.hidden=true;hooks.close(returnMode);returnFocus?.focus({preventScroll:true});}
  function save(exit=false){try{const saved=tx.save();hooks.apply(saved);status.textContent='Configuración guardada';if(exit)close();else render();return true;}catch{status.textContent='No se pudo guardar. Revisa el almacenamiento del navegador; tus cambios siguen aquí.';return false;}}
  function requestClose(){if(tx.dirty){confirm.hidden=false;document.querySelector('#settings-keep').focus();}else close();}
  const api={get isOpen(){return open;},get draft(){return P.effective(tx.draft);},requestClose,open(mode){returnFocus=document.activeElement;returnMode=mode;tx.begin();open=true;hooks.open();screen.hidden=false;confirm.hidden=true;status.textContent='Configuración guardada';render();document.querySelector('#settings-back').focus();}};
  for(const button of screen.querySelectorAll('[data-settings-tab]'))button.addEventListener('click',()=>{tab=button.dataset.settingsTab;render();});
  document.querySelector('#settings-save').addEventListener('click',()=>save(false));
  document.querySelector('#settings-back').addEventListener('click',requestClose);
  document.querySelector('#settings-reset').addEventListener('click',()=>{tx.draft.profiles[tx.draft.style]=JSON.parse(JSON.stringify(P.styles[tx.draft.style]));render();status.textContent='Estilo restaurado · cambios sin guardar';});
  document.querySelector('#settings-keep').addEventListener('click',()=>{confirm.hidden=true;document.querySelector('#settings-back').focus();});
  document.querySelector('#settings-discard').addEventListener('click',()=>{tx.discard();close();});
  document.querySelector('#settings-confirm-save').addEventListener('click',()=>save(true));
  screen.addEventListener('keydown',event=>{
   if(event.target?.dataset.settingsTab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
    event.preventDefault();const names=['look','performance','audio'],at=names.indexOf(tab);tab=event.key==='Home'?names[0]:event.key==='End'?names[2]:names[(at+(event.key==='ArrowRight'?1:2))%3];render();screen.querySelector('[data-settings-tab="'+tab+'"]').focus();
   }
   if(event.code==='Escape'){event.preventDefault();event.stopPropagation();if(!confirm.hidden){confirm.hidden=true;document.querySelector('#settings-back').focus();}else requestClose();}
   if(event.key==='Tab'){const scope=confirm.hidden?screen:confirm,nodes=[...scope.querySelectorAll('button,input,select')].filter(el=>!el.disabled&&el.offsetParent!==null),first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  });
  window.addEventListener('beforeunload',event=>{if(open&&tx.dirty){event.preventDefault();event.returnValue='';}});
  return api;
 }};
})();
