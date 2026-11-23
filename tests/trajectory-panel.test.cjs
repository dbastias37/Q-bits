const test=require('node:test');
const assert=require('node:assert/strict');
const UI=require('../assets/js/trajectory-panel.js');

// DOM/input contracts only. This fixture does not certify browser layout or WebGL.
function fixture(initial={},options={}){
 const doc={activeElement:null,created:0},calls=[];let state=initial,reads=0,closed=0;
 function events(node){
  node.listeners=[];
  node.addEventListener=(type,fn,capture=false)=>node.listeners.push({type,fn,capture:capture===true||capture?.capture===true});
  node.removeEventListener=(type,fn)=>{node.listeners=node.listeners.filter(x=>x.type!==type||x.fn!==fn);};return node;
 }
 events(doc);
 doc.createElement=tag=>{
  doc.created++;const attributes={},node=events({tagName:tag.toUpperCase(),children:[],dataset:{},hidden:false,disabled:false,open:false,value:'',checked:false,textContent:'',parentNode:null});
  Object.defineProperty(node,'innerHTML',{set(){throw Error('Never interpolate route data into HTML.');}});
  Object.defineProperty(node,'isConnected',{get(){let p=node;while(p){if(p===doc.body)return true;p=p.parentNode;}return false;}});
  node.setAttribute=(key,value)=>{attributes[key]=String(value);};node.getAttribute=key=>attributes[key]??null;node.removeAttribute=key=>delete attributes[key];
  node.appendChild=child=>{child.parentNode?.removeChild(child);node.children.push(child);child.parentNode=node;return child;};node.append=(...children)=>children.forEach(node.appendChild);
  node.removeChild=child=>{const at=node.children.indexOf(child);if(at>=0)node.children.splice(at,1);child.parentNode=null;};node.remove=()=>node.parentNode?.removeChild(node);
  node.replaceChildren=(...children)=>{for(const child of [...node.children])node.removeChild(child);node.append(...children);};node.focus=()=>{doc.activeElement=node;};return node;
 };
 doc.createElementNS=(_,tag)=>doc.createElement(tag);doc.body=doc.createElement('body');const previous=doc.createElement('canvas');doc.body.append(previous);doc.activeElement=previous;
 const walk=(node,id)=>node.id===id?node:node.children.map(child=>walk(child,id)).find(Boolean),get=id=>walk(doc.body,'trajectory-'+id);
 const countListeners=()=>{let n=doc.listeners.length;const visit=node=>{n+=node.listeners.length;node.children.forEach(visit);};visit(doc.body);return n;};
 function dispatch(type,target=doc,props={}){
  const event={type,target,...props,defaultPrevented:false,stopped:false,immediate:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.immediate=true;this.stopped=true;}};
  const invoke=(node,capture)=>{for(const l of [...node.listeners])if(l.type===type&&l.capture===capture){l.fn(event);if(event.immediate)break;}};
  invoke(doc,true);if(!event.stopped&&target!==doc){let at=target;while(at&&!event.stopped){invoke(at,false);at=at.parentNode;}}if(!event.stopped)invoke(doc,false);return event;
 }
 const ui=UI.create({document:doc,snapshot(id){reads++;return options.snapshot?options.snapshot(id,state):state;},action(id,action,payload){calls.push({id,action,...(payload===undefined?{}:{payload})});return options.action?options.action(id,action,payload,state,ui):{ok:true,message:'Hecho'};},onClose(){closed++;options.onClose?.();}});
 return {doc,ui,get,dispatch,previous,calls,countListeners,setState(next){state=next;},get state(){return state;},get reads(){return reads;},get closed(){return closed;},click(id){return dispatch('click',get(id));},change(id,value){get(id).value=String(value);return dispatch('change',get(id));}};
}
const glyph=Array.from({length:10},(_,i)=>i===2?'0110000110':i===7?'0011111100':'0000000000');
const beacon=()=>({title:'Cubo de trayectoria',status:'Listo',role:'beacon',routeId:null,glyph:null,level:1,mode:'ground',range:4,length:0,paired:false,points:[],running:false,canStart:false,canCreate:true,availableGlyphs:144,glyphCapacity:144,reason:''});
const route=()=>({...beacon(),routeId:'ruta-a',routeLabel:'Camino del taller',glyph,canCreate:false,availableGlyphs:143,paired:true,length:2.2,mode:'air',points:[{x:0,y:.5,z:0,action:'pass',wait:0},{x:1,y:.8,z:1,action:'wait',wait:2}]});

