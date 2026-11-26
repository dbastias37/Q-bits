'use strict';
// Isolated paid fixture, not an end-to-end mission. A receipts, manufacture,
// initial empty-equipment placement and queue inputs are explicit fixtures.
// The tower uses normal welds; the arm rests on it as a separate mechanism.
// The destination feed is stopped to isolate the arm's complete duty cycle.
// Mission supports stay untouched, and every payload transfer uses motors,
// the real gripper and Cannon. No body/energy writes occur during a carry.
const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,plain,near}=require('./galpon-chain-fixture.cjs');
function run(hz,context){
const count=3,layers=8,f=fixture(),{t,sandbox,s,w,G,C}=f;
const arm=f.build('arm'),feedA=f.build('feedA'),feedB=f.build('feedB');assert(t.hangarChainPlaceAssembler(),w.message);
const fixtures=w.fixtures.map(x=>({p:plain(x.p),body:plain(x.body.position)})),initial=t.robotKinematics(arm),base=t.rotorPart(arm.baseId).g,pivot=t.V(4.05,.225+.09*layers,-.35),delta=pivot.vsub(initial.chain[0].pivot),beforeTower=s.energyJ;
let tower=null;const towerIds=[];
for(let y=0;y<layers;y++)for(let x=0;x<4;x++)for(let z=0;z<3;z++){
 const cube=f.manufacture('cube',t.V(pivot.x+.09*x-.18,.045+.09*y,pivot.z+.09*(z-1)));towerIds.push(cube.parts[0].id);
 tower=tower?t.weld({source:cube,target:tower,position:cube.body.position.clone(),quaternion:cube.body.quaternion.clone()},{sound:false}):cube;assert(tower);
}
const towerJ=beforeTower-s.energyJ;t.stopRobotArm(arm,'Colocación del equipo sobre la torre pagada');
for(const g of t.rotorConnectedGroups([base])){g.body.position.vadd(delta,g.body.position);g.body.velocity.set(0,0,0);g.body.angularVelocity.set(0,0,0);g.body.aabbNeedsUpdate=true;g.body.wakeUp();}
let sawTowerContact=false;const contactAt=[];
function observeSupport(){if(t.world.contacts.some(c=>c.bi===base.body&&c.bj===tower.body||c.bj===base.body&&c.bi===tower.body)){if(!sawTowerContact)contactAt.push(t.getSimTime());sawTowerContact=true;}}
for(let i=0;i<4;i++){t.stepSimulation(1/hz);observeSupport();}
const source=f.source(),from={kind:'reservoir',id:source.id},to={kind:'part',id:arm.baseId},a=t.powerPort(from),b=t.powerPort(to),wire=Array.from({length:8},()=>f.manufacture()).flatMap(g=>t.worldParts(g));
const cable=t.connectPowerCable(from,to,[t.V(a.x,1.4,a.z),t.V(b.x,1.4,a.z),t.V(b.x,1.4,b.z)],wire);assert(cable.ok,cable.error);
const loads=Array.from({length:count},(_,i)=>f.manufacture('cube',i===0?t.V(4.04,.620,.45):null));assert(C.reintroduce(s,[loads[0].parts[0].id]));
const hit=t.rotorPart(arm.gripperId);t.setSelected({g:hit.g,part:hit.part});
function teach(name,p,heightCm){
 sandbox.document.pointerLockElement=t.canvas;assert(t.robotPanelAction('pose',{pose:name,heightCm}).ok);
 const camera=[p.x,p.y+.85,p.z+.7];t.setLook({camera,yaw:0,pitch:Math.atan2(p.y-camera[1],.7)});t.updateRobotPoseDraft(1,true);const draft=t.getRobotPoseDraft();assert(draft.solution?.pose,draft.reason);
 t.canvas.dispatchEvent({type:'mousedown',button:0});t.resumeGame();t.hideStoryDialogue();
}
teach('pick',t.V(4.04,.665,.45),4.5);teach('place',t.V(4.2,.575,-1.1),18.5);
for(let joint=0;joint<4;joint++)assert(t.robotPanelAction('motor',{joint,rpm:12,maxTorque:4,capacity:64}).ok);
assert(t.configureRobotArm(arm,{repeat:true}));assert(t.startRobotArm(arm),arm.status);
const cells=t.robotArmRotors(arm).flatMap(r=>[t.rotorPart(r.aId).part,t.rotorPart(r.bId).part]).concat(t.rotorPart(arm.gripperId).part),charge=cells.map(p=>p.mood.energy),ids=plain(s.records.map(r=>r.id)),start=t.getSimTime(),energy=s.energyJ,spentBefore=plain(s.spent),rows=[];let peakMotorWatts=0;
function step(){t.stepSimulation(1/hz);observeSupport();peakMotorWatts=Math.max(peakMotorWatts,t.robotArmRotors(arm).reduce((n,r)=>n+(r.power?.inputWatts||0),0));}
function until(predicate,seconds,label){for(let i=0;i<Math.ceil(seconds*hz);i++){step();if(predicate())return;}assert.fail(label+': '+arm.status+' '+JSON.stringify({state:arm.state,p:plain(t.robotKinematics(arm).point),load:loads.map(g=>plain(g.body.position))}));}
for(let index=0;index<count;index++){
 if(index){f.place(loads[index],t.V(4.04,.620,.45));assert(C.reintroduce(s,[loads[index].parts[0].id]));}
 const at=t.getSimTime(),reserve=s.energyJ,load=loads[index],id=load.parts[0].id;
 until(()=>arm.cycles===index+1&&s.chain.traces[id].feed,40,'the actual load must reach B');
 assert.equal(t.hangarChainZone(load),'feed');assert(s.chain.traces[id].second);assert.equal(s.chain.traces[id].lastMethod,'arm');assert.equal(load.parts[0].id,id);near(load.parts[0].weight,1);
 const arrived=t.getSimTime(),arrivalJ=reserve-s.energyJ,position=plain(load.body.position);
 until(()=>arm.state==='wait'&&!t.robotGrips.has(arm.gripperId),30,'return and park');
 rows.push({id,arrivalSeconds:arrived-at,arrivalJ,fullCycleSeconds:t.getSimTime()-at,fullCycleJ:reserve-s.energyJ,position});
 // Explicit output queue fixture, after release and completed empty return.
 if(index<count-1)f.place(load,t.V(-4,.045,1.6+index*.2));
}
assert.deepEqual(plain(s.records.map(r=>r.id)),ids);assert.deepEqual(w.fixtures.map(x=>({p:plain(x.p),body:plain(x.body.position)})),fixtures);assert.doesNotThrow(()=>G.validate(s));
cells.forEach((p,i)=>near(p.mood.energy,charge[i]));assert(sawTowerContact,'Cannon must observe the arm resting on the paid tower');
const spent=Object.fromEntries(Object.entries(s.spent).map(([key,value])=>[key,value-spentBefore[key]]));near(spent.cooling,6);near(spent.transport+spent.cooling,energy-s.energyJ);
const result={scope:'Paid isolated construction and transport fixture; native welds for a separate tower; initial empty arm placement and staged inputs/outputs are explicit fixtures; not mission E2E',hz,towerUnits:towerIds.length,towerHeightMetres:.09*layers,towerJ,initialPivot:plain(pivot),finalPivot:plain(t.robotKinematics(arm).chain[0].pivot),rows,seconds:t.getSimTime()-start,sourceSpentJ:energy-s.energyJ,spent,peakMotorWatts,contactAt,fixturesUnchanged:true,identitiesUnchanged:true,internalChargeUnchanged:true,cycles:arm.cycles};
assert(arm.running);assert.equal(arm.state,'wait');assert(arm.pin);assert(t.robotArmRotors(arm).every(r=>!r.enabled));
context.diagnostic(JSON.stringify(result));
}

for(const hz of [60,120])test('a paid independent pedestal supports three cold-to-feed arm cycles with intact mission fixtures at '+hz+' Hz',context=>run(hz,context));
