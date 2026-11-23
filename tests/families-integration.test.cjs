// Real game and Cannon with DOM/GPU stubs. These are functional tests, not visual QA.
const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

const plain = value => JSON.parse(JSON.stringify(value));
const itemParts = items => items.flatMap(item => item.groups.flatMap(group => group.parts));
const familyCount = family => itemParts(family.items).length;
function inventory(t) {
  return plain([
    ...t.groups.flatMap(t.worldParts),
    ...t.families.flatMap(family => itemParts(family.items)),
    ...t.disassemblyJobs.flatMap(job => job.parts.slice(job.cursor))
  ].map(part => ({id:part.id,shape:part.shape,weight:part.weight,mood:part.mood})))
    .sort((a,b) => a.id-b.id);
}
function lab() {
  const game = createGame();
  game.t.clearNarrativeScene();
  Object.assign(game.t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
  game.t.canvas.requestPointerLock=()=>{game.sandbox.document.pointerLockElement=game.t.canvas;game.sandbox.document.dispatchEvent({type:'pointerlockchange'});};
  game.sandbox.document.pointerLockElement = game.t.canvas;
  game.sandbox.document.body.dataset.booting = 'false';
  game.t.setRunning(true);
  return game;
}
function pieces(t,count,{mixed=false,compound=false}={}) {
  const records = Array.from({length:count},(_,i) => ({
    id:t.allocateUnitId(),shape:mixed?['cube','tetra','pyramid','coupler'][i%4]:'cube',
    weight:1+(i%7)/10,p:t.V(1.5+(i%40)*.13,.07,-1.5+Math.floor(i/40)*.13),q:t.Q(),
    mood:{name:'Pieza '+i,energy:.19+(i%11)/20,matter:{root:100000+i,rootWeight:1+(i%7)/10,path:'',name:'Origen '+i}}
  }));
  return compound?[t.makeGroup(records)]:records.map(part => t.makeGroup([part]));
}
function finishVisuals(t) { for(let i=0;i<30;i++)t.updateFamilies(1/30); }
function finishGrouping(t) {
  let passes=0;
  while(t.getFamilyGroupingJob?.()&&passes++<10000)t.advanceFamilyGrouping();
  assert.equal(t.getFamilyGroupingJob?.()||null,null,'family preparation must finish');
}
function group(t,members,options={}) {
  const made=t.groupIntoFamilies(members,{name:'Drones',color:'#e0bc45',...options});
  assert(Array.isArray(made)&&made.length,'grouping creates families');
  finishVisuals(t);
  return made;
}
const hit=(t,x=4,z=-3)=>({point:t.V(x,0,z),normal:t.V(0,1,0)});

test('a named mixed family preserves matter and replaces its pieces with one simple physical body',()=>{
  const {t}=lab(),empty=t.world.bodies.length,members=pieces(t,32,{mixed:true}),before=inventory(t),mass=members.reduce((sum,g)=>sum+g.body.mass,0);
  const [family]=group(t,members,{name:'Drones amarillos',color:'#000000'});
  assert.equal(t.groups.length,0);
  assert.equal(t.families.length,1);
  assert.equal(familyCount(family),32);
  assert.equal(family.name,'Drones amarillos');
  assert.equal(family.color,'#000000');
  assert.equal(t.world.bodies.length,empty+1);
  assert.equal(family.body.shapes.length,1);
  assert(Math.abs(family.body.mass-mass)<1e-9);
  assert.equal(t.scenePartCount(),32);
  assert.equal(t.familyInventoryCount(),32);
  assert.deepEqual(inventory(t),before);
});

test('families respect 100 base pieces per container and retain a complete inventory',()=>{
  const {t}=lab(),members=pieces(t,201),before=inventory(t),empty=t.world.bodies.length-members.length;
  const made=group(t,members);
  assert.deepEqual(Array.from(made,familyCount).sort((a,b)=>a-b),[1,100,100]);
  assert.equal(t.world.bodies.length,empty+3);
  assert.equal(t.scenePartCount(),201);
  assert.deepEqual(inventory(t),before);
});

test('disassembling by type creates homogeneous families without making loose physical fragments',()=>{
  const {t}=lab(),members=pieces(t,40,{mixed:true,compound:true}),before=inventory(t),empty=t.world.bodies.length-1;
  const made=group(t,members,{disassemble:true,byType:true});
  assert.equal(made.length,4);
  for(const family of made)assert.equal(new Set(itemParts(family.items).map(part=>part.shape)).size,1);
  assert.equal(t.groups.length,0);
  assert.equal(t.world.bodies.length,empty+4);
  assert.deepEqual(inventory(t),before);
});

test('splitting into tens and merging only moves inventory and rejects capacity overflow',()=>{
  const {t}=lab(),[family]=group(t,pieces(t,37)),before=inventory(t);
  const split=t.splitFamily(family,10);
  assert(Array.isArray(split)&&split.length===4);
  finishVisuals(t);
  assert.deepEqual(Array.from(t.families,familyCount).sort((a,b)=>a-b),[7,10,10,10]);
  assert.equal(t.groups.length,0);
  assert.deepEqual(inventory(t),before);
  const target=t.families[0],sources=t.families.slice(1);
  for(const source of sources){assert.equal(t.mergeFamilies(target,source),true);finishVisuals(t);}
  assert.equal(t.families.length,1);
  assert.equal(familyCount(target),37);
  assert.deepEqual(inventory(t),before);
  const [large]=group(t,pieces(t,70),{name:'Otra familia',color:'#3366ee'}),snapshot=inventory(t);
  assert.equal(t.mergeFamilies(target,large),false);
  assert.deepEqual(inventory(t),snapshot);
  assert.equal(familyCount(target),37);
  assert.equal(familyCount(large),70);
});

test('withdrawal uses the placement preview and cancellation leaves all content and energy intact',()=>{
  const {t}=lab(),[family]=group(t,pieces(t,12)),before=inventory(t);
  assert.equal(t.beginFamilyPlacement(family,'withdraw',1),true);
  assert(t.getFamilyPlacement());
  t.updateFamilyPlacement(hit(t));
  assert.equal(t.groups.length,0,'preview must not instantiate a real piece');
  assert.equal(familyCount(family),12);
  t.cancelFamilyPlacement();
  assert.equal(t.getFamilyPlacement(),null);
  assert.deepEqual(inventory(t),before);
  assert.equal(t.beginFamilyPlacement(family,'withdraw',1),true);
  assert.equal(t.updateFamilyPlacement(hit(t)),true);
  assert(t.confirmFamilyPlacement(hit(t)));
  finishVisuals(t);
  assert.equal(t.groups.length,1);
  assert.equal(familyCount(family),11);
  assert.equal(t.scenePartCount(),12);
  assert.deepEqual(inventory(t),before);
});

test('an obstacle inserted after preview prevents withdrawal without losing the reserved item',()=>{
  const {t}=lab(),[family]=group(t,pieces(t,4)),before=inventory(t),target=hit(t);
  assert(t.beginFamilyPlacement(family,'withdraw',1));
  assert(t.updateFamilyPlacement(target));
  t.storyWall(t.V(target.point.x,.3,target.point.z),t.V(.4,.3,.4));
  assert.equal(t.confirmFamilyPlacement(target),null);
  assert.equal(t.groups.length,0);
  assert.equal(familyCount(family),4);
  assert.deepEqual(inventory(t),before);
  t.cancelFamilyPlacement();
});

test('moving a family commits only its pose and cancellation preserves the original pose',()=>{
  const {t}=lab(),[family]=group(t,pieces(t,5)),before=inventory(t),original=family.body.position.clone();
  assert(t.beginFamilyPlacement(family,'move'));
  assert(t.updateFamilyPlacement(hit(t)));
  t.cancelFamilyPlacement();
  assert(family.body.position.almostEquals(original,1e-10));
  assert(t.beginFamilyPlacement(family,'move'));
  assert(t.updateFamilyPlacement(hit(t)));
  assert(t.confirmFamilyPlacement(hit(t)));
  assert(Math.abs(family.body.position.x-4)<.15);
  assert(Math.abs(family.body.position.z+3)<.15);
  assert.equal(t.families.length,1);
  assert.deepEqual(inventory(t),before);
});

test('lab snapshot hydration and restoration retain families, names, colors, energy and unique IDs',()=>{
  const {t}=lab();
  group(t,pieces(t,24,{mixed:true}),{name:'Bodega amarilla',color:'#e1c247'});
  const before=inventory(t),saved=t.hydrateLabSnapshot(plain(t.saveLab())),records=plain(t.serializeFamilies());
  assert.equal(saved.families.length,1);
  t.clearNarrativeScene();
  assert.equal(t.families.length,0);
  t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);
  assert.deepEqual(inventory(t),before);
  assert.deepEqual(plain(t.serializeFamilies()),records);
  assert(t.allocateUnitId()>Math.max(...before.map(part=>part.id)));
});

