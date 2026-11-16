const test=require('node:test'),assert=require('node:assert/strict');
const HUD=require('../assets/js/selection-hud.js');
const vertices=[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,.5,.5],[-.5,.5,.5]];
const faces=[[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]];
const item=(id,extra={})=>({id,mood:'neutral',energy:1,parts:[{id,p:[0,0,0],q:[0,0,0,1],vertices,faces}],...extra});
function setup(){let draws=0,contexts=0;const nodes=[],events=[];
 function node(tag){const listeners=new Map(),classes=new Set(),attrs=new Map();const ctx=new Proxy({}, {get:(o,k)=>k in o?o[k]:(...args)=>{if(k==='clearRect')draws++;}});const n={tag,style:{},dataset:{},children:[],hidden:false,clientWidth:tag==='section'?420:70,clientHeight:76,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},setAttribute:(k,v)=>attrs.set(k,String(v)),getAttribute:k=>attrs.get(k),append(...children){for(const c of children){this.children.push(c);c.parent=this;}},remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);},replaceChildren(...children){this.children=[];this.append(...children);},getContext:kind=>{assert.equal(kind,'2d');contexts++;return ctx;},addEventListener:(k,fn)=>listeners.set(k,[...(listeners.get(k)||[]),fn]),removeEventListener:(k,fn)=>listeners.set(k,(listeners.get(k)||[]).filter(x=>x!==fn)),dispatch(type,extra={}){for(const fn of listeners.get(type)||[])fn({preventDefault(){},stopPropagation(){},...extra});}};nodes.push(n);return n;}
 const doc={createElement:node,body:node('body')},root=node('section'),hud=HUD.create({root,document:doc,onSelect:(...args)=>events.push(args)});return {hud,nodes,root,events,get draws(){return draws;},get contexts(){return contexts;}};
}
test('real part transforms normalize compound silhouettes without changing the source',()=>{
 const source=item(1);source.parts.push({...source.parts[0],id:2,p:[1,0,0]});const before=JSON.stringify(source),mesh=HUD.geometry(source);assert.equal(mesh.points.length,16);assert.equal(mesh.faces.length,12);assert.equal(JSON.stringify(source),before);
 assert.equal(Math.min(...mesh.points.map(p=>p[0])),-.5);assert.equal(Math.max(...mesh.points.map(p=>p[0])),.5);assert.equal(Math.max(...mesh.points.map(p=>p[1])),.25);
 const rotated=HUD.geometry(item(1,{parts:[{...source.parts[0],vertices:[[0,0,0],[2,0,0],[0,1,0]],faces:[[0,1,2]],q:[0,0,Math.SQRT1_2,Math.SQRT1_2]}]}));assert(Math.max(...rotated.points.map(p=>p[1]))>.49);
});
test('entry overshoot is subtle and inverse exit reaches zero; reduced motion stays still',()=>{
 assert(Math.abs(HUD.scaleAt(0,false,false))<1e-12);assert.equal(HUD.scaleAt(.34,false,false),1);const samples=Array.from({length:35},(_,i)=>HUD.scaleAt(i*.01,false,false));assert(Math.max(...samples)>1);assert(Math.max(...samples)<1.06);assert.equal(HUD.scaleAt(.22,true,false),0);assert.equal(HUD.scaleAt(0,false,true),1);
 assert.deepEqual(HUD.stateMotion(item(1,{mood:'excited',shaking:true}),12,true),HUD.stateMotion(item(1,{mood:'restless'}),28,true));
 assert.notEqual(HUD.stateMotion(item(1,{mood:'excited'}),.4,false).y,0);assert.notEqual(HUD.stateMotion(item(1,{shaking:true,agitation:1}),.4,false).x,0);
});
test('only visible entries draw at 30 FPS and no additional context or RAF is needed',()=>{
 const s=setup(),items=Array.from({length:20},(_,i)=>item(i));for(let i=0;i<61;i++)s.hud.update(items,1/60,{active:true});assert.equal(s.hud.visibleCount,5);assert.equal(s.contexts,5);assert(s.draws<=31*5);assert(s.draws>=30*5);const before=s.draws;s.hud.update(items,.1,{active:false});assert.equal(s.draws,before);assert(s.root.hidden);assert(!s.hud.available);
});
test('selection input is disabled normally, preserved across updates and virtualizes focused groups',()=>{
 const s=setup(),items=Array.from({length:20},(_,i)=>item(i));s.hud.update(items,.1);assert(s.hud.available);assert.equal(s.hud.activateFocused(),false);s.hud.setInteractive(true,'gamepad');for(let i=0;i<8;i++)s.hud.stepFocus(1);assert.equal(s.hud.focusedId,8);s.hud.update(items,.05);assert.equal(s.hud.activateFocused({toggle:true}),true);assert.deepEqual(s.events[0],[8,{toggle:true,source:'gamepad'}]);assert.equal(s.hud.visibleCount,5);
 s.hud.setInteractive(false);assert.equal(s.hud.activateFocused(),false);s.hud.clear();assert(!s.hud.available);assert(s.root.hidden);s.hud.dispose();assert.equal(s.root.children.length,0);
});
test('removing a selection keeps its inverse plop until exit ends, then clears it',()=>{
 const s=setup();s.hud.update([item(1),item(2)],.1);s.hud.update([item(2)],.02);assert.equal(s.hud.visibleCount,2);s.hud.update([item(2)],.1);s.hud.update([item(2)],.1);assert.equal(s.hud.visibleCount,1);s.hud.update([],.1);s.hud.update([],.1);s.hud.update([],.1);assert(s.root.hidden);assert(!s.hud.available);
});
test('hover greetings are rare and remain absent during pointer-lock mode',()=>{
 const s=setup();s.hud.update([item(1)],.1);const button=s.nodes.find(n=>n.className==='selection-hud-unit'),speech=s.nodes.find(n=>n.className==='selection-hud-speech');button.dispatch('pointerenter');assert(speech.hidden);s.hud.setInteractive(true);button.dispatch('pointerenter');assert.equal(speech.textContent,'Hola.');for(let i=0;i<30;i++)s.hud.update([item(1)],.1);assert(speech.hidden);button.dispatch('pointerenter');assert(speech.hidden);s.hud.setInteractive(false);assert(speech.hidden);
});
test('untrusted or oversized geometry cannot exceed 256 part budget',()=>{
 const s=setup();const many=Array.from({length:300},(_,i)=>item(i));s.hud.update(many,.1);assert.equal(s.root.dataset.count,'256');assert(s.hud.visibleCount<=8);assert.doesNotThrow(()=>HUD.geometry({parts:[{vertices:[[0,0,0],[0,1,0],[1,0,0]],faces:[[0,1,9999]]}]}));
});

test('overflow remains visible outside interaction and names the total selected piece count',()=>{
 const s=setup();s.hud.update(Array.from({length:128},(_,i)=>item(i)),.1);const more=s.nodes.find(n=>n.className==='selection-hud-overflow');assert.equal(more.textContent,'+123');assert.equal(more.hidden,false);assert.equal(s.root.getAttribute('aria-label'),'128 piezas seleccionadas en 128 estructuras');
});
