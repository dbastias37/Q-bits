'use strict';
// These isolated station tests use legal production/credit fixtures to reach B.
// They exercise actual Cannon bodies, contact plates, mechanisms and durable
// bytes. They do not claim a complete player run through the arm and QR route.
const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');
const {fixture,memory,plain,near}=require('./galpon-chain-fixture.cjs');
test('the B arm blueprint consumes 18 real cubes and 8 real couplers and preserves the extraction crew',()=>{
  const f=fixture(),{t,s,w,G,build}=f,crew=[...s.initialIds],before=G.stats(s).mass;
  const arm=build('arm');assert(arm);assert.equal(arm.joints.length,4);
  const component=t.rotorConnectedGroups([t.rotorPart(arm.gripperId).g]),parts=component.flatMap(g=>g.parts);
  assert.equal(parts.filter(p=>p.shape==='cube').length,18);assert.equal(parts.filter(p=>p.shape==='coupler').length,8);
  assert.equal(parts.reduce((n,p)=>n+p.weight,0),26);assert(!parts.some(p=>crew.includes(p.id)));
  assert(crew.every(id=>G.record(s,id).place==='world'));assert.equal(G.population(s),4);
  assert.equal(t.robotArms.length,1);assert.equal(w.arms.length,1);assert.equal(t.buildHangarChainMechanism('arm'),false);
  assert.equal(G.stats(s).mass,before+26);assert(s.spent.assembly>=52);assert(s.spent.charge>26*15);
  assert.doesNotThrow(()=>G.validate(s));
});

test('the laser waits for real belt contact, consumes its original cube and emits six Cannon pyramids',()=>{
  const f=fixture(),{t,s,w,G,C,build,cableTo,manufacture,certify,place,bodySteps}=f;
  const belt=build('feedB');cableTo(belt.baseId);manufacture();
  assert(t.hangarChainMountLaser(),w.message);assert(t.hangarChainPowered('laser'));
  assert(t.startConveyor(belt));
  const port=t.conveyorPortWorld(belt,'exit'),g=certify(manufacture()),origin=g.parts[0].id;
  const centre=t.V(port.p.x-port.direction.x*.20,port.p.y+t.unitGroundHeight('cube')+.065,port.p.z-port.direction.z*.20);
  place(g,centre);bodySteps(45);
  assert(t.conveyorContactLoads(belt).some(v=>v.body===g.body),'input must physically rest on the active belt');
  assert(t.hangarChainStartStation('laser'),w.message);assert.equal(G.record(s,origin).place,'machine');assert.equal(t.rotorPart(origin),null);
  const energy=s.energyJ;C.tick(s,1.2,{powered:{laser:true,assembler:false},working:true});
  near(energy-s.energyJ,4);assert(t.hangarChainFinishStation('laser'),w.message);
  const fragments=s.records.filter(r=>r.origin===origin);assert.equal(fragments.length,6);assert(fragments.every(r=>r.kind==='pyramid'));
  assert(fragments.every(r=>t.rotorPart(r.id)?.g.body.world===t.world));near(fragments.reduce((n,r)=>n+r.weight,0),1);
  assert.equal(new Set(fragments.map(r=>r.path)).size,6);assert.doesNotThrow(()=>G.validate(s));
});

