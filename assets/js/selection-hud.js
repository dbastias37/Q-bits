/* Selected assemblies, rendered from their real polygons without another GL context. */
(function(root){
 'use strict';
 const MAX_PARTS=2000,MAX_VISIBLE=8,ENTER=.34,EXIT=.22;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),finite=(v,f=0)=>Number.isFinite(v)?v:f;
 const rotate=(v,q)=>{
  const [x,y,z]=v,[qx,qy,qz,qw]=q,tx=2*(qy*z-qz*y),ty=2*(qz*x-qx*z),tz=2*(qx*y-qy*x);
  return [x+qw*tx+qy*tz-qz*ty,y+qw*ty+qz*tx-qx*tz,z+qw*tz+qx*ty-qy*tx];
 };
 function geometry(item){
  const points=[],faces=[];
  for(const part of (item.parts||[]).slice(0,MAX_PARTS)){
   if(!Array.isArray(part.vertices)||!Array.isArray(part.faces))continue;
   const p=(part.p||[0,0,0]).map(v=>finite(v)),rawQ=part.q||[0,0,0,1],length=Math.hypot(...rawQ)||1,q=rawQ.map(v=>finite(v)/length),offset=points.length;
   for(const v of part.vertices){if(!Array.isArray(v)||v.length!==3)return {points:[],faces:[]};const r=rotate(v.map(n=>finite(n)),q);points.push(r.map((n,i)=>n+(p[i]||0)));}
   const color=(part.color||[.15,.17,.18]).slice(0,3).map(v=>clamp(finite(v,.16),0,1));
   for(const face of part.faces)if(Array.isArray(face)&&face.length>=3&&face.every(i=>Number.isInteger(i)&&i>=0&&i<part.vertices.length))faces.push({indices:face.map(i=>offset+i),color});
  }
  if(!points.length)return {points,faces};
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const p of points)for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
  const center=min.map((n,i)=>(n+max[i])/2),span=Math.max(...max.map((n,i)=>n-min[i]),.00001);
  return {points:points.map(p=>p.map((v,i)=>(v-center[i])/span)),faces};
 }
 function fingerprint(item){
  if(item.revision!==undefined)return String(item.revision);
  return JSON.stringify((item.parts||[]).map(p=>[p.id,p.shape,p.p,p.q,p.vertices,p.faces,p.color]));
 }
 // Selection geometry is rigid. Prepare its face planes and centers once,
 // then rotate them with the vertices instead of rebuilding every polygon
 // and allocating its vectors on each 30 Hz thumbnail frame.
 function prepareMesh(mesh){
  const points=mesh.points.map(()=>[0,0,0]),faces=mesh.faces.map(face=>{
   const a=mesh.points[face.indices[0]],b=mesh.points[face.indices[1]],c=mesh.points[face.indices[2]],ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
   const normal=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx],center=[0,0,0];
   for(const index of face.indices){const p=mesh.points[index];for(let i=0;i<3;i++)center[i]+=p[i];}for(let i=0;i<3;i++)center[i]/=face.indices.length;
   return {normal,length:Math.hypot(...normal),center,color:face.color,pts:face.indices.map(i=>points[i]),z:0,r:-1,g:-1,b:-1,fill:''};
  });return {points,faces,visible:[]};
 }
 function stateMotion(item,time,reduced,hoverAge=-1){
  if(reduced)return {x:0,y:0,turn:.45,tilt:0,stretch:1};
  const agitation=clamp(finite(item.agitation),0,1),excited=item.mood==='excited',restless=item.mood==='restless';
  const jump=excited?Math.pow(Math.max(0,Math.sin(time*3.3)),4)*7:0;
  const shake=item.shaking||restless&&agitation>.45;
  const greeting=hoverAge>=0&&hoverAge<1.15?Math.sin(hoverAge*Math.PI/1.15):0;
  return {x:shake?Math.sin(time*34)*(.5+agitation*1.6):0,y:-jump-(restless?Math.max(0,Math.sin(time*5))*agitation*2:0),
   turn:time*.28+.45,tilt:shake?Math.sin(time*29)*.035*agitation:(excited?.025*Math.sin(time*3.3):0)+greeting*(restless?-.08:.11),
   stretch:1+(excited?.025*Math.sin(time*3.3):0)+greeting*.025};
 }
 function scaleAt(age,leaving,reduced){
  if(reduced)return leaving?0:1;
  const x=clamp(age/(leaving?EXIT:ENTER),0,1);
  if(leaving)return Math.max(0,1-x*x*(3-2*x));
  // A single restrained overshoot, with zero velocity at its final size.
  const t=x-1;return 1+2.15*t*t*t+1.15*t*t;
 }
 function create(options={}){
  const doc=options.document||root.document,container=options.root||doc.createElement('section'),owned=!options.root;
  if(!container.id)container.id='selection-hud';container.classList.add('selection-hud');container.setAttribute('aria-label','Q-bits seleccionados');
  if(owned)doc.body.append(container);
  const strip=doc.createElement('div');strip.className='selection-hud-strip';strip.setAttribute('role','group');strip.setAttribute('aria-label','Selección actual');
  const hint=doc.createElement('div');hint.className='selection-hud-hint';hint.setAttribute('aria-hidden','true');
  const speech=doc.createElement('div');speech.className='selection-hud-speech';speech.setAttribute('aria-live','off');speech.hidden=true;
  const overflow=doc.createElement('span');overflow.className='selection-hud-overflow';overflow.hidden=true;overflow.setAttribute('aria-hidden','true');
  const previous=doc.createElement('button'),next=doc.createElement('button');
  for(const [button,label,text]of [[previous,'Selecciones anteriores','‹'],[next,'Selecciones siguientes','›']]){button.type='button';button.className='selection-hud-page';button.setAttribute('aria-label',label);button.textContent=text;button.tabIndex=-1;}
  container.append(previous,strip,next,hint,speech,overflow);
  let entries=new Map(),order=[],focusId=null,interactive=false,source='keyboard',active=false,reduced=false,disposed=false;
  let clock=0,drawTime=-Infinity,page=0,capacity=MAX_VISIBLE,lastSpeech=-Infinity,speechUntil=0,needsPaint=true,customHint=options.hint||'',measuredWidth=0,measuredAt=-Infinity,viewportWidth=0,rootLabel='';
  const listeners=[];
  function listen(node,event,fn){node.addEventListener(event,fn);listeners.push([node,event,fn]);}
  function liveIds(){return order.filter(id=>entries.has(id)&&!entries.get(id).leaving);}
  function setInteractive(value,via='keyboard'){
   interactive=!!value&&active&&liveIds().length>0;source=via||source;container.classList.toggle('is-interactive',interactive);
   if(interactive&&!liveIds().includes(focusId))focusId=liveIds()[0]||null;
   hint.textContent=interactive?(customHint||(source==='gamepad'?'← → · elegir   × · aislar':'← → · elegir   Enter · aislar')):'';
   if(!interactive){speech.hidden=true;speechUntil=0;}
   needsPaint=true;layout();
  }
  function select(id,toggle,via){if(!interactive||!active||!entries.has(id)||entries.get(id).leaving)return false;focusId=id;options.onSelect?.(id,{toggle:!!toggle,source:via||source});return true;}
  function greet(entry){
   if(!interactive||entry.leaving||clock-lastSpeech<6||clock-entry.lastHello<22)return;
   focusId=entry.id;entry.hoverAt=clock;entry.lastHello=clock;lastSpeech=clock;
   const tired=finite(entry.item.energy,1)<.15,restless=entry.item.mood==='restless';
   const lines=tired?['Un momento…','Estoy recuperando energía.']:restless?['Ahora no.','Dame un poco de espacio.']:entry.item.mood==='excited'?['¡Aquí estoy!','¡Hey!']:['Hola.','¿Me necesitas?','Te veo.'];
   speech.textContent=lines[entry.helloCount++%lines.length];speech.hidden=false;speechUntil=clock+1.9;
   options.onHover?.(entry.id);needsPaint=true;
  }
  function add(item){
   const button=doc.createElement('button');button.type='button';button.className='selection-hud-unit';button.tabIndex=-1;
   const canvas=doc.createElement('canvas');canvas.setAttribute('aria-hidden','true');const count=doc.createElement('span');count.className='selection-hud-count';count.setAttribute('aria-hidden','true');button.append(canvas,count);strip.append(button);
   const entry={id:item.id,item,button,canvas,count,ctx:null,contextFailed:false,age:0,leaving:false,hoverAt:-Infinity,lastHello:-Infinity,helloCount:0,stamp:null,mesh:null};
   listen(button,'pointerenter',()=>greet(entry));listen(button,'focus',()=>{if(interactive){focusId=entry.id;needsPaint=true;}});
   listen(button,'click',event=>{event.preventDefault();event.stopPropagation();select(entry.id,event.ctrlKey||event.metaKey||event.shiftKey,'mouse');});
   listen(button,'keydown',event=>{if(!interactive)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();select(entry.id,event.ctrlKey||event.metaKey,'keyboard');}});
   return entry;
  }
  function remove(entry){entry.button.remove();for(let i=listeners.length-1;i>=0;i--)if(listeners[i][0]===entry.button){const [node,event,fn]=listeners[i];node.removeEventListener(event,fn);listeners.splice(i,1);}entries.delete(entry.id);}
  function layout(){
   if(disposed)return;
   const width=measuredWidth||Math.min(370,(root.innerWidth||1024)/2-32),cell=(root.innerWidth||1024)<=620?48:58;
   capacity=Math.max(1,Math.min(MAX_VISIBLE,Math.floor((width-36)/cell)));
   const ids=order.filter(id=>entries.has(id));const focused=ids.indexOf(focusId);
   if(interactive&&focused>=0){if(focused<page)page=focused;else if(focused>=page+capacity)page=focused-capacity+1;}
   page=clamp(page,0,Math.max(0,ids.length-capacity));const visible=new Set(ids.slice(page,page+capacity));
   for(const [id,entry]of entries){const wasVisible=entry.visible;entry.visible=visible.has(id);if(wasVisible&&!entry.visible&&entry.ctx){entry.canvas.width=1;entry.canvas.height=1;}if(entry.button.hidden===entry.visible)entry.button.hidden=!entry.visible;const focused=String(interactive&&id===focusId),disabled=String(!interactive||entry.leaving),tab=interactive&&entry.visible?0:-1;if(entry.button.dataset.focused!==focused)entry.button.dataset.focused=focused;if(entry.button.tabIndex!==tab)entry.button.tabIndex=tab;if(entry.disabledState!==disabled){entry.button.setAttribute('aria-disabled',disabled);entry.disabledState=disabled;}}
   previous.hidden=!interactive||page<=0;next.hidden=!interactive||page+capacity>=ids.length;
   const hidden=!active||!ids.length;if(container.hidden!==hidden)container.hidden=hidden;const count=String(liveIds().length);if(container.dataset.count!==count)container.dataset.count=count;
   const additional=liveIds().filter(id=>!visible.has(id)).length,overflowText='+'+additional;if(overflow.hidden!==(additional===0))overflow.hidden=additional===0;if(overflow.textContent!==overflowText)overflow.textContent=overflowText;
  }
  function render(entry){
   if(entry.contextFailed)return;const canvas=entry.canvas,ctx=entry.ctx||(entry.ctx=canvas.getContext('2d'));if(!ctx){entry.contextFailed=true;return;}const w=canvas.clientWidth||70,h=canvas.clientHeight||76,dpr=Math.min(root.devicePixelRatio||1,2);
   if(canvas.width!==Math.round(w*dpr))canvas.width=Math.round(w*dpr);if(canvas.height!==Math.round(h*dpr))canvas.height=Math.round(h*dpr);
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
   const stamp=fingerprint(entry.item);if(stamp!==entry.stamp){entry.mesh=geometry(entry.item);entry.paint=prepareMesh(entry.mesh);entry.stamp=stamp;}
   const scale=scaleAt(entry.age,entry.leaving,reduced),opacity=entry.leaving?clamp(1-entry.age/EXIT,0,1):clamp(entry.age/.12,0,1),motion=stateMotion(entry.item,clock,reduced,clock-entry.hoverAt);
   if(!entry.mesh.points.length||scale<=0)return;
   const sy=Math.sin(motion.turn),cy=Math.cos(motion.turn),pitch=.45+motion.tilt,sp=Math.sin(pitch),cp=Math.cos(pitch),zoom=Math.min(w,h)*.54*scale;
   const paint=entry.paint;for(let i=0;i<entry.mesh.points.length;i++){const [x,y,z]=entry.mesh.points[i],xx=x*cy+z*sy,zz=z*cy-x*sy,p=paint.points[i];p[0]=xx;p[1]=y*cp-zz*sp;p[2]=y*sp+zz*cp;}
   const faces=paint.visible;faces.length=0;
   for(const face of paint.faces){const [x,y,z]=face.normal,xx=x*cy+z*sy,zz=z*cy-x*sy,ny=y*cp-zz*sp,nz=y*sp+zz*cp;if(face.length<1e-9||nz<=0)continue;
    const light=.56+.44*Math.max(0,(-.35*xx+.65*ny+.68*nz)/face.length),r=Math.round(clamp(face.color[0]*light+.012,0,1)*255),g=Math.round(clamp(face.color[1]*light+.012,0,1)*255),b=Math.round(clamp(face.color[2]*light+.012,0,1)*255);
    if(r!==face.r||g!==face.g||b!==face.b){face.r=r;face.g=g;face.b=b;face.fill='rgb('+r+','+g+','+b+')';}
    const center=face.center;face.z=center[1]*sp+(center[2]*cy-center[0]*sy)*cp;faces.push(face);
   }
   faces.sort((a,b)=>a.z-b.z);ctx.globalAlpha=opacity;ctx.lineJoin='round';ctx.lineWidth=.7;
   for(const face of faces){ctx.beginPath();for(let i=0;i<face.pts.length;i++){const p=face.pts[i],x=w/2+p[0]*zoom+motion.x,y=h*.54-p[1]*zoom*motion.stretch+motion.y;ctx[i?'lineTo':'moveTo'](x,y);}ctx.closePath();ctx.fillStyle=face.fill;ctx.fill();ctx.strokeStyle='rgba(100,117,118,.28)';ctx.stroke();}
   ctx.globalAlpha=1;
  }
  function update(items,dt=0,flags={}){
   if(disposed)return;clock+=clamp(finite(dt),0,.1);active=flags.active!==false;reduced=flags.reducedMotion===true;
   const viewport=root.innerWidth||1024;if(viewport!==viewportWidth||clock-measuredAt>.25){viewportWidth=viewport;measuredWidth=container.clientWidth||Math.min(370,viewport/2-32);measuredAt=clock;}
   const wanted=new Map();let remaining=MAX_PARTS;
   for(const item of Array.isArray(items)?items:[]){if(item?.id===undefined||wanted.has(item.id)||!Array.isArray(item.parts)||!item.parts.length||remaining<=0)continue;const parts=item.parts.slice(0,remaining);remaining-=parts.length;wanted.set(item.id,{...item,parts});}
   for(const [id,item]of wanted){let entry=entries.get(id);if(!entry){entry=add(item);entries.set(id,entry);needsPaint=true;}else if(entry.leaving){entry.leaving=false;entry.age=ENTER;needsPaint=true;}entry.item=item;const count=Math.max(1,Math.round(finite(item.count,item.parts.length)));const countText=count>1?'×'+count:'',label=(item.name||'Selección')+(count>1?' · '+count+' piezas':'');if(entry.count.textContent!==countText)entry.count.textContent=countText;if(entry.label!==label){entry.button.setAttribute('aria-label',label);entry.label=label;}}
   for(const [id,entry]of entries){if(!wanted.has(id)&&!entry.leaving){entry.leaving=true;entry.age=0;needsPaint=true;}entry.age+=clamp(finite(dt),0,.1);if(entry.leaving&&(entry.age>=EXIT||reduced||!active))remove(entry);}
   order=[...order.filter(id=>entries.has(id)),...Array.from(wanted.keys()).filter(id=>!order.includes(id))];
   if(!wanted.has(focusId))focusId=wanted.keys().next().value??null;
   const pieces=[...wanted.values()].reduce((sum,item)=>sum+item.parts.length,0),label=pieces+' piezas seleccionadas en '+wanted.size+' estructuras';if(label!==rootLabel){container.setAttribute('aria-label',label);rootLabel=label;}
   if(flags.interactive!==undefined&&interactive!==!!flags.interactive)setInteractive(flags.interactive,flags.source||source);
   if(!active&&interactive)setInteractive(false);if(clock>=speechUntil)speech.hidden=true;
   layout();
   if(!active||container.hidden)return;
   // The caller owns time; no background RAF, timers, or GPU context are created.
   if(clock-drawTime>=1/30-.0001){for(const entry of entries.values())if(entry.visible)render(entry);drawTime=clock;needsPaint=false;}
  }
  function navigate(direction){if(!active||!interactive)return false;const ids=liveIds();if(!ids.length)return false;const current=Math.max(0,ids.indexOf(focusId)),delta=direction==='left'?-1:direction==='right'?1:Math.trunc(Number(direction)||0);focusId=ids[((current+delta)%ids.length+ids.length)%ids.length];needsPaint=true;layout();return focusId;}
  function activate(options={}){return select(focusId,options.toggle,options.source||source);}
  function clear(){for(const entry of [...entries.values()])remove(entry);order=[];focusId=null;page=0;speech.hidden=true;container.hidden=true;interactive=false;container.classList.remove('is-interactive');}
  function dispose(){if(disposed)return;clear();for(const [node,event,fn]of listeners)node.removeEventListener(event,fn);listeners.length=0;if(owned)container.remove();else container.replaceChildren();disposed=true;}
  listen(previous,'click',event=>{event.preventDefault();navigate(-capacity);});listen(next,'click',event=>{event.preventDefault();navigate(capacity);});
  container.hidden=true;
  return {update,setInteractive,setHint(text){customHint=String(text||'');setInteractive(interactive,source);},navigate,stepFocus:navigate,activate,activateFocused:activate,clear,dispose,get available(){return !disposed&&active&&liveIds().length>0;},get focusedId(){return focusId;},get visibleCount(){return [...entries.values()].filter(e=>e.visible).length;},get element(){return container;}};
 }
 const api={create,geometry,stateMotion,scaleAt};if(typeof module==='object'&&module.exports)module.exports=api;else root.QBitsSelectionHUD=api;
})(typeof window==='object'?window:globalThis);
