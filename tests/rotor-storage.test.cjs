const test = require('node:test');
const assert = require('node:assert/strict');
const createGame = require('./game-harness.cjs');

function setup() {
  const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();
  Object.assign(t.story,{ready:false,scene:'lab',mode:'playing',phase:'idle'});
  sandbox.document.pointerLockElement=t.canvas;
  return game;
}
function rotor(game, options={}) {
  const r=game.t.spawnRotor(game.t.V(0,0,0),options);assert(r);return r;
}
function clone(value){return JSON.parse(JSON.stringify(value));}
function partIds(t){return new Set(t.groups.flatMap(g=>g.parts.map(p=>p.id)));}
function attachCube(t,r,side=0) {
  const group=t.rotorGroups(r)[side],part=group.parts[0],pose=t.poses(group)[0];
  const face=t.unitFaces(pose).find(f=>f.kind==='square'&&Math.abs(f.normal.x)>.9);
  assert(face,'coupler has a square side for a wheel attachment');
  const p=face.center.vadd(face.normal.scale(.045)),cube=t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:3,p,q:pose.q.clone()}]);
  const joined=t.weld({source:cube,target:group,position:cube.body.position.clone(),quaternion:cube.body.quaternion.clone()});
  assert(joined);t.refreshRotors();assert(t.rotors.includes(r));return joined;
}

test('one coupler saves as Enganche and restores as one rigid mechanism with fresh identity',()=>{
  const game=setup(),{t}=game;
  const g=t.addQubit([0,t.unitGroundHeight('coupler')+.003,0],1.25,'coupler');
  const record=t.saveMechanism(g);assert(record);
  assert.equal(record.name,'Enganche');assert.equal(record.type,'coupler');assert.equal(record.joints.length,0);
  assert.equal(t.mechanismPartCount(record),1);assert(t.savedMechanismValid(record));
  const original=g.parts[0].id,created=t.spawnSavedMechanism(record,t.V(2,0,1));
  assert(created&&created.parts);assert.equal(created.parts[0].shape,'coupler');assert.equal(created.parts[0].weight,1.25);
  assert.notEqual(created.parts[0].id,original);assert.equal(t.rotors.length,0);
});

test('saved Rotor preserves rigid attachments, motor choices and real joint after motor stepping',()=>{
  const game=setup(),{t}=game,r=rotor(game,{mount:'fixed'});
  attachCube(t,r,1);t.configureRotor(r,{rpm:42,direction:-1,moving:'b',enabled:true});
  for(let i=0;i<480;i++)t.stepPhysics(1/240);
  const record=t.saveMechanism(r);assert(record,'a running mechanism remains saveable');
  assert.equal(record.name,'Rotor');assert.equal(record.groups.length,2);assert.equal(record.joints.length,1);
  assert.deepEqual(Array.from(record.groups,g=>g.parts.length).sort(),[1,2]);
  assert.equal(record.joints[0].rpm,42);assert.equal(record.joints[0].direction,-1);assert.equal(record.joints[0].moving,'b');assert.equal(record.joints[0].enabled,true);
  const before=partIds(t),created=t.spawnSavedMechanism(record,t.V(3,0,2));assert(created);
  assert.equal(t.rotors.length,2);assert(created.constraint);assert.notEqual(created.constraint.bodyA,created.constraint.bodyB);
  const sides=t.rotorGroups(created);assert.deepEqual(Array.from(sides,g=>g.parts.length).sort(),[1,2]);
  for(const group of sides)for(const part of group.parts)assert(!before.has(part.id));
  const base=sides[0].body.quaternion.clone(),moving=sides[1].body.quaternion.clone();
  for(let i=0;i<120;i++)t.stepPhysics(1/240);
  assert(Math.abs(['x','y','z','w'].reduce((sum,k)=>sum+base[k]*sides[0].body.quaternion[k],0))>.99999);
  assert(Math.abs(['x','y','z','w'].reduce((sum,k)=>sum+moving[k]*sides[1].body.quaternion[k],0))<.99,'only the selected side rotates');
});

test('normal Guardar forma delegates a hinged group to mechanisms instead of flattening the rotor',()=>{
  const game=setup(),{t}=game,r=rotor(game),g=t.rotorGroups(r)[0];
  const result=t.saveShape(g);assert(result);assert.equal(t.savedShapes.length,0);assert.equal(t.savedMechanisms.length,1);
  assert.equal(t.savedMechanisms[0].groups.length,2);assert.equal(t.savedMechanisms[0].joints.length,1);
});

