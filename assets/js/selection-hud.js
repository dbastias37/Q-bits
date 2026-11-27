// Optional text chooser for keyboard, mouse and controller. The world view owns
// selection feedback. Holding the HUD control exposes only names and counts.
(function(root){
 'use strict';
 function create(options={}){
  const doc=options.document||root.document,container=options.root||doc.createElement('section');
  if(!options.root){container.id='selection-hud';doc.body.append(container);}
  const previous=doc.createElement('button'),next=doc.createElement('button');
  const list=doc.createElement('div'),hint=doc.createElement('small'),pageSize=4;
  for(const [button,label,symbol] of [[previous,'Página anterior','‹'],[next,'Página siguiente','›']]){
   button.type='button';button.setAttribute('aria-label',label);button.textContent=symbol;
  }
  list.className='selection-hud-list';container.setAttribute('aria-label','Estructuras seleccionadas');
  container.append(previous,list,next,hint);container.hidden=true;
  let items=[],focus=null,interactive=false,available=false,disposed=false,source='keyboard',stamp='';
  const buttons=[];
  function activate(id,toggle=false,via=source){
   if(!available||!interactive||!items.some(item=>item.id===id))return false;
   focus=id;options.onSelect?.(id,{toggle,source:via});return true;
  }
  for(let i=0;i<pageSize;i++){
   const button=doc.createElement('button');button.type='button';
   button.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    activate(button.itemId,!!(event.ctrlKey||event.metaKey||event.shiftKey),'mouse');
   });
   button.addEventListener('focus',()=>{if(interactive&&button.itemId!=null){focus=button.itemId;paint();}});
   buttons.push(button);list.append(button);
  }
  function paint(){
   const visible=available&&interactive&&items.length>0;
   container.hidden=!visible;if(!visible){stamp='';return;}
   const at=Math.max(0,items.findIndex(item=>item.id===focus)),start=at-at%pageSize;
   const page=items.slice(start,start+pageSize);
   const signature=JSON.stringify([start,items.length,focus,...page.map(item=>[item.id,item.name,item.count])]);
   if(signature===stamp)return;stamp=signature;
   for(let i=0;i<pageSize;i++){
    const item=page[i],button=buttons[i];button.hidden=!item;button.itemId=item?.id;
    if(!item)continue;
    const text=item.name+(item.count>1?' · '+item.count+' piezas':'');
    button.textContent=text;button.dataset.focused=String(item.id===focus);button.setAttribute('aria-label',text);
   }
   previous.hidden=start===0;next.hidden=start+pageSize>=items.length;
  }
  function navigate(step){
   if(!available||!interactive||!items.length)return false;
   const index=items.findIndex(item=>item.id===focus);
   const delta=step==='left'?-1:step==='right'?1:Number(step)||0;
   focus=items[(Math.max(0,index)+delta%items.length+items.length)%items.length].id;
   paint();return focus;
  }
  previous.addEventListener('click',()=>navigate(-pageSize));
  next.addEventListener('click',()=>navigate(Math.min(pageSize,items.length-1-items.findIndex(item=>item.id===focus))));
  function update(entries,flags={}){
   if(disposed)return;
   available=flags.available??!!entries.length;items=entries;
   if(!items.some(item=>item.id===focus))focus=items[0]?.id??null;
   if(!available)interactive=false;
   paint();
  }
  function setInteractive(value,via='keyboard'){interactive=!!value&&available;source=via;paint();}
  function clear(){items=[];focus=null;available=false;interactive=false;paint();}
  function dispose(){clear();disposed=true;container.replaceChildren();if(!options.root)container.remove();}
  return {update,setInteractive,setHint(value){hint.textContent=value;},navigate,stepFocus:navigate,
   activateFocused(opts={}){return activate(focus,!!opts.toggle,opts.source||source);},clear,dispose,
   get available(){return available;},get focusedId(){return focus;},get visibleCount(){return container.hidden?0:buttons.filter(b=>!b.hidden).length;},get element(){return container;}};
 }
 const api={create};if(typeof module==='object'&&module.exports)module.exports=api;else root.QBitsSelectionHUD=api;
})(typeof window==='object'?window:globalThis);
