const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;return game;}
function shelf(t){const s=t.createShelf({p:t.V(0,.4,-13.996),q:t.Q(),wall:'north'});assert(s);return s;}
function choose(t,groups){t.clearRotorSelection();t.setMultiSelection(groups);t.setSelected(groups.length?{g:groups[0],part:groups[0].parts[0]}:null);}
function arm(t,x=0){
 const rotor=t.spawnRotor(t.V(x,.5,0)),moving=t.rotorPart(rotor.bId),id=t.allocateUnitId(),parts=t.worldParts(moving.g);
 parts.push({id,shape:'cube',weight:1,p:t.V(moving.p.x+.09,moving.p.y,moving.p.z),q:moving.q.clone()});
 t.removeGroup(moving.g);t.makeGroup(parts);t.refreshRotors();assert(t.configureGripper(id,{mode:'shape',shape:'cube',capacity:3}));
 const controller=t.createRobotArm({baseId:rotor.aId,gripperId:id,joints:[rotor],repeat:false});assert(controller);assert(t.teachRobotArmPose(controller,'place'));
 return {controller,rotor,id,groups:t.rotorConnectedGroups(t.rotorGroups(rotor))};
}

test('shelf preserves taught poses, program, filter, charge and piece identities across immediate storage and withdrawal',()=>{
 const {t}=lab(),s=shelf(t),a=arm(t);t.rotorPart(a.id).part.mood.energy=.271;
 const before=plain(t.serializeRobotArms()),ids=t.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b),originalGripper=t.rotorPart(a.id).part;
 choose(t,a.groups);assert(t.storeShelfSelection(s,0));assert.equal(t.groups.length,0);assert.equal(t.world.constraints.length,0);
 const stored=s.cells[0].items[0];assert.deepEqual(plain(stored.robotArms),before);assert.match(stored.category.label,/Brazo/);
 assert.equal('running' in stored.robotArms[0],false);assert.equal('brakes' in stored.robotArms[0],false);assert.equal('pin' in stored.robotArms[0],false);
 a.controller.poses.pick[0][0]=.8;originalGripper.mood.gripper.capacity=16;
 assert(t.withdrawShelf(s,0));assert.deepEqual(plain(t.serializeRobotArms()),before);assert.equal(t.robotArms.length,1);
 assert.deepEqual(t.groups.flatMap(g=>g.parts.map(p=>p.id)).sort((a,b)=>a-b),ids);assert.equal(t.rotorPart(a.id).part.mood.energy,.271);assert.equal(t.rotorPart(a.id).part.mood.gripper.capacity,3);
 const restored=t.robotArms[0];assert.equal(restored.running,false);assert.equal(restored.jogging,false);assert.equal(t.robotGrips.size,0);assert.equal(restored.brakes.length,1);assert(t.world.constraints.includes(restored.brakes[0]));assert.equal(t.withdrawShelf(s,0),false);
});

test('running and jogging arms cannot be stored even before the next physics step',()=>{
 const {t}=lab(),s=shelf(t),a=arm(t);choose(t,a.groups);assert(t.startRobotArm(a.controller));
 assert.equal(t.storeShelfSelection(s),false);assert.match(t.shelfSelectionPlan(s).error,/secuencia/);assert.equal(s.cells[0].items.length,0);assert.equal(t.groups.length,2);
 t.stopRobotArm(a.controller);assert(t.jogRobotArm(a.controller,0,15));assert.equal(t.storeShelfSelection(s),false);assert.match(t.shelfSelectionPlan(s).error,/secuencia/);
 t.stopRobotArm(a.controller);assert(t.storeShelfSelection(s));
});