test('scene clearing removes all rotor records and laboratory restoration rebuilds exact connections',()=>{
  const game=setup(),{t}=game,r=rotor(game,{rpm:18,direction:1,moving:'a',enabled:true});
  attachCube(t,r,0);const snapshot=t.saveLab(),ids=[...partIds(t)].sort();
  assert.equal(snapshot.rotors.length,1);assert.equal(snapshot.rotors[0].enabled,true);
  t.clearNarrativeScene();assert.equal(t.groups.length,0);assert.equal(t.rotors.length,0);
  t.story.scene='campaign';t.story.lab=snapshot;t.enterLab(false);
  assert.equal(t.rotors.length,1);assert.deepEqual([...partIds(t)].sort(),ids);
  const restored=t.rotors[0];assert.equal(restored.rpm,18);assert.equal(restored.moving,'a');assert.equal(restored.enabled,true);
  assert(restored.constraint&&t.world.constraints.includes(restored.constraint));
  t.clearNarrativeScene();assert.equal(t.rotors.length,0);assert.equal(t.groups.length,0);
});

test('duplicating a selected rotor copies both sides and remaps its joint rather than copying one half',()=>{
  const game=setup(),{t}=game,r=rotor(game,{rpm:25,moving:'a',direction:-1});
  const g=t.rotorGroups(r)[0];t.setSelected({g,part:g.parts[0]});
  const before=partIds(t),made=t.duplicateSelection();assert(made);assert.equal(made.length,2);assert.equal(t.rotors.length,2);
  const copy=t.rotors.find(other=>other!==r);assert(!before.has(copy.aId));assert(!before.has(copy.bId));
  assert.equal(copy.rpm,25);assert.equal(copy.direction,-1);assert.equal(copy.moving,'a');
});

test('invalid imports are atomic and reject malformed references, values, geometry and rigid boundaries',()=>{
  const game=setup(),{t}=game,record=t.saveMechanism(rotor(game));assert(record);
  const mutations=[
    s=>{s.groups[0].parts[0].key=s.groups[1].parts[0].key;},
    s=>{s.joints[0].a=127;},s=>{s.joints[0].b=s.joints[0].a;},
    s=>{s.joints[0].rpm=Infinity;},s=>{s.joints[0].rpm=121;},s=>{s.joints[0].direction=0;},
    s=>{s.joints[0].moving='both';},s=>{s.joints[0].enabled='true';},
    ...['up',null,1].map(value=>s=>{s.joints[0].mount=value;}),
    ...[NaN,Infinity,.019,4.001,null,'0.4'].map(value=>s=>{s.joints[0].maxTorque=value;}),
    ...[NaN,Infinity,1.99,256.01,null,'16'].map(value=>s=>{s.joints[0].capacity=value;}),
    s=>{s.groups[0].parts[0].p[0]=NaN;},s=>{s.groups[0].parts[0].q=[0,0,0,2];},
    s=>{s.groups[0].parts[0].shape='wheel';},s=>{s.groups[0].parts[0].weight=-1;},
    s=>{s.groups[1].parts[0].p[1]+=.03;},
    s=>{s.groups[0].parts.push(...s.groups[1].parts);s.groups.pop();},
    s=>{s.groups.push({parts:[]});},s=>{s.name='bad\u0000name';},
    s=>{s.type='coupler';},s=>{s.joints.push({...s.joints[0]});}
  ];
  for(const change of mutations){const bad=clone(record);change(bad);assert.equal(t.savedMechanismValid(bad),false);assert.throws(()=>t.importMechanismsData({version:1,mechanisms:[bad]}));assert.equal(t.savedMechanisms.length,1);}
  const payload=t.mechanismsExportData();assert.equal(t.importMechanismsData(payload),1);assert(t.savedMechanismValid(t.savedMechanisms[0]));
  assert.notEqual(t.savedMechanisms[0],payload.mechanisms[0]);
});

test('blocked placement rolls back every new group and leaves existing rotor constraints intact',()=>{
  const game=setup(),{t}=game,r=rotor(game),record=t.saveMechanism(r);
  const before={groups:t.groups.length,rotors:t.rotors.length,bodies:t.world.bodies.length,constraints:t.world.constraints.length};
  assert.equal(t.spawnSavedMechanism(record,t.V(0,0,0)),null);
  assert.equal(t.groups.length,before.groups);assert.equal(t.rotors.length,before.rotors);assert.equal(t.world.bodies.length,before.bodies);assert.equal(t.world.constraints.length,before.constraints);
  assert(t.world.constraints.includes(r.constraint));
});

