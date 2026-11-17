const test=require('node:test'),assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function line(t,kinds=['straight','straight','right']){
 let last=null;const modules=[];
 for(const kind of kinds){const recipe=t.conveyorBlueprintTemplate(kind);let p=t.V(),q=t.Q();if(last){const placement=t.conveyorBlueprintPlacement(recipe,last);assert(placement);p=placement.point.clone();p.y-=.003;q.setFromAxisAngle(t.V(0,1,0),placement.quarterTurns*Math.PI/2);}const prior=new Set(t.groups);assert(t.spawnSavedMechanism(recipe,p,q));const c=t.conveyors.at(-1);if(last)assert(t.joinCompletedConveyorBlueprint({conveyorLink:last.baseId},t.groups.filter(g=>!prior.has(g))));modules.push(c);last=c;}
 return modules;
}
function inventory(t){return t.groups.flatMap(g=>g.parts.map(p=>({id:p.id,shape:p.shape,weight:p.weight}))).sort((a,b)=>a.id-b.id);}
function supply(t,c){const base=t.rotorPart(c.baseId),p=base.p.clone();p.y+=.09;const g=t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:1,p,q:base.q.clone()}]),cell=g.parts[0];cell.mood.energy=.9;cell.mood.externalBattery={version:1,ownerId:cell.id,packId:cell.id,enabled:true};assert(t.weld({source:g,target:base.g,position:g.body.position.clone(),quaternion:g.body.quaternion.clone()}));return t.rotorPart(cell.id).part;}
function steps(t,count){for(let i=0;i<count;i++)t.stepPhysics(1/120);}

test('three compact modules keep every material identity and exactly one physical mass contribution',()=>{
 const {t}=lab(),modules=line(t),parts=inventory(t),base=t.rotorPart(modules[0].baseId).g;
 assert.equal(parts.length,101);assert.equal(new Set(parts.map(p=>p.id)).size,101);
 assert.equal(t.groups.length,10,'virtual source groups remain recoverable data');
 assert.equal(t.groups.filter(g=>t.world.bodies.includes(g.body)).length,1,'assembled roller bodies leave the solver');
 assert.equal(t.world.constraints.length,0,'assembled rollers create no live hinges');
 assert(t.rotors.every(r=>r.virtualConveyor&&!r.constraint));
 assert(Math.abs(base.body.mass-parts.reduce((n,p)=>n+p.weight,0)*.25)<1e-9,'one chassis carries the full conserved mass');
 assert.equal(t.world.bodies.filter(b=>b.qubitGroup).reduce((n,b)=>n+b.mass,0),base.body.mass);
 const record=t.mechanismSnapshot(base);assert(record&&t.savedMechanismValid(record));assert.equal(record.groups.flatMap(g=>g.parts).length,101);
});

test('picking a visible roller moves the real chassis and releases its only hand constraint',()=>{
 const {t}=lab(),modules=line(t),before=inventory(t),roller=t.rotorPart(t.conveyorRotors(modules[1])[0].bId),base=t.rotorPart(modules[0].baseId).g;
 assert(!t.world.bodies.includes(roller.g.body));t.setLook({camera:[roller.p.x,roller.p.y+.2,roller.p.z+1],yaw:0,pitch:0});
 t.grabQubit({...roller,point:roller.p.clone(),distance:1});const held=t.getHeld();assert(held);assert.equal(held.g,base,'the visual hit resolves to the real carrying body');
 assert.equal(t.world.constraints.length,1);assert(held.items.filter(item=>item.anchorBody).every(item=>t.world.bodies.includes(item.g.body)));
 steps(t,24);assert.deepEqual(inventory(t),before);assert(t.groups.every(g=>Number.isFinite(g.body.position.y)));
 t.releaseQubit();assert.equal(t.world.constraints.length,0);assert.equal(t.groups.filter(g=>t.world.bodies.includes(g.body)).length,1);
});

test('powered virtual rollers continue through selection and stop on shared external energy exhaustion',()=>{
 const {t}=lab(),modules=line(t),cell=supply(t,modules[0]),before=inventory(t),reserve=new Map(t.rotors.flatMap(r=>[r.aId,r.bId]).map(id=>[id,t.rotorPart(id).part.mood.energy]));
 for(const c of modules)assert(t.startConveyor(c),c.status);const energy=cell.mood.energy;steps(t,30);assert(modules.every(c=>c.running));assert(cell.mood.energy<energy);
 const roller=t.rotorPart(t.conveyorRotors(modules[1])[0].bId),bodies=t.world.bodies.length,constraints=t.world.constraints.length;
 t.grabQubit({...roller,point:roller.p.clone(),distance:1});assert.equal(t.getHeld(),null);assert(modules.every(c=>c.running));assert.equal(t.world.bodies.length,bodies);assert.equal(t.world.constraints.length,constraints);
 const selectedEnergy=cell.mood.energy;steps(t,30);assert(cell.mood.energy<selectedEnergy,'selection does not pause production');assert(modules.every(c=>c.running));
 cell.mood.energy=1e-8;steps(t,4);assert(modules.every(c=>!c.running));assert(t.rotors.every(r=>!r.enabled));for(const [id,charge]of reserve)assert.equal(t.rotorPart(id).part.mood.energy,charge,'depleted external supply never switches to internal reserves');assert.deepEqual(inventory(t),before);
});

test('virtual rollers retain the real belt surface, transport contact and capacity stop',()=>{
 const {t}=lab(),modules=line(t,['straight','straight']),cell=supply(t,modules[0]);for(const c of modules)assert(t.startConveyor(c),c.status);
 const first=t.conveyorSurfacePoses(modules[0])[0],point=first.p.vadd(first.q.vmult(t.V(-first.half.x+.08,first.half.y+.048,0))),payload=t.addQubit([point.x,point.y,point.z]),start=payload.body.position.clone();
 steps(t,720);assert(modules.every(c=>c.running));assert(payload.body.position.x>start.x+.25,'real contact traction moves the payload');assert(cell.mood.energy<.9);
 const c=modules[1];assert(t.configureConveyor(c,{capacity:1}));const skin=t.conveyorSurfacePoses(c)[0],load=skin.p.vadd(skin.q.vmult(t.V(0,skin.half.y+.048,0)));t.addQubit([load.x,load.y,load.z],2);steps(t,60);assert.equal(c.running,false);assert.match(c.status,/Sobrecarga/);
});

for(const kind of ['left','right'])test(`a ${kind} corner uses real contact traction through both legs with visual rollers`,()=>{
 const {t}=lab(),[c]=line(t,[kind]);supply(t,c);assert(t.startConveyor(c),c.status);
 const skin=t.conveyorSurfacePoses(c)[0],point=skin.p.vadd(skin.q.vmult(t.V(-skin.half.x+.08,skin.half.y+.048,0))),load=t.addQubit([point.x,point.y,point.z]),start=load.body.position.clone(),sign=kind==='left'?-1:1;let crossed=false;
 for(let i=0;i<1200;i++){t.stepPhysics(1/120);if(load.body.position.x>start.x+.2&&(load.body.position.z-start.z)*sign>.2)crossed=true;}
 assert(crossed,'a physical payload must reach the second leg of the corner');assert(c.running,c.status);assert(t.conveyorRotors(c).every(r=>r.virtualConveyor&&!r.constraint));assert(Number.isFinite(load.body.position.y));
});
