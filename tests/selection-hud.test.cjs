const test=require('node:test'),assert=require('node:assert/strict');
const HUD=require('../assets/js/selection-hud.js');
const item=id=>({id,name:'Q-bit '+id,count:1});
function setup(){let draws=0,contexts=0;const nodes=[],events=[];
 function node(tag){const listeners=new Map(),classes=new Set(),attrs=new Map();const ctx=new Proxy({}, {get:(o,k)=>k in o?o[k]:(...args)=>{if(k==='clearRect')draws++;}});const n={tag,style:{},dataset:{},children:[],hidden:false,clientWidth:tag==='section'?370:54,clientHeight:76,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},setAttribute:(k,v)=>attrs.set(k,String(v)),getAttribute:k=>attrs.get(k),append(...children){for(const c of children){this.children.push(c);c.parent=this;}},remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);},replaceChildren(...children){this.children=[];this.append(...children);},getContext:kind=>{assert.equal(kind,'2d');contexts++;return ctx;},addEventListener:(k,fn)=>listeners.set(k,[...(listeners.get(k)||[]),fn]),removeEventListener:(k,fn)=>listeners.set(k,(listeners.get(k)||[]).filter(x=>x!==fn)),dispatch(type,extra={}){for(const fn of listeners.get(type)||[])fn({preventDefault(){},stopPropagation(){},...extra});}};nodes.push(n);return n;}
 const doc={createElement:node,body:node('body')},root=node('section'),hud=HUD.create({root,document:doc,onSelect:(...args)=>events.push(args)});return {hud,nodes,root,events,get draws(){return draws;},get contexts(){return contexts;}};
}
test('ordinary selection is silent and never constructs a canvas, even with 2000 pieces',()=>{
 const s=setup();for(let i=0;i<120;i++)s.hud.update([],{available:true});
 assert(s.root.hidden);assert(s.hud.available);assert.equal(s.contexts,0);
 s.hud.setInteractive(true);s.hud.update([{...item(1),count:2000}]);
 assert.equal(s.hud.visibleCount,1);assert(!s.root.hidden);
 assert(s.nodes.some(n=>n.textContent==='Q-bit 1 · 2000 piezas'));
 assert(!s.nodes.some(n=>n.tag==='canvas'));assert.equal(s.draws,0);
});
test('the text chooser pages, isolates and toggles with mouse, keyboard and gamepad',()=>{
 const s=setup(),items=Array.from({length:12},(_,i)=>item(i));s.hud.update(items);
 assert.equal(s.hud.activateFocused(),false);s.hud.setInteractive(true,'gamepad');
 for(let i=0;i<7;i++)s.hud.stepFocus('right');
 assert.equal(s.hud.focusedId,7);assert.equal(s.hud.visibleCount,4);
 assert(s.hud.activateFocused({toggle:true}));assert.deepEqual(s.events[0],[7,{toggle:true,source:'gamepad'}]);
 const button=s.nodes.find(n=>n.itemId===5);button.dispatch('click',{ctrlKey:true});
 assert.deepEqual(s.events[1],[5,{toggle:true,source:'mouse'}]);
 s.hud.setInteractive(false);assert(s.root.hidden);assert(!s.hud.activateFocused());
 s.hud.setInteractive(true,'keyboard');s.hud.update([item(2)]);
 assert(s.hud.activateFocused());assert.deepEqual(s.events[2],[2,{toggle:false,source:'keyboard'}]);
 s.hud.update([],{available:false});assert(!s.hud.available);assert(s.root.hidden);
 s.hud.dispose();assert.equal(s.root.children.length,0);
});
