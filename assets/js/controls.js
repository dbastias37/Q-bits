/* Physical inputs map to game actions; neither profiles nor polling synthesize DOM keys. */
(function(root){'use strict';
 const rows=[['forward','Avanzar','KeyW'],['backward','Retroceder','KeyS'],['left','Mover a la izquierda','KeyA'],['right','Mover a la derecha','KeyD'],['crouch','Agacharse','KeyC'],['rotate','Girar / unir una pieza','ShiftLeft'],['drop','Soltar sin unir','ControlLeft'],['inspect','Inspeccionar / separar','AltLeft'],['radial','Catálogo de creación','KeyQ'],['interact','Interactuar / avanzar diálogo','KeyE'],['skip','Omitir presentación','KeyO'],['codex','Catálogo','KeyJ'],['tablet','Desplegar o guardar la tableta','Mouse1'],['tools','Controles de la tableta','KeyP'],['spawn','Crear Q-bit (banco)','KeyN'],['cargo','Crear carga (banco)','KeyB'],['duplicate','Duplicar (banco)','KeyV'],['stop','Detener órdenes','KeyR'],['remove','Borrar (banco)','Delete'],['pause','Pausa / volver','Escape'],['fullscreen','Pantalla completa','KeyF'],['hud','Interactuar con miniaturas (mantener)','Tab'],['primary','Tomar / soltar (mantener)','Mouse0'],['secondary','Órdenes contextuales','Mouse2'],['select','Añadir / quitar de selección','KeyT'],['clear','Deseleccionar','KeyG'],['near','Acercar objeto','BracketLeft'],['far','Alejar objeto','BracketRight']];
 const actions=rows.map(([id,label,code])=>({id,label,code})),ids=actions.map(a=>a.id),copy=x=>JSON.parse(JSON.stringify(x));
 const classic=Object.fromEntries(actions.map(a=>[a.id,a.code]));
 const keyboardPresets={classic:{label:'Clásico · WASD',bindings:classic},arrows:{label:'Direccional · flechas',bindings:{...classic,forward:'ArrowUp',backward:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',rotate:'ShiftRight',drop:'ControlRight',inspect:'AltRight',interact:'Enter',radial:'Slash'}}};
 const pads=Object.fromEntries(ids.map(id=>[id,null]));Object.assign(pads,{interact:0,clear:1,primary:2,select:3,rotate:4,radial:5,drop:6,secondary:7,codex:8,pause:9,hud:10,inspect:11,near:12,far:13,stop:14,crouch:15});
 const gamepadPresets={explore:{label:'Explorar · agarre en □',bindings:pads},build:{label:'Construir · agarre en R2',bindings:{...pads,primary:7,secondary:2,rotate:5,radial:4}}};
 const buttonLabels=['✕ / A','○ / B','□ / X','△ / Y','L1 / LB','R1 / RB','L2 / LT','R2 / RT','SHARE / View','OPTIONS / Menu','L3','R3','Cruceta ↑','Cruceta ↓','Cruceta ←','Cruceta →','PS / Home'];
 function defaults(){return {keyboard:{preset:'classic',bindings:copy(classic),sensitivity:1,invertY:false},gamepad:{preset:'explore',bindings:copy(pads),sensitivity:1,deadzone:.18,invertY:false,enabled:true}};}
 function validKey(code){return typeof code==='string'&&/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Bracket(Left|Right)|Numpad[0-9]|F([1-9]|10)|Space|Tab|Enter|Escape|Backspace|Delete|Home|End|PageUp|PageDown|Insert|Comma|Period|Slash|Backslash|Semicolon|Quote|Minus|Equal|Backquote|Mouse[012])$/.test(code);}
 const limit=(v,a,b,f)=>Number.isFinite(v)?Math.max(a,Math.min(b,v)):f;
 function normalize(code){return typeof code==='string'?code.replace(/^(Shift|Control|Alt)Right$/,'$1Left'):code;}
 function tabletBindingUpgrade(raw){
  const keyboard=raw?.keyboard,bindings=keyboard?.bindings;
  if(!bindings||Object.prototype.hasOwnProperty.call(bindings,'tablet')||!Object.values(bindings).includes('Mouse1'))return raw;
  return {...raw,keyboard:{...keyboard,bindings:{...bindings,tablet:null}}};
 }
 function sanitize(raw){raw=tabletBindingUpgrade(raw);const d=defaults();for(const device of ['keyboard','gamepad']){const r=raw?.[device]||{},p=device==='keyboard'?keyboardPresets:gamepadPresets;d[device].preset=p[r.preset]||r.preset==='custom'?r.preset:d[device].preset;const source=p[d[device].preset]?.bindings||d[device].bindings,seen=new Set();d[device].bindings=copy(source);for(const id of ids){const v=r.bindings&&Object.prototype.hasOwnProperty.call(r.bindings,id)?r.bindings[id]:source[id],valid=v===null||(device==='keyboard'?validKey(v):Number.isInteger(v)&&v>=0&&v<=16),token=device==='keyboard'?normalize(v):v;d[device].bindings[id]=valid&&!seen.has(token)?v:null;if(v!==null&&valid)seen.add(token);}d[device].sensitivity=limit(r.sensitivity,.25,3,1);d[device].invertY=typeof r.invertY==='boolean'?r.invertY:false;if(device==='gamepad'){d.gamepad.deadzone=limit(r.deadzone,.05,.4,.18);d.gamepad.enabled=r.enabled!==false;}}return d;}
 function setPreset(c,device,name){const p=(device==='keyboard'?keyboardPresets:gamepadPresets)[name];if(!p)return false;c[device].bindings=copy(p.bindings);c[device].preset=name;return true;}
 function assignBinding(c,device,action,value){if(!ids.includes(action)||!c?.[device]||(device==='keyboard'&&value==='Escape'&&action!=='pause')||(value!==null&&!(device==='keyboard'?validKey(value):Number.isInteger(value)&&value>=0&&value<=16)))return false;const b=c[device].bindings,old=b[action],token=device==='keyboard'?normalize(value):value,other=value===null?null:ids.find(id=>id!==action&&(device==='keyboard'?normalize(b[id]):b[id])===token);b[action]=value;if(other)b[other]=old;c[device].preset='custom';return {swapped:other||null};}
 function keyLabel(code){if(code===null)return 'Sin asignar';const names={Mouse0:'Clic izquierdo',Mouse1:'Clic central',Mouse2:'Clic derecho',Space:'Espacio',Tab:'Tab',Escape:'Esc',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',ShiftLeft:'Shift',ShiftRight:'Shift derecho',ControlLeft:'Ctrl',ControlRight:'Ctrl derecho',AltLeft:'Alt',AltRight:'Alt derecho',BracketLeft:'[',BracketRight:']'};return names[code]||code.replace(/^Key|^Digit/,'');}
 function keyboardAction(config,code){return ids.find(id=>config.bindings[id]!==null&&normalize(config.bindings[id])===normalize(code))||null;}
 function contextButtons(config,context){const hold=context==='hud'||context==='radial'?config.bindings[context]:null;return {hold,confirm:hold===0?3:0,back:hold===1?2:1};}
 function gamepadHint(config,context){const {confirm,back}=contextButtons(config,context);return 'Cruceta · elegir · '+buttonLabels[confirm]+' confirmar · '+buttonLabels[back]+' volver';}
 function contextAction(config,context,index){
  if(context==='menu'){if(index===0)return 'confirm';if(index===1)return 'back';if(index===9||index===config.bindings.pause)return 'pause';return ({12:'up',13:'down',14:'left',15:'right'})[index];}
  if(context==='hud'||context==='radial'){const {hold,confirm,back}=contextButtons(config,context);if(index===hold)return context;if(index===confirm)return 'confirm';if(index===back||index===9||index===config.bindings.pause)return 'back';return ({12:'up',13:'down',14:'left',15:'right'})[index];}
  return ids.find(id=>config.bindings[id]===index);
 }
 function keyboard(getConfig,dispatch){const held=new Map();return {down(code,event={}){if(held.has(code)){if(event.repeat!==false)return true;this.up(code,{cancelled:true});}const id=keyboardAction(getConfig(),code);if(!id)return false;if(event.repeat)return true;const already=[...held.values()].includes(id);held.set(code,id);if(!already)dispatch(id,true,event);return true;},up(code,event={}){const id=held.get(code);if(!id)return false;held.delete(code);if(![...held.values()].includes(id))dispatch(id,false,event);return true;},clear(){const active=new Set(held.values());held.clear();for(const id of active)dispatch(id,false,{cancelled:true});},get held(){return held.size;}};}
 function stick(x,y,deadzone){const n=Math.hypot(x,y);if(!Number.isFinite(n)||n<=deadzone)return [0,0];const scale=Math.min(1,(n-deadzone)/(1-deadzone))/n;return [x*scale,y*scale];}
 function gamepad(){let index=null,previous=[],held=new Map(),mode=null,active=false,blocked=false;function release(events){for(const id of new Set(held.values()))events.push({id,down:false,cancelled:true});held.clear();}
  return {poll(list,config,context='game'){
   const events=[],pads=Array.from(list||[]).filter(Boolean),pad=pads.find(p=>p.index===index&&p.connected!==false&&p.mapping==='standard')||pads.find(p=>p.connected!==false&&p.mapping==='standard');
   const unsupported=pads.length>0&&!pad,status=!config.enabled?'disabled':pad?'connected':unsupported?'unsupported':'disconnected';
   if(!config.enabled||!pad){release(events);index=null;previous=[];active=false;mode=context;return {events,move:[0,0],look:[0,0],active:false,status,id:pad?.id||''};}
   const buttons=Array.from(pad.buttons||[],b=>!!(b?.pressed||b?.value>.55));
   if(index!==pad.index){release(events);index=pad.index;previous=buttons.slice();active=false;mode=context;}
   const changedMode=mode!==context;if(changedMode){const keep=context==='hud'?'hud':context==='radial'?'radial':null;for(const [button,id]of held)if(id!==keep){events.push({id,down:false,cancelled:true});held.delete(button);}mode=context;}
   const move=stick(Number(pad.axes?.[0])||0,Number(pad.axes?.[1])||0,config.deadzone),look=stick(Number(pad.axes?.[2])||0,Number(pad.axes?.[3])||0,config.deadzone);
   if(context==='blocked'){release(events);previous=buttons;active=false;blocked=true;return {events,move:[0,0],look:[0,0],active:false,status,id:pad.id};}
   if(blocked){previous=buttons.slice();blocked=false;}
   for(let i=0;i<buttons.length;i++){
    if(!buttons[i]&&previous[i]){const id=held.get(i);held.delete(i);if(id)events.push({id,down:false});}
    if(buttons[i]&&!previous[i]){
     active=true;const id=contextAction(config,context,i);
     if(id){held.set(i,id);events.push({id,down:true});}
    }
   }
   if(Math.hypot(...move,...look)>.08)active=true;previous=buttons;
   return {events,move:context==='game'?move:[0,0],look:context==='game'?look:[0,0],active,status,id:pad.id};
  },reset(){index=null;previous=[];held.clear();active=false;mode=null;blocked=true;}};
 }
 function labelFor(action,preferences,device='keyboard'){const config=preferences?.controls||preferences||defaults(),value=config[device]?.bindings?.[action];return device==='keyboard'?keyLabel(value??null):value===null||value===undefined?'Sin asignar':buttonLabels[value];}
 const api={keyboardAction,contextButtons,gamepadHint,labelFor,actions,keyboardPresets,gamepadPresets,buttonLabels,defaults,sanitize,setPreset,assignBinding,validKey,keyLabel,keyboard,gamepad,stick};if(typeof module==='object'&&module.exports)module.exports=api;else root.QBitsControls=api;
})(typeof window==='object'?window:globalThis);