test('a gripper and its held payload reject storage until physically released',()=>{
 const {t}=lab(),s=shelf(t),gripper=t.addQubit([0,.3,0]),payload=t.addQubit([0,.21,0]),id=gripper.parts[0].id;
 assert(t.configureGripper(id));assert(t.gripperGrab(id));const constraints=t.world.constraints.length;
 choose(t,[gripper]);assert.equal(t.storeShelfSelection(s),false);assert.match(t.shelfSelectionPlan(s).error,/Suelta/);
 choose(t,[payload]);assert.equal(t.storeShelfSelection(s),false);assert.equal(t.world.constraints.length,constraints);assert.equal(t.robotGrips.size,1);
 t.releaseGripper(id);choose(t,[gripper]);assert(t.storeShelfSelection(s));assert.equal(s.cells[0].category.label,'Cubo de agarre');assert(t.groups.includes(payload));
});

test('gripper compartments do not accept ordinary cubes and preserve separate target filters',()=>{
 const {t}=lab(),s=shelf(t),gripper=t.addQubit([0,.3,0]),plainCube=t.addQubit([1,.3,0]),target=t.addQubit([2,.3,0]),id=gripper.parts[0].id;
 assert(t.configureGripper(id,{mode:'piece',targetId:target.parts[0].id,capacity:2}));choose(t,[gripper]);assert(t.storeShelfSelection(s));
 choose(t,[plainCube]);assert.equal(t.storeShelfSelection(s),false);assert(t.withdrawShelf(s));assert.equal(t.rotorPart(id).part.mood.gripper.targetId,target.parts[0].id);
});

test('blocked withdrawal preserves the stored arm without disturbing another live controller',()=>{
 const {t}=lab(),s=shelf(t),stored=arm(t),live=arm(t,3);choose(t,stored.groups);assert(t.storeShelfSelection(s));
 const before=plain(s.cells[0]),liveState=plain(t.serializeRobotArms().filter(a=>a.gripperId===live.id));
 const point=t.shelfCellPoint(s);t.storyWall(t.V(point.x,.3,point.z+.65),t.V(1,.3,.6));assert.equal(t.withdrawShelf(s),false);
 assert.deepEqual(plain(s.cells[0]),before);assert.deepEqual(plain(t.serializeRobotArms()),liveState);assert(t.robotArms.includes(live.controller));assert.equal(t.groups.length,2);assert.equal(t.robotGrips.size,0);
});

test('malformed saved arm references and filters are rejected atomically before creating bodies',()=>{
 const {t,sandbox}=lab(),s=shelf(t),a=arm(t);choose(t,a.groups);assert(t.storeShelfSelection(s));const original=plain(s.cells[0].items[0]);
 for(const alter of [
  item=>{item.robotArms[0].gripperId=999999;},
  item=>{item.robotArms[0].baseId=999999;},
  item=>{item.robotArms[0].joints[0].bId=999999;},
  item=>{item.robotArms[0].poses.place=[[0,0,0,0]];},
  item=>{item.robotArms.push(plain(item.robotArms[0]));},
  item=>{item.groups.flatMap(g=>g.parts).find(p=>p.id===a.id).mood.gripper.capacity=Infinity;}
 ]){const invalid=plain(original);alter(invalid);s.cells[0].items[0]=invalid;assert.equal(sandbox.QBitsOrganizers.validItem(invalid),false);assert.equal(t.withdrawShelf(s),false);assert.equal(t.groups.length,0);assert.equal(s.cells[0].items.length,1);}
 s.cells[0].items[0]=original;assert(t.withdrawShelf(s));assert.equal(t.robotArms.length,1);
});

test('lab restoration keeps stored robot programs and reserves all their physical IDs',()=>{
 const {t}=lab(),s=shelf(t),a=arm(t);choose(t,a.groups);assert(t.storeShelfSelection(s));const saved=t.saveLab(),expected=plain(saved.shelves),maxId=Math.max(...a.groups.flatMap(g=>g.parts.map(p=>p.id)));
 t.clearNarrativeScene();t.story.scene='campaign';t.story.lab=saved;t.enterLab(false);assert.deepEqual(plain(t.serializeShelves()),expected);assert(t.allocateUnitId()>maxId);assert.equal(t.robotArms.length,0);
 assert(t.withdrawShelf(t.shelves[0]));assert.equal(t.robotArms.length,1);assert.equal(t.robotArms[0].gripperId,a.id);assert.equal(t.robotArms[0].repeat,false);
});