test('the panel creates a literal, accessible identity and does not mutate a route by opening',()=>{
 const p=fixture({...beacon(),glyph,title:'<b>Ruta</b>'});assert.equal(p.ui.isOpen,false);assert.equal(p.reads,0);p.ui.open(15);
 assert.equal(p.ui.isOpen,true);assert.equal(p.ui.partId,15);assert.equal(p.get('title').textContent,'<b>Ruta</b>');assert.equal(p.get('screen').getAttribute('role'),'dialog');assert.equal(p.get('screen').getAttribute('aria-modal'),'true');
 assert.equal(p.get('glyph').getAttribute('viewBox'),'0 0 14 14');assert.equal(p.get('glyph').children.length,13);assert.equal(p.get('range').textContent,'Hasta 4 m');assert.match(p.get('orientation').textContent,/lateral/);assert.equal(p.calls.length,0);
 p.ui.close();assert.equal(p.doc.activeElement,p.previous);assert.equal(p.closed,0);const reads=p.reads;p.ui.refresh();assert.equal(p.reads,reads);
});

test('a free beacon progresses through explicit start, pair and trace commands',()=>{
 const p=fixture(beacon(),{action(id,action,payload,state){if(action==='start-route')state.routeId='ruta-a';if(action==='pair')state.paired=true;return {ok:true};}});p.ui.open(23);
 assert.equal(p.get('start-route').hidden,false);assert.equal(p.get('pair').hidden,true);p.click('start-route');assert.equal(p.get('start-route').hidden,true);assert.equal(p.get('pair').hidden,false);
 p.click('pair');assert.equal(p.get('trace').hidden,false);p.click('trace');assert.deepEqual(p.calls.map(c=>c.action),['start-route','pair','trace']);assert(p.calls.every(c=>c.id===23));assert(p.ui.isOpen);
});

test('a free beacon offers generation or intentional linking and hides changing a nonexistent face',()=>{
 const p=fixture(beacon());p.ui.open(4);
 assert.equal(p.get('start-route').textContent,'Generar cara nueva');assert.equal(p.get('start-route').disabled,false);
 assert.equal(p.get('link-route').textContent,'Vincular como fin');assert.equal(p.get('link-route').hidden,false);assert.equal(p.get('link-route').disabled,false);
 assert.equal(p.get('glyph-next').hidden,true);assert.match(p.get('availability').textContent,/144 de 144/);assert.equal(p.get('glyph').getAttribute('aria-label'),'Cara sin identidad asignada');
 p.click('glyph-next');assert.equal(p.calls.length,0);p.click('link-route');assert.deepEqual(p.calls,[{id:4,action:'link-route'}]);
});

test('the exhausted catalogue blocks generation and changing faces while still allowing an explicit end link',()=>{
 const state={...beacon(),canCreate:false,availableGlyphs:0},p=fixture(state);p.ui.open(145);
 assert.equal(p.get('start-route').hidden,false);assert.equal(p.get('start-route').disabled,true);assert.equal(p.get('link-route').disabled,false);
 assert.match(p.get('availability').textContent,/No quedan caras libres.*0 de 144/);assert.match(p.get('availability').textContent,/vincular.*fin/);
 p.click('start-route');assert.equal(p.calls.length,0);p.click('link-route');assert.equal(p.calls[0].action,'link-route');
 p.setState({...route(),availableGlyphs:0});p.ui.open(1);assert.equal(p.get('glyph-next').hidden,false);assert.equal(p.get('glyph-next').disabled,true);assert.equal(p.get('glyph-next').textContent,'Cambiar cara de la pareja');
});

test('new fourth and fifth selections do not inherit a previous route or lose creation controls',()=>{
 const p=fixture({...route(),paired:false});p.ui.open(3);assert.equal(p.get('pair').hidden,false);assert.equal(p.get('glyph-next').textContent,'Cambiar cara');
 for(const id of [4,5]){p.setState({...beacon(),availableGlyphs:144-id});p.ui.open(id);assert.equal(p.get('start-route').hidden,false);assert.equal(p.get('start-route').disabled,false);assert.equal(p.get('pair').hidden,true);assert.equal(p.get('glyph-next').hidden,true);assert.equal(p.ui.partId,id);}
 assert.equal(p.calls.length,0);
});

test('a stale creation click rechecks catalogue availability instead of sending a forbidden command',()=>{
 const state={...beacon(),availableGlyphs:1},p=fixture(state);p.ui.open(144);assert.equal(p.get('start-route').disabled,false);
 state.availableGlyphs=0;state.canCreate=false;p.click('start-route');assert.equal(p.calls.length,0);assert.equal(p.get('start-route').disabled,true);assert.equal(p.get('link-route').disabled,false);
});

test('a receiver explains its existing-face role and points to the workshop for conversion',()=>{
 const p=fixture({...beacon(),role:'receiver',canCreate:false});p.ui.open(6);
 assert.match(p.get('kind').textContent,/Receptor.*cara existente/);assert.match(p.get('guide').textContent,/generar.*baliza.*taller/);
 assert.equal(p.get('start-route').hidden,true);assert.equal(p.get('link-route').hidden,true);assert.equal(p.get('glyph-next').hidden,true);assert.equal(p.get('assign').hidden,false);
});

