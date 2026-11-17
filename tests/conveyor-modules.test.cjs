const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function setup(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function inventory(t){return Array.from(t.groups).flatMap(g=>Array.from(g.parts,p=>({id:p.id,weight:p.weight,shape:p.shape,energy:p.mood.energy}))).sort((a,b)=>a.id-b.id);}
function build(t,kind='straight',previous=null,supports=false){
 const recipe=t.conveyorBlueprintTemplate(kind,supports),placement=previous?t.conveyorBlueprintPlacement(recipe,previous):{point:t.V(),height:0,quarterTurns:0};assert(placement);
 const bp=t.placeBlueprint(t.mechanismBlueprintShape(recipe),placement.point,placement);assert(bp);if(previous)bp.conveyorLink=previous.baseId;
 for(const [index,target]of t.blueprintTargets(bp).entries()){const g=t.makeGroup([{id:t.allocateUnitId(),shape:target.shape,weight:1,p:target.p.clone(),q:target.q.clone()}]);g.parts[0].mood.energy=.25+(index%20)*.01;const slot={g,bp,index,state:'placed'};g.blueprintJob=slot;bp.slots.push(slot);}
 bp.active=true;t.updateBlueprints(0);assert(!t.blueprints.includes(bp));return t.conveyors.at(-1);
}
function battery(t,c){const base=t.rotorPart(c.baseId),p=base.p.clone();p.y+=.09;const g=t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:1,p,q:base.q.clone()}]),cell=g.parts[0];cell.mood.energy=.8;cell.mood.externalBattery={version:1,ownerId:cell.id,packId:cell.id,enabled:true};assert(t.weld({source:g,target:base.g,position:g.body.position.clone(),quaternion:g.body.quaternion.clone()}));return t.rotorPart(cell.id).part;}
function tick(t,n){for(let i=0;i<n;i++)t.stepPhysics(1/240);}
function hit(t,id){const part=t.rotorPart(id);return {...part,point:part.p.clone(),distance:.6};}

test('clicking any body of a powered joined line selects it without stopping or adding hand constraints',()=>{
 const {t,sandbox}=setup(),first=build(t),last=build(t,'straight',first),cell=battery(t,first);assert(t.startConveyor(first));assert(t.startConveyor(last));tick(t,12);
 const constraints=t.world.constraints.length,bodies=t.world.bodies.length,before=cell.mood.energy,component=t.rotorConnectedGroups([t.rotorPart(first.baseId).g]);
 for(const g of component){t.grabQubit(hit(t,g.parts[0].id));assert.equal(t.getHeld(),null);assert.equal(t.getSelected().g.body.id,(g.virtualConveyor?t.rotorPart(g.virtualConveyor.conveyor.baseId).g:g).body.id);assert.match(sandbox.document.querySelector('#notice').textContent,/primero apaga o desconecta/);}
 assert.equal(t.world.constraints.length,constraints);assert.equal(t.world.bodies.length,bodies);tick(t,24);assert(first.running&&last.running);assert(cell.mood.energy<before);
 t.stopConveyor(first);t.grabQubit(hit(t,first.baseId));assert.equal(t.getHeld(),null,'a running neighbour protects the shared chassis');assert(last.running);
 t.stopConveyor(last);t.grabQubit(hit(t,first.baseId));assert(t.getHeld(),'the complete line is movable after explicit shutdown');t.releaseQubit();
});

test('joining and separating a powered line are refused atomically and do not interrupt production',()=>{
 const {t}=setup(),first=build(t),last=build(t,'straight',first),cell=battery(t,first);assert(t.startConveyor(last));const target=t.rotorPart(first.baseId),loose=t.addQubit([3,.05,0]),before=inventory(t),constraints=t.world.constraints.length,energy=cell.mood.energy;
 assert.equal(t.weld({source:loose,target:target.g,position:loose.body.position.clone(),quaternion:loose.body.quaternion.clone()}),null);
 assert.equal(t.detachConveyorModule(first),false);t.detachPart(hit(t,first.baseId));assert.deepEqual(inventory(t),before);assert.equal(t.world.constraints.length,constraints);assert(last.running);tick(t,12);assert(cell.mood.energy<energy);
});

