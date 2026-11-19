const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function lab(){const game=createGame();game.t.clearNarrativeScene();Object.assign(game.t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle',progress:{}});return game;}
function tick(t,seconds){for(let i=0;i<Math.round(seconds*240);i++)t.stepPhysics(1/240);}
function make(t,kind='straight',direction=1,origin=t.V()){
 assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate(kind),origin));const conveyor=t.conveyors.at(-1),hit=t.rotorPart(conveyor.baseId),point=hit.p.vadd(hit.q.vmult(t.V(0,0,kind==='left'?.09:-.09))),cell=t.addQubit([point.x,point.y,point.z]);
 const part=cell.parts[0];part.mood.externalBattery={version:1,ownerId:part.id,packId:part.id,enabled:true};part.mood.energy=1;
 assert(t.weld({source:cell,target:hit.g,position:cell.body.position.clone(),quaternion:cell.body.quaternion.clone()}));t.stepPhysics(1/240);assert.equal(t.conveyors.at(-1),conveyor);t.configureConveyor(conveyor,{direction});return {conveyor,battery:t.rotorPart(part.id).part};
}
function path(t,c,direction=c.direction){const hit=t.rotorPart(c.baseId),points=c.path.map(point=>hit.p.vadd(hit.q.vmult(point)));return direction===1?points:points.reverse();}
function payload(t,c,weight=1,cargo=false){const points=path(t,c),dir=points[1].vsub(points[0]);dir.normalize();const at=points[0].vadd(dir.scale(.06));at.y+=cargo?.10:.055;if(!cargo)return t.addQubit([at.x,at.y,at.z],weight);
 const solid=t.newCargo(t.V(at.x,0,at.z),2,weight,'#cc3300');solid.robotPhysical=true;solid.body.mass=weight*.25;solid.body.type=1;solid.body.fixedRotation=false;solid.body.position.copy(at);solid.body.updateMassProperties();return solid;
}
function reaches(t,c,load,seconds=10){const end=path(t,c).at(-1);for(let i=0;i<seconds*240;i++){t.stepPhysics(1/240);if(Math.hypot(load.body.position.x-end.x,load.body.position.z-end.z)<.035&&load.body.position.y>end.y)return (i+1)/240;}assert.fail('Payload did not reach '+end.toString()+'; actual '+load.body.position.toString()+'; '+c.status);}
for(const [kind,direction,weight]of [['straight',1,1],['straight',-1,3],['right',1,3],['left',-1,1]])test('finite contact traction transports '+kind+' direction '+direction+' with '+weight+' u',()=>{
 const {t}=lab(),{conveyor:c,battery}=make(t,kind,direction),load=payload(t,c,weight),ids=t.groups.flatMap(g=>g.parts.map(p=>p.id)),before=battery.mood.energy;assert(t.startConveyor(c));assert(reaches(t,c,load)<8);assert(battery.mood.energy<before);assert(t.conveyorRotors(c).every(r=>Math.abs(r.actualRpm)>20));assert.deepEqual(t.groups.flatMap(g=>g.parts.map(p=>p.id)),ids);
});
test('a colored physical solid with the hauling material traverses a real corner',()=>{
 const {t}=lab(),{conveyor:c}=make(t,'right'),solid=payload(t,c,4,true);assert(t.startConveyor(c));assert(reaches(t,c,solid,12)<10);assert.equal(solid.color,'#cc3300');assert.equal(solid.required,4);assert.equal(solid.body.mass,1);
});
test('battery switch and exhaustion stop the whole belt without draining motor reserves',()=>{
 const {t}=lab(),{conveyor:c,battery}=make(t),load=payload(t,c);for(const r of t.conveyorRotors(c)){t.rotorPart(r.aId).part.mood.energy=.3;t.rotorPart(r.bId).part.mood.energy=.3;}
 assert(t.startConveyor(c));tick(t,1);battery.mood.externalBattery.enabled=false;tick(t,.25);const stopped=load.body.position.clone();assert(!c.running);assert(t.conveyorRotors(c).every(r=>!r.enabled));tick(t,.5);assert(load.body.position.distanceTo(stopped)<.01);
 battery.mood.externalBattery.enabled=true;battery.mood.energy=.000004;assert(t.startConveyor(c));tick(t,.05);assert(!c.running);assert(battery.mood.energy>=0);
 for(const r of t.conveyorRotors(c))assert(t.rotorPart(r.aId).part.mood.energy>=.3,'external operation never spends the internal motor reserve');
});
test('an eight-unit capacity stops on an overweight real contact and rejects legacy bypass',()=>{
 const {t}=lab(),{conveyor:c}=make(t),load=payload(t,c,3);t.configureConveyor(c,{capacity:2});assert(t.startConveyor(c));tick(t,.25);assert(!c.running);assert.match(c.status,/Sobrecarga/);const rotor=t.conveyorRotors(c)[0];assert.equal(t.configureRotor(rotor,{enabled:true}),false);assert.equal(t.configureRotorSet({rotorIds:[rotor.id]},{enabled:true}),false);assert(t.groups.includes(load));
});
test('a wall blocks a belt payload and an object above the belt receives no remote traction',()=>{
 const {t}=lab(),{conveyor:c}=make(t),load=payload(t,c),points=path(t,c),middle=points[0].vadd(points[1]).scale(.5);t.storyWall(t.V(middle.x,middle.y+.10,middle.z),t.V(.02,.10,.2));assert(t.startConveyor(c));tick(t,3);assert(load.body.position.x<middle.x-.055,'real contact wall cannot be passed');
 const airborne=t.addQubit([middle.x,middle.y+2,middle.z+.04]);const before=airborne.body.position.clone();tick(t,.1);assert(Math.abs(airborne.body.position.x-before.x)<1e-6,'no force before surface contact');
});
function extend(t,c,kind='straight'){
 const base=t.rotorPart(c.baseId);t.setSelected({g:base.g,part:base.part});assert(t.conveyorPanelAction('blueprint',{kind,height:0,quarterTurns:0,supports:false,extend:true}).ok);const bp=t.blueprints.at(-1);
 for(const [index,target]of t.blueprintTargets(bp).entries()){const g=t.makeGroup([{id:t.allocateUnitId(),shape:target.shape,weight:1,p:target.p.clone(),q:target.q.clone()}]),slot={g,bp,index,state:'placed'};g.blueprintJob=slot;bp.slots.push(slot);}bp.active=true;t.updateBlueprints(0);assert(!t.blueprints.includes(bp));return t.conveyors.at(-1);
}
test('two joined sections physically pass a load across their seam and release their shared support in either stop order',()=>{
 for(const order of [[0,1],[1,0]]){const {t}=lab(),{conveyor:first,battery}=make(t),second=extend(t,first),liveBattery=t.rotorPart(battery.id).part,shared=t.rotorPart(first.baseId).g.body;assert.equal(t.rotorPart(second.baseId).g.body,shared);tick(t,.05);
  assert(t.startConveyor(first));tick(t,.02);assert(t.startConveyor(second));const before=liveBattery.mood.energy;if(order[0]===0){const load=payload(t,first,2);assert(reaches(t,second,load,10)<8);}else tick(t,.05);assert(liveBattery.mood.energy<before);const controllers=[first,second];t.stopConveyor(controllers[order[0]]);tick(t,.01);assert.equal(shared.type,4,'remaining powered section retains the common frame');t.stopConveyor(controllers[order[1]]);assert.equal(shared.type,1,'last stop restores the original dynamic frame');assert.equal(shared.fixedRotation,false);
 }
});

test('restart rewinds the virtual rollers and resumes the powered belt',()=>{
 const {t}=lab(),{conveyor,battery}=make(t);assert(t.startConveyor(conveyor));tick(t,.5);
 const rollers=t.conveyorRotors(conveyor),charge=battery.mood.energy;
 assert(rollers.every(r=>Math.abs(r.visualPhase)>.01));
 assert(t.restartMechanism(t.rotorPart(conveyor.baseId).g));assert(conveyor.running);
 assert(rollers.every(r=>r.visualPhase===0&&r.enabled));assert.equal(battery.mood.energy,charge);
 tick(t,.5);assert(rollers.every(r=>Math.abs(r.actualRpm)>20));
});