test('duplicate IDs across a family and live pieces fail hydration before replacing a scene',()=>{
  const {t}=lab();group(t,pieces(t,3));
  const snapshot=plain(t.saveLab()),before=inventory(t),p=plain(snapshot.families[0].items[0].groups[0].parts[0]);
  snapshot.groups.push({parts:[p],q:[0,0,0,1],v:[0,0,0],w:[0,0,0]});
  assert.throws(()=>t.hydrateLabSnapshot(snapshot));
  assert.deepEqual(inventory(t),before);
});

test('stored pieces still occupy the room limit and clearing a scene retires all family bodies',()=>{
  const game=lab(),{t}=game,empty=t.world.bodies.length,members=pieces(t,2000,{compound:true}),before=inventory(t);
  const made=group(t,members,{disassemble:true});
  assert.equal(made.length,20);
  assert.equal(t.scenePartCount(),2000);
  assert.equal(t.world.bodies.length,empty+20);
  assert.deepEqual(inventory(t),before);
  t.spawnQubit('cube');
  assert.equal(t.scenePartCount(),2000);
  assert.equal(t.groups.length,0);
  t.clearNarrativeScene();
  assert.equal(t.families.length,0);
  assert.equal(t.scenePartCount(),0);
  assert.equal(t.world.bodies.length,empty);
});