test('extracting a middle corner keeps complete modules, original identities, stored energy and all nine motors',()=>{
 for(const kind of ['left','right']){const {t}=setup(),first=build(t),middle=build(t,kind,first),last=build(t,'straight',middle);battery(t,first);const before=inventory(t),rotors=Array.from(t.rotors,r=>[r.aId,r.bId]),positions=new Map(t.groups.flatMap(g=>t.poses(g)).map(p=>[p.part.id,p.p.clone()]));
 assert(t.detachConveyorModule(middle));assert.deepEqual(inventory(t),before);assert.deepEqual(Array.from(t.rotors,r=>[r.aId,r.bId]),rotors);assert.equal(t.conveyors.length,3);
 const owned=new Set(middle.required),component=t.rotorConnectedGroups([t.rotorPart(middle.baseId).g]),ids=component.flatMap(g=>g.parts.map(p=>p.id));assert.equal(ids.length,owned.size);assert(ids.every(id=>owned.has(id)));
 assert.notEqual(t.rotorPart(first.baseId).g,t.rotorPart(last.baseId).g,'removing the middle section splits the two remaining islands');
 for(const c of [first,middle,last]){assert.equal(t.conveyorRotors(c).length,3);assert(t.conveyorEnsureSurfaces(c));assert.equal(c.running,false);}
 for(const g of t.groups)for(const p of t.poses(g))assert(p.p.distanceTo(positions.get(p.part.id))<1e-7,'splitting does not teleport any material');
 assert.equal(t.detachConveyorModule(middle),false,'already isolated module cannot duplicate material');assert.deepEqual(inventory(t),before);
 const saved=t.saveLab();t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);assert.deepEqual(inventory(t),before);assert.equal(t.conveyors.length,3);assert.equal(t.rotors.length,9);assert.equal(t.rotorConnectedGroups([t.rotorPart(middle.baseId).g]).flatMap(g=>g.parts).length,owned.size);
 }
});

test('selection preserves the motor controller until the actual external battery is exhausted',()=>{
 const {t}=setup(),c=build(t),cell=battery(t,c);cell.mood.energy=.0003;assert(t.startConveyor(c));t.grabQubit(hit(t,c.baseId));let steps=0;while(c.running&&steps++<2400)t.stepPhysics(1/240);assert(steps<2400,'finite energy stops the production controller');assert.equal(t.getHeld(),null);assert(cell.mood.energy<.00001);assert.match(c.status,/energía|Motor detenido/);assert(t.conveyorRotors(c).every(r=>!r.enabled));
});

test('context-menu selection keeps production alive and exposes whole-module extraction',()=>{
 const {t,sandbox}=setup(),first=build(t),last=build(t,'straight',first),cell=battery(t,first);assert(t.startConveyor(last));const surface=t.conveyorSurfacePoses(last)[0];t.setLook({camera:[surface.p.x,surface.p.y+.6,surface.p.z],yaw:0,pitch:-Math.PI/2});
 t.handleSecondary({clientX:640,clientY:360});const menu=t.getCommandState();assert.match(menu.title,/Cinta Q-bits/);assert(menu.items.some(i=>i.label==='Separar módulo completo'));const energy=cell.mood.energy;tick(t,16);assert(last.running);assert(cell.mood.energy<energy);const before=inventory(t);menu.items.find(i=>i.label==='Separar módulo completo').run();assert(last.running);assert.deepEqual(inventory(t),before);assert.match(sandbox.document.querySelector('#notice').textContent,/primero apaga o desconecta/);
});

test('Alt separation selects a whole module and leaves unrelated modules assembled',()=>{
 const {t,sandbox}=setup(),first=build(t),last=build(t,'straight',first),surface=t.conveyorSurfacePoses(last)[0],before=inventory(t);t.setLook({camera:[surface.p.x,surface.p.y+.6,surface.p.z],yaw:0,pitch:-Math.PI/2});t.handleSecondary({clientX:640,clientY:360,altKey:true});assert.equal(sandbox.document.querySelector('#detach-one').textContent,'Separar módulo completo');sandbox.document.querySelector('#detach-one').dispatchEvent({type:'click'});assert.deepEqual(inventory(t),before);assert.notEqual(t.rotorPart(first.baseId).g,t.rotorPart(last.baseId).g);assert.equal(t.rotors.length,6);assert.equal(t.conveyors.length,2);
});