test('the map follows compiled geometry while markers and editing keep the authored points',()=>{
 const state=route();state.displayPoints=[state.points[0],{x:.5,y:.5,z:0},{x:.5,y:.8,z:1},state.points[1]];
 const p=fixture(state);p.ui.open(7);const children=p.get('map').children,line=children.find(node=>node.tagName==='POLYLINE'),markers=children.filter(node=>node.tagName==='CIRCLE');
 assert.equal(line.getAttribute('points').split(' ').length,4);assert.equal(markers.length,2);assert.equal(p.get('point').children.length,2);
 const option=p.get('point').children[1];p.change('point',1);assert.equal(p.get('height').value,'0.8');assert.equal(p.get('point-action').value,'wait');
 const selectedLine=p.get('map').children.find(node=>node.tagName==='POLYLINE');state.displayPoints[1]={x:.8,y:.5,z:0};p.ui.refresh();
 assert.notEqual(p.get('map').children.find(node=>node.tagName==='POLYLINE'),selectedLine);assert.equal(p.get('point').children[1],option);assert.equal(p.get('point').children.length,2);
 p.click('point-save');assert.equal(p.calls[0].payload.index,1);assert.equal(p.calls[0].payload.patch.y,.8);
});

test('receiver commands expose run or stop and recheck capability before sending a stale click',()=>{
 const state={...route(),role:'receiver',canStart:true},p=fixture(state,{action(id,action,payload,s){if(action==='run')s.running=true;if(action==='stop')s.running=false;return {ok:true};}});p.ui.open(9);
 assert.equal(p.get('trace').hidden,true);assert.equal(p.get('glyph-next').hidden,true);assert.equal(p.get('details').hidden,true);assert.equal(p.get('assign').textContent,'Cambiar ruta');p.click('run');assert(p.get('run').hidden);assert.equal(p.get('stop').hidden,false);assert(p.get('assign').disabled);
 p.click('stop');state.canStart=false;state.reason='Falta energía';p.click('run');assert.deepEqual(p.calls.map(c=>c.action),['run','stop']);assert.equal(p.get('feedback').textContent,'Falta energía');assert(p.get('run').disabled);
});

test('height, action and wait edits remain local until the selected point is saved',()=>{
 const p=fixture(route());p.ui.open(3);p.change('point',1);p.change('height',1.2);p.change('point-action','land');p.change('wait',5);assert.equal(p.calls.length,0);
 p.ui.refresh();assert.equal(p.get('height').value,'1.2');assert.equal(p.get('point-action').value,'land');assert.equal(p.get('wait').value,'5');p.click('point-save');
 assert.deepEqual(p.calls,[{id:3,action:'point-update',payload:{index:1,patch:{action:'land',wait:5,y:1.2}}}]);
});

test('invalid altitude, wait and ground landing cannot reach the game adapter',()=>{
 const p=fixture(route());p.ui.open(3);p.change('height',5);p.click('point-save');assert.match(p.get('feedback').textContent,/altura/);p.change('height','.5');p.change('point-action','wait');p.change('wait',61);p.click('point-save');assert.match(p.get('feedback').textContent,/60/);assert.equal(p.calls.length,0);
 p.setState({...route(),mode:'ground'});p.ui.open(3);assert(p.get('height-field').hidden);p.change('point-action','land');p.click('point-save');assert.equal(p.calls.length,0);
 p.change('point-action','wait');p.change('wait',2);p.click('point-save');assert.deepEqual(p.calls[0].payload,{index:0,patch:{action:'wait',wait:2}});
});

test('a changed point cannot be overwritten or deleted through a stale editor index',()=>{
 const state=route(),p=fixture(state);p.ui.open(8);p.change('point',1);p.change('height',1.3);state.points[1]={x:2,y:1,z:1,action:'wait',wait:4};p.click('point-save');assert.equal(p.calls.length,0);assert.match(p.get('feedback').textContent,/recorrido cambió/);assert.equal(p.get('height').value,'1');
 state.points[1]={x:3,y:1,z:1,action:'wait',wait:4};p.click('point-remove');assert.equal(p.calls.length,0);assert.match(p.get('feedback').textContent,/antes de quitarlo/);
 p.click('point-remove');assert.deepEqual(p.calls[0],{id:8,action:'point-remove',payload:{index:1}});
});

test('changing route identity clears an unsaved point draft even for a reused snapshot object',()=>{
 const state=route(),p=fixture(state);p.ui.open(8);p.change('height',1.7);state.routeId='ruta-b';state.points[0].y=.9;p.ui.refresh();assert.equal(p.get('height').value,'0.9');assert.equal(p.calls.length,0);p.click('point-save');assert.equal(p.calls[0].payload.patch.y,.9);
});

