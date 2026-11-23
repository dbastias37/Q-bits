const test=require('node:test');
const assert=require('node:assert/strict');
const UI=require('../assets/js/families-ui.js');

// This fixture checks DOM contracts and input isolation, not browser pixels.
function fixture(options={}){
 const doc={activeElement:null,listeners:[],created:0,writes:0};
 function events(node){
  node.listeners=[];
  node.addEventListener=(type,callback,capture=false)=>node.listeners.push({type,callback,capture:capture===true||capture?.capture===true});
  node.removeEventListener=(type,callback)=>{node.listeners=node.listeners.filter(x=>x.type!==type||x.callback!==callback);};
  return node;
 }
 events(doc);
 doc.createElement=tag=>{
  doc.created++;const values={},attributes={},node=events({tagName:tag.toUpperCase(),children:[],dataset:{},hidden:false,disabled:false,value:'',parentNode:null});
  let content='';Object.defineProperty(node,'textContent',{get:()=>content,set:value=>{content=String(value);doc.writes++;}});
  Object.defineProperty(node,'innerHTML',{set:()=>{throw Error('Family UI must not use HTML interpolation');}});
  Object.defineProperty(node,'isConnected',{get:()=>{let p=node;while(p){if(p===doc.body)return true;p=p.parentNode;}return false;}});
  node.style=new Proxy({setProperty(key,value){values[key]=value;doc.writes++;}}, {get:(obj,key)=>key in obj?obj[key]:values[key],set:(obj,key,value)=>{values[key]=value;doc.writes++;return true;}});
  node.setAttribute=(key,value)=>{attributes[key]=String(value);};node.getAttribute=key=>attributes[key]??null;
  node.appendChild=child=>{child.parentNode?.removeChild(child);node.children.push(child);child.parentNode=node;return child;};node.append=(...children)=>children.forEach(node.appendChild);
  node.removeChild=child=>{const at=node.children.indexOf(child);if(at>=0)node.children.splice(at,1);child.parentNode=null;};node.remove=()=>node.parentNode?.removeChild(node);
  node.focus=()=>{doc.activeElement=node;};node.select=()=>{node.selected=true;};
  node.getBoundingClientRect=()=>{throw Error('No layout reads in family UI');};
  return node;
 };
 doc.body=doc.createElement('body');const previous=doc.createElement('canvas');doc.body.append(previous);doc.activeElement=previous;
 const walk=(node,id)=>node.id===id?node:node.children.map(c=>walk(c,id)).find(Boolean);
 const get=id=>walk(doc.body,id);
 function dispatch(type,target=doc,properties={}){
  const event={type,target,...properties,defaultPrevented:false,stopped:false,immediate:false,
   preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.immediate=true;this.stopped=true;}};
  const invoke=(node,capture)=>{for(const l of [...node.listeners]){if(l.type===type&&l.capture===capture){l.callback(event);if(event.immediate)break;}}};
  invoke(doc,true);if(!event.stopped&&target!==doc){invoke(target,false);let node=target.parentNode;while(node&&!event.stopped){invoke(node,false);node=node.parentNode;}}
  if(!event.stopped)invoke(doc,false);return event;
 }
 const ui=UI.create({document:doc,...options});return {doc,ui,get,dispatch,previous};
}

test('family editor applies only the current draft and preserves black and safe literal names',()=>{
 let saved=null,closed=0;const {ui,get,dispatch}=fixture({onEditorClose:()=>closed++});
 assert.equal(ui.isOpen(),false);assert(ui.openEditor({name:'Drones',color:'#e6bb42'},value=>{saved=value;}));
 assert.equal(get('family-name').value,'Drones');get('family-name').value='<img src=x onerror=alert(1)>';dispatch('input',get('family-name'));
 const black=get('family-palette').children.find(node=>node.dataset.color==='#000000');dispatch('click',black);
 assert.equal(saved,null);assert.equal(get('family-preview-name').textContent,'<img src=x onerror=alert(1)>');assert.equal(get('family-color').value,'#000000');
 dispatch('submit',get('family-apply').parentNode.parentNode);
 assert.deepEqual(saved,{name:'<img src=x onerror=alert(1)>',color:'#000000'});assert.equal(closed,1);assert.equal(ui.isOpen(),false);assert.equal(get('family-editor').hidden,true);
});

test('editor isolates typing, Escape and its keyup from game controls and restores focus',()=>{
 let canceled=0,saved=0,gameKeys=0;const {doc,ui,get,dispatch,previous}=fixture();doc.addEventListener('keydown',()=>gameKeys++);doc.addEventListener('keyup',()=>gameKeys++);
 ui.openEditor({name:'Familia'},()=>saved++,()=>canceled++);
 const typing=dispatch('keydown',get('family-name'),{code:'KeyW'});assert.equal(typing.defaultPrevented,false);assert.equal(typing.stopped,true);assert.equal(gameKeys,0);
 const esc=dispatch('keydown',get('family-name'),{code:'Escape'});assert.equal(esc.defaultPrevented,true);assert.equal(ui.isOpen(),false);assert.equal(canceled,1);assert.equal(saved,0);assert.equal(doc.activeElement,previous);
 dispatch('keyup',get('family-name'),{code:'Escape'});dispatch('keyup',get('family-name'),{code:'KeyW'});assert.equal(gameKeys,0);
 dispatch('keydown',previous,{code:'KeyD'});assert.equal(gameKeys,1);
});

