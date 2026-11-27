const test=require('node:test'),assert=require('node:assert/strict');
const HUD=require('../assets/js/selection-hud.js'),createGame=require('./game-harness.cjs');

function recorder(){
 const nodes=[];let contexts=0;
 function node(tag){
  const attrs=new Map(),classes=new Set(),listeners=new Map();
  const el={tag,children:[],dataset:{},style:{},hidden:false,clientWidth:tag==='section'?370:70,
   classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),toggle:(c,on)=>on?classes.add(c):classes.delete(c)},
   setAttribute:(k,v)=>attrs.set(k,String(v)),getAttribute:k=>attrs.get(k),
   append(...items){this.children.push(...items);for(const item of items)item.parent=this;},
   remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);},
   replaceChildren(...items){this.children=[];this.append(...items);},
   addEventListener:(k,fn)=>listeners.set(k,[...(listeners.get(k)||[]),fn]),
   removeEventListener:(k,fn)=>listeners.set(k,(listeners.get(k)||[]).filter(f=>f!==fn)),
   getContext(){contexts++;throw new Error('Static HUD must not allocate Canvas2D');}};
  nodes.push(el);return el;
 }
 const doc={createElement:node,body:node('body')};
 return {hud:HUD.create({document:doc,root:node('section')}),nodes,get contexts(){return contexts;}};
}
function specimen(){
 const {t}=createGame(),shapes=['cube','pyramid','tetra','coupler'];
 return {id:1,count:shapes.length,name:'Conjunto original',parts:shapes.map((shape,i)=>{
  const profile=t.unitProfile({shape});return {id:i+1,shape,p:[i*.067,i*.023,-i*.037],vertices:profile.vertices,faces:profile.faces};
 })};
}
test('all compound shapes use one static numeric chip without projecting polygons',()=>{
 const original=specimen(),before=original.parts.map(p=>p.id);
 const {hud,nodes,contexts}=recorder();
 for(const mood of ['neutral','excited','restless'])for(const reduced of [false,true]){
  const item={...original,mood,agitation:.9,shaking:mood==='restless'};
  for(let i=0;i<40;i++)hud.update([item],.05,{active:true,reducedMotion:reduced});
 }
 assert.deepEqual(original.parts.map(p=>p.id),before);
 assert.equal(nodes.filter(n=>n.tag==='canvas').length,0);
 assert.equal(contexts,0);
 assert.equal(hud.visibleCount,1);
 assert.equal(nodes.find(n=>n.className==='selection-hud-count').textContent,'×4');
 hud.dispose();
});
test('structural edits update the counter with no animated transition or recreation of geometry',()=>{
 const {hud,nodes,contexts}=recorder(),item=specimen();
 hud.update([item],.05,{active:true});
 item.parts=[...item.parts,{...item.parts[0],id:5,p:[-.24,.11,.15]}];item.count=5;
 hud.update([item],.05,{active:true});
 assert.equal(hud.visibleCount,1);
 assert.equal(hud.focusedId,1);
 assert.equal(nodes.find(n=>n.className==='selection-hud-count').textContent,'×5');
 assert.equal(contexts,0);hud.dispose();
});
