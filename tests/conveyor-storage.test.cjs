const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});sandbox.document.body.dataset.booting='false';return game;}
function choose(t,groups){t.clearRotorSelection();t.setMultiSelection(groups);t.setSelected(groups.length?{g:groups[0],part:groups[0].parts[0]}:null);}
function moduleAt(t,x=0){const rotor=t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight',false),t.V(x,.3,0));assert(rotor);const controller=t.conveyors[t.conveyors.length-1];assert(controller);assert(t.configureConveyor(controller,{direction:-1,capacity:7}));return {rotor,controller,groups:t.rotorConnectedGroups(t.rotorGroups(rotor))};}
function inventory(t){return t.groups.flatMap(g=>g.parts).map(p=>({id:p.id,shape:p.shape,weight:p.weight,joules:p.mood.energy*t.gameBatteryCapacity(p)})).sort((a,b)=>a.id-b.id);}
function supply(t,bp,index){const target=t.blueprintTargets(bp)[index],g=t.makeGroup([{id:t.allocateUnitId(),shape:target.shape,weight:1,p:target.p.clone(),q:target.q.clone()}]);g.parts[0].mood.energy=.31+index*.001;const slot={g,bp,index,state:'placed'};g.blueprintJob=slot;bp.slots.push(slot);return g;}

test('conveyor save, export and duplication remap controller references and preserve reverse drive exactly once',()=>{
 const {t}=lab(),m=moduleAt(t),saved=t.mechanismSnapshot(m.rotor,'Cinta de ensayo');assert(saved);assert(t.savedMechanismValid(saved));assert.equal(saved.conveyors.length,1);assert.equal(saved.conveyors[0].direction,-1);assert.deepEqual(plain(saved.conveyors[0].drives),[1,1,1]);
 assert.equal(t.importMechanismsData({version:1,mechanisms:[saved]}),1);const exported=t.mechanismsExportData();assert.deepEqual(plain(exported.mechanisms[0].conveyors),plain(saved.conveyors));
 assert(t.spawnSavedMechanism(exported.mechanisms[0],t.V(2,0,2)));assert.equal(t.conveyors.length,2);const clone=t.conveyors[1];assert.notEqual(clone.baseId,m.controller.baseId);assert.equal(clone.direction,-1);assert.equal(clone.joints[0].forward,1);assert.equal(clone.running,false);assert(t.conveyorRotors(clone).every(r=>!r.enabled));
 const origin=m.controller.ports.entry.p[0];clone.ports.entry.p[0]=9;assert.equal(m.controller.ports.entry.p[0],origin);assert.equal(saved.conveyors[0].ports.entry.p[0],origin);
});

test('malformed conveyor metadata is rejected atomically, including ownership conflicts with arms',()=>{
 const {t}=lab(),m=moduleAt(t),saved=t.mechanismSnapshot(m.rotor);t.importMechanismsData({version:1,mechanisms:[saved]});
 for(const mutate of [r=>r.conveyors[0].base=255,r=>r.conveyors[0].joints=[0,0],r=>r.conveyors[0].joints=[999],r=>r.conveyors[0].direction=0,r=>r.conveyors[0].capacity=Infinity,r=>r.conveyors[0].required=[],r=>r.conveyors[0].required=[r.conveyors[0].base,r.conveyors[0].base],r=>r.conveyors[0].required=r.conveyors[0].required.filter(key=>key!==r.groups[1].parts.find(p=>p.shape==='cube').key),r=>r.conveyors[0].drives=[0],r=>r.conveyors[0].ports.exit.direction=[0,0,0],r=>r.conveyors[0].ports.entry.p=[20,0,0],r=>r.conveyors.push(plain(r.conveyors[0]))]){const invalid=plain(saved);mutate(invalid);assert.equal(t.savedMechanismValid(invalid),false);assert.throws(()=>t.importMechanismsData({version:1,mechanisms:[invalid]}));assert.equal(t.savedMechanisms.length,1);}
 const arm=t.robotArmBlueprintTemplate();arm.conveyors=[{version:1,base:arm.robotArm.base,joints:[0],kind:'straight',direction:1,capacity:8}];assert.equal(t.savedMechanismValid(arm),false);
});

test('conveyor blueprint enables its controller only after completion and preserves supplied matter and energy',()=>{
 const {t}=lab(),m=moduleAt(t),record=t.mechanismSnapshot(m.rotor);t.clearNarrativeScene();t.story.scene='lab';const bp=t.placeMechanismBlueprint(record,t.V());assert(bp);const count=record.groups.flatMap(g=>g.parts).length;for(let i=0;i<count-1;i++)supply(t,bp,i);const first=inventory(t);bp.active=true;t.updateBlueprints(0);assert.equal(t.conveyors.length,0);assert.equal(t.rotors.length,0);assert.deepEqual(inventory(t),first);
 supply(t,bp,count-1);const all=inventory(t);t.updateBlueprints(0);assert.equal(t.blueprints.length,0);assert.equal(t.conveyors.length,1);assert.equal(t.conveyors[0].running,false);assert(t.rotors.every(r=>!r.enabled));assert.deepEqual(inventory(t),all);
});

test('shelf roundtrip keeps conveyor identity, charge, ports and configuration while restoring stopped',()=>{
 const {t}=lab(),m=moduleAt(t),s=t.createShelf({p:t.V(0,.4,-13.996),q:t.Q(),wall:'north'});assert(s);t.rotorPart(m.controller.baseId).part.mood.energy=.237;const before=plain(t.serializeConveyors()),matter=inventory(t);choose(t,m.groups);assert(t.storeShelfSelection(s));assert.equal(t.conveyors.length,0);assert.equal(t.groups.length,0);assert.match(s.cells[0].category.label,/Línea de 1 cinta/);assert.deepEqual(plain(s.cells[0].items[0].conveyors),before);assert.equal('running' in s.cells[0].items[0].conveyors[0],false);
 assert(t.withdrawShelf(s));assert.equal(t.conveyors.length,1);assert.deepEqual(plain(t.serializeConveyors()),before);assert.deepEqual(inventory(t),matter);assert.equal(t.conveyors[0].running,false);assert(t.rotors.every(r=>!r.enabled));
});

test('shelf rejects running conveyors and damaged stored references before removing material',()=>{
 const {t,sandbox}=lab(),m=moduleAt(t),s=t.createShelf({p:t.V(0,.4,-13.996),q:t.Q(),wall:'north'});choose(t,m.groups);m.controller.running=true;assert.equal(t.storeShelfSelection(s),false);assert.match(t.shelfSelectionPlan(s).error,/Detén las cintas/);t.stopConveyor(m.controller);assert(t.storeShelfSelection(s));const original=plain(s.cells[0].items[0]);
 for(const mutate of [item=>item.conveyors[0].baseId=999999,item=>item.conveyors[0].joints[0].aId=999999,item=>item.conveyors[0].joints[0].forward=0,item=>item.conveyors[0].required=[],item=>item.conveyors[0].required=item.conveyors[0].required.filter(id=>id!==item.groups[1].parts.find(p=>p.shape==='cube').id),item=>item.conveyors[0].ports.exit.p=[20,0,0],item=>item.conveyors.push(plain(item.conveyors[0]))]){const invalid=plain(original);mutate(invalid);s.cells[0].items[0]=invalid;assert.equal(sandbox.QBitsOrganizers.validItem(invalid),false);assert.equal(t.withdrawShelf(s),false);assert.equal(t.groups.length,0);}
 s.cells[0].items[0]=original;assert(t.withdrawShelf(s));
});

test('laboratory snapshot restores conveyor settings and IDs without resuming its motors',()=>{
 const {t}=lab(),m=moduleAt(t);t.rotorPart(m.controller.baseId).part.mood.energy=.42;const before=plain(t.serializeConveyors()),matter=inventory(t),saved=t.saveLab();t.clearNarrativeScene();assert.equal(t.conveyors.length,0);t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);assert.deepEqual(plain(t.serializeConveyors()),before);assert.deepEqual(inventory(t),matter);assert.equal(t.conveyors[0].running,false);assert(t.rotors.every(r=>!r.enabled));
});