test('five intake contacts and one fallen sibling block the next cut until the assembler owns all six',()=>{
  // Prepare legal material/provenance at the ports, then use real Cannon
  // contacts to reproduce one missing sibling. This is a queue recovery fixture.
  const f=fixture(),{t,s,w,G,C,factory,feedRotor,manufacture,certify,place,bodySteps}=f;
  factory();manufacture();assert(t.hangarChainMountLaser(),w.message);
  const feed=feedRotor(),fallen=feed.pyramids[5],rested=fallen.body.position.clone();
  place(fallen,t.V(-3,.07,1.6));bodySteps();assert.equal(t.hangarChainFeedParts('pyramid').length,5);
  assert.equal(C.laserBacklog(s).pieces,6);assert.equal(C.laserBacklog(s).origins.length,1);
  const belt=t.conveyors.find(c=>c.baseId===w.belts.feedB);assert(t.startConveyor(belt));
  const port=t.conveyorPortWorld(belt,'exit'),input=certify(manufacture()),id=input.parts[0].id;
  place(input,t.V(port.p.x-port.direction.x*.20,port.p.y+t.unitGroundHeight('cube')+.065,port.p.z-port.direction.z*.20));
  bodySteps(45);assert(t.conveyorContactLoads(belt).some(hit=>hit.body===input.body));
  const energy=s.energyJ,ids=s.records.map(r=>r.id),serial=s.chain.serial;
  assert.equal(t.hangarChainStartStation('laser'),false);assert.match(w.message,/pirámides anteriores/);
  assert.equal(s.chain.jobs.laser,null);assert.equal(s.chain.serial,serial);assert.deepEqual(s.records.map(r=>r.id),ids);
  assert.equal(G.record(s,id).place,'world');near(s.energyJ,energy);
  place(fallen,rested);bodySteps();assert.equal(t.hangarChainFeedParts('pyramid').length,6);
  assert(t.hangarChainStartStation('assembler'),w.message);assert.equal(C.laserBacklog(s).blocked,false);
  assert(t.hangarChainStartStation('laser'),w.message);assert.equal(G.record(s,id).place,'machine');
  assert.doesNotThrow(()=>G.validate(s));
});

test('a saved laser reserves all six future identities before the next allocation in a fresh instance',()=>{
  const f=fixture(),{t,s,w,G,C,build,cableTo,manufacture,certify,place,bodySteps,storage}=f;
  const belt=build('feedB');cableTo(belt.baseId);manufacture();
  assert(t.hangarChainMountLaser(),w.message);assert(t.startConveyor(belt));
  const port=t.conveyorPortWorld(belt,'exit'),g=certify(manufacture()),origin=g.parts[0].id;
  place(g,t.V(port.p.x-port.direction.x*.20,port.p.y+t.unitGroundHeight('cube')+.065,port.p.z-port.direction.z*.20));
  bodySteps(45);assert(t.hangarChainStartStation('laser'),w.message);C.tick(s,.6,{powered:true,working:true});
  const expected=plain(s.chain.jobs.laser),energy=s.energyJ,save=t.saveCurrentGame();assert(save.ok,save.error);
  const loaded=createGame({graphics:false,storage}),r=loaded.t;r.story.ready=true;assert(r.continueHangarGame(),r.saveSession.message);
  assert.deepEqual(plain(r.story.galpon.chain.jobs.laser),expected);assert.equal(r.rotorPart(origin),null);
  const next=r.allocateUnitId();assert(next>Math.max(...expected.outputs.map(p=>p.id)),'pending laser outputs own their future IDs after loading');
  near(r.story.galpon.energyJ,energy);loaded.sandbox.QBitsGalponChain.tick(r.story.galpon,.6,{powered:true,working:true});
  assert(r.hangarChainFinishStation('laser'),r.getHangarChainWorld().message);
  const pieces=r.story.galpon.records.filter(v=>v.origin===origin);
  assert.equal(pieces.length,6);assert(pieces.every(p=>r.rotorPart(p.id)?.g.body.world===r.world));
  assert.equal(r.hangarChainFinishStation('laser'),false);assert.doesNotThrow(()=>G.validate(r.story.galpon));
});