test('shape blueprints cannot recruit an attached rotor half as a loose coupler',()=>{
  const game=setup(),{t}=game,r=rotor(game),loose=t.addQubit([.6,t.unitGroundHeight('coupler')+.003,0],1,'coupler');
  const bp={p:t.V(0,.002,0),q:t.Q(),slots:[],shape:{name:'Enganche',parts:[{shape:'coupler',p:[0,t.unitGroundHeight('coupler'),0],q:[0,0,0,1]}]}};
  const near=t.nearBlueprint(bp);assert(near.includes(loose));for(const g of t.rotorGroups(r))assert(!near.includes(g));
});

test('saving canonicalizes only small solver drift on the saved copy and rejects a detached-looking gap',()=>{
  const game=setup(),{t}=game,r=rotor(game),sides=t.rotorGroups(r);
  sides[1].body.position.y+=.003;
  const before=sides.map(g=>g.body.position.clone()),record=t.mechanismSnapshot(r);assert(record);
  for(let i=0;i<2;i++)assert(sides[i].body.position.distanceTo(before[i])<1e-12,'saving must not move live bodies');
  const partMap=new Map(record.groups.flatMap(g=>g.parts).map(part=>[part.key,part]));
  const tip=key=>{const part=partMap.get(key),q=t.Q();q.set(...part.q);return t.couplerTip({p:t.V(...part.p),q}).point;};
  assert(tip(record.joints[0].a).distanceTo(tip(record.joints[0].b))<1e-7);
  assert(t.savedMechanismValid(record));
  sides[1].body.position.y+=.02;
  assert.equal(t.mechanismSnapshot(r),null,'large gaps are not silently repaired');
});

test('returning to the lab repairs only tiny solver drift before recreating the snapshot joint',()=>{
  const game=setup(),{t}=game,r=rotor(game),sides=t.rotorGroups(r);
  sides[1].body.position.y+=.003;
  const snapshot=t.saveLab();t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=snapshot;t.enterLab(false);
  assert.equal(t.rotors.length,1);
  const restored=t.rotors[0],a=t.rotorPart(restored.aId),b=t.rotorPart(restored.bId);
  assert(t.couplerTip(a).point.distanceTo(t.couplerTip(b).point)<1e-9);
  assert(t.world.constraints.includes(restored.constraint));
});

test('mechanisms persist in their own versioned store and reload independently of ordinary shapes',()=>{
  const game=setup(),{t,sandbox}=game,store=new Map();
  sandbox.localStorage.setItem=(key,value)=>store.set(key,value);sandbox.localStorage.getItem=key=>store.get(key)??null;
  const r=rotor(game,{rpm:37,direction:-1,moving:'a'}),saved=t.saveMechanism(r);assert(saved);
  const encoded=store.get('qbits.mechanisms.v1');assert(encoded);assert(!encoded.includes('aId'));
  t.savedMechanisms.length=0;t.loadSavedMechanisms();assert.equal(t.savedMechanisms.length,1);assert(t.savedMechanismValid(t.savedMechanisms[0]));
  assert.equal(t.savedMechanisms[0].joints[0].rpm,37);assert.equal(t.savedShapes.length,0);
  sandbox.localStorage.setItem=()=>{throw new Error('Quota exceeded');};
  assert.equal(t.persistMechanisms(),false);assert.equal(t.savedMechanisms.length,1,'failed disk persistence must keep the exportable session copy');
});

test('campaign spawning cannot obtain free construction pieces through a saved mechanism',()=>{
  const game=setup(),{t,sandbox}=game,r=rotor(game);attachCube(t,r,1);
  const record=t.mechanismSnapshot(r);assert(record);
  t.story.scene='campaign';t.story.progress.level5=true;
  const count=t.groups.reduce((n,g)=>n+g.parts.length,0),joints=t.rotors.length;
  assert.equal(t.spawnSavedMechanism(record,t.V(3,0,3)),null);
  assert.equal(t.groups.reduce((n,g)=>n+g.parts.length,0),count);assert.equal(t.rotors.length,joints);
  assert.match(sandbox.document.querySelector('#notice').textContent,/banco de pruebas/);
  const bare=clone(record);for(const group of bare.groups)group.parts=group.parts.filter(part=>part.shape==='coupler');
  assert(t.savedMechanismValid(bare));assert(t.spawnSavedMechanism(bare,t.V(3,0,3)),'unlocked bare rotor remains available');
});


