// Shared deterministic scenes for Node and real Chromium. This file is tooling,
// never loaded by the shipped game. No limit, rate or physical rule is changed.
function auditFixtures(t) {
  const check = (ok, message) => { if (!ok) throw new Error(message); return ok; };
  function count() { return t.groups.reduce((n, g) => n + g.parts.length, 0); }
  function plate(n, center = [0, .045, 0], width = 10) {
    return t.makeGroup(Array.from({length:n}, (_, i) => ({
      id:t.allocateUnitId(), shape:'cube', weight:1,
      p:t.V(center[0] + (i % width) * .09, center[1], center[2] + Math.floor(i / width) * .09), q:t.Q()
    })));
  }
  function distant(n, per = 10) {
    for (let i = 0, left = n; left > 0; i++, left -= per) {
      plate(Math.min(per, left), [4 + (i % 5) * 1.5, .045, -4 + Math.floor(i / 5) * .4], per);
    }
  }
  function battery(n = 3, center = [0, .045, 0], enabled = false) {
    const g = plate(n, center, n), id = g.parts[0].id;
    for (const p of g.parts) {
      p.mood.externalBattery = {version:1, ownerId:p.id, packId:id, enabled}; p.mood.energy = 1;
    }
    return g;
  }
  function heldCube() {
    const parts = [];
    for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) {
      parts.push({id:t.allocateUnitId(), shape:'cube', weight:1, p:t.V((x-1.5)*.09, 1+(y-1.5)*.09, (z-1.5)*.09), q:t.Q()});
    }
    const g = t.makeGroup(parts); t.setHeld({g, items:[{g}]}); return g;
  }
  function sensor(g, mode = 'weight') {
    const p = g.parts[0];
    p.mood.workshop = {version:1, ownerId:p.id, sensor:true, battery:1, lightweight:1, movement:1, baseWeight:1, ballast:0};
    p.mood.sensorConfig = {mode, range:50, weight:1, speed:5, action:'start'};
    return t.rotorPart(p.id);
  }
  function belt(x, z = 0, active = true) {
    check(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'), t.V(x, 0, z)), 'belt fixture');
    const c = t.conveyors[t.conveyors.length - 1], base = t.rotorPart(c.baseId);
    const bg = battery(1, [base.p.x, base.p.y + .09, base.p.z], true);
    check(t.weld({source:bg, target:base.g, position:bg.body.position.clone(), quaternion:bg.body.quaternion.clone()}), 'weld battery');
    check(t.conveyorEnsureSurfaces(c), 'belt surfaces');
    const surface = t.conveyorSurfacePoses(c)[0];
    const p = surface.p.vadd(surface.q.vmult(t.V(-surface.size.x*.2, surface.half.y+.05, 0)));
    const cargo = t.addQubit([p.x,p.y,p.z]);
    if (active) check(t.startConveyor(c), 'start belt: '+c.status);
    return {c, cargo};
  }
  function scene(kind, pieces, active = false) {
    check(pieces <= 2000, 'Do not raise the shipped piece limit');
    if (kind === 'welded') {
      const per = Math.ceil(pieces / 4);
      for (let i=0, left=pieces; left>0; i++, left-=per) plate(Math.min(per,left), [-3+(i%2)*4,.045,-3+Math.floor(i/2)*4], 20);
    } else if (kind === 'independent') {
      for (let i=0; i<pieces; i++) t.addQubit([-5+(i%45)*.22,.045,-5+Math.floor(i/45)*.22]);
    } else if (kind === 'many-mechanisms') {
      // Each standard rotor is two separate dynamic bodies and one real hinge.
      // At most 64 mechanisms; the remainder is distributed in welded ballast.
      const n = Math.min(64, Math.floor(pieces/4));
      for (let i=0; i<n; i++) {
        const r = check(t.spawnRotor(t.V(-4+(i%8)*1.1,.25,-4+Math.floor(i/8)*1.1),{mount:'wheel'}),'rotor fixture');
        if (active) check(t.configureRotor(r,{enabled:true}), 'start rotor');
      }
      if (count()<pieces) plate(pieces-count(),[-4,.045,5],32);
    } else if (kind === 'few-articulated') {
      // Four existing arms, each with four joints. Additional pieces stay on
      // their original chassis; weld preserves every collider and identity.
      const n = Math.min(4, Math.floor(pieces/26));
      if (!n) { plate(pieces,[-.4,.045,0]); return; }
      for (let i=0;i<n;i++) check(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V(-3+(i%2)*5,0,-3+Math.floor(i/2)*5)), 'arm fixture');
      const remaining=pieces-count();
      for (let i=0,left=remaining;i<n&&left>0;i++) {
        const size=Math.ceil(left/(n-i)), arm=t.robotArms[i], base=t.rotorPart(arm.baseId);
        const box=t.bounds(base.g);
        const g=plate(size,[box.max.x+.045,box.min.y+.045,box.min.z+.045],20);
        check(t.weld({source:g,target:base.g,position:g.body.position.clone(),quaternion:g.body.quaternion.clone()}),'arm chassis ballast');left-=size;
      }
      if (active) for (const r of t.rotors) check(t.configureRotor(r,{enabled:true}), 'start arm joint');
    } else if (kind === 'factory') {
      const n=Math.min(4,Math.floor(pieces/32));
      for(let i=0;i<n;i++)belt(-3+(i%2)*5,-2+Math.floor(i/2)*4,active);
      if(count()<pieces)distant(pieces-count(),20);
    } else throw new Error('Unknown fixture '+kind);
    check(count() === pieces, 'piece count '+count()+' != '+pieces);
  }
  function inventory() {
    const dynamic=t.world.bodies.filter(b=>b.type===1);
    return {
      pieces:count(), groups:t.groups.length, physicalBodies:t.world.bodies.length,
      dynamicBodies:dynamic.length, virtualGroups:t.groups.filter(g=>g.virtualConveyor).length,
      shapes:t.world.bodies.reduce((n,b)=>n+b.shapes.length,0), constraints:t.world.constraints.length,
      awakeBodies:dynamic.filter(b=>b.sleepState!==2).length, contacts:t.world.contacts.length,
      contactEquations:t.world.contacts.length, frictionEquations:t.world.frictionEquations.length,
      constraintEquations:t.world.constraints.reduce((n,c)=>n+c.equations.filter(e=>e.enabled).length,0),
      sensors:t.groups.reduce((n,g)=>n+g.parts.filter(p=>p.mood.workshop?.sensor===true).length,0),
      motors:t.rotors.length, activeMotors:t.rotors.filter(r=>r.enabled).length,
      physicsDt:t.getPhysicsStep()
    };
  }
  function state() {
    const v=b=>b.toArray(), data=t.saveLab({passive:true});
    const s=t.story.campaign?.production;
    const production=s?{ledger:s.ledger,entries:s.entries,buffer:s.buffer,packJob:s.packJob,
      started:s.started,complete:s.complete,failed:s.failed,reason:s.reason,time:s.time,
      autonomy:s.autonomy,joules:s.joules,meter:s.meter,forceJoules:s.forceJoules,
      receiver:Array.from(s.receiver,([g,dwell])=>({ids:g.parts.map(p=>p.id),dwell})),
      progress:t.story.progress}:null;
    return JSON.stringify({
      data,production,
      bodies:t.world.bodies.map(b=>({mass:b.mass,type:b.type,p:v(b.position),q:v(b.quaternion),v:v(b.velocity),w:v(b.angularVelocity),sleep:b.sleepState,force:v(b.force),torque:v(b.torque)})),
      motors:t.rotors.map(r=>({a:r.aId,b:r.bId,enabled:r.enabled,rpm:r.actualRpm,torque:r.actualTorque,phase:r.phase,reason:r.stopReason,pulses:r.sensorPulses})),
      belts:t.conveyors.map(c=>({running:c.running,phase:c.phase,speed:c.speed,load:c.load,status:c.status})),
      contacts:Array.from(t.contactStates), clocks:t.getTickState(), worldTime:t.world.time
    });
  }
  return {plate,distant,battery,heldCube,sensor,belt,scene,inventory,state,count};
}
module.exports=auditFixtures;
