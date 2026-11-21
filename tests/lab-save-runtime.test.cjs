// Persisted JSON, fresh game instances and real Cannon; DOM/GPU are stubs.
const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

function lab(){
 const game=createGame({graphics:false}),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle',progress:{}});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;
 return game;
}
function tick(t,seconds,hz=120){for(let i=0;i<Math.round(seconds*hz);i++)t.stepPhysics(1/hz);}
function plain(value){return JSON.parse(JSON.stringify(value));}
function energy(t){return plain(t.groups.flatMap(g=>g.parts).map(p=>[p.id,p.mood.energy]).sort((a,b)=>a[0]-b[0]));}
function restore(snapshot){
 const game=lab(),{t}=game,saved=t.hydrateLabSnapshot(plain(snapshot));
 t.story.lab=saved;t.story.scene='campaign';t.enterLab(false);
 const result=t.restoreLabRuntime(saved.runtime);return {...game,saved,result};
}
function conveyor(t){
 assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight',true),t.V()));
 const c=t.conveyors[0],hit=t.rotorPart(c.baseId),p=hit.p.vadd(hit.q.vmult(t.V(0,0,-.09))),battery=t.addQubit([p.x,p.y,p.z]);
 const part=battery.parts[0];part.mood.energy=.71;part.mood.externalBattery={version:1,ownerId:part.id,packId:part.id,enabled:true};
 assert(t.weld({source:battery,target:hit.g,position:battery.body.position.clone(),quaternion:battery.body.quaternion.clone()}));
 tick(t,.3);assert(t.startConveyor(c),c.status);return c;
}
function drone(t){
 const g=t.spawnSavedMechanism(t.propellerBlueprintTemplate(true),t.V());assert(g);
 const cell=g.parts.find(t.isExternalBattery);cell.mood.energy=.8;cell.mood.externalBattery.enabled=true;
 const f=t.flightForGroup(g);t.configureFlight(f,{height:.45,speed:0});return {g,f,cell};
}
function servo(t){
 t.settings.gravity=0;t.world.gravity.set(0,0,0);
 const a=t.addQubit([0,1,0],.25,'pyramid'),q=t.Q();q.setFromAxisAngle(t.V(0,0,1),Math.PI);
 const b=t.makeGroup([{id:t.allocateUnitId(),shape:'pyramid',weight:.25,p:t.V(0,1+.75*.09,0),q}]);
 const r=t.connectServoTips(a.parts[0].id,b.parts[0].id,{kind:'hinge'});assert(r);return r;
}

test('a fresh instance hydrates JSON poses, velocities, cargo and stable identities without spending energy',()=>{
 const {t}=lab(),q=t.Q();q.setFromAxisAngle(t.V(0,1,0),.37);
 const g=t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:2,p:t.V(1,.5,-1),q}]);
 g.parts[0].mood.energy=.371;g.body.velocity.set(.2,-.1,.3);g.body.angularVelocity.set(.1,.2,-.3);
 const cargo=t.newCargo(t.V(-1,0,1),2,3,'#cc3300');cargo.robotPhysical=true;cargo.body.mass=.75;cargo.body.type=1;cargo.body.fixedRotation=false;
 cargo.body.position.y=.9;cargo.body.velocity.set(-.2,.1,0);cargo.body.quaternion.copy(q);cargo.body.updateMassProperties();
 const snapshot=t.saveLab({passive:true}),before=energy(t),ids=t.groups.flatMap(g=>g.parts.map(p=>p.id)),game=restore(snapshot),rt=game.t;
 assert(game.result.ok,game.result.warnings.join('; '));assert.deepEqual(energy(rt),before);
 const restored=rt.rotorPart(ids[0]).g;
 assert(restored.body.position.distanceTo(g.body.position)<1e-10);
 assert(restored.body.velocity.distanceTo(g.body.velocity)<1e-10);
 assert(restored.body.angularVelocity.distanceTo(g.body.angularVelocity)<1e-10);
 assert.equal(restored.body.mass,g.body.mass);assert(rt.allocateUnitId()>Math.max(...ids));
 const solid=rt.cargos.find(c=>c.id===cargo.id);assert(solid?.robotPhysical);assert.equal(solid.body.position.y,.9);assert.equal(solid.body.velocity.x,-.2);
 assert.equal(typeof game.saved.groups[0].parts[0].p.scale,'function');assert.equal(typeof game.saved.groups[0].q.inverse,'function');
 assert.doesNotThrow(()=>rt.stepPhysics(1/120));
});

