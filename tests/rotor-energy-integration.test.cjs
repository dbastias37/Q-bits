const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle',progress:{}});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function energies(t,r){return [r.aId,r.bId].map(id=>t.rotorPart(id).part.mood.energy);}
function step(t,n=240){for(let i=0;i<n;i++)t.stepPhysics(1/240);}

test('powered rotor uses both actual energy bars without simultaneous passive recovery',()=>{
 const {t}=lab(),r=t.spawnRotor(t.V(0,.4,0),{mount:'fixed'}),before=energies(t,r);
 assert(t.configureRotor(r,{enabled:true}));step(t);
 const after=energies(t,r);assert(after.every((e,i)=>e<before[i]));assert(r.power.inputWatts>0);assert(r.power.drainPerSecond>0);
 t.configureRotor(r,{enabled:false});step(t);assert(energies(t,r).every((e,i)=>e>after[i]));assert.equal(t.rotorPowerState(r).inputWatts,0);
});
test('one empty enganche stops the motor, keeps the joint and requires manual restart',()=>{
 const {t}=lab(),r=t.spawnRotor(t.V(0,.4,0),{mount:'fixed'});
 t.rotorPart(r.aId).part.mood.energy=.000002;t.rotorPart(r.bId).part.mood.energy=.6;
 assert(t.configureRotor(r,{enabled:true}));t.stepPhysics(1/16);
 assert.equal(r.enabled,false);assert.equal(r.stopReason,'empty');assert.equal(r.constraint.motorEquation.enabled,false);
 assert.equal(energies(t,r)[0],0,'no recharge in the same powered step');assert(energies(t,r)[1]>.59);
 assert.equal(t.rotors.length,1);step(t,240);assert(energies(t,r)[0]>0);assert.equal(r.enabled,false);
});
test('capacity counts weighted connected pieces and stops an already running motor',()=>{
 const {t}=lab(),r=t.spawnRotor(t.V(0,.4,0),{capacity:2,mount:'fixed'});
 assert.equal(t.rotorPowerState(r).load,2);assert(t.configureRotor(r,{enabled:true}));
 t.rotorPart(r.aId).part.weight=2;step(t,1);
 assert.equal(r.enabled,false);assert.equal(r.stopReason,'overload');assert.equal(t.rotorPowerState(r).load,3);
 assert.equal(t.configureRotor(r,{enabled:true}),false,'cannot bypass a load cutoff by toggling');
 assert(t.configureRotor(r,{capacity:4,enabled:true}));assert.equal(r.enabled,true);
});
test('Q menu freezes rotor energy along with world simulation',()=>{
 const game=lab(),{t,sandbox}=game,r=t.spawnRotor(t.V(0,.4,0));t.configureRotor(r,{enabled:true});
 const before=energies(t,r),time=t.getSimTime();sandbox.document.dispatchEvent({type:'keydown',code:'KeyQ',repeat:false});
 assert(t.radialOpen());for(let i=0;i<10;i++)game.frame(1000+i*50);
 assert.deepEqual(energies(t,r),before);assert.equal(t.getSimTime(),time);
});
test('motor bank exposes mount, torque, capacity, demand and real speed',()=>{
 const game=lab(),{t,sandbox}=game,r=t.spawnRotor();const node=id=>sandbox.document.querySelector('#'+id);
 for(const [id,value,type]of [['rotor-mount','fixed','change'],['rotor-torque','0.8','input'],['rotor-capacity','24','input']]){node(id).value=value;node(id).dispatchEvent({type});}
 assert.equal(r.mount,'fixed');assert.equal(r.maxTorque,.8);assert.equal(r.capacity,24);
 node('rotor-clockwise').dispatchEvent({type:'click'});step(t,30);t.updateMechanismPanel();
 assert.match(node('rotor-power-readout').textContent,/Carga conectada.*batería mínima/);
 assert.match(node('rotor-technical-readout').textContent,/Energía A.*B.*consumo.*Carga.*Torque usado.*Giro real/);
 assert.match(node('rotor-technical-readout').textContent,/24 u/);
});

test('depleting one rotor does not skip another motor\'s energy bill or recharge its active Enganches',()=>{
 const {t}=lab();
 const first=t.spawnRotor(t.V(-.5,.4,0),{mount:'fixed'}),second=t.spawnRotor(t.V(.5,.4,0),{mount:'fixed'});
 t.rotorPart(first.aId).part.mood.energy=.000002;t.rotorPart(first.bId).part.mood.energy=.6;
 for(const id of [second.aId,second.bId])t.rotorPart(id).part.mood.energy=.6;
 assert(t.configureRotor(first,{enabled:true}));assert(t.configureRotor(second,{enabled:true}));
 t.stepPhysics(1/16);
 assert.equal(first.enabled,false);assert.equal(first.stopReason,'empty');
 assert.equal(first.pin,null,'cutoff releases a fixed base');
 assert(t.rotorGroups(first).every(g=>g.body.type===1&&!g.body.fixedRotation),'cutoff restores dynamic rigid bodies');
 assert.equal(energies(t,first)[0],0,'the depleted battery stays empty through the final powered frame');
 assert.equal(second.enabled,true);assert(second.powerActive,'other powered motors retain their per-step accounting');
 assert(second.power.drainPerSide>0);
 for(const [i,value]of energies(t,second).entries())assert(Math.abs(value-(.6-(i?second.power.drainB:second.power.drainA)))<1e-12,'both active batteries pay exactly their own model draw without passive recovery');
});
