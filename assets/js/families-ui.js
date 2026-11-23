/* Family UI owns only labels and an editable draft. The game owns all material. */
(function(root){
 'use strict';
 const MAX_LABELS=64,MAX_NAME_LENGTH=40,DEFAULT_COLOR='#202327';
 const PALETTE=[['Negro','#000000'],['Grafito','#202327'],['Blanco','#e5ece8'],['Amarillo','#e6bb42'],['Naranja','#de8640'],['Rojo','#cd575b'],['Violeta','#9a7dca'],['Azul','#5a91cf'],['Turquesa','#54b9b0'],['Verde','#7aaa6b']];
 const color=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():DEFAULT_COLOR;
 const name=value=>(typeof value==='string'?value:'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,MAX_NAME_LENGTH)||'Familia';
 const quantity=value=>Number.isSafeInteger(value)&&value>=0?value:0;
 function create(options={}){
  const doc=options.document||root.document;if(!doc?.body)return null;
  const listeners=[],labels=new Map(),freeLabels=[];
  const element=(tag,className,text,id)=>{const node=doc.createElement(tag);if(className)node.className=className;if(id)node.id=id;if(text!==undefined)node.textContent=text;return node;};
  const on=(node,type,callback,settings)=>{node.addEventListener(type,callback,settings);listeners.push([node,type,callback,settings]);};
  const setText=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
  const stop=event=>{event.stopImmediatePropagation?.();event.stopPropagation?.();};
  const suppress=event=>{event.preventDefault?.();stop(event);};
  const rootNode=element('div','family-ui',undefined,'family-ui');
  const labelLayer=element('div','family-labels',undefined,'family-labels');labelLayer.setAttribute('aria-hidden','true');
  const active=element('aside','family-active',undefined,'family-active');active.hidden=true;active.setAttribute('aria-label','Familia en uso');
  const activeMark=element('span','family-mark');activeMark.setAttribute('aria-hidden','true');
  const activeCopy=element('div','family-active-copy'),activeLine=element('div','family-active-line');
  const activeName=element('span','family-active-name','', 'family-active-name'),activeCount=element('span','family-active-count','', 'family-active-count'),activeHint=element('span','family-active-hint','', 'family-active-hint');
  activeLine.append(activeName,activeCount);activeCopy.append(activeLine,activeHint);active.append(activeMark,activeCopy);
  const overlay=element('section','family-editor',undefined,'family-editor');overlay.hidden=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','family-editor-title');
  const card=element('form','family-editor-card');card.noValidate=true;
  const header=element('header','family-editor-header'),heading=element('div');heading.append(element('span','family-editor-kicker','Q-bits / familias'));
  const title=element('h2','', 'Nombrar familia','family-editor-title');heading.append(title);
  const close=element('button','family-editor-close','×','family-editor-close');close.type='button';close.setAttribute('aria-label','Cancelar edición de familia');header.append(heading,close);
  const nameLabel=element('label','family-editor-field','Nombre','family-name-label'),nameInput=element('input','',undefined,'family-name');nameLabel.htmlFor=nameInput.id;nameInput.type='text';nameInput.maxLength=MAX_NAME_LENGTH;nameInput.autocomplete='off';nameInput.spellcheck=false;nameInput.setAttribute('aria-describedby','family-name-note');nameLabel.append(nameInput);
  const note=element('p','family-editor-note','Hasta 40 caracteres. El nombre y el color identifican el contenido.','family-name-note');
  const colorRow=element('div','family-color-row'),colorLabel=element('label','family-editor-field','Color','family-color-label'),colorInput=element('input','',undefined,'family-color');colorLabel.htmlFor=colorInput.id;colorInput.type='color';colorInput.value=DEFAULT_COLOR;colorLabel.append(colorInput);
  const colorValue=element('output','family-color-value',DEFAULT_COLOR,'family-color-value');colorValue.htmlFor=colorInput.id;colorRow.append(colorLabel,colorValue);
  const palette=element('div','family-palette',undefined,'family-palette');palette.setAttribute('role','group');palette.setAttribute('aria-label','Colores de familia');
  const swatches=[];for(const [label,value]of PALETTE){const button=element('button','family-swatch');button.type='button';button.dataset.color=value;button.style.setProperty('--swatch',value);button.setAttribute('aria-label',label);button.title=label;button.setAttribute('aria-pressed','false');palette.append(button);swatches.push(button);on(button,'click',()=>setDraftColor(value));}
  const preview=element('div','family-editor-preview'),previewMark=element('span','family-mark');previewMark.setAttribute('aria-hidden','true');const previewName=element('span','', 'Familia','family-preview-name');preview.append(previewMark,previewName);
  const feedback=element('p','family-editor-feedback','','family-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  const footer=element('footer','family-editor-actions'),cancel=element('button','', 'Cancelar','family-cancel'),apply=element('button','family-apply','Aplicar','family-apply');cancel.type='button';apply.type='submit';footer.append(cancel,apply);
  card.append(header,nameLabel,note,colorRow,palette,preview,feedback,footer);overlay.append(card);rootNode.append(labelLayer,active,overlay);doc.body.append(rootNode);
  let opened=false,disposed=false,applying=false,onSave=null,onCancel=null,previousFocus=null,lastActiveColor=null;
  const swallowedKeys=new Set();
  function setDraftColor(value){const next=color(value);colorInput.value=next;setText(colorValue,next.toUpperCase());preview.style.setProperty('--family-color',next);for(const button of swatches)button.setAttribute('aria-pressed',String(button.dataset.color===next));}
  function finish(committed,notify=true){
   if(!opened)return false;
   const cancelCallback=onCancel,returnFocus=previousFocus;opened=false;overlay.hidden=true;onSave=null;onCancel=null;previousFocus=null;applying=false;apply.disabled=false;
   if(returnFocus?.focus&&returnFocus.isConnected!==false)returnFocus.focus({preventScroll:true});
   if(notify){if(!committed)cancelCallback?.();options.onEditorClose?.({committed});}return true;
  }
  function closeEditor(commit=false){
   if(!opened||applying)return false;if(!commit)return finish(false);
   applying=true;apply.disabled=true;let result;
   try{result=onSave?.({name:name(nameInput.value),color:color(colorInput.value)});}catch{result={ok:false,message:'No se pudo aplicar. Revisa la familia e inténtalo de nuevo.'};}
   if(result===false||result?.ok===false){applying=false;apply.disabled=false;setText(feedback,result?.message||'La familia cambió. Revisa la selección e inténtalo de nuevo.');return false;}
   return finish(true);
  }
  function openEditor(initial={},save,cancelCallback){
   if(disposed)return false;if(opened)finish(false,false);
   previousFocus=doc.activeElement;onSave=typeof save==='function'?save:null;onCancel=typeof cancelCallback==='function'?cancelCallback:null;opened=true;overlay.hidden=false;
   setText(title,typeof initial.title==='string'?initial.title.slice(0,80):'Nombrar familia');nameInput.value=name(initial.name);setText(previewName,nameInput.value);setDraftColor(initial.color);setText(feedback,'');apply.disabled=false;
   nameInput.focus({preventScroll:true});nameInput.select?.();return true;
  }
  on(nameInput,'input',()=>{setText(previewName,name(nameInput.value));setText(feedback,'');});
  on(colorInput,'input',()=>setDraftColor(colorInput.value));on(colorInput,'change',()=>setDraftColor(colorInput.value));
  on(card,'submit',event=>{suppress(event);closeEditor(true);});on(close,'click',()=>closeEditor(false));on(cancel,'click',()=>closeEditor(false));
  on(overlay,'click',event=>{stop(event);if(event.target===overlay)closeEditor(false);});
  for(const type of ['mousedown','mouseup','pointerdown','pointerup','contextmenu','wheel'])on(overlay,type,event=>{stop(event);if(type==='contextmenu')event.preventDefault?.();});
  const focusable=[close,nameInput,colorInput,...swatches,cancel,apply];
  on(doc,'keydown',event=>{
   const code=event.code||event.key;if(!opened){if(swallowedKeys.has(code))suppress(event);return;}swallowedKeys.add(code);stop(event);
   if(event.isComposing)return;
   if(code==='Escape'){event.preventDefault?.();closeEditor(false);}
   else if(code==='Enter'||code==='NumpadEnter'){
    event.preventDefault?.();const target=event.target;
    if(target===cancel||target===close)closeEditor(false);else if(swatches.includes(target))setDraftColor(target.dataset.color);else closeEditor(true);
   }
   else if(code==='Tab'){
    event.preventDefault?.();const available=focusable.filter(node=>!node.disabled&&!node.hidden),at=available.indexOf(doc.activeElement),next=at<0?(event.shiftKey?available.length-1:0):(at+(event.shiftKey?-1:1)+available.length)%available.length;available[next]?.focus({preventScroll:true});
   }
  },true);
  on(doc,'keyup',event=>{const code=event.code||event.key;if(opened||swallowedKeys.has(code)){stop(event);if(code==='Escape'||code==='Enter'||code==='NumpadEnter')event.preventDefault?.();swallowedKeys.delete(code);}},true);
  on(doc,'keypress',event=>{if(opened)stop(event);},true);
  function updateActive(value){
   if(disposed)return;if(!value||quantity(value.count)<1){active.hidden=true;return;}
   active.hidden=false;setText(activeName,name(value.name));setText(activeCount,'×'+quantity(value.count));setText(activeHint,typeof value.hint==='string'?value.hint:'');
   const nextColor=color(value.color);if(lastActiveColor!==nextColor){active.style.setProperty('--family-color',nextColor);lastActiveColor=nextColor;}
  }
  function releaseLabel(id,entry){entry.node.remove();labels.delete(id);if(freeLabels.length<MAX_LABELS)freeLabels.push(entry);}
  function updateLabels(entries){
   if(disposed)return;const wanted=new Map();
   for(const item of Array.isArray(entries)?entries:[]){if(wanted.size>=MAX_LABELS)break;
    if(!item||item.visible===false||quantity(item.count)<1||!Number.isFinite(item.x)||!Number.isFinite(item.y)||Math.abs(item.x)>100000||Math.abs(item.y)>100000||!['string','number'].includes(typeof item.id))continue;
    wanted.set(item.id,item);
   }
   for(const [id,entry]of labels)if(!wanted.has(id))releaseLabel(id,entry);
   for(const [id,item]of wanted){
    let entry=labels.get(id);if(!entry){entry=freeLabels.pop()||{node:element('span','family-count')};entry.node.dataset.familyId=String(id);labelLayer.append(entry.node);labels.set(id,entry);}
    const text='×'+quantity(item.count),nextColor=color(item.color),transform='translate3d('+(Math.round(item.x*2)/2)+'px,'+(Math.round(item.y*2)/2)+'px,0)',opacity=String(Number.isFinite(item.opacity)?Math.max(0,Math.min(1,item.opacity)):1);
    if(entry.text!==text){entry.node.textContent=text;entry.text=text;}if(entry.color!==nextColor){entry.node.style.setProperty('--family-color',nextColor);entry.color=nextColor;}
    if(entry.transform!==transform){entry.node.style.transform=transform;entry.transform=transform;}if(entry.opacity!==opacity){entry.node.style.opacity=opacity;entry.opacity=opacity;}
   }
  }
  function clear(){finish(false,false);active.hidden=true;for(const [id,entry]of labels)releaseLabel(id,entry);swallowedKeys.clear();}
  function dispose(){if(disposed)return;clear();disposed=true;for(const [node,type,callback,settings]of listeners)node.removeEventListener(type,callback,settings);listeners.length=0;freeLabels.length=0;rootNode.remove();}
  return {openEditor,closeEditor,isOpen:()=>opened,updateActive,updateLabels,clear,dispose};
 }
 const api={create,MAX_LABELS,MAX_NAME_LENGTH,PALETTE};root.QBitsFamiliesUI=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