test('hydration rejects invalid vectors and duplicate ownership before changing the live scene',()=>{
 const {t}=lab(),g=t.addQubit([0,.045,0]),saved=plain(t.saveLab());
 const cases=[];let bad=plain(saved);bad.groups[0].parts[0].p.x=null;cases.push(bad);
 bad=plain(saved);bad.groups.push(plain(bad.groups[0]));cases.push(bad);
 bad=plain(saved);bad.groups[0].q={x:0,y:0,z:0,w:0};cases.push(bad);
 bad=plain(saved);bad.groups[0].parts[0].mood.energy='full';cases.push(bad);
 for(const data of cases){assert.throws(()=>t.hydrateLabSnapshot(data));assert.equal(t.groups[0],g);}
});

test('passive capture leaves a cable draft in progress and legacy saveLab still cancels it',()=>{
 const {t}=lab(),g=t.addQubit([0,.045,0]);assert(t.beginPowerCable([g]));const draft=t.getPowerDraft();
 const saved=t.saveLab({passive:true});assert.equal(t.getPowerDraft(),draft);assert(saved.groups.some(s=>s.parts.some(p=>p.id===g.parts[0].id)));
 t.saveLab();assert.equal(t.getPowerDraft(),null);
});

test('a running conveyor resumes from JSON with the same matter and charge and carries its load',()=>{
 const {t}=lab(),c=conveyor(t),surface=t.conveyorSurfacePoses(c)[0];
 const p=surface.p.vadd(surface.q.vmult(t.V(-.17,surface.half.y+.05,0))),load=t.addQubit([p.x,p.y,p.z]);
 tick(t,.25);const saved=t.saveLab({passive:true}),before=energy(t),mass=t.world.bodies.filter(b=>b.qubitGroup).reduce((sum,b)=>sum+b.mass,0);
 const game=restore(saved),rt=game.t,restored=rt.conveyors.find(b=>b.baseId===c.baseId),payload=rt.rotorPart(load.parts[0].id).g;
 assert(game.result.ok,game.result.warnings.join('; '));assert(restored.running);assert.deepEqual(energy(rt),before);
 assert(Math.abs(rt.world.bodies.filter(b=>b.qubitGroup).reduce((sum,b)=>sum+b.mass,0)-mass)<1e-9);
 const x=payload.body.position.x,charge=rt.externalBatterySummary(rt.rotorPart(restored.baseId).g).storedJ;
 tick(rt,.5);assert(restored.running,restored.status);assert(payload.body.position.x>x+.025);assert(rt.externalBatterySummary(rt.rotorPart(restored.baseId).g).storedJ<charge);
});

test('hovering flight retains spool and altitude across a fresh page without an extra energy debit',()=>{
 const {t}=lab(),{g,f}=drone(t);assert(t.startFlight(f),f.status);tick(t,4);
 const height=t.bounds(g).min.y;assert(Math.abs(height-.45)<.04);
 const saved=t.saveLab({passive:true}),before=energy(t),game=restore(saved),rt=game.t,body=rt.rotorPart(f.id).g,flight=rt.flightForGroup(body);
 assert(game.result.ok,game.result.warnings.join('; '));assert(flight.enabled);assert.equal(flight.spool,f.spool);assert.deepEqual(energy(rt),before);
 let minimum=Infinity;for(let i=0;i<120;i++){rt.stepPhysics(1/120);minimum=Math.min(minimum,rt.bounds(body).min.y);}
 assert(flight.enabled,flight.status);assert(minimum>height-.035,'loading must not ramp thrust from zero and drop the drone');
 assert(Math.abs(rt.bounds(body).min.y-.45)<.04);assert(rt.externalBatterySummary(body).storedJ<t.externalBatterySummary(g).storedJ);
});