test('a shared rigid chassis saves every conveyor controller with independent reverse directions',()=>{
 const {t}=lab(),a=moduleAt(t,0),b=moduleAt(t,.54),baseA=t.rotorPart(a.controller.baseId),baseB=t.rotorPart(b.controller.baseId),parts=[...t.worldParts(baseA.g),...t.worldParts(baseB.g)];
 t.removeGroup(baseA.g);t.removeGroup(baseB.g);const chassis=t.makeGroup(parts);t.refreshRotors();t.configureConveyor(b.controller,{direction:1});const record=t.mechanismSnapshot(chassis,'Dos cintas');assert(record);assert.equal(record.conveyors.length,2);assert.deepEqual(plain(record.conveyors.map(c=>c.direction)),[-1,1]);const originalIds=new Set(t.conveyors.map(c=>c.baseId));assert(t.spawnSavedMechanism(record,t.V(2,0,2)));assert.equal(t.conveyors.length,4);assert(t.conveyors.slice(2).every(c=>!originalIds.has(c.baseId)));assert.deepEqual(plain(t.conveyors.slice(2).map(c=>c.direction)),[-1,1]);
});

test('the real straight conveyor blueprint consumes every supplied part and conserves exact energy',()=>{
 const {t}=lab(),record=t.conveyorBlueprintTemplate('straight',false);assert(record);assert(t.savedMechanismValid(record));const count=record.groups.reduce((n,g)=>n+g.parts.length,0),bp=t.placeMechanismBlueprint(record,t.V());assert(bp);for(let i=0;i<count-1;i++)supply(t,bp,i);const incomplete=inventory(t);bp.active=true;t.updateBlueprints(0);assert.equal(t.conveyors.length,0);assert.equal(t.rotors.length,0);assert.deepEqual(inventory(t),incomplete);supply(t,bp,count-1);const before=inventory(t);t.updateBlueprints(0);assert.equal(t.blueprints.length,0);assert.equal(t.conveyors.length,1);assert.equal(t.rotors.length,record.joints.length);assert.equal(t.groups.length,record.groups.length);assert.deepEqual(inventory(t),before);assert(t.mechanismSnapshot(t.rotors[0]));
});

