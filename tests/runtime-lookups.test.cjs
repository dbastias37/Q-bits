const test=require('node:test'),assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function lab(){const game=createGame();game.t.clearNarrativeScene();Object.assign(game.t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle'});return game;}

test('persistent ownership follows live poses, welding, deletion and rebuilding',()=>{
 const {t}=lab(),r=t.spawnRotor(t.V(0,.35,0)),[base,moving]=t.rotorGroups(r),id=r.bId;
 const cached=t.mechanicalTopologyIndex();
 for(let i=0;i<4;i++)t.stepPhysics(1/240);
 assert.equal(t.mechanicalTopologyIndex(),cached,'unchanged topology is reused across substeps');
 const before=t.rotorPart(id).p.clone();moving.body.position.x+=.1;
 assert(Math.abs(t.rotorPart(id).p.x-before.x-.1)<1e-10,'positions must never be cached with topology');
 moving.body.position.x-=.1;
 const endpoint=t.rotorPart(id),point=endpoint.p.vadd(endpoint.q.vmult(t.V(.09,-5/56*.09,0)));
 const cube=t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:1,p:point,q:endpoint.q}]),cubeId=cube.parts[0].id;
 assert.notEqual(t.mechanicalTopologyIndex(),cached);
 assert(t.weld({source:cube,target:moving,position:cube.body.position.clone(),quaternion:cube.body.quaternion.clone()}));
 const joined=t.rotorPart(id).g;
 assert.notEqual(joined,moving);assert.equal(t.rotorPart(cubeId).g,joined);
 assert.equal(t.rotorForGroup(joined),r);assert.equal(t.rotorForPart(id),r);
 assert.deepEqual(Array.from(t.rotorConnectedGroups([base])),[base,joined]);
 assert(t.disconnectRotor(r));assert.equal(t.rotorForPart(id),null);
 assert.deepEqual(Array.from(t.rotorConnectedGroups([base])),[base]);
 t.removeGroup(joined);assert.equal(t.rotorPart(id),null);assert.equal(t.rotorPart(cubeId),null);
 const rebuilt=t.makeGroup([{id,shape:'coupler',weight:1,p:t.V(2,.35,0),q:t.Q()}]);
 assert.equal(t.rotorPart(id).g,rebuilt);assert.equal(t.rotorForGroup(rebuilt),null);
});

test('contact index is rebuilt after narrowphase even when Cannon reuses its array',()=>{
 const {t}=lab();assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate('straight'),t.V()));
 const belt=t.conveyors[0],surface=t.conveyorSurfacePoses(belt)[0],p=surface.p.vadd(surface.q.vmult(t.V(0,surface.half.y+.045,0)));
 const load=t.addQubit([p.x,p.y,p.z]);for(let i=0;i<30;i++)t.stepPhysics(1/240);
 assert(t.conveyorContactLoads(belt).some(item=>item.body===load.body));
 t.setStepCache({});const old=t.conveyorContactIndex(),array=t.world.contacts;
 load.body.position.x+=3;load.body.velocity.set(0,0,0);load.body.aabbNeedsUpdate=true;load.body.wakeUp();
 t.world.step(1/240);
 assert.equal(t.world.contacts,array,'exercise reused contact-array identity');
 assert.notEqual(t.conveyorContactIndex(),old);
 assert(!t.conveyorContactLoads(belt).some(item=>item.body===load.body));
 const neighbors=t.conveyorContactMap();
 for(const contact of t.world.contacts){assert(neighbors.get(contact.bi).has(contact.bj));assert(neighbors.get(contact.bj).has(contact.bi));}
 t.setStepCache(null);
});

test('direct contact queries outside a physics step never retain old contacts',()=>{
 const {t}=lab(),a=t.addQubit([0,1,0]).body,b=t.addQubit([1,1,0]).body,c=t.addQubit([2,1,0]).body;
 t.world.contacts=[{bi:a,bj:b}];assert(t.conveyorContactMap().get(a).has(b));
 t.world.contacts[0]={bi:a,bj:c};assert(!t.conveyorContactMap().get(a).has(b));assert(t.conveyorContactMap().get(a).has(c));
});