test('drive limits survive saving, duplication, export/import and laboratory restoration',()=>{
  const game=setup(),{t}=game,r=rotor(game,{mount:'fixed',maxTorque:.75,capacity:9,rpm:23,moving:'a'});
  const a=t.rotorPart(r.aId),b=t.rotorPart(r.bId),freshEnergy=a.part.mood.energy;a.part.mood.energy=.61;b.part.mood.energy=.43;
  const record=t.saveMechanism(r);assert(record);
  const check=drive=>{assert.equal(drive.mount,'fixed');assert.equal(drive.maxTorque,.75);assert.equal(drive.capacity,9);};
  check(record.joints[0]);check(t.serializeRotorState()[0]);
  const payload=clone(t.mechanismsExportData());assert.equal(t.importMechanismsData(payload),1);check(t.savedMechanisms[0].joints[0]);
  const spawned=t.spawnSavedMechanism(record,t.V(3,0,1));assert(spawned);check(spawned);
  assert.equal(t.rotorPart(spawned.aId).part.mood.energy,freshEnergy,'a template creates fresh units');
  const snapshot=t.saveLab();check(snapshot.rotors[0]);
  t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=snapshot;t.enterLab(false);
  const restored=t.rotors.find(other=>other.aId===r.aId);assert(restored);check(restored);
  assert.equal(t.rotorPart(restored.aId).part.mood.energy,.61);assert.equal(t.rotorPart(restored.bId).part.mood.energy,.43);
  const group=t.rotorGroups(restored)[0];t.setSelected({g:group,part:group.parts.find(part=>part.id===restored.aId)});
  assert(t.duplicateSelection());check(t.rotors.at(-1));
});

test('older mechanism and lab records receive explicit safe wheel drive defaults',()=>{
  const game=setup(),{t}=game,r=rotor(game),record=clone(t.mechanismSnapshot(r));
  for(const joint of record.joints)for(const key of ['mount','maxTorque','capacity'])delete joint[key];
  assert(t.savedMechanismValid(record));assert.equal(t.importMechanismsData({version:1,mechanisms:[record]}),1);
  const check=drive=>{assert.equal(drive.mount,'wheel');assert.equal(drive.maxTorque,.4);assert.equal(drive.capacity,16);};
  check(t.savedMechanisms[0].joints[0]);const made=t.spawnSavedMechanism(record,t.V(3,0,2));assert(made);check(made);
  const snapshot=t.saveLab();for(const state of snapshot.rotors)for(const key of ['mount','maxTorque','capacity'])delete state[key];
  delete snapshot.mechanismDefaults;
  t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=snapshot;t.enterLab(false);
  t.rotors.forEach(check);check(t.saveLab().mechanismDefaults);
});

test('damaged laboratory drive settings cannot inject invalid controls or unsupported keys',()=>{
  const game=setup(),{t}=game;rotor(game);
  const snapshot=t.saveLab();snapshot.mechanismDefaults={rpm:NaN,direction:0,moving:'both',mount:'ceiling',maxTorque:Infinity,capacity:-5,injected:123};
  t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=snapshot;t.enterLab(false);
  const defaults=t.saveLab().mechanismDefaults;
  assert.equal(defaults.rpm,30);assert.equal(defaults.direction,1);assert.equal(defaults.moving,'b');assert.equal(defaults.mount,'wheel');assert.equal(defaults.maxTorque,.4);assert.equal(defaults.capacity,16);assert.equal(defaults.injected,undefined);
  const state=t.serializeRotorState();state[0].capacity=Infinity;
  assert.equal(t.restoreRotorState(state).length,0);assert.equal(t.rotors.length,0);
});

test('a saved chassis accepts simultaneous wheel motors but rejects conflicting fixed mounts',()=>{
  const game=setup(),{t}=game,r=rotor(game),first=t.rotorGroups(r)[0],pose=t.rotorPart(r.aId),id=t.allocateUnitId(),parts=t.worldParts(first);
  parts.push({id,shape:'coupler',weight:1,p:pose.p.vadd(t.V(.09,0,0)),q:t.Q()});
  t.removeGroup(first);t.makeGroup(parts);t.refreshRotors();
  const flip=t.Q();flip.setFromAxisAngle(t.V(0,0,1),Math.PI);
  const end=t.makeGroup([{id:t.allocateUnitId(),shape:'coupler',weight:1,p:pose.p.vadd(t.V(.09,2*.09*51/56,0)),q:flip}]);
  assert(t.connectRotorTips(id,end.parts[0].id));
  const record=t.mechanismSnapshot(r);assert(record);assert.equal(record.joints.length,2);
  for(const joint of record.joints){joint.mount='wheel';joint.enabled=true;}
  assert(t.savedMechanismValid(record));
  const made=t.spawnSavedMechanism(record,t.V(3,0,2));assert(made);
  const joints=t.rotors.filter(other=>t.mechanismGroups(made).includes(t.rotorGroups(other)[0]));
  assert.equal(joints.length,2);assert(joints.every(other=>other.enabled));
  record.joints[0].mount='fixed';assert.equal(t.savedMechanismValid(record),false);
  record.joints[1].enabled=false;assert(t.savedMechanismValid(record),'one fixed motor is valid while the other is off');
});