test('campaign families use existing resources and are cleared when the checkpoint level restarts',()=>{
  const {t}=lab();t.beginCampaignLevel(8);t.hideStoryDialogue();
  const guide=t.groups.find(g=>g.parts.some(part=>part.id===t.story.guideId));
  assert(guide);
  const initial=inventory(t);
  assert.equal(t.groupIntoFamilies([guide]),null,'the narrative guide remains available');
  assert.deepEqual(inventory(t),initial);
  const members=t.groups.filter(g=>g!==guide&&!g.cooler&&!g.haulJob&&!g.route).slice(0,2);
  assert(members.length>0);
  group(t,members,{name:'Familia de campaña',color:'#cc5533'});
  assert.deepEqual(inventory(t),initial);
  t.beginCampaignLevel(8);
  assert.equal(t.families.length,0,'checkpoint restart must not add stored matter to fresh level resources');
});

test('families cannot absorb active puzzle resources or in-progress production and construction',()=>{
  const {t}=lab(),members=pieces(t,3),before=inventory(t);
  t.puzzle.active=true;assert.equal(t.groupIntoFamilies(members),null);t.puzzle.active=false;
  members[0].blueprintJob={};assert.equal(t.groupIntoFamilies(members),null);delete members[0].blueprintJob;
  members[0].parts[0].mood.production={batch:7,kind:'A',role:'stock'};
  assert.equal(t.groupIntoFamilies(members),null);delete members[0].parts[0].mood.production;
  assert.deepEqual(inventory(t),before);
});

