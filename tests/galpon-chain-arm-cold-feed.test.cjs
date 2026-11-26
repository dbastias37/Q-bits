'use strict';
// Isolated physical alternative to the drone: all parts and wire are paid.
// The first-line trace is an explicit model fixture. Before the measured run,
// both feed benches move 0.8 m towards the cooler and the arm/its existing
// bench move together. The payload stays on the real cooler until the motors
// pick it up; nothing edits its pose during the transfer.
const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,plain,near}=require('./galpon-chain-fixture.cjs');

for(const hz of [60,120])test('a paid arm removes a stabilized cube from the second cooler and drops it on a relocated feed at '+hz+' Hz',context=>{
 const f=fixture(),{t,sandbox,s,w,G,C,build,manufacture}=f,arm=build('arm'),first=build('feedA'),belt=build('feedB');
 const moveGroups=(list,d)=>{for(const g of list){g.body.position.vadd(d,g.body.position);g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);g.body.aabbNeedsUpdate=true;g.body.wakeUp();}};
 const moveWall=(wall,d)=>{wall.p.vadd(d,wall.p);wall.body.position.copy(wall.p);wall.min?.vadd(d,wall.min);wall.max?.vadd(d,wall.max);wall.body.aabbNeedsUpdate=true;};
 for(const [kind,line]of [['feedA',first],['feedB',belt]]){
  t.stopConveyor(line);t.materializeConveyor(line);moveGroups(t.rotorConnectedGroups([t.rotorPart(line.baseId).g]),t.V(0,0,.8));
  const feed=t.hangarChainLayout().feeds[kind],plate=w.fixtures.find(wall=>Math.abs(wall.p.x-feed.x)<1e-8&&Math.abs(wall.p.z-feed.z)<1e-8);assert(plate);moveWall(plate,t.V(0,0,.8));
 }
 assert(t.hangarChainPlaceAssembler(t.V(3.70,0,-1.35)),w.message);
 const initial=t.robotKinematics(arm),delta=t.V(4.55,initial.chain[0].pivot.y,.20).vsub(initial.chain[0].pivot);
 moveGroups(t.rotorConnectedGroups([t.rotorPart(arm.gripperId).g]),delta);moveWall(w.fixtures[0],delta);
 // The fixture relocates the existing bench mount before any simulation;
 // the live sequence thereafter uses its unmodified native clamp.
 assert(arm.pin);arm.pin.p.vadd(delta,arm.pin.p);
 const source=f.source(),from={kind:'reservoir',id:source.id},to={kind:'part',id:arm.baseId},a=t.powerPort(from),b=t.powerPort(to);
 const material=Array.from({length:8},()=>manufacture()).flatMap(g=>t.worldParts(g)),wire=t.connectPowerCable(from,to,[t.V(a.x,1.4,a.z),t.V(b.x,1.4,a.z),t.V(b.x,1.4,b.z)],material);assert(wire.ok,wire.error);
 const payload=manufacture('cube',t.V(4.3,.625,.7)),id=payload.parts[0].id;assert(C.reintroduce(s,[id]));
 for(let i=0;i<3*hz;i++)t.stepSimulation(1/hz);
 assert.equal(t.hangarChainZone(payload),'second-cooler');assert(G.stabilized(G.record(s,id)));assert(s.chain.traces[id].second);assert(G.record(s,id).secondActiveSeconds>=.5);
 const hit=t.rotorPart(arm.gripperId);t.setSelected({g:hit.g,part:hit.part});
 function teach(name,p,height){
  sandbox.document.pointerLockElement=t.canvas;assert(t.robotPanelAction('pose',{pose:name,heightCm:height}).ok);
  const camera=[p.x,p.y+.85,p.z+.7];t.setLook({camera,yaw:0,pitch:Math.atan2(p.y-camera[1],.7)});t.updateRobotPoseDraft(1,true);
  const draft=t.getRobotPoseDraft();assert(draft.solution?.pose,draft.reason);t.canvas.dispatchEvent({type:'mousedown',button:0});t.resumeGame();t.hideStoryDialogue();
 }
 const box=t.bounds(payload),entry=t.conveyorPortWorld(belt,'entry'),destination=entry.p.vadd(entry.direction.scale(.08));
 teach('pick',t.V(box.center.x,box.max.y,box.center.z),3);teach('place',destination,25);
 for(let joint=0;joint<4;joint++)assert(t.robotPanelAction('motor',{joint,rpm:12,maxTorque:4,capacity:64}).ok);
 assert(t.configureRobotArm(arm,{repeat:false}));
 const ids=plain(s.records.map(r=>r.id)),energy=s.energyJ,started=t.getSimTime(),origin=payload.body.position.clone();
 const cells=t.robotArmRotors(arm).flatMap(rotor=>[t.rotorPart(rotor.aId).part,t.rotorPart(rotor.bId).part]),charge=cells.map(p=>p.mood.energy);
 assert(t.startRobotArm(arm),arm.status);
 for(let i=0;i<30*hz&&!s.chain.traces[id].feed;i++)t.stepSimulation(1/hz);
 assert.equal(arm.cycles,1,arm.status);assert.equal(t.hangarChainZone(payload),'feed');assert.equal(s.chain.traces[id].lastMethod,'arm');assert(s.chain.traces[id].second);assert(s.chain.traces[id].feed);
 assert(payload.body.position.distanceTo(origin)>.9);assert.equal(payload.parts[0].id,id);assert.equal(payload.parts[0].weight,1);assert.deepEqual(plain(s.records.map(r=>r.id)),ids);
 cells.forEach((p,i)=>near(p.mood.energy,charge[i]));assert(s.energyJ<energy);assert.doesNotThrow(()=>G.validate(s));
 context.diagnostic(JSON.stringify({hz,seconds:t.getSimTime()-started,joules:energy-s.energyJ,feedOffsetZ:.8,assembler:[3.70,0,-1.35],armPivot:plain(t.robotKinematics(arm).chain[0].pivot),sourceWatts:source.maxWatts,wireUnits:material.length}));
});