test('loop and glyph controls send only their explicit commands',()=>{
 const p=fixture(route());p.ui.open(7);p.get('loop').checked=true;p.dispatch('change',p.get('loop'));p.click('glyph-next');assert.deepEqual(p.calls,[{id:7,action:'loop',payload:{value:true}},{id:7,action:'glyph-next'}]);
});

test('drop is an explicit arrival action for an equipped ground or air mechanism',()=>{
 for(const mode of ['ground','air']){const p=fixture({...route(),mode});p.ui.open(5);p.change('point-action','drop');p.change('wait',3);assert.equal(p.calls.length,0);p.click('point-save');assert.equal(p.calls[0].action,'point-update');assert.equal(p.calls[0].payload.patch.action,'drop');assert.equal(p.calls[0].payload.patch.wait,3);assert.equal(p.get('point-action').children[3].textContent,'Soltar carga');}
});

test('Escape isolates game keys, closes once, restores focus and swallows the matching release',()=>{
 const p=fixture(route());let gameKeys=0;p.doc.addEventListener('keydown',()=>gameKeys++);p.doc.addEventListener('keyup',()=>gameKeys++);p.ui.open(1);
 const typing=p.dispatch('keydown',p.get('height'),{code:'KeyW'});assert(typing.stopped);assert.equal(typing.defaultPrevented,false);assert.equal(gameKeys,0);
 const esc=p.dispatch('keydown',p.get('height'),{code:'Escape'});assert(esc.defaultPrevented);assert.equal(p.ui.isOpen,false);assert.equal(p.closed,1);assert.equal(p.doc.activeElement,p.previous);
 p.dispatch('keydown',p.previous,{code:'Escape',repeat:true});p.dispatch('keyup',p.previous,{code:'Escape'});p.dispatch('keyup',p.previous,{code:'KeyW'});assert.equal(gameKeys,0);
 p.dispatch('keydown',p.previous,{code:'KeyD'});assert.equal(gameKeys,1);p.ui.close();assert.equal(p.closed,1);
});

test('Tab stays in visible controls while pointer events stay out of the game',()=>{
 const p=fixture(route());p.ui.open(1);p.get('return').focus();const tab=p.dispatch('keydown',p.get('return'),{code:'Tab'});assert(tab.defaultPrevented);assert.equal(p.doc.activeElement,p.get('close'));
 p.dispatch('keydown',p.get('close'),{code:'Tab',shiftKey:true});assert.equal(p.doc.activeElement,p.get('return'));
 let mouse=0;p.doc.addEventListener('mousedown',()=>mouse++);assert(p.dispatch('mousedown',p.get('run')).stopped);assert.equal(mouse,0);assert(p.dispatch('contextmenu',p.get('title')).defaultPrevented);
});

test('unchanged refreshes reuse glyph, map, fields and event subscriptions',()=>{
 const p=fixture(route());p.ui.open(1);const created=p.doc.created,listeners=p.countListeners(),glyphNode=p.get('glyph').children[3],mapNode=p.get('map').children[1],option=p.get('point').children[0];
 for(let i=0;i<100;i++)p.ui.refresh();assert.equal(p.doc.created,created);assert.equal(p.countListeners(),listeners);assert.equal(p.get('glyph').children[3],glyphNode);assert.equal(p.get('map').children[1],mapNode);assert.equal(p.get('point').children[0],option);
 p.setState(beacon());p.ui.open(2);assert.equal(p.get('point').children.length,0);assert(p.get('details').hidden);
});

test('failed callbacks preserve the draft and an adapter can close for world selection',()=>{
 let fail=true;const p=fixture(route(),{action(id,action,payload,state,ui){if(action==='trace'){ui.close();return {ok:true};}if(fail)throw Error('stale body');return {ok:true};}});p.ui.open(2);p.change('height',1.6);p.click('point-save');assert(p.ui.isOpen);assert.equal(p.get('height').value,'1.6');assert.match(p.get('feedback').textContent,/No se pudo/);
 fail=false;p.click('point-save');p.click('trace');assert.equal(p.ui.isOpen,false);assert.equal(p.closed,0);
});

test('missing selection disables commands and dispose removes nodes and all subscriptions',()=>{
 const p=fixture(route());p.ui.open(4);p.setState(null);p.ui.refresh();assert.match(p.get('status').textContent,/ya no está disponible/);p.click('start-route');assert.equal(p.calls.length,0);assert(p.get('start-route').disabled);
 p.ui.dispose();assert.equal(p.ui.isOpen,false);assert.equal(p.get('screen'),undefined);assert.equal(p.countListeners(),0);assert.equal(p.ui.open(4),false);p.ui.dispose();
});