test('an airborne route keeps its original coordinates, current stop timer and sensor latch',()=>{
 const {t}=lab(),{f}=drone(t);
 t.configureFlight(f,{height:.45,speed:.5,route:{loop:true,points:[{x:0,z:-.5,height:.45,action:'wait',wait:30}]}});
 assert(t.startFlight(f));tick(t,4);assert.equal(f.trip.phase,'wait');f.contact={latched:true,clearSeconds:.02};
 const saved=t.saveLab({passive:true}),game=restore(saved),rt=game.t,flight=rt.flightForGroup(rt.rotorPart(f.id).g);
 assert(game.result.ok,game.result.warnings.join('; '));assert(flight.enabled);assert.equal(flight.trip.index,f.trip.index);assert.equal(flight.trip.phase,'wait');
 assert(flight.trip.origin.distanceTo(f.trip.origin)<1e-12);assert(flight.trip.depart.distanceTo(f.trip.depart)<1e-12);assert.equal(flight.trip.remaining,f.trip.remaining);
 assert.deepEqual(plain(flight.contact),{latched:true,clearSeconds:.02});
 tick(rt,.5);assert.equal(flight.trip.phase,'wait');assert(Math.abs(flight.trip.remaining-(f.trip.remaining-.5))<1e-7);
});

test('a repeating servo retains the half-cycle goal after durable restoration',()=>{
 const {t}=lab(),r=servo(t);assert(t.configureServo(r,{min:-25,max:25,target:25,speed:90,mode:'repeat'}));assert(t.startServo(r));
 for(let i=0;i<1200&&r.servoGoal!==r.servo.min;i++)t.stepPhysics(1/240);
 assert.equal(r.servoGoal,r.servo.min);tick(t,.08,240);
 const saved=t.saveLab({passive:true}),before=energy(t),game=restore(saved),rt=game.t,restored=rt.rotors.find(s=>s.aId===r.aId&&s.bId===r.bId);
 assert(game.result.ok,game.result.warnings.join('; '));assert(restored.enabled);assert.equal(restored.servoGoal,r.servoGoal);assert.deepEqual(energy(rt),before);
 const start=rt.servoAngle(restored);tick(rt,.15,240);assert(rt.servoAngle(restored)<start,'the returning half-cycle continues toward its saved minimum');
});

test('a held robot payload marks the runtime as unavailable instead of silently resuming an empty arm',()=>{
 const {t}=lab(),hand=t.addQubit([0,.145,0]),load=t.addQubit([0,.05,0]);assert(t.configureGripper(hand.parts[0].id,{}));assert(t.gripperGrab(hand.parts[0].id));
 const saved=t.saveLab({passive:true});assert.equal(saved.runtime.blocked,'robot-grip');assert.equal(t.robotGrips.size,1);assert(t.groups.includes(load));
 const result=t.restoreLabRuntime(saved.runtime);assert.equal(result.ok,false);assert.match(result.warnings[0],/pinza/);assert.equal(t.robotGrips.size,1);
});

test('persisted mood cooldown ages are rebased to the new simulation clock',()=>{
 const {t}=lab(),g=t.addQubit([0,.045,0]);tick(t,.5);g.parts[0].mood.lastAnger=t.getSimTime()-.2;
 const game=restore(t.saveLab({passive:true})),part=game.t.rotorPart(g.parts[0].id).part;
 assert(Math.abs(game.t.getSimTime()-part.mood.lastAnger-.2)<1e-8);
});