test('incremental family preparation freezes simulation and Escape cancels without mutating matter',()=>{
  const game=lab(),{t,sandbox}=game,members=pieces(t,1000,{mixed:true}),before=inventory(t);
  const bodies=Array.from(t.world.bodies),pose=body=>[body.position.x,body.position.y,body.position.z,body.quaternion.x,body.quaternion.y,body.quaternion.z,body.quaternion.w];
  const poses=bodies.map(pose),removed=[];t.world.addEventListener('removeBody',event=>removed.push(event.body));
  assert(t.startFamilyGrouping(members,{name:'Cancelación',color:'#000000'}));
  assert(t.getFamilyGroupingJob());assert.equal(t.families.length,0);
  const ticks=t.getTickState().physics;
  t.advanceSimulation(.1);
  assert.equal(t.getTickState().physics,ticks,'simulation must remain frozen while the inventory is prepared');
  t.advanceFamilyGrouping();
  assert(t.getFamilyGroupingJob(),'a large selection is prepared over multiple frames');
  assert.equal(t.families.length,0);assert.equal(t.groups.length,members.length);
  sandbox.document.dispatchEvent({type:'keydown',code:'Escape',repeat:false});
  sandbox.document.dispatchEvent({type:'keyup',code:'Escape'});
  assert.equal(t.getFamilyGroupingJob(),null);assert.equal(t.families.length,0);
  assert.equal(t.story.mode,'playing');assert.equal(t.simulationSuspended(),false);
  assert.equal(removed.length,0);assert.deepEqual(Array.from(t.world.bodies),bodies);
  assert.deepEqual(bodies.map(pose),poses);assert.deepEqual(inventory(t),before);
  t.advanceFamilyGrouping();assert.equal(t.families.length,0);
});

test('incremental family preparation publishes a complete inventory only when all work succeeds',()=>{
  const {t}=lab(),members=pieces(t,400,{mixed:true}),before=inventory(t),bodies=Array.from(t.world.bodies);
  assert(t.startFamilyGrouping(members,{name:'Reserva',color:'#32cc55',disassemble:true,byType:true}));
  assert(t.getFamilyGroupingJob());
  let passes=0;
  while(t.getFamilyGroupingJob()&&passes++<10000){
    assert.equal(t.families.length,0);assert.equal(t.groups.length,members.length);
    assert.deepEqual(Array.from(t.world.bodies),bodies,'preparation must not instantiate temporary Cannon bodies');
    assert.deepEqual(inventory(t),before);
    t.advanceFamilyGrouping();
  }
  assert.equal(t.getFamilyGroupingJob(),null);assert(passes>1,'work is spread across frames');
  assert.equal(t.groups.length,0);assert.equal(t.families.length,4);
  for(const family of t.families){assert.equal(family.count,100);assert.equal(family.name,'Reserva');assert.equal(family.color,'#32cc55');}
  assert.deepEqual(inventory(t),before);
});

test('clearing a scene cancels incremental preparation and a late advance cannot restore its matter',()=>{
  const {t}=lab(),members=pieces(t,200);
  assert(t.startFamilyGrouping(members,{name:'Nivel anterior'}));assert(t.getFamilyGroupingJob());
  t.clearNarrativeScene();
  assert.equal(t.getFamilyGroupingJob(),null);assert.equal(t.scenePartCount(),0);
  t.advanceFamilyGrouping();
  assert.equal(t.families.length,0);assert.equal(t.groups.length,0);assert.equal(t.scenePartCount(),0);
});

test('battery families preserve individual charge and pack identity when dispensing a battery',()=>{
  const {t}=lab(),members=Array.from({length:3},(_,i)=>{
    const id=t.allocateUnitId();
    return t.makeGroup([{id,shape:'cube',weight:1,p:t.V(2+i*.2,.06,-1),q:t.Q(),mood:{name:'Batería '+i,energy:.15+i*.2,externalBattery:{version:1,ownerId:id,packId:id,enabled:false}}}]);
  }),before=inventory(t),[family]=group(t,members,{name:'Baterías azules',color:'#3388ff'});
  assert.equal(family.color,'#3388ff');
  assert(t.beginFamilyPlacement(family,'withdraw',1));
  assert(t.updateFamilyPlacement(hit(t)));
  assert(t.confirmFamilyPlacement(hit(t)));
  finishVisuals(t);
  assert.equal(t.groups.length,1);
  assert(t.isExternalBattery(t.groups[0].parts[0]));
  assert.equal(t.groups[0].parts[0].mood.energy,.15);
  assert.deepEqual(inventory(t),before,'placing stored batteries must not run the free-spawn recharge path');
});