test('stored return evidence survives a retired cargo ID and reload with its six current pyramids',()=>{
  // This fixture prepares a coherent already-observed delivery. It exercises
  // durable evidence and the real drone/material snapshots, not another flight.
  const f=fixture(),{t,s,w,G,C,build,manufacture,reconfigure,storage}=f;
  const drone=build('drone'),tool=drone.parts.find(p=>p.mood.gripper);assert(tool);
  const input=manufacture(),origin=input.parts[0].id;assert(C.reintroduce(s,[origin]));
  C.cool(s,[origin],.5,{second:true,powered:true});const pieces=reconfigure(input,'divide');
  assert.equal(G.record(s,origin),null);assert.equal(pieces.length,6);
  const evidence={ids:[origin],origins:[origin],method:'drone',toolId:tool.id,origin:[drone.body.position.x,0,drone.body.position.z],
    wired:false,repeated:false,age:.2,settled:.2,zone:'second-cooler'};
  w.returning.push(evidence);const energy=s.energyJ,save=t.saveCurrentGame();assert(save.ok,save.error);
  const fresh=createGame({graphics:false,storage}),r=fresh.t;r.story.ready=true;assert(r.continueHangarGame(),r.saveSession.message);
  const restored=r.story.galpon,chain=fresh.sandbox.QBitsGalponChain,world=r.getHangarChainWorld();
  assert.deepEqual(plain(world.returning),[plain(evidence)]);assert.equal(r.rotorPart(origin),null);
  assert(pieces.every(g=>r.rotorPart(g.parts[0].id)));assert(r.rotorPart(tool.id).part.mood.gripper);
  assert(chain.noteReturn(restored,{origins:[origin],toolId:tool.id,powered:true,returned:true}));
  assert(chain.noteReturn(restored,{origins:[origin],toolId:tool.id,powered:true,returned:true}));
  assert.equal(chain.status(restored).droneDelivered,1);assert.equal(chain.status(restored).stabilized,1);
  near(restored.energyJ,energy);assert.doesNotThrow(()=>G.validate(restored));
});

test('two physical assembler inputs wait at a blocked output, form one hinge and enter one family exactly once',()=>{
  const f=fixture(),{t,s,w,G,C,factory,feedRotor,manufacture,place,bodySteps,credited,certify}=f;
  credited.slice(0,3).forEach(certify);assert(C.beginOrder(s));factory();
  const feed=feedRotor();assert(t.hangarChainStartStation('assembler'),w.message);
  const job=s.chain.jobs.assembler,ids=[...job.inputIds],out=job.outputs[0].p;
  const blocker=manufacture('cube',t.V(out.x,out.y,out.z));C.tick(s,2,{powered:{assembler:true,laser:false},working:true});
  const paid=s.energyJ;assert.equal(t.hangarChainFinishStation('assembler'),false);assert(C.ready(s,'assembler'));
  assert(ids.every(id=>G.record(s,id).place==='machine'));assert.equal(s.chain.products.length,0);
  assert.equal(t.hangarChainRemoveAssembler(),false);assert.equal(t.hangarChainPlaceAssembler(t.V(1,0,-2)),false);
  C.tick(s,2,{powered:true,working:true});near(s.energyJ,paid);
  place(blocker,t.V(-3,.07,3));assert(t.hangarChainFinishStation('assembler'),w.message);
  const product=s.chain.products[0],rotor=t.rotors.find(r=>product.partIds.includes(r.aId)&&product.partIds.includes(r.bId));
  assert(rotor);assert.equal(rotor.enabled,false);assert.deepEqual([...product.origins].sort((a,b)=>a-b),feed.origins.sort((a,b)=>a-b));
  bodySteps(120);assert(t.hangarChainReceiveProduct(product),w.message);
  assert.equal(C.status(s).total,1);assert.equal(t.families.length,1);assert.equal(t.families[0].count,2);
  assert(product.partIds.every(id=>t.families[0].partIds.has(id)));assert.equal(t.hangarChainReceiveProduct(product),false);
  assert(t.families[0].items[0].joints.length===1);assert.doesNotThrow(()=>G.validate(s));
});