test('complete module membership includes optional feet through blueprints, snapshots, shelves and legacy saves',()=>{
 for(const kind of ['straight','left','right']){const {t}=setup(),first=build(t,'straight',null,true),next=build(t,kind,first,true),expected=kind==='straight'?34:45,before=inventory(t);assert.equal(next.moduleParts.length,expected);const feet=Array.from(next.moduleParts).filter(id=>!next.required.includes(id));assert.equal(feet.length,4);
  const record=t.mechanismSnapshot(t.rotorPart(first.baseId).g);assert(t.savedMechanismValid(record));assert.equal(record.conveyors[1].moduleParts.length,expected);const bad=JSON.parse(JSON.stringify(record));bad.conveyors[1].moduleParts.push(999999);assert.equal(t.savedMechanismValid(bad),false);
  // New saves retain explicit ownership; old joined scenes recover only exact
  // support positions instead of claiming the whole shared frame.
  const saved=t.saveLab();if(kind!=='straight')for(const c of saved.conveyors)delete c.moduleParts;
  t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);const restored=t.conveyors.find(c=>c.baseId===next.baseId);assert.equal(restored.moduleParts.length,expected);assert(t.detachConveyorModule(restored));assert.deepEqual(inventory(t),before);const component=t.rotorConnectedGroups([t.rotorPart(restored.baseId).g]);assert.equal(component.flatMap(g=>g.parts).length,expected);assert(feet.every(id=>component.includes(t.rotorPart(id).g)),'all four original feet travel with the module');
  const shelf=t.createShelf({p:t.V(0,.4,-13.996),q:t.Q(),wall:'north'});t.setSelected(hit(t,restored.baseId));t.setMultiSelection(component);assert(t.storeShelfSelection(shelf));assert(t.withdrawShelf(shelf));const recovered=t.conveyors.find(c=>c.baseId===restored.baseId);assert(recovered);assert.equal(recovered.moduleParts.length,expected);assert.deepEqual(inventory(t),before);
 }
});

test('virtual complete roller cartridges retain logical identities while sharing one real hand driver',()=>{
 const {t}=setup(),first=build(t),last=build(t,'straight',first);t.updateConveyors(0);const base=t.rotorPart(first.baseId),before=inventory(t),bodies=t.world.bodies.length,constraints=t.world.constraints.length;assert(first.virtual&&last.virtual);
 t.grabQubit(hit(t,first.baseId));let held=t.getHeld();assert(held);assert.equal(held.items.length,7);assert.equal(held.items.filter(i=>i.anchorBody).length,1);assert.equal(held.items.filter(i=>i.passiveGrip).length,6);assert.equal(t.world.bodies.length,bodies+1);assert.equal(t.world.constraints.length,constraints+1);assert.equal(held.items.reduce((sum,i)=>sum+i.gripMass,0),held.weight*.25);assert.deepEqual(inventory(t),before);
 t.handleKey({code:'ShiftLeft',preventDefault(){}});assert(held.items.every(i=>Number.isFinite(i.relative.x)));t.keys.delete('ShiftLeft');t.releaseQubit();assert.equal(t.world.bodies.length,bodies);assert.equal(t.world.constraints.length,constraints);assert.deepEqual(inventory(t),before);
 const roller=t.conveyorRotors(last)[1].bId;t.grabQubit(hit(t,roller));held=t.getHeld();assert.equal(held.g.body.id,t.rotorPart(last.baseId).g.body.id);assert(held.anchorBody);assert.equal(held.items.filter(i=>i.anchorBody).length,1,'picking a virtual roller manipulates the complete chassis');assert.equal(held.items.filter(i=>i.passiveGrip).length,6);assert.equal(held.items.reduce((sum,i)=>sum+i.gripMass,0),held.weight*.25);t.releaseQubit();assert.deepEqual(inventory(t),before);
});


test('optional feet select the owning later module in the conveyor configuration panel',()=>{
 const {t}=setup(),first=build(t,'straight',null,true),last=build(t,'left',first,true);assert.equal(t.rotorPart(first.baseId).g.body.id,t.rotorPart(last.baseId).g.body.id);assert(t.configureConveyor(last,{direction:-1}));const foot=last.moduleParts.find(id=>!last.required.includes(id));assert(foot);t.setSelected(hit(t,foot));const snapshot=t.conveyorPanelSnapshot();assert.equal(snapshot.conveyor.id,last.id);assert.equal(snapshot.conveyor.direction,-1);assert(t.conveyorPanelAction('direction',{direction:1}).ok);assert.equal(last.direction,1);assert.equal(first.direction,1);
});