test('a rotor survives family save and reload as an intact reusable module with the same settings',()=>{
  const {t}=lab(),rotor=t.spawnRotor(t.V(2,.3,-1));
  t.configureRotor(rotor,{rpm:44,maxTorque:.3,enabled:false});
  const before=inventory(t),saved=plain(t.serializeRotorState());
  let [family]=group(t,t.rotorGroups(rotor));
  assert.equal(t.rotors.length,0);
  assert.equal(familyCount(family),2);
  assert.equal(family.items.length,1);
  assert.equal(family.items[0].joints.length,1);
  const snapshot=t.hydrateLabSnapshot(plain(t.saveLab()));
  t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=snapshot;t.enterLab(false);
  assert.equal(t.families.length,1);family=t.families[0];
  assert.deepEqual(inventory(t),before);
  assert(t.beginFamilyPlacement(family,'withdraw',1));
  assert(t.updateFamilyPlacement(hit(t)));
  assert(t.confirmFamilyPlacement(hit(t)));
  finishVisuals(t);
  assert.equal(t.families.length,0);
  assert.equal(t.rotors.length,1);
  assert.equal(t.rotors[0].enabled,false);
  const restored=plain(t.serializeRotorState());
  for(const key of ['aId','bId','rpm','maxTorque','moving','mount'])assert.equal(restored[0][key],saved[0][key],key);
  assert.deepEqual(inventory(t),before);
});

test('an external contact sensor keeps its stored rotor target through ticks, save and withdrawal',()=>{
  const game=lab(),{t,sandbox}=game;
  t.story.progress={level1:true};
  const sensor=t.addQubit([0,.046,0]),W=sandbox.QBitsWorkshop;
  const profile=W.purchase(W.awardCompleted({},t.story.progress).profile,'sensor').profile;
  const upgrade=W.planPartUpgrade(sensor.parts[0],{sensor:true},profile);assert(!upgrade.error,upgrade.error);
  Object.assign(sensor.parts[0],upgrade.part);
  const sensorId=sensor.parts[0].id,rotor=t.spawnRotor(t.V(1.2,.3,0),{mount:'fixed'});
  assert(t.linkContactSensor(sensorId,rotor));
  const link=plain(sensor.parts[0].mood.sensorLink),aId=rotor.aId;
  group(t,t.rotorGroups(rotor));
  for(let i=0;i<30;i++)t.tickContactSensors(.02);
  assert.deepEqual(plain(t.rotorPart(sensorId).part.mood.sensorLink),link);
  assert.equal(t.rotors.length,0);
  const saved=t.hydrateLabSnapshot(plain(t.saveLab()));
  t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);
  t.tickContactSensors(.02);
  assert.deepEqual(plain(t.rotorPart(sensorId).part.mood.sensorLink),link);
  assert(t.beginFamilyPlacement(t.families[0],'withdraw',1));
  assert(t.confirmFamilyPlacement(hit(t,1.8,0)));
  const restored=t.rotors.find(r=>r.aId===aId);assert(restored);assert(t.configureRotor(restored,{enabled:true}));
  const active=t.rotorPart(sensorId).g;
  active.body.fixedRotation=true;active.body.updateMassProperties();
  t.world.defaultContactMaterial.friction=0;t.world.defaultContactMaterial.restitution=0;
  const wall=new sandbox.CANNON.Body({mass:0,shape:new sandbox.CANNON.Box(t.V(.04,.3,.4)),position:t.V(.12,.3,0)});
  t.world.addBody(wall);
  for(let i=0;i<80;i++){active.body.wakeUp();active.body.aabbNeedsUpdate=true;active.body.velocity.x=.7;t.stepSimulation(1/240);}
  assert.equal(restored.sensorPulses,1,'the original sensor link operates again after restoring its target');
  assert.deepEqual(plain(t.rotorPart(sensorId).part.mood.sensorLink),link);
});

