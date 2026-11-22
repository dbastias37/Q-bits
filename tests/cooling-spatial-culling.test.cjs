// Real cooling rules and geometry; the GPU/DOM are stubs. Work assertions use
// exact function counts, never machine-dependent elapsed-time thresholds.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),createGame=require('./game-harness.cjs');
const source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8');
const hook=`{let count=0;const original=corners;corners=function(...args){count++;return original(...args);};window.__coolingAudit={reset(){count=0;},get corners(){return count;}};}`;
const at=source.lastIndexOf('})();'),instrumented=source.slice(0,at)+hook+source.slice(at);
function lab(){const game=createGame({gameSource:instrumented,graphics:false}),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return {...game,audit:sandbox.__coolingAudit};}
function parts(t,n,center,shape='cube'){return Array.from({length:n},(_,i)=>({id:t.allocateUnitId(),weight:1,shape,p:center.vadd(t.V((i-(n-1)/2)*.09,0,0)),q:t.Q()}));}
function placeOnFloor(t,g,y=.003){g.body.position.y+=y-t.bounds(g).min.y;g.body.aabbNeedsUpdate=true;}
function exactEligible(t,g,c){const vertices=t.poses(g).flatMap(t.corners),low=Math.min(...vertices.map(p=>p.y));return low>=-.005&&low<.05&&vertices.every(p=>Math.hypot(p.x-c.p.x,p.z-c.p.z)<.315);}

test('eight coolers reject 1000 distant pieces before transforming their detailed vertices',()=>{
 const {t,audit}=lab(),coolers=[];
 for(let i=0;i<8;i++){const cooler=t.createCooler(t.V(-7+i%4*1.2,0,-2+Math.floor(i/4)*1.2));assert(cooler);coolers.push(cooler);}
 for(let i=0;i<100;i++)t.makeGroup(parts(t,10,t.V(4+i%5*1.5,.045,Math.floor(i/5)*.4-4)));
 for(const g of t.groups)t.bounds(g);audit.reset();t.updateCooling(1/120);
 assert.equal(audit.corners,0,'far material never reaches the detailed radial test');
 assert(coolers.every(c=>c.occupants===0&&c.entries.size===0));assert(t.groups.every(g=>g.cooler===null));
});

test('cooling retains exact cube and convex geometry at the circular boundary under rotation and translation',()=>{
 const {t}=lab(),c=t.createCooler(t.V(-2,0,1));assert(c);c.capacity=2000;c.coolSeconds=100;
 const objects=['cube','tetra','pyramid','coupler'].map((shape,i)=>t.makeGroup(parts(t,i===0?2:1,t.V(c.p.x,.15,c.p.z),shape)));
 let accepted=0,rejected=0;
 for(let step=0;step<36;step++){
  for(let i=0;i<objects.length;i++){const g=objects[i],radius=[0,.12,.26,.314,.316,.5][step%6];g.body.position.x=c.p.x+radius*Math.cos(i+step*.27);g.body.position.z=c.p.z+radius*Math.sin(i+step*.27);g.body.quaternion.setFromEuler(step*.07,i*.5+step*.11,step*.03);placeOnFloor(t,g,step%7===0?.06:.003);}
  const expected=objects.map(g=>exactEligible(t,g,c));t.updateCooling(1/120);
  assert.equal(c.occupants,objects.reduce((n,g,i)=>n+(expected[i]?g.parts.length:0),0),'occupants at '+step);
  objects.forEach((g,i)=>{assert.equal(g.cooler===c,expected[i],'membership at '+step+'/'+i);if(expected[i])accepted++;else rejected++;});
 }
 assert(accepted>0&&rejected>0,'exercise both sides of the exact boundary');
});

test('a virtual conveyor roller keeps the native cooling path when its chassis moved before pose synchronization',()=>{
 const {t}=lab(),c=t.createCooler(t.V());assert(c);c.capacity=2000;
 assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight',false),t.V(4,0,0)));
 const roller=t.groups.find(g=>g.virtualConveyor);assert(roller);const base=roller.virtualConveyor.baseGroup;
 base.body.position.y-=t.bounds(roller).min.y-.003;t.poses(roller);
 const oldX=roller.body.position.x;assert(oldX>3);assert(t.bounds(roller).min.y>=-.005&&t.bounds(roller).min.y<.05);
 base.body.position.x-=oldX; // Native poses() synchronizes this logical body later.
 for(const p of roller.parts)p.mood.energy=.2;
 t.updateCooling(1/120);
 assert(Math.abs(roller.body.position.x)<1e-8,'logical roller followed its chassis');
 assert.equal(roller.cooler,c);assert(roller.parts.every(p=>c.entries.has(p.id)));
});

test('cooler capacity still prefers existing occupants when another eligible group returns',()=>{
 const {t}=lab(),c=t.createCooler(t.V());assert(c);c.capacity=1;c.coolSeconds=10;
 const first=t.addQubit([-.1,.048,0]),second=t.addQubit([.1,.048,0]);t.updateCooling(.1);
 assert.equal(first.cooler,c);assert.equal(second.cooler,null);
 first.body.position.x=2;t.updateCooling(.1);assert.equal(second.cooler,c);assert.equal(first.cooler,null);
 first.body.position.x=-.1;t.updateCooling(.1);assert.equal(second.cooler,c);assert.equal(first.cooler,null);assert.equal(c.occupants,1);
 assert(Math.abs(c.entries.get(second.parts[0].id).elapsed-.2)<1e-12);
});

test('spatial rejection preserves cooling completion, inactive occupancy and exclusion of held or working groups',()=>{
 const {t}=lab(),c=t.createCooler(t.V());assert(c);c.coolSeconds=1;
 const g=t.addQubit([0,.048,0]),m=g.parts[0].mood;m.energy=.1;m.state='restless';m.agitation=.8;
 t.updateCooling(.25);const e=c.entries.get(g.parts[0].id);assert(e);assert.equal(e.elapsed,.25);
 t.updateCooling(e.duration);assert.equal(m.energy,t.alphaSettings.exitEnergy);assert.equal(m.state,'neutral');assert.equal(m.agitation,0);assert.equal(e.done,true);
 c.enabled=false;m.energy=.2;t.updateCooling(2);assert.equal(c.occupants,1);assert.equal(g.cooler,null);assert.equal(m.energy,.2);assert.equal(c.entries.size,0);
 c.enabled=true;for(const key of ['route','haulJob','blueprintJob']){g[key]={};t.updateCooling(.1);assert.equal(c.occupants,0,key);assert.equal(g.cooler,null,key);g[key]=null;}
 t.setHeld({g,items:[{g}]});t.updateCooling(.1);assert.equal(c.occupants,0);assert.equal(g.cooler,null);t.setHeld(null);
 g.body.position.y=.3;t.updateCooling(.1);assert.equal(c.occupants,0);g.body.position.y=.048;t.updateCooling(.1);assert.equal(c.occupants,1);
});
