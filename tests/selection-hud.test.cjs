const test=require('node:test'),assert=require('node:assert/strict');
const HUD=require('../assets/js/selection-hud.js');
const item=(id,count=1)=>({id,name:'Grupo '+id,count,parts:[{id}]});
function setup(){
 let contexts=0;const nodes=[],events=[];
 function node(tag){
  const listeners=new Map(),attrs=new Map(),classes=new Set();
  const n={tag,style:{},dataset:{},children:[],hidden:false,clientWidth:tag==='section'?370:54,
   classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),toggle:(k,on)=>on?classes.add(k):classes.delete(k)},
   setAttribute:(k,v)=>attrs.set(k,String(v)),getAttribute:k=>attrs.get(k),
   append(...children){for(const child of children){this.children.push(child);child.parent=this;}},
   remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);},
   replaceChildren(...children){this.children=[];this.append(...children);},
   getContext(){contexts++;throw new Error('An animated preview must not request a canvas');},
   addEventListener:(key,fn)=>listeners.set(key,[...(listeners.get(key)||[]),fn]),
   removeEventListener:(key,fn)=>listeners.set(key,(listeners.get(key)||[]).filter(f=>f!==fn)),
   dispatch(key,extra={}){for(const fn of listeners.get(key)||[])fn({preventDefault(){},stopPropagation(){},...extra});}
  };nodes.push(n);return n;
 }
 const doc={createElement:node,body:node('body')},root=node('section');
 const hud=HUD.create({root,document:doc,onSelect:(...args)=>events.push(args)});
 return {hud,root,nodes,events,get contexts(){return contexts;}};
}
test('selected mechanisms show only static counts, with no canvas, replica or animation',()=>{
 const s=setup(),selected=Array.from({length:20},(_,i)=>item(i,i+1));
 for(let n=0;n<100;n++)s.hud.update(selected,1/60,{active:true});
 assert.equal(s.hud.visibleCount,5);
 assert.equal(s.contexts,0);
 assert.equal(s.nodes.filter(n=>n.tag==='canvas').length,0);
 const label=s.nodes.find(n=>n.className==='selection-hud-count');
 assert.equal(label.textContent,'×1');
 assert.equal(s.root.getAttribute('aria-label'),'210 piezas seleccionadas en 20 estructuras');
 assert.equal(s.nodes.filter(n=>n.className==='selection-hud-unit').length,20);
 s.hud.update(selected,.1,{active:false});
 assert(s.root.hidden);assert(!s.hud.available);
});
test('keyboard and controller HUD navigation preserves selection without animated previews',()=>{
 const s=setup(),selected=Array.from({length:20},(_,i)=>item(i));
 s.hud.update(selected,.1);assert(s.hud.available);assert.equal(s.hud.activateFocused(),false);
 s.hud.setInteractive(true,'gamepad');
 for(let i=0;i<8;i++)s.hud.stepFocus(1);
 assert.equal(s.hud.focusedId,8);s.hud.update(selected,.05);
 assert.equal(s.hud.activateFocused({toggle:true}),true);
 assert.deepEqual(s.events[0],[8,{toggle:true,source:'gamepad'}]);
 assert.equal(s.hud.visibleCount,5);s.hud.setInteractive(false);
 assert.equal(s.hud.activateFocused(),false);s.hud.clear();
 assert(!s.hud.available);assert(s.root.hidden);s.hud.dispose();assert.equal(s.root.children.length,0);
});
test('selection counts update immediately, without bouncing replicas or delays',()=>{
 const s=setup();s.hud.update([item(1,12),item(2,4)],.1);
 const names=s.nodes.filter(n=>n.className==='selection-hud-unit');assert.equal(names.length,2);
 assert.equal(s.root.getAttribute('aria-label'),'16 piezas seleccionadas en 2 estructuras');
 s.hud.update([item(2,2)],.01);
 assert.equal(s.hud.visibleCount,1);assert.equal(s.root.dataset.count,'1');
 assert.equal(s.root.getAttribute('aria-label'),'2 piezas seleccionadas en 1 estructuras');
 s.hud.update([],.01);assert(s.root.hidden);assert(!s.hud.available);
});
test('2000-piece budget protects UI without allocating preview geometry',()=>{
 const s=setup();s.hud.update(Array.from({length:2001},(_,i)=>item(i)),.1);
 assert.equal(s.root.dataset.count,'2000');assert(s.hud.visibleCount<=8);
 assert.equal(s.contexts,0);assert.equal(s.nodes.filter(n=>n.tag==='canvas').length,0);
});
test('overflow count remains visible for long selections',()=>{
 const s=setup();s.hud.update(Array.from({length:128},(_,i)=>item(i)),.1);
 const more=s.nodes.find(n=>n.className==='selection-hud-overflow');
 assert.equal(more.textContent,'+'+(128-s.hud.visibleCount));
 assert.equal(more.hidden,false);
 assert.equal(s.root.getAttribute('aria-label'),'128 piezas seleccionadas en 128 estructuras');
});
