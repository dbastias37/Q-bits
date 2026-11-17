const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function setup(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function inventory(t){return Array.from(t.groups).flatMap(g=>Array.from(g.parts,p=>({id:p.id,weight:p.weight,shape:p.shape,energy:p.mood.energy}))).sort((a,b)=>a.id-b.id);}
function bodyMass(t){return t.world.bodies.filter(b=>b.qubitGroup).reduce((n,b)=>n+b.mass,0);}
function groupsOf(t,c){return t.rotorConnectedGroups([t.rotorPart(c.baseId).g]);}
function spawn(t,kind='straight',supports=true,p=t.V()){assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate(kind,supports),p));return t.conveyors.at(-1);}
function assertVirtual(t,c){const base=t.rotorPart(c.baseId).g,rollers=[...new Set(t.conveyorRotors(c).flatMap(r=>t.rotorGroups(r)).filter(g=>g!==base))];assert(c.virtual,'complete standard conveyor uses virtual rollers');assert.equal(rollers.length,3);for(const g of rollers){assert(g.virtualConveyor);assert(!t.world.bodies.includes(g.body),'no independent roller body participates in physics');}for(const r of t.conveyorRotors(c)){assert(r.virtualConveyor);assert.equal(r.constraint,null,'no independent hinge is solved');}assert(t.world.bodies.includes(base.body));return rollers;}
function battery(t,c){const base=t.rotorPart(c.baseId),p=base.p.clone();p.y+=.09;const g=t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:1,p,q:base.q.clone()}]),cell=g.parts[0];cell.mood.energy=.8;cell.mood.externalBattery={version:1,ownerId:cell.id,packId:cell.id,enabled:true};assert(t.weld({source:g,target:base.g,position:g.body.position.clone(),quaternion:g.body.quaternion.clone()}));return t.rotorPart(cell.id).part;}

test('virtual straight and corner modules preserve matter and simulated mass through current/legacy lab saves',()=>{
 for(const kind of ['straight','left','right']){const {t}=setup(),c=spawn(t,kind),before=inventory(t),mass=before.reduce((n,p)=>n+p.weight*.25,0);assertVirtual(t,c);assert(Math.abs(bodyMass(t)-mass)<1e-9);
  const saved=t.saveLab();assert(!JSON.stringify(saved.conveyors).includes('virtual'),'virtual runtime ownership is rebuilt rather than persisted');if(kind!=='straight')for(const module of saved.conveyors)delete module.moduleParts;
  t.clearNarrativeScene();assert.equal(t.groups.length,0);assert.equal(t.world.bodies.filter(b=>b.qubitGroup).length,0,'clearing does not resurrect phantom rollers');t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);assert.deepEqual(inventory(t),before);assert.equal(t.conveyors.length,1);assertVirtual(t,t.conveyors[0]);assert.equal(t.conveyors[0].moduleParts.length,before.length);assert(Math.abs(bodyMass(t)-mass)<1e-9);
 }
});

test('shelf storage recovers every original virtual part with energy, membership and one simulated chassis',()=>{
 const {t}=setup(),c=spawn(t,'left'),before=inventory(t),mass=bodyMass(t),component=groupsOf(t,c);assertVirtual(t,c);const shelf=t.createShelf({p:t.V(0,.4,-13.996),q:t.Q(),wall:'north'});assert(shelf);t.setSelected(t.rotorPart(c.baseId));t.setMultiSelection(component);assert(t.storeShelfSelection(shelf));assert.equal(t.groups.length,0);assert.equal(t.world.bodies.filter(b=>b.qubitGroup).length,0);assert(t.withdrawShelf(shelf));assert.deepEqual(inventory(t),before);assertVirtual(t,t.conveyors[0]);assert(Math.abs(bodyMass(t)-mass)<1e-9);
});

test('virtual animated operation exports a valid complete blueprint and lab recovery stays stopped',()=>{
 const {t}=setup(),c=spawn(t,'straight',false),cell=battery(t,c);assert(t.startConveyor(c),c.status);for(let i=0;i<80;i++)t.stepPhysics(1/240);assert(c.running);assertVirtual(t,c);const before=inventory(t),record=t.mechanismSnapshot(t.rotorPart(c.baseId).g);assert(record&&t.savedMechanismValid(record));assert.equal(record.groups.flatMap(g=>g.parts).length,before.length);assert(t.spawnSavedMechanism(record,t.V(3,0,0)));assertVirtual(t,t.conveyors.at(-1));assert.equal(t.conveyors.at(-1).running,false);assert(cell.mood.energy<.8);
 const saved=t.saveLab(),matter=inventory(t);t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);assert.deepEqual(inventory(t),matter);assert(t.conveyors.every(c=>!c.running));for(const restored of t.conveyors)assertVirtual(t,restored);
});

test('breaking a virtual roller recovers its original physical parts once and removes the incomplete belt',()=>{
 const {t}=setup(),c=spawn(t,'straight',false),rollers=assertVirtual(t,c),part=rollers[0].parts.find(p=>p.shape==='cube'),before=inventory(t),mass=bodyMass(t);t.detachPart({g:rollers[0],part});assert.deepEqual(inventory(t),before);assert.equal(t.conveyors.length,0);assert(t.groups.every(g=>!g.virtualConveyor));assert(t.groups.every(g=>t.world.bodies.includes(g.body)));assert(Math.abs(bodyMass(t)-mass)<1e-9);assert.equal(new Set(t.groups.flatMap(g=>g.parts.map(p=>p.id))).size,before.length);
});

test('removing optional support material keeps the remaining virtual conveyor complete',()=>{
 const {t}=setup(),c=spawn(t),before=inventory(t),legId=c.moduleParts.find(id=>!c.required.includes(id)),leg=t.rotorPart(legId);assert(leg);assertVirtual(t,c);t.detachPart(leg);assert.deepEqual(inventory(t),before);assert(t.conveyors.includes(c));assertVirtual(t,c);const data=t.serializeConveyors()[0];assert(!data.moduleParts.includes(legId),'detached optional leg is not silently reclaimed');assert.equal(data.moduleParts.length,before.length-2,'removing upper support recovers its lower disconnected companion too');
});

test('staged disassembly materializes a virtual module into the same individual pieces without duplicate bodies',()=>{
 const {t,sandbox}=setup(),c=spawn(t,'right'),before=inventory(t),mass=bodyMass(t);let clock=0;sandbox.performance={now:()=>clock+=.001};assertVirtual(t,c);assert(t.beginStagedDisassembly(groupsOf(t,c)));assert.equal(t.conveyors.length,0);assert.equal(t.rotors.length,0);assert.equal(t.world.bodies.filter(b=>b.qubitGroup).length,0);assert.equal(t.pendingDisassemblyCount(),before.length);
 for(let i=0;i<2000&&t.pendingDisassemblyCount();i++)t.updateDisassembly(1/60);assert.equal(t.pendingDisassemblyCount(),0);assert.deepEqual(inventory(t),before);assert.equal(t.groups.length,before.length);assert(t.groups.every(g=>!g.virtualConveyor&&g.parts.length===1&&t.world.bodies.includes(g.body)));assert(Math.abs(bodyMass(t)-mass)<1e-9);
});