test('JSON restores inventory stored in shelves, cable and pending disassembly and reserves every identity',()=>{
 const {t}=lab(),shelf=t.createShelf({p:t.V(0,.4,-13.996),q:t.Q(),wall:'north'});assert(shelf);
 const stored=t.addQubit([2,.045,2]);stored.parts[0].mood.energy=.23;t.setMultiSelection([stored]);t.setSelected({g:stored,part:stored.parts[0]});assert(t.storeShelfSelection(shelf));
 const reservoir=t.createPowerReservoir(t.V(0,0,0),{energy:.31,enabled:true}),motor=t.spawnRotor(t.V(0,0,2));assert(reservoir&&motor);
 const material=[];for(let i=0;i<2;i++){const g=t.addQubit([4+i*.1,.045,4]);g.parts[0].mood.energy=.4+i*.1;material.push(...t.worldParts(g));t.removeGroup(g);}
 assert(t.connectPowerCable({kind:'reservoir',id:reservoir.id},{kind:'part',id:motor.aId},[],material).ok);
 const pending=t.makeGroup([0,1].map(i=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(2+i*.09,.5,1),q:t.Q(),mood:{energy:.19+i*.1}})));
 assert(t.beginStagedDisassembly([pending]));
 const saved=t.saveLab({passive:true}),game=restore(saved),rt=game.t;assert(game.result.ok,game.result.warnings.join('; '));
 const all=s=>[...s.groups.flatMap(g=>g.parts),...s.disassembly.flatMap(j=>j.parts),...s.powerNetwork.cables.flatMap(c=>c.materials),...s.shelves.flatMap(s=>s.cells.flatMap(c=>c.items.flatMap(i=>i.groups.flatMap(g=>g.parts))))].map(p=>[p.id,p.weight,p.mood.energy]).sort((a,b)=>a[0]-b[0]);
 assert.deepEqual(plain(all(rt.saveLab({passive:true}))),plain(all(saved)));assert.equal(rt.powerReservoirs[0].cell.mood.energy,.31);
 assert(rt.allocateUnitId()>Math.max(...all(saved).map(p=>p[0])));
 const duplicate=plain(saved);duplicate.shelves[0].cells[0].items[0].groups[0].parts[0].id=duplicate.powerNetwork.cables[0].materials[0].id;
 assert.throws(()=>rt.hydrateLabSnapshot(duplicate),'a cable and a shelf cannot own the same piece');
});

test('a synchronized march keeps its current cycle rather than realigning on reload',()=>{
 const {t}=lab(),r=servo(t);assert(t.configureServo(r,{min:-25,max:25,target:25,speed:90,mode:'repeat'}));assert(t.startServoMarch(r));tick(t,2,240);
 const march=t.servoMarchFor(r);assert(march);assert.equal(march.phase,'march');assert(march.elapsed>0);
 const saved=t.saveLab({passive:true}),before=energy(t),game=restore(saved),rt=game.t,restored=rt.rotors.find(s=>s.aId===r.aId&&s.bId===r.bId),run=rt.servoMarchFor(restored);
 assert(game.result.ok,game.result.warnings.join('; '));assert(run);assert.equal(run.phase,march.phase);assert.equal(run.elapsed,march.elapsed);assert.deepEqual(energy(rt),before);
 rt.stepPhysics(1/240);assert.equal(run.phase,'march');assert(Math.abs(run.elapsed-(march.elapsed+1/240)%run.period)<1e-9);
});

test('an empty arm waiting for a load resumes its program without another energy debit',()=>{
 const {t}=lab();assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V()));const arm=t.robotArms[0];assert(t.startRobotArm(arm),arm.status);
 for(let i=0;i<1200&&arm.state!=='wait';i++)t.stepPhysics(1/240);
 assert.equal(arm.state,'wait',arm.status);assert.equal(t.robotGrips.size,0);
 const saved=t.saveLab({passive:true}),before=energy(t),game=restore(saved),rt=game.t,restored=rt.robotArms.find(a=>a.gripperId===arm.gripperId);
 assert(game.result.ok,game.result.warnings.join('; '));assert(restored.running);assert.equal(restored.state,'wait');assert.deepEqual(energy(rt),before);
 tick(rt,.1,240);assert(restored.running,restored.status);assert.equal(restored.state,'wait');assert.equal(rt.robotGrips.size,0);
});