test('the straight conveyor assembles naturally from real loose floor materials without early machinery',()=>{
 const {t}=lab(),record=t.conveyorBlueprintTemplate('straight',false),bp=t.placeMechanismBlueprint(record,t.V());assert(bp);const parts=record.groups.flatMap(g=>g.parts);parts.forEach((p,i)=>{const angle=i*2*Math.PI/parts.length;t.addQubit([1.1*Math.cos(angle),t.unitGroundHeight(p.shape)+.003,1.1*Math.sin(angle)],1,p.shape);});const ids=inventory(t).map(p=>p.id);t.activateBlueprint(bp);let ticks=0;while(t.blueprints.includes(bp)&&ticks<240*150){t.runNavigationJobs();t.stepPhysics(1/240);ticks++;if(t.blueprints.includes(bp)){assert.equal(t.conveyors.length,0);assert.equal(t.rotors.length,0);}}
 assert(!t.blueprints.includes(bp),bp.status);assert.equal(t.conveyors.length,1);assert.equal(t.groups.length,record.groups.length);assert.deepEqual(inventory(t).map(p=>p.id),ids);assert(t.conveyorRotors(t.conveyors[0]).every(r=>!r.enabled));assert(ticks>240*20);assert(ticks<240*150);
});

test('both corner blueprints conserve real matter, mirror drives and survive export without extra material',()=>{
 for(const kind of ['left','right']){const {t}=lab(),record=t.conveyorBlueprintTemplate(kind,true);assert(record);const count=record.groups.flatMap(g=>g.parts).length,bp=t.placeMechanismBlueprint(record,t.V());assert(bp);for(let i=0;i<count;i++)supply(t,bp,i);const before=inventory(t),mass=t.groups.reduce((n,g)=>n+g.body.mass,0);bp.active=true;t.updateBlueprints(0);assert.equal(t.conveyors.length,1);assert.equal(t.groups.length,4);assert.equal(t.groups.reduce((n,g)=>n+g.body.mass,0),mass);assert.deepEqual(inventory(t),before);const stored=t.mechanismSnapshot(t.rotors[0]);assert(stored);assert.equal(stored.conveyors[0].kind,kind);assert.deepEqual(plain(stored.conveyors[0].drives),plain(record.conveyors[0].drives));assert.equal(stored.groups.flatMap(g=>g.parts).length,count);}
});

