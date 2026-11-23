/* The game owns routes and physics. This panel sends explicit commands only. */
(function(root){
 'use strict';
 const SVG='http://www.w3.org/2000/svg';
 const POINT_ACTIONS={pass:'Pasar',wait:'Esperar',land:'Aterrizar',drop:'Soltar carga'};
 const finite=value=>typeof value==='number'&&Number.isFinite(value);
 const metres=value=>finite(value)?String(Math.round(value*100)/100).replace('.',',')+' m':'—';
 const hasRoute=value=>value?.routeId!==undefined&&value?.routeId!==null&&value?.routeId!=='';
 const pointKey=p=>p?[p.x,p.y,p.z,p.action,p.wait].join('|'):'';
 function create(hooks={}){
  const doc=hooks.document||root.document;if(!doc?.body)return null;
  const listeners=[],focusable=[],swallowedKeys=new Set(),buttons=new Map();
  let opened=false,disposed=false,busy=false,partId=null,last=null,lastRouteId=null,previousFocus=null,selectedPoint=0;
  let pointStamp=null,glyphStamp='',mapStamp='',draft=null,draftKey='',draftRoute=null,dirty=false;
  const element=(tag,className,text,id)=>{const node=doc.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;if(id)node.id='trajectory-'+id;return node;};
  const svg=(tag,attributes={})=>{const node=doc.createElementNS(SVG,tag);for(const [key,value]of Object.entries(attributes))node.setAttribute(key,String(value));return node;};
  const on=(node,type,fn,options)=>{node.addEventListener(type,fn,options);listeners.push([node,type,fn,options]);};
  const setText=(node,text)=>{const next=String(text??'');if(node.textContent!==next)node.textContent=next;};
  const stop=event=>{event.stopImmediatePropagation?.();event.stopPropagation?.();};
  const suppress=event=>{event.preventDefault?.();stop(event);};
  const button=(action,label,className='')=>{const node=element('button',className,label,action);node.type='button';node.dataset.action=action;buttons.set(action,node);focusable.push(node);return node;};
  const field=(labelText,input,id)=>{const label=element('label','trajectory-field',labelText,id+'-field');label.htmlFor=input.id;label.append(input);return label;};
  const screen=element('section','trajectory-screen',undefined,'screen');screen.hidden=true;screen.setAttribute('role','dialog');screen.setAttribute('aria-modal','true');screen.setAttribute('aria-labelledby','trajectory-title');screen.setAttribute('aria-describedby','trajectory-status');
  const shell=element('div','trajectory-shell'),header=element('header','trajectory-header'),heading=element('div');
  heading.append(element('p','trajectory-kicker','Q-bits / recorridos'));
  const title=element('h2','', 'Cubo de trayectoria','title'),status=element('p','trajectory-status','','status');heading.append(title,status);
  const closeButton=button('close','×','trajectory-close');closeButton.setAttribute('aria-label','Cerrar trayectorias');header.append(heading,closeButton);
  const content=element('div','trajectory-content'),identity=element('aside','trajectory-identity');
  const glyph=svg('svg',{viewBox:'0 0 14 14','shape-rendering':'crispEdges',role:'img','aria-label':'Identidad visual de la ruta'});glyph.id='trajectory-glyph';
  const routeLabel=element('strong','trajectory-route-label','','route-label'),kind=element('span','trajectory-kind','','kind'),orientation=element('p','trajectory-orientation','','orientation');
  const facts=element('dl','trajectory-facts'),reachRow=element('div'),lengthRow=element('div'),rangeValue=element('dd','', '', 'range'),lengthValue=element('dd','', '', 'length');
  reachRow.append(element('dt','', 'Alcance'),rangeValue);lengthRow.append(element('dt','', 'Trazado'),lengthValue);facts.append(reachRow,lengthRow);
  const availability=element('p','trajectory-guide','','availability');
  const changeGlyph=button('glyph-next','Cambiar cara','trajectory-subtle');identity.append(glyph,routeLabel,kind,orientation,facts,availability,changeGlyph);
  const stages=element('ol','trajectory-stages');
  const stageLabels=['Balizas','Trazado','Receptor'];
  for(const text of stageLabels)stages.appendChild(element('li','',text));
  const controls=element('div','trajectory-controls'),guide=element('p','trajectory-guide','','guide'),actions=element('div','trajectory-actions');
  actions.append(button('start-route','Generar cara nueva','trajectory-primary'),button('link-route','Vincular como fin','trajectory-primary'),button('pair','Elegir final','trajectory-primary'),button('trace','Trazar recorrido','trajectory-primary'),button('assign','Elegir ruta','trajectory-primary'),button('run','Iniciar recorrido','trajectory-primary'),button('stop','Detener recorrido','trajectory-stop'));
  const preview=element('div','trajectory-preview'),map=svg('svg',{viewBox:'0 0 420 150',role:'img','aria-label':'Vista superior del recorrido'});map.id='trajectory-map';
  const mapEmpty=element('p','trajectory-preview-empty','El trazado aparecerá aquí.','map-empty');preview.append(map,mapEmpty);
  const routeOptions=element('div','trajectory-route-options'),loop=element('input','',undefined,'loop');loop.type='checkbox';focusable.push(loop);
  const loopLabel=element('label','trajectory-loop');loopLabel.htmlFor=loop.id;loopLabel.append(loop,element('span','','Repetir · ida y vuelta'));
  routeOptions.append(loopLabel,button('clear-points','Borrar trazado','trajectory-subtle'));
  const details=element('details','trajectory-details',undefined,'details'),summary=element('summary','','Puntos del recorrido','points-title');focusable.push(summary);details.append(summary);
  const pointControls=element('div','trajectory-point-controls'),pointSelect=element('select','',undefined,'point');focusable.push(pointSelect);
  const pointSelection=field('Editar punto',pointSelect,'point');
  const pointFields=element('div','trajectory-point-fields'),height=element('input','',undefined,'height');height.type='number';height.step='.05';height.min='.15';height.max='3';height.inputMode='decimal';focusable.push(height);
  const heightLabel=field('Altura (m)',height,'height'),action=element('select','',undefined,'point-action');focusable.push(action);
  for(const [value,label]of Object.entries(POINT_ACTIONS)){const option=element('option','',label);option.value=value;action.append(option);}
  const actionLabel=field('Al llegar',action,'point-action'),wait=element('input','',undefined,'wait');wait.type='number';wait.min='0';wait.max='60';wait.step='1';wait.inputMode='numeric';focusable.push(wait);
  const waitLabel=field('Espera (segundos)',wait,'wait');pointFields.append(heightLabel,actionLabel,waitLabel);
  const pointActions=element('div','trajectory-point-actions');pointActions.append(button('point-save','Guardar punto'),button('point-remove','Quitar punto','trajectory-subtle'));
  pointControls.append(pointSelection,pointFields,pointActions);details.append(pointControls);
  const reason=element('p','trajectory-reason','','reason');controls.append(stages,guide,actions,preview,routeOptions,details,reason);content.append(identity,controls);
  const footer=element('footer','trajectory-footer'),feedback=element('p','trajectory-feedback','','feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');feedback.setAttribute('aria-atomic','true');
  const footerActions=element('div','trajectory-footer-actions');footerActions.append(button('unlink','Desvincular','trajectory-subtle'),button('return','Volver'));
  footer.append(feedback,footerActions);shell.append(header,content,footer);screen.append(shell);doc.body.append(screen);
  function snapshot(){try{return typeof hooks.snapshot==='function'?hooks.snapshot(partId)||null:null;}catch{return null;}}
  function message(text,error=false){setText(feedback,text);feedback.dataset.error=String(error);}
  function visible(node){for(let p=node;p&&p!==screen.parentNode;p=p.parentNode){if(p.hidden)return false;if(p.parentNode?.tagName==='DETAILS'&&!p.parentNode.open&&p.tagName!=='SUMMARY')return false;}return true;}
  function accepted(result){return result===true||result?.ok===true;}
  function permission(type,s){
   if(!s)return false;const linked=hasRoute(s),beacon=s.role!=='receiver',stopped=!s.running;
   if(type==='start-route')return beacon&&!linked&&stopped&&s.canCreate!==false&&s.availableGlyphs!==0;
   if(type==='link-route')return beacon&&!linked&&stopped;
   if(type==='pair')return beacon&&linked&&!s.paired&&stopped;
   if(type==='trace')return beacon&&linked&&s.paired&&stopped;
   if(type==='assign')return !beacon&&stopped;
   if(type==='run')return !beacon&&!!s.canStart&&stopped;
   if(type==='stop')return !!s.running;
   if(type==='unlink')return linked&&stopped;
   if(type==='glyph-next')return beacon&&linked&&stopped&&s.availableGlyphs!==0;
   if(type==='loop')return beacon&&linked&&s.paired&&stopped;
   if(['clear-points','point-update','point-remove'].includes(type))return beacon&&linked&&s.paired&&stopped&&!!s.points?.length;
   return false;
  }
  function perform(type,payload){
   if(!opened||busy||disposed)return false;
   const current=snapshot();if(!permission(type,current)){refresh();message(current?.reason||'El estado cambió. Revisa el recorrido antes de continuar.',true);return false;}
   busy=true;let result;
   try{result=typeof hooks.action==='function'?hooks.action(partId,type,payload):{ok:false,message:'Esta acción todavía no está disponible.'};}catch{result={ok:false,message:'No se pudo completar la acción. Revisa las piezas e inténtalo de nuevo.'};}
   busy=false;
   if(opened){if(accepted(result)){dirty=false;draft=null;}refresh();message(result?.message||(accepted(result)?'Cambio aplicado.':'No se pudo aplicar el cambio.'),!accepted(result));}
   return accepted(result);
  }
  function drawGlyph(rows){
   const valid=Array.isArray(rows)&&rows.length===10&&rows.every(row=>typeof row==='string'&&row.length===10),stamp=valid?rows.join(''):'empty';if(stamp===glyphStamp)return;glyphStamp=stamp;
   const nodes=[svg('rect',{width:14,height:14,fill:'#202727'}),svg('rect',{x:1,y:1,width:12,height:12,fill:'#f5f7ee'}),svg('rect',{x:2,y:2,width:10,height:10,fill:'#090c0c'})];
   if(valid)for(let y=0;y<10;y++)for(let x=0;x<10;x++)if(!['0','.',' '].includes(rows[y][x]))nodes.push(svg('rect',{x:x+2,y:y+2,width:1,height:1,fill:'#f5f7ee'}));
   glyph.replaceChildren(...nodes);glyph.setAttribute('aria-label',valid?'Identidad visual de la ruta':'Cara sin identidad asignada');
  }
  function drawMap(points,linePoints=points){
   const signature=list=>list.map(p=>[p.x,p.z].join(',')).join(';');
   const stamp=signature(linePoints)+'|'+signature(points)+'|'+selectedPoint;if(stamp===mapStamp)return;mapStamp=stamp;
   const valid=linePoints.length>1&&linePoints.concat(points).every(p=>finite(p.x)&&finite(p.z));preview.dataset.empty=String(!valid);mapEmpty.hidden=valid;map.hidden=!valid;if(!valid){map.replaceChildren();return;}
   const all=linePoints.concat(points),xs=all.map(p=>p.x),zs=all.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),scale=Math.min(364/Math.max(.1,maxX-minX),96/Math.max(.1,maxZ-minZ));
   const project=p=>[210+(p.x-(minX+maxX)/2)*scale,75+(p.z-(minZ+maxZ)/2)*scale],coords=points.map(project);
   const nodes=[svg('path',{d:'M 24 38 H 396 M 24 75 H 396 M 24 112 H 396 M 72 20 V 130 M 164 20 V 130 M 256 20 V 130 M 348 20 V 130',stroke:'#8fa99c','stroke-opacity':'.18',fill:'none'}),svg('polyline',{points:linePoints.map(project).map(p=>p.join(',')).join(' '),fill:'none',stroke:'#4b8c76','stroke-width':3,'stroke-linejoin':'round','stroke-linecap':'round'})];
   coords.forEach(([x,y],index)=>{nodes.push(svg('circle',{cx:x,cy:y,r:index===selectedPoint?6:4,fill:index===selectedPoint?'#295f4d':'#f6fff8',stroke:'#4b8c76','stroke-width':2}));const label=svg('text',{x:x+9,y:y-8,fill:'#46695c','font-size':11});label.textContent=String(index+1);nodes.push(label);});map.replaceChildren(...nodes);
  }
  function updatePointFields(s){
   const points=Array.isArray(s?.points)?s.points:[],point=points[selectedPoint];
   if(!point){draft=null;dirty=false;return;}
   if(!dirty||!draft){draft={y:finite(point.y)?point.y:.5,action:POINT_ACTIONS[point.action]?point.action:'pass',wait:finite(point.wait)?point.wait:0};draftKey=pointKey(point);draftRoute=s.routeId;height.value=String(draft.y);action.value=draft.action;wait.value=String(draft.wait);}
   const airborne=s.mode==='air';heightLabel.hidden=!airborne;waitLabel.hidden=action.value==='pass';
   height.min=String(finite(s.minHeight)?s.minHeight:.15);height.max=String(finite(s.maxHeight)?s.maxHeight:3);
   wait.max=String(finite(s.maxWait)?s.maxWait:60);
   const land=action.children[2];land.hidden=!airborne;land.disabled=!airborne;
   const blocked=busy||!permission('point-update',s);for(const node of [height,action,wait,buttons.get('point-save'),buttons.get('point-remove')])node.disabled=blocked;
  }
  function refresh(){
   if(!opened||disposed)return false;const s=snapshot();last=s;
   if(lastRouteId!==s?.routeId){dirty=false;draft=null;selectedPoint=0;pointStamp=null;}lastRouteId=s?.routeId;
   const beacon=s?.role!=='receiver',linked=hasRoute(s),paired=linked&&!!s?.paired,points=Array.isArray(s?.points)?s.points:[];
   screen.dataset.layout=hooks.layout?.()||'studio';
   stages.hidden=screen.dataset.layout!=='guided';
   const step=beacon?(paired?1:0):2;
   [...stages.children].forEach((item,i)=>item.setAttribute('aria-current',i===step?'step':'false'));
   setText(title,s?.title||(beacon?'Cubo de trayectoria':'Receptor de trayectoria'));setText(status,s?.status||(s?'Prepara el recorrido':'Esta pieza ya no está disponible.'));status.dataset.running=String(!!s?.running);
   setText(routeLabel,s?.routeLabel||(linked?'Ruta enlazada':'Sin ruta'));setText(kind,(beacon?'Baliza':'Receptor · sigue una cara existente')+(beacon&&finite(s?.level)?' · Nivel '+(['I','II','III'][s.level-1]||s.level):''));
   setText(orientation,s?.mode==='air'?'Cara hacia arriba · vuelo':s?.mode==='ground'?'Cara lateral · suelo':'Orienta la cara hacia un costado o hacia arriba.');
   setText(rangeValue,finite(s?.range)?'Hasta '+metres(s.range):'—');setText(lengthValue,linked&&finite(s?.length)?metres(s.length):'Sin trazado');lengthRow.hidden=!linked;
   drawGlyph(s?.glyph);
   availability.hidden=!beacon||!finite(s?.availableGlyphs);
   const capacity=finite(s?.glyphCapacity)?s.glyphCapacity:144;
   setText(availability,s?.availableGlyphs===0?'No quedan caras libres (0 de '+capacity+'). '+(!linked?'Puedes vincular este cubo como fin de un inicio existente.':'Desvincula un recorrido para liberar su cara.'):'Caras libres: '+s?.availableGlyphs+' de '+capacity+'.');
   setText(guide,!s?'Cierra este panel y selecciona una pieza disponible.':beacon?!linked?'Genera una cara nueva para iniciar otro recorrido, o vincula este cubo como fin de un inicio existente.':!paired?'Esta cara ya está reservada. Elige una baliza libre como final para que ambas compartan la identidad.':'Traza el camino en la sala. Después, asigna esta ruta al receptor del mecanismo.':!linked?'Este receptor sigue una cara existente. Elige una baliza de la ruta. Para generar una cara nueva, conviértelo en baliza desde el taller.':s.running?'El mecanismo sigue la ruta asignada. Puedes detenerlo desde aquí.':'La ruta está asignada. Inicia el recorrido cuando el mecanismo esté preparado.');
   const show={'start-route':beacon&&!linked,'link-route':beacon&&!linked,pair:beacon&&linked&&!paired,trace:beacon&&paired,assign:!beacon,run:!beacon&&!s?.running,stop:!!s?.running,unlink:linked,'glyph-next':beacon&&linked,'clear-points':beacon&&paired&&points.length>0};
   for(const [type,shown]of Object.entries(show)){const node=buttons.get(type);node.hidden=!shown;node.disabled=busy||!permission(type,s);}
   setText(changeGlyph,paired?'Cambiar cara de la pareja':'Cambiar cara');setText(buttons.get('assign'),linked?'Cambiar ruta':'Elegir ruta');routeOptions.hidden=!beacon||!paired;loop.checked=!!s?.loop;loop.disabled=busy||!permission('loop',s);
   selectedPoint=Math.max(0,Math.min(selectedPoint,points.length-1));
   const stamp=points.map(pointKey).join(';');if(stamp!==pointStamp){pointStamp=stamp;const options=points.map((p,index)=>{const option=element('option','', 'Punto '+(index+1)+' · '+(POINT_ACTIONS[p.action]||'Pasar'));option.value=String(index);return option;});pointSelect.replaceChildren(...options);}
   pointSelect.value=String(selectedPoint);pointSelect.disabled=!points.length;setText(summary,'Puntos del recorrido'+(points.length?' · '+points.length:''));details.hidden=!beacon||!paired||!points.length;
   updatePointFields(s);drawMap(points,Array.isArray(s?.displayPoints)?s.displayPoints:points);preview.hidden=!linked;setText(reason,s?.reason||'');reason.hidden=!s?.reason;return !!s;
  }
  function savePoint(){
   if(!last||busy||!opened)return false;const current=snapshot(),point=current?.points?.[selectedPoint];
   if(current?.routeId!==draftRoute||pointKey(point)!==draftKey){dirty=false;draft=null;refresh();message('El recorrido cambió. Revisa este punto antes de guardarlo.',true);return false;}
   const choice=action.value,seconds=wait.value===''?NaN:Number(wait.value),altitude=height.value===''?NaN:Number(height.value),airborne=current.mode==='air';
   const low=finite(current.minHeight)?current.minHeight:.15,high=finite(current.maxHeight)?current.maxHeight:3;
   if(!POINT_ACTIONS[choice]||choice==='land'&&!airborne){message('Elige una acción válida para este recorrido.',true);return false;}
   if(airborne&&(!Number.isFinite(altitude)||altitude<low||altitude>high)){message('La altura debe estar entre '+metres(low)+' y '+metres(high)+'.',true);return false;}
   const maxWait=finite(current.maxWait)?current.maxWait:60;
   if(choice!=='pass'&&(!Number.isFinite(seconds)||seconds<0||seconds>maxWait)){message('La espera debe estar entre 0 y '+maxWait+' segundos.',true);return false;}
   const patch={action:choice,wait:choice==='pass'?0:seconds};if(airborne)patch.y=altitude;
   return perform('point-update',{index:selectedPoint,patch});
  }
  function removePoint(){
   const current=snapshot();if(current?.routeId!==draftRoute||pointKey(current?.points?.[selectedPoint])!==draftKey){dirty=false;draft=null;refresh();message('El recorrido cambió. Revisa el punto antes de quitarlo.',true);return false;}
   return perform('point-remove',{index:selectedPoint});
  }
  function open(id){
   if(disposed)return false;if(!opened)previousFocus=doc.activeElement;
   partId=id;opened=true;screen.hidden=false;busy=false;last=null;dirty=false;draft=null;selectedPoint=0;pointStamp=null;mapStamp='';details.open=false;message('');refresh();closeButton.focus({preventScroll:true});return true;
  }
  function close(){
   if(!opened)return false;const target=previousFocus;opened=false;screen.hidden=true;busy=false;last=null;draft=null;dirty=false;previousFocus=null;
   if(target?.focus&&target.isConnected!==false)target.focus({preventScroll:true});return true;
  }
  function requestClose(){if(close())hooks.onClose?.();}
  function actionTarget(target){for(let p=target;p&&p!==screen;p=p.parentNode)if(p.dataset?.action)return p;return null;}
  on(screen,'click',event=>{stop(event);if(!opened)return;if(event.target===screen){requestClose();return;}const node=actionTarget(event.target);if(!node||node.disabled||node.hidden)return;const type=node.dataset.action;
   if(type==='close'||type==='return')requestClose();else if(type==='point-save')savePoint();else if(type==='point-remove')removePoint();else perform(type);
  });
  on(screen,'input',event=>{if([height,action,wait].includes(event.target)){dirty=true;waitLabel.hidden=action.value==='pass';message('');}});
  on(screen,'change',event=>{stop(event);const node=event.target;if(node===loop){perform('loop',{value:!!loop.checked});return;}if(node===pointSelect){selectedPoint=Math.max(0,Math.trunc(Number(pointSelect.value)||0));dirty=false;draft=null;message('');refresh();return;}if([height,action,wait].includes(node)){dirty=true;waitLabel.hidden=action.value==='pass';message('');}});
  for(const type of ['mousedown','mouseup','pointerdown','pointerup','contextmenu','wheel'])on(screen,type,event=>{stop(event);if(type==='contextmenu')event.preventDefault?.();});
  on(doc,'keydown',event=>{
   const code=event.code||event.key;if(!opened){if(swallowedKeys.has(code))suppress(event);return;}
   swallowedKeys.add(code);stop(event);if(event.isComposing)return;
   if(code==='Escape'){event.preventDefault?.();requestClose();}
   else if(code==='Tab'){event.preventDefault?.();const available=focusable.filter(node=>!node.disabled&&visible(node)),at=available.indexOf(doc.activeElement),next=at<0?(event.shiftKey?available.length-1:0):(at+(event.shiftKey?-1:1)+available.length)%available.length;available[next]?.focus({preventScroll:true});}
  },true);
  on(doc,'keyup',event=>{const code=event.code||event.key;if(opened||swallowedKeys.has(code)){stop(event);if(code==='Escape')event.preventDefault?.();swallowedKeys.delete(code);}},true);
  on(doc,'keypress',event=>{if(opened)stop(event);},true);
  function dispose(){if(disposed)return;close();disposed=true;swallowedKeys.clear();for(const [node,type,fn,options]of listeners)node.removeEventListener(type,fn,options);listeners.length=0;screen.remove();}
  return {open,close,refresh,dispose,get isOpen(){return opened;},get partId(){return partId;}};
 }
 const api={create};root.QBitsTrajectoryPanel=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