test('external cables and gripper ID filters survive storing, saving and restoring their target',()=>{
  const {t}=lab(),reservoir=t.createPowerReservoir(t.V(0,0,0),{enabled:true,energy:.321}),rotor=t.spawnRotor(t.V(0,0,2),{capacity:256});
  assert(reservoir&&rotor);
  const spool=[];
  for(let i=0;i<4;i++){const g=t.addQubit([5+i*.14,.05,5]);g.parts[0].mood.energy=.2+i*.1;spool.push(...t.worldParts(g));t.removeGroup(g);}
  const connection=t.connectPowerCable({kind:'reservoir',id:reservoir.id},{kind:'part',id:rotor.aId},[],spool);
  assert(connection.ok,connection.error);assert(connection.cable.active);
  const gripper=t.addQubit([3,.145,1]),gripperId=gripper.parts[0].id,targetId=rotor.aId;
  assert(t.configureGripper(gripperId,{mode:'piece',targetId}));
  const network=plain(t.serializePowerNetwork()),filter=plain(gripper.parts[0].mood.gripper),before=inventory(t);
  group(t,t.rotorGroups(rotor));
  t.updatePowerNetwork(1);t.gripperCheck(gripperId,true);
  assert.equal(t.powerCables[0].active,false);assert.equal(reservoir.cell.mood.energy,.321);
  assert.deepEqual(plain(t.serializePowerNetwork()),network);
  assert.deepEqual(plain(t.rotorPart(gripperId).part.mood.gripper),filter);
  const saved=t.hydrateLabSnapshot(plain(t.saveLab()));
  t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);
  assert.deepEqual(plain(t.serializePowerNetwork()),network);
  assert.equal(t.powerCables[0].active,false);assert.equal(t.powerReservoirs[0].cell.mood.energy,.321);
  assert.deepEqual(plain(t.rotorPart(gripperId).part.mood.gripper),filter);
  assert(t.beginFamilyPlacement(t.families[0],'withdraw',1));
  assert(t.confirmFamilyPlacement(hit(t,0,2.7)));
  t.updatePowerNetwork(0);
  assert.equal(t.powerCables[0].active,true);assert.equal(t.powerReservoirs[0].cell.mood.energy,.321);
  assert.deepEqual(plain(t.serializePowerNetwork()),network);
  const restored=t.rotors.find(r=>r.aId===targetId);assert(restored);
  assert.equal(t.externalBatterySummary(restored).capacity,180000);
  assert(t.gripperMatches(t.rotorPart(gripperId).part.mood.gripper,t.rotorPart(targetId)));
  assert.deepEqual(inventory(t),before);
});

test('bulk retirement preserves Cannon indexes, body events and unrelated physical objects',()=>{
  const {t}=lab(),members=pieces(t,40),retired=members.filter((_,i)=>i%2===0),keep=members.filter((_,i)=>i%2===1);
  const bodyArray=t.world.bodies,removed=[];
  t.world.addEventListener('removeBody',event=>removed.push(event.body));
  const before=inventory(t),[family]=group(t,retired);
  assert.equal(t.world.bodies,bodyArray,'Cannon and broadphase retain the same body array');
  assert.equal(removed.length,retired.length);
  assert.equal(new Set(removed).size,retired.length);
  for(const g of retired){
    assert(removed.includes(g.body));assert.equal(g.body.world,null);
    assert(!t.world.bodies.includes(g.body));assert(!t.world.broadphase.axisList.includes(g.body));
  }
  for(const g of keep){assert(t.groups.includes(g));assert(t.world.bodies.includes(g.body));assert(t.world.broadphase.axisList.includes(g.body));}
  for(const [index,body]of t.world.bodies.entries())assert.equal(body.index,index);
  assert(t.world.broadphase.axisList.includes(family.body));
  for(let i=0;i<120;i++)t.stepSimulation(1/120);
  for(const body of t.world.bodies)for(const value of [body.position.x,body.position.y,body.position.z,body.quaternion.x,body.quaternion.y,body.quaternion.z,body.quaternion.w])assert(Number.isFinite(value));
  assert.equal(t.scenePartCount(),before.length);
  assert.deepEqual(inventory(t).map(p=>({id:p.id,weight:p.weight,shape:p.shape})),before.map(p=>({id:p.id,weight:p.weight,shape:p.shape})));
});