test('imports and shelf withdrawals reject valid-looking ports that would create a remote free platform',()=>{
 const {t}=lab(),m=moduleAt(t),record=t.mechanismSnapshot(m.rotor),invalid=plain(record);for(const p of Object.values(invalid.conveyors[0].ports))p.p[0]+=1;assert.equal(t.savedMechanismValid(invalid),false);const count=t.groups.length;assert.equal(t.spawnSavedMechanism(invalid,t.V(2,0,2)),null);assert.equal(t.groups.length,count);
 const s=t.createShelf({p:t.V(0,.4,-13.996),q:t.Q(),wall:'north'});choose(t,m.groups);assert(t.storeShelfSelection(s));const stored=s.cells[0].items[0];for(const p of Object.values(stored.conveyors[0].ports))p.p[0]+=1;const corrupt=plain(stored),bodies=t.world.bodies.length;assert.equal(t.withdrawShelf(s),false);assert.equal(t.world.bodies.length,bodies);assert.equal(t.groups.length,0);assert.deepEqual(plain(s.cells[0].items[0]),corrupt);
});

test('a corner assembles naturally from loose pieces before its final belt becomes available',()=>{
 const {t}=lab(),record=t.conveyorBlueprintTemplate('right',false),bp=t.placeMechanismBlueprint(record,t.V());assert(bp);const parts=record.groups.flatMap(g=>g.parts);parts.forEach((p,i)=>{const angle=i*2*Math.PI/parts.length;t.addQubit([1.25*Math.cos(angle),t.unitGroundHeight(p.shape)+.003,1.25*Math.sin(angle)],1,p.shape);});const ids=inventory(t).map(p=>p.id);t.activateBlueprint(bp);let ticks=0;while(t.blueprints.includes(bp)&&ticks<240*180){t.runNavigationJobs();t.stepPhysics(1/240);ticks++;if(t.blueprints.includes(bp)){assert.equal(t.conveyors.length,0);assert.equal(t.rotors.length,0);}}
 assert(!t.blueprints.includes(bp),bp.status);assert.equal(t.conveyors.length,1);assert.equal(t.conveyors[0].kind,'right');assert.deepEqual(inventory(t).map(p=>p.id),ids);assert(t.conveyorRotors(t.conveyors[0]).every(r=>!r.enabled));assert(ticks<240*180);
});

test('belt collision shapes are removed on shelving, missing joints and clearing, then recreated once on restore',()=>{
 const {t}=lab(),m=moduleAt(t),base=t.rotorPart(m.controller.baseId).g,body=base.body,skin=m.controller.surfaces.map(s=>s.shape),count=base.parts.length;assert.equal(body.shapes.length,count+1);const shelf=t.createShelf({p:t.V(0,.4,-13.996),q:t.Q(),wall:'north'});choose(t,m.groups);assert(t.storeShelfSelection(shelf));assert.equal(t.conveyors.length,0);assert.equal(body.shapes.length,count);assert(skin.every(shape=>shape.body===null));assert(!t.world.bodies.includes(body));assert(t.withdrawShelf(shelf));const restored=t.conveyors[0],nextBase=t.rotorPart(restored.baseId).g;assert.equal(nextBase.body.shapes.length,nextBase.parts.length+1);t.disconnectRotor(t.conveyorRotors(restored)[0]);t.pruneConveyors();assert.equal(t.conveyors.length,0);assert.equal(nextBase.body.shapes.length,nextBase.parts.length);
 const another=moduleAt(t,3),anotherBase=t.rotorPart(another.controller.baseId).g,shapes=another.controller.surfaces.map(s=>s.shape);t.clearNarrativeScene();assert.equal(t.conveyors.length,0);assert.equal(anotherBase.body.shapes.length,anotherBase.parts.length);assert(shapes.every(shape=>shape.body===null));assert.equal(t.world.constraints.length,0);
});

