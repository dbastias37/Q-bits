/* Compact selection counters. No preview canvases, animation frames or physics clones. */
(function(root){
 'use strict';
 const MAX_PIECES=2000,MAX_VISIBLE=8;
 const finite=(v,f=0)=>Number.isFinite(v)?v:f,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function create(options={}){
  const doc=options.document||root.document,container=options.root||doc.createElement('section'),owned=!options.root;
  if(!container.id)container.id='selection-hud';
  container.classList.add('selection-hud');container.setAttribute('aria-label','Q-bits seleccionados');
  if(owned)doc.body.append(container);
  const strip=doc.createElement('div');strip.className='selection-hud-strip';strip.setAttribute('role','group');strip.setAttribute('aria-label','Selección actual');
  const hint=doc.createElement('div');hint.className='selection-hud-hint';hint.setAttribute('aria-hidden','true');
  const overflow=doc.createElement('span');overflow.className='selection-hud-overflow';overflow.hidden=true;overflow.setAttribute('aria-hidden','true');
  const previous=doc.createElement('button'),next=doc.createElement('button');
  for(const [button,label,arrow]of [[previous,'Selecciones anteriores','‹'],[next,'Selecciones siguientes','›']]){
   button.type='button';button.className='selection-hud-page';button.setAttribute('aria-label',label);button.textContent=arrow;button.tabIndex=-1;
  }
  container.append(previous,strip,next,hint,overflow);
  const entries=new Map(),listeners=[];
  let order=[],focusId=null,interactive=false,active=false,disposed=false,page=0,capacity=MAX_VISIBLE,source='keyboard',customHint=options.hint||'';
  function listen(node,name,fn){node.addEventListener(name,fn);listeners.push([node,name,fn]);}
  function liveIds(){return order.filter(id=>entries.has(id));}
  function setInteractive(enabled,via='keyboard'){
   source=via||source;interactive=!!enabled&&active&&entries.size>0;
   container.classList.toggle('is-interactive',interactive);
   if(interactive&&!entries.has(focusId))focusId=order[0]??null;
   hint.textContent=interactive?(customHint||(source==='gamepad'?'← → · elegir   × · aislar':'← → · elegir   Enter · aislar')):'';
   layout();
  }
  function select(id,toggle,via){if(!interactive||!active||!entries.has(id))return false;focusId=id;options.onSelect?.(id,{toggle:!!toggle,source:via||source});return true;}
  function add(item){
   const button=doc.createElement('button');button.type='button';button.className='selection-hud-unit';button.tabIndex=-1;
   const count=doc.createElement('span');count.className='selection-hud-count';count.setAttribute('aria-hidden','true');
   const label=doc.createElement('span');label.className='selection-hud-label';label.setAttribute('aria-hidden','true');
   button.append(count,label);strip.append(button);
   const entry={id:item.id,button,count,label,item};
   listen(button,'focus',()=>{if(interactive){focusId=entry.id;layout();}});
   listen(button,'click',event=>{event.preventDefault();event.stopPropagation();select(entry.id,event.ctrlKey||event.metaKey||event.shiftKey,'mouse');});
   listen(button,'keydown',event=>{if(interactive&&(event.key==='Enter'||event.key===' ')){event.preventDefault();select(entry.id,event.ctrlKey||event.metaKey,'keyboard');}});
   return entry;
  }
  function remove(entry){
   entry.button.remove();
   for(let i=listeners.length-1;i>=0;i--)if(listeners[i][0]===entry.button){const [node,name,fn]=listeners[i];node.removeEventListener(name,fn);listeners.splice(i,1);}
   entries.delete(entry.id);
  }
  function layout(){
   if(disposed)return;
   const width=container.clientWidth||Math.min(370,(root.innerWidth||1024)/2-32),cell=(root.innerWidth||1024)<=620?48:58;
   capacity=Math.max(1,Math.min(MAX_VISIBLE,Math.floor((width-36)/cell)));
   const focused=order.indexOf(focusId);
   if(interactive&&focused>=0){if(focused<page)page=focused;else if(focused>=page+capacity)page=focused-capacity+1;}
   page=clamp(page,0,Math.max(0,order.length-capacity));const visible=new Set(order.slice(page,page+capacity));
   for(const [id,entry]of entries){
    entry.button.hidden=!visible.has(id);
    entry.button.dataset.focused=String(interactive&&id===focusId);
    entry.button.tabIndex=interactive&&visible.has(id)?0:-1;
    entry.button.setAttribute('aria-disabled',String(!interactive));
   }
   previous.hidden=!interactive||page===0;next.hidden=!interactive||page+capacity>=order.length;
   container.hidden=!active||!order.length;container.dataset.count=String(order.length);
   const additional=Math.max(0,order.length-visible.size);
   overflow.hidden=additional===0;overflow.textContent='+'+additional;
  }
  function update(items,dt=0,flags={}){
   if(disposed)return;
   active=flags.active!==false;
   const wanted=new Map();let budget=MAX_PIECES;
   for(const item of Array.isArray(items)?items:[]){
    if(item?.id===undefined||wanted.has(item.id)||budget<=0)continue;
    const count=Math.max(1,Math.round(finite(item.count,Array.isArray(item.parts)?item.parts.length:1)));
    const accepted=Math.min(count,budget);budget-=accepted;wanted.set(item.id,{...item,count:accepted});
   }
   for(const [id,entry]of [...entries])if(!wanted.has(id))remove(entry);
   order=[...wanted.keys()];
   for(const item of wanted.values()){
    let entry=entries.get(item.id);if(!entry){entry=add(item);entries.set(item.id,entry);}
    entry.item=item;
    const number='×'+item.count,name=item.name||'Conjunto',label=name+(item.count>1?' · '+item.count+' piezas':'');
    if(entry.count.textContent!==number)entry.count.textContent=number;
    if(entry.label.textContent!==name)entry.label.textContent=name;
    if(entry.accessibleLabel!==label){entry.button.setAttribute('aria-label',label);entry.accessibleLabel=label;}
   }
   if(!wanted.has(focusId))focusId=order[0]??null;
   const pieces=[...wanted.values()].reduce((sum,item)=>sum+item.count,0);
   container.setAttribute('aria-label',pieces+' piezas seleccionadas en '+wanted.size+' estructuras');
   if(flags.interactive!==undefined&&interactive!==!!flags.interactive)setInteractive(flags.interactive,flags.source||source);
   if(!active&&interactive)setInteractive(false);
   layout();
  }
  function navigate(direction){
   if(!active||!interactive||!order.length)return false;
   const current=Math.max(0,order.indexOf(focusId)),delta=direction==='left'?-1:direction==='right'?1:Math.trunc(Number(direction)||0);
   focusId=order[((current+delta)%order.length+order.length)%order.length];layout();return focusId;
  }
  function clear(){for(const entry of [...entries.values()])remove(entry);order=[];focusId=null;page=0;interactive=false;container.classList.remove('is-interactive');container.hidden=true;}
  function dispose(){if(disposed)return;clear();for(const [node,name,fn]of listeners)node.removeEventListener(name,fn);listeners.length=0;if(owned)container.remove();else container.replaceChildren();disposed=true;}
  listen(previous,'click',event=>{event.preventDefault();navigate(-capacity);});
  listen(next,'click',event=>{event.preventDefault();navigate(capacity);});
  container.hidden=true;
  return {update,setInteractive,setHint(text){customHint=String(text||'');setInteractive(interactive,source);},navigate,stepFocus:navigate,activate:opts=>select(focusId,opts?.toggle,opts?.source||source),activateFocused:opts=>select(focusId,opts?.toggle,opts?.source||source),clear,dispose,get available(){return !disposed&&active&&order.length>0;},get focusedId(){return focusId;},get visibleCount(){return [...entries.values()].filter(e=>!e.button.hidden).length;},get element(){return container;}};
 }
 const api={create};if(typeof module==='object'&&module.exports)module.exports=api;else root.QBitsSelectionHUD=api;
})(typeof window==='object'?window:globalThis);