test('stored piece states are not visited by continuous simulation or family animation updates',()=>{
  const {t}=lab(),[family]=group(t,pieces(t,100));
  let moodReads=0;
  const records=itemParts(family.items).map(part=>({part,mood:part.mood}));
  for(const {part,mood}of records)Object.defineProperty(part,'mood',{configurable:true,enumerable:true,get(){moodReads++;return mood;}});
  try{
    for(let i=0;i<30;i++){t.stepSimulation(1/120);t.updateFamilies(1/60);}
    assert.equal(moodReads,0,'a family must not run per-piece moods, energy or battery reads every frame');
  }finally{
    for(const {part,mood}of records)Object.defineProperty(part,'mood',{configurable:true,enumerable:true,writable:true,value:mood});
  }
});

test('withdrawing a loose piece rejects another family as an occupied destination',()=>{
  const {t}=lab(),[first]=group(t,pieces(t,4));
  const next=pieces(t,4);for(const g of next){g.body.position.x+=2;g.body.aabbNeedsUpdate=true;}
  const [second]=group(t,next,{name:'Otra',color:'#aa2244'}),before=inventory(t);
  const target={point:t.V(second.body.position.x,0,second.body.position.z),normal:t.V(0,1,0)};
  assert(t.beginFamilyPlacement(first,'withdraw',1));
  assert.equal(t.updateFamilyPlacement(target),false);
  assert.equal(t.confirmFamilyPlacement(target),null);
  t.cancelFamilyPlacement();
  assert.deepEqual(inventory(t),before);
});

function openSelectionMenu(game,members){
  const {t}=game,p=t.worldParts(members[0])[0].p;
  t.setMultiSelection(members);t.setSelected({g:members[0],part:members[0].parts[0]});
  t.setLook({camera:[p.x,p.y+.8,p.z],yaw:0,pitch:-Math.PI/2});
  game.sandbox.document.pointerLockElement=t.canvas;t.handleSecondary({clientX:640,clientY:360});
  return t.getCommandState();
}
function commandButton(game,label){
  const button=game.sandbox.document.querySelector('#command-actions').children.find(node=>node.textContent===label);
  assert(button,'menu contains '+label);return button;
}

test('secondary selection menu opens the family editor and Enter applies its name and black color',()=>{
  const game=lab(),{t,sandbox}=game,members=pieces(t,6),before=inventory(t);
  const menu=openSelectionMenu(game,members),action=menu.items.find(item=>/Agrupar en familia/.test(item.label));
  assert(action);commandButton(game,action.label).dispatchEvent({type:'click'});
  const name=sandbox.document.querySelector('#family-name'),color=sandbox.document.querySelector('#family-color');
  assert.equal(sandbox.document.querySelector('#family-editor').hidden,false);
  name.value='Drones de prueba';color.value='#000000';
  sandbox.document.dispatchEvent({type:'keydown',code:'Enter',target:name,repeat:false});
  sandbox.document.dispatchEvent({type:'keyup',code:'Enter',target:name});
  finishGrouping(t);
  assert.equal(t.families.length,1);
  assert.equal(t.families[0].name,'Drones de prueba');
  assert.equal(t.families[0].color,'#000000');
  assert.equal(sandbox.document.querySelector('#family-editor').hidden,true);
  assert.equal(t.story.mode,'playing');
  assert.deepEqual(inventory(t),before);
});