test('a failed physical rotor joint restores the paid reservation; retry cannot duplicate either origin',()=>{
  const f=fixture(),{t,s,w,G,C,factory,feedRotor}=f;factory();feedRotor();
  assert(t.hangarChainStartStation('assembler'),w.message);C.tick(s,2,{powered:true,working:true});
  const job=s.chain.jobs.assembler,goodQ=plain(job.outputs[1].q),ids=[...job.inputIds],energy=s.energyJ;
  job.outputs[1].q={x:0,y:0,z:0,w:1};
  assert.equal(t.hangarChainFinishStation('assembler'),false);assert(C.ready(s,'assembler'));
  assert.equal(s.chain.products.length,0);assert(ids.every(id=>G.record(s,id)?.place==='machine'));
  assert(ids.every(id=>!t.rotorPart(id)));near(s.energyJ,energy);assert.doesNotThrow(()=>G.validate(s));
  s.chain.jobs.assembler.outputs[1].q=goodQ;assert(t.hangarChainFinishStation('assembler'),w.message);
  assert.equal(s.chain.products.length,1);assert.equal(s.records.filter(r=>r.kind==='coupler'&&s.chain.products[0].origins.includes(r.origin)).length,2);
  near(s.energyJ,energy);assert.doesNotThrow(()=>G.validate(s));
});

test('a physical pending assembler survives durable save and reload with its paid time and single input custody',()=>{
  const f=fixture(),{t,s,w,G,C,factory,feedRotor,storage}=f;factory();feedRotor();
  assert(t.hangarChainStartStation('assembler'),w.message);C.tick(s,.75,{powered:true,working:true});
  const expected=plain(s.chain.jobs.assembler),energy=s.energyJ,save=t.saveCurrentGame();assert(save.ok,save.error);
  const loaded=createGame({graphics:false,storage}),r=loaded.t;r.story.ready=true;
  assert(r.continueHangarGame(),r.saveSession.message);assert.deepEqual(plain(r.story.galpon.chain.jobs.assembler),expected);
  near(r.story.galpon.energyJ,energy);assert(expected.inputIds.every(id=>!r.rotorPart(id)));
  const c2=loaded.sandbox.QBitsGalponChain;c2.tick(r.story.galpon,1.25,{powered:true,working:true});
  assert(r.hangarChainFinishStation('assembler'),r.getHangarChainWorld().message);assert.equal(r.story.galpon.chain.products.length,1);
  assert.equal(r.hangarChainFinishStation('assembler'),false);assert.doesNotThrow(()=>G.validate(r.story.galpon));
});

test('inputs can settle and sleep while power is off; reconnecting detects the observed support without proximity credit',()=>{
  const f=fixture(),{t,s,w,G,factory,feedRotor,source,place,bodySteps}=f;
  factory();const reservoir=source();reservoir.enabled=false;
  const feed=feedRotor();assert.equal(feed.a.body.sleepState,2);assert(feed.pyramids.every(g=>g.body.sleepState===2));
  const energy=s.energyJ;assert.equal(t.hangarChainStartStation('assembler'),false);near(s.energyJ,energy);
  // An old support cannot become a proximity check after the same body moves.
  const rested=feed.a.body.position.clone();place(feed.a,t.V(rested.x,rested.y+.15,rested.z));bodySteps(1);
  assert.equal(t.hangarChainFeedParts('cube').length,0);
  reservoir.enabled=true;t.updatePowerNetwork(0);assert.equal(t.hangarChainStartStation('assembler'),false);
  place(feed.a,rested);bodySteps();assert.equal(feed.a.body.sleepState,2);
  assert(t.hangarChainStartStation('assembler'),w.message);
  assert(s.chain.jobs.assembler.inputIds.every(id=>G.record(s,id).place==='machine'));assert.doesNotThrow(()=>G.validate(s));
});

