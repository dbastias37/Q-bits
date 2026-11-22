const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const createGame=require('./game-harness.cjs');

function lab(countPasses=false){
 let gameSource;
 if(countPasses){
  const source=fs.readFileSync(path.join(__dirname,'../assets/js/game.js'),'utf8'),end=source.lastIndexOf('})();');
  const hook=`
   const grabPasses={active:false,refresh:0,motors:0};window.__grabPasses=grabPasses;
   const refreshBefore=refreshRotors,motorsBefore=updateRotorMotors;
   refreshRotors=function(...args){if(grabPasses.active)grabPasses.refresh++;return refreshBefore(...args);};
   updateRotorMotors=function(...args){if(grabPasses.active)grabPasses.motors++;return motorsBefore(...args);};
  `;gameSource=source.slice(0,end)+hook+source.slice(end);
 }
 const game=createGame(gameSource?{gameSource}:{}),{t,sandbox}=game;
 t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;
}
function line(t,count){
 let last=null;const modules=[];
 for(let i=0;i<count;i++){
  const recipe=t.conveyorBlueprintTemplate('straight'),q=t.Q();let point=t.V();
  if(last){const placement=t.conveyorBlueprintPlacement(recipe,last);assert(placement);point=placement.point.clone();point.y-=.003;q.setFromAxisAngle(t.V(0,1,0),placement.quarterTurns*Math.PI/2);}
  const prior=new Set(t.groups);assert(t.spawnSavedMechanism(recipe,point,q));const conveyor=t.conveyors.at(-1);
  if(last)assert(t.joinCompletedConveyorBlueprint({conveyorLink:last.baseId},t.groups.filter(g=>!prior.has(g))));
  modules.push(conveyor);last=conveyor;
 }return modules;
}
function rotorAt(t,x){
 const q=t.Q();q.setFromAxisAngle(t.V(1,0,0),Math.PI);
 const first=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p:t.V(x,1,0),q:t.Q()}]);
 const second=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p:t.V(x,1+2*.09*51/56,0),q}]);
 const rotor=t.connectRotorTips(first.parts[0].id,second.parts[0].id,{mount:'fixed',maxTorque:3.2});assert(rotor);return rotor;
}
function pick(t,hit){t.grabQubit({...hit,point:hit.p.clone(),distance:.8});assert(t.getHeld());}
function inventory(t){return t.groups.flatMap(g=>g.parts.map(p=>[p.id,p.shape,p.weight,p.mood.energy])).sort((a,b)=>a[0]-b[0]);}

test('grabbing many stopped conveyor motors performs one global refresh and preserves material, mass and one hand anchor',()=>{
 const {t,sandbox}=lab(true),modules=line(t,8),base=t.rotorPart(modules[0].baseId),before=inventory(t),mass=base.g.body.mass;
 assert.equal(t.rotors.length,24);assert(t.rotors.every(r=>r.virtualConveyor));
 for(const rotor of t.rotors){rotor.stopReason='empty';rotor.actualRpm=7;rotor.actualTorque=.2;}
 base.g.body.velocity.set(.1,.2,.3);base.g.body.angularVelocity.set(.2,.3,.4);
 sandbox.__grabPasses.active=true;pick(t,base);sandbox.__grabPasses.active=false;
 assert.equal(sandbox.__grabPasses.refresh,1,'all stopped motors share one topology check');
 assert.equal(sandbox.__grabPasses.motors,1,'brakes and motor state update after the entire selection stops');
 assert.equal(t.getHeld().items.filter(item=>item.anchorBody).length,1);
 assert.equal(t.world.constraints.length,1);assert.equal(base.g.body.mass,mass);assert.deepEqual(inventory(t),before);
 assert(t.rotors.every(r=>!r.enabled&&r.stopReason===null&&r.actualRpm===0&&r.actualTorque===0));
 assert(t.getHeld().items.every(item=>item.g.body.angularVelocity.norm()===0));
 assert(t.getHeld().items.filter(item=>item.g.virtualConveyor).every(item=>item.g.body.velocity.distanceTo(base.g.body.velocity)<1e-12),'virtual velocities reflect the stopped chassis immediately');
 t.releaseQubit();assert.equal(t.world.constraints.length,0);assert.equal(base.g.body.mass,mass);
 assert.equal(t.groups.filter(g=>t.world.bodies.includes(g.body)).length,1);
});