test('removing a required roller cube removes the belt even if its motor coupler remains connected',()=>{
 const {t}=lab(),m=moduleAt(t),base=t.rotorPart(m.controller.baseId).g,r=t.conveyorRotors(m.controller)[0],moving=t.rotorPart(r.bId).g,cube=moving.parts.find(p=>p.shape==='cube'),before=inventory(t);assert(cube);t.detachPart({g:moving,part:cube});t.stepPhysics(1/240);assert.equal(t.conveyors.length,0);assert.equal(base.body.shapes.length,base.parts.length);assert.deepEqual(inventory(t).map(({id,weight,shape})=>({id,weight,shape})),before.map(({id,weight,shape})=>({id,weight,shape})));
});

test('optional pedestal cubes can be recovered without losing the completed conveyor core',()=>{
 const {t}=lab(),record=t.conveyorBlueprintTemplate('straight',true);assert(t.spawnSavedMechanism(record,t.V(0,.5,0)));const c=t.conveyors[0],base=t.rotorPart(c.baseId).g,leg=base.parts.filter(p=>!c.required.includes(p.id)).sort((a,b)=>a.offset.y-b.offset.y)[0];assert(leg);const before=inventory(t).map(({id,weight,shape})=>({id,weight,shape}));t.detachPart({g:base,part:leg});t.stepPhysics(1/240);assert(t.conveyors.includes(c));assert.equal(c.surfaces.length,1);assert(!t.rotorConnectedGroups([t.rotorPart(c.baseId).g]).includes(t.rotorPart(leg.id).g));assert.deepEqual(inventory(t).map(({id,weight,shape})=>({id,weight,shape})),before);assert(t.mechanismSnapshot(t.rotorPart(c.baseId).g));
});

test('snapshot alignment corrects a complete articulated branch without creating false downstream hinge gaps',()=>{
 const {t}=lab();assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V(2,0,2)));const arm=t.robotArms[0],root=t.robotArmRotors(arm)[0],base=t.rotorPart(arm.baseId).g,pivot=t.couplerTip(t.rotorPart(root.aId)).point,turn=t.Q();turn.setFromAxisAngle(t.V(1,0,0),Math.PI/60);
 for(const g of t.rotorConnectedGroups([base]))if(g!==base){const offset=g.body.position.vsub(pivot);g.body.position.copy(pivot.vadd(turn.vmult(offset)));g.body.quaternion.copy(turn.mult(g.body.quaternion));g.body.aabbNeedsUpdate=true;}
 for(const rotor of t.robotArmRotors(arm)){const a=t.couplerTip(t.rotorPart(rotor.aId)),b=t.couplerTip(t.rotorPart(rotor.bId));assert(a.point.distanceTo(b.point)<.005);assert(a.axis.dot(b.axis)<-.995);}
 const positions=plain(t.groups.map(g=>({p:g.body.position,q:g.body.quaternion}))),inventoryBefore=inventory(t),record=t.mechanismSnapshot(base);assert(record);assert(t.savedMechanismValid(record));assert.deepEqual(plain(t.groups.map(g=>({p:g.body.position,q:g.body.quaternion}))),positions,'canonicalization must change only the exported copy');assert.deepEqual(inventory(t),inventoryBefore);
});