test('an isolated physical factory receives 80 articulated products into bounded families and saves all 160 material IDs',()=>{
  const f=fixture(),{t,s,w,G,C,factory,feedRotor,credited,certify,bodySteps}=f;
  credited.slice(0,3).forEach(certify);assert(C.beginOrder(s));factory();
  const startingMass=G.stats(s).mass,created=new Set(),baseBodies=t.world.bodies.length;let peakBodies=baseBodies;
  for(let i=0;i<80;i++) {
    feedRotor();assert(t.hangarChainStartStation('assembler'),w.message);
    C.tick(s,2,{powered:true,working:true});assert(t.hangarChainFinishStation('assembler'),w.message);
    const product=s.chain.products.at(-1);product.partIds.forEach(id=>{assert(!created.has(id));created.add(id);});
    peakBodies=Math.max(peakBodies,t.world.bodies.length);
    bodySteps(100);assert(t.hangarChainReceiveProduct(product),w.message);
    assert.equal(C.status(s).total,i+1);assert(t.families.every(family=>family.count<=100));
    if(i%20===19)assert.doesNotThrow(()=>G.validate(s));
  }
  assert.equal(created.size,160);assert.equal(t.families.length,2);
  assert.equal(t.families.reduce((n,family)=>n+family.count,0),160);
  assert.equal(t.families.reduce((n,family)=>n+family.items.reduce((sum,item)=>sum+item.joints.length,0),0),80);
  assert.equal(t.families.reduce((n,family)=>n+family.weight,0),160);
  assert.equal(C.status(s).completed,true);near(G.stats(s).mass,startingMass+160);
  assert(peakBodies<=baseBodies+12,'received products must be compressed into bounded families');
  const save=t.saveCurrentGame();assert(save.ok,save.error);
  assert.equal(save.save.data.production.chain.order.receivedIds.length,80);
  assert.equal(save.save.data.snapshot.families.reduce((n,family)=>n+family.items.length,0),80);
});

test('both actual feed conveyors deliver their inputs, including all six laser fragments, to the assembler ports',()=>{
  const f=fixture(),{t,s,w,G,C,factory,manufacture,certify,credited,place}=f;
  credited.slice(0,3).forEach(certify);factory();manufacture();assert(t.hangarChainMountLaser(),w.message);
  assert(C.beginOrder(s));
  const feeds=['feedA','feedB'].map(key=>t.conveyors.find(c=>c.baseId===w.belts[key]));
  feeds.forEach(c=>assert(t.startConveyor(c)));
  const inputs=feeds.map(c=>{
    const g=certify(manufacture('cube',t.V(-4,.07,1.7))),entry=t.conveyorPortWorld(c,'entry');
    place(g,t.V(entry.p.x+entry.direction.x*.08,entry.p.y+t.unitGroundHeight('cube')+.065,entry.p.z+entry.direction.z*.08));return g.parts[0].id;
  });
  let sawCut=false,sawReservation=false,allSixAtPort=false;
  for(let frame=0;frame<1800&&!s.chain.products.some(p=>p.received);frame++) {
    t.stepSimulation(1/60);
    sawCut ||= !!s.chain.jobs.laser;
    sawReservation ||= !!s.chain.jobs.assembler;
    allSixAtPort ||= t.hangarChainFeedParts('pyramid').filter(g=>G.record(s,g.parts[0].id).origin===inputs[1]).length===6 || !!s.chain.jobs.assembler;
  }
  const diagnostics=JSON.stringify({message:w.message,products:plain(s.chain.products),jobs:plain(s.chain.jobs),inputs:inputs.map(id=>({id,records:s.records.filter(r=>r.origin===id).map(r=>({id:r.id,kind:r.kind,place:r.place,p:t.rotorPart(r.id)?.g.body.position}))})),feed:feeds.map(c=>({running:c.running,status:c.status,load:c.load,speed:c.speed}))});
  assert(sawCut,diagnostics);assert(allSixAtPort,diagnostics);assert(sawReservation,diagnostics);
  assert.equal(s.chain.products.filter(p=>p.received).length,1,diagnostics);assert.equal(C.status(s).total,1);
  assert.equal(t.families.reduce((n,family)=>n+family.count,0),2);assert.doesNotThrow(()=>G.validate(s));
});