test('Enter applies once, Tab cycles without leaving editor, and composition never applies',()=>{
 let saved=0;const {doc,ui,get,dispatch}=fixture();ui.openEditor({},()=>saved++);
 get('family-apply').focus();const tab=dispatch('keydown',get('family-apply'),{code:'Tab'});assert(tab.defaultPrevented);assert.equal(doc.activeElement,get('family-editor-close'));
 dispatch('keydown',get('family-editor-close'),{code:'Tab',shiftKey:true});assert.equal(doc.activeElement,get('family-apply'));
 dispatch('keydown',get('family-name'),{code:'Enter',isComposing:true});assert.equal(saved,0);assert(ui.isOpen());
 dispatch('keydown',get('family-name'),{code:'Enter'});assert.equal(saved,1);assert.equal(ui.isOpen(),false);assert.equal(ui.closeEditor(true),false);assert.equal(saved,1);
 let gameKeys=0;doc.addEventListener('keydown',()=>gameKeys++);dispatch('keydown',doc,{code:'Enter',repeat:true});assert.equal(gameKeys,0);dispatch('keyup',doc,{code:'Enter'});dispatch('keydown',doc,{code:'Enter'});assert.equal(gameKeys,1);
});

test('Enter on palette and cancellation buttons keeps their expected keyboard actions',()=>{
 let saved=0,canceled=0;const {ui,get,dispatch}=fixture();ui.openEditor({},()=>saved++,()=>canceled++);
 const yellow=get('family-palette').children.find(node=>node.dataset.color==='#e6bb42');dispatch('keydown',yellow,{code:'Enter'});assert.equal(get('family-color').value,'#e6bb42');assert.equal(saved,0);assert(ui.isOpen());
 dispatch('keyup',yellow,{code:'Enter'});dispatch('keydown',get('family-cancel'),{code:'Enter'});assert.equal(saved,0);assert.equal(canceled,1);assert.equal(ui.isOpen(),false);
});

test('failed and throwing save callbacks preserve the editable draft',()=>{
 let attempts=0,closed=0;const {ui,get}=fixture({onEditorClose:()=>closed++});
 ui.openEditor({name:'Baterías'},()=>{attempts++;if(attempts===1)return {ok:false,message:'No hay espacio.'};if(attempts===2)throw Error('stale selection');return {ok:true};});
 assert.equal(ui.closeEditor(true),false);assert.equal(ui.isOpen(),true);assert.equal(get('family-feedback').textContent,'No hay espacio.');assert.equal(get('family-apply').disabled,false);
 assert.equal(ui.closeEditor(true),false);assert.match(get('family-feedback').textContent,/No se pudo/);assert.equal(closed,0);
 assert.equal(ui.closeEditor(true),true);assert.equal(closed,1);assert.equal(attempts,3);
});

test('active family HUD caches unchanged fields and hides when there is no stock',()=>{
 const {doc,ui,get}=fixture(),state={name:'Drones amarillos',count:40,color:'#e6bb42',hint:'Clic · colocar · Esc · cancelar'};
 ui.updateActive(state);assert.equal(get('family-active').hidden,false);assert.equal(get('family-active-count').textContent,'×40');const writes=doc.writes;
 ui.updateActive({...state});assert.equal(doc.writes,writes);ui.updateActive({...state,count:39});assert.equal(get('family-active-count').textContent,'×39');
 ui.updateActive({...state,count:0});assert.equal(get('family-active').hidden,true);ui.updateActive(null);assert.equal(get('family-active').hidden,true);
});

test('world count labels cache writes, reuse nodes, skip bad positions and cap visible labels',()=>{
 const {doc,ui,get}=fixture(),entry={id:1,x:100,y:180,count:30,color:'#000000',visible:true};
 ui.updateLabels([entry]);const node=get('family-labels').children[0],created=doc.created,writes=doc.writes;assert.equal(node.textContent,'×30');
 ui.updateLabels([{...entry}]);assert.equal(doc.writes,writes);assert.equal(doc.created,created);assert.equal(get('family-labels').children[0],node);
 ui.updateLabels([{...entry,id:2,count:40}]);assert.equal(doc.created,created);assert.equal(get('family-labels').children[0],node);assert.equal(node.textContent,'×40');
 ui.updateLabels([{...entry,x:NaN},{...entry,id:2,visible:false},{...entry,id:3,count:0}]);assert.equal(get('family-labels').children.length,0);
 ui.updateLabels(Array.from({length:500},(_,id)=>({...entry,id})));assert.equal(get('family-labels').children.length,UI.MAX_LABELS);const highCreated=doc.created;
 for(let step=0;step<50;step++)ui.updateLabels(Array.from({length:100},(_,i)=>({...entry,id:step*100+i})));assert.equal(doc.created,highCreated);
 ui.updateLabels([]);assert.equal(get('family-labels').children.length,0);
});

test('clear and dispose release UI state without mutating material via callbacks',()=>{
 let canceled=0,closed=0,saved=0;const {doc,ui,get}=fixture({onEditorClose:()=>closed++});
 ui.openEditor({name:'Familia'},()=>saved++,()=>canceled++);ui.updateActive({name:'Familia',count:10});ui.updateLabels([{id:1,x:20,y:30,count:10}]);
 ui.clear();assert.equal(ui.isOpen(),false);assert.equal(get('family-active').hidden,true);assert.equal(get('family-labels').children.length,0);assert.equal(saved+canceled+closed,0);
 ui.openEditor({},()=>saved++,()=>canceled++);ui.dispose();assert.equal(get('family-ui'),undefined);assert.equal(doc.listeners.length,0);assert.equal(saved+canceled+closed,0);assert.equal(ui.openEditor({}),false);ui.dispose();
});