test('picking an active fixed rotor releases its room pin, applies campaign torque limits and preserves an unrelated motor',()=>{
 const {t,sandbox}=lab(),chosen=rotorAt(t,0),other=rotorAt(t,4);
 assert(t.configureRotor(chosen,{enabled:true}));assert(t.configureRotor(other,{enabled:true}));
 assert(chosen.pin&&other.pin);const oldPin=chosen.pin,otherPin=other.pin;
 chosen.stopReason='overload';chosen.actualRpm=12;
 for(const g of t.rotorGroups(chosen))g.body.angularVelocity.set(.3,.2,.1);
 t.story.scene='campaign';t.story.campaign={production:{goal:{maxTorque:.4},started:false},gates:[],stage:0};
 pick(t,t.rotorPart(chosen.aId));
 assert.equal(chosen.enabled,false);assert.equal(chosen.pin,null);assert.equal(chosen.stopReason,null);assert.equal(chosen.actualRpm,0);assert.equal(chosen.maxTorque,.4);
 assert.equal(oldPin.body.type,sandbox.CANNON.Body.DYNAMIC);assert.equal(oldPin.body.fixedRotation,false);
 assert.equal(chosen.constraint.motorEquation.enabled,false);assert.equal(chosen.constraint.stopBrake.equation.enabled,true);
 assert(t.rotorGroups(chosen).every(g=>g.body.angularVelocity.norm()===0));
 assert.equal(other.enabled,true);assert.equal(other.pin,otherPin);assert.equal(other.maxTorque,3.2);
 assert.equal(other.constraint.motorEquation.enabled,true);assert.equal(t.getHeld().items.length,2);
});

test('surface ownership follows welded and detached conveyor bodies and agrees with their real Cannon shapes',()=>{
 const {t}=lab(),modules=line(t,2);
 const verify=()=>{
  for(const g of t.groups){
   const shapes=[];
   for(const c of t.conveyors){if(c.surfaceBody===g.body)shapes.push(...c.surfaces.map(s=>s.shape));if(c.virtual?.body===g.body)shapes.push(...c.virtual.proxies.map(p=>p.shape));}
   const poses=t.conveyorGroupSurfaces(g);assert.equal(poses.length,shapes.length);
   for(let i=0;i<shapes.length;i++){
    const index=g.body.shapes.indexOf(shapes[i]);assert(index>=0);const p=g.body.position.vadd(g.body.quaternion.vmult(g.body.shapeOffsets[index])),q=g.body.quaternion.mult(g.body.shapeOrientations[index]);
    assert(poses[i].p.distanceTo(p)<1e-9);assert(Math.abs(poses[i].q.x*q.x+poses[i].q.y*q.y+poses[i].q.z*q.z+poses[i].q.w*q.w)>1-1e-9);assert(poses[i].half.distanceTo(shapes[i].halfExtents)<1e-9);
   }
  }
 };
 verify();assert(t.detachConveyorModule(modules[1]));assert.notEqual(t.rotorPart(modules[0].baseId).g,t.rotorPart(modules[1].baseId).g);verify();
 const group=t.rotorPart(modules[1].baseId).g;group.body.position.vadd(t.V(.2,.4,.1),group.body.position);group.body.quaternion.setFromAxisAngle(t.V(0,1,0),.3);verify();
 const probe={body:group.body,parts:group.parts};assert.deepEqual(t.conveyorGroupSurfaces(probe),t.conveyorGroupSurfaces(group),'hypothetical placement probes keep their own local material lookup');
});