test('the detach dialog groups a construction through its published family button',()=>{
  const game=lab(),{t,sandbox}=game,members=pieces(t,12,{mixed:true,compound:true}),before=inventory(t);
  const menu=openSelectionMenu(game,members),action=menu.items.find(item=>item.label==='Separar…'||/Desarmar piezas/.test(item.label));
  assert(action);commandButton(game,action.label).dispatchEvent({type:'click'});
  sandbox.document.querySelector('#detach-family').dispatchEvent({type:'click'});
  finishGrouping(t);
  assert(t.families.length>0);
  assert.equal(t.groups.length,0);
  assert.deepEqual(inventory(t),before);
});

test('Shift with deliberate mouse shakes splits a held family while ordinary motion and jitter do not',()=>{
  const game=lab(),{t,sandbox}=game,[family]=group(t,pieces(t,35)),before=inventory(t);
  assert(t.beginFamilyPlacement(family,'move'));
  for(let i=0;i<6;i++)sandbox.document.dispatchEvent({type:'mousemove',movementX:i%2?-50:50,movementY:0,timeStamp:100+i*70});
  assert.equal(t.families.length,1);
  sandbox.document.dispatchEvent({type:'keydown',code:'ShiftLeft',repeat:false});
  for(let i=0;i<6;i++)sandbox.document.dispatchEvent({type:'mousemove',movementX:i%2?-2:2,movementY:0,timeStamp:700+i*30});
  assert.equal(t.families.length,1);
  for(let i=0;i<5;i++)sandbox.document.dispatchEvent({type:'mousemove',movementX:i%2?-50:50,movementY:0,timeStamp:1200+i*70});
  sandbox.document.dispatchEvent({type:'keyup',code:'ShiftLeft'});
  assert.equal(t.families.length,4);
  assert.deepEqual(Array.from(t.families,familyCount).sort((a,b)=>a-b),[5,10,10,10]);
  assert.equal(t.getFamilyPlacement(),null);
  assert.deepEqual(inventory(t),before);
});

test('wheel rotation, Escape cancellation and E placement use the ordinary input handlers',()=>{
  const game=lab(),{t,sandbox}=game,[family]=group(t,pieces(t,4)),before=inventory(t);
  t.setLook({camera:[4,2,-3],yaw:0,pitch:-Math.PI/2});
  assert(t.beginFamilyPlacement(family,'withdraw',1));
  const wheel={deltaY:100,preventDefault(){this.defaultPrevented=true;}};t.handleWheel(wheel);
  assert.equal(wheel.defaultPrevented,true);
  assert.equal(t.getFamilyPlacement().turns,1);
  sandbox.document.dispatchEvent({type:'keydown',code:'Escape',repeat:false});
  sandbox.document.dispatchEvent({type:'keyup',code:'Escape'});
  assert.equal(t.getFamilyPlacement(),null);
  assert.equal(t.story.mode,'playing');
  assert.deepEqual(inventory(t),before);
  assert(t.beginFamilyPlacement(family,'withdraw',1));
  sandbox.document.dispatchEvent({type:'keydown',code:'KeyE',repeat:false});
  sandbox.document.dispatchEvent({type:'keyup',code:'KeyE'});
  assert.equal(t.groups.length,1);
  assert.equal(familyCount(family),3);
  assert.equal(t.getFamilyPlacement(),null);
  assert.deepEqual(inventory(t),before);
});

test('family effects stay globally bounded and repeated draws reuse existing GPU buffers',()=>{
  const game=lab(),{t}=game,members=pieces(t,500,{compound:true}),before=inventory(t);
  assert(t.groupIntoFamilies(members,{disassemble:true,byType:true}));
  assert(t.familyEffects.length>0&&t.familyEffects.length<=16);
  const buffers=game.buffers.size;
  for(let i=0;i<20;i++){t.drawFamilies();t.drawFamilyGlass();t.updateFamilies(1/60);}
  assert.equal(game.buffers.size,buffers);
  assert.deepEqual(inventory(t),before);
  t.clearFamilies();
  assert.equal(t.familyEffects.length,0);
  assert.equal(game.buffers.size,buffers);
});
