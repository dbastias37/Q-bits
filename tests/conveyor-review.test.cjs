const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
function lab(){const game=createGame(),{t}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:false,scene:'lab',mode:'playing',phase:'idle'});return game;}
function step(t,n=120){for(let i=0;i<n;i++)t.stepPhysics(1/240);}
function machine(t,height=0){assert(t.spawnSavedMechanism(t.conveyorBlueprintTemplate(),t.V()));const c=t.conveyors.at(-1);for(const g of t.rotorConnectedGroups([t.rotorPart(c.baseId).g])){g.body.position.y+=height;g.body.aabbNeedsUpdate=true;}
 const base=t.rotorPart(c.baseId),p=base.p.clone();p.y+=.09;const g=t.makeGroup([{id:t.allocateUnitId(),shape:'cube',weight:1,p,q:base.q.clone()}]),cell=g.parts[0];cell.mood.energy=.8;cell.mood.externalBattery={version:1,ownerId:cell.id,packId:cell.id,enabled:true};assert(t.weld({source:g,target:base.g,position:g.body.position.clone(),quaternion:g.body.quaternion.clone()}));return {c,cell:t.rotorPart(cell.id).part};}

test('a floating conveyor cannot anchor itself or consume power before it is supported',()=>{
 const {t}=lab(),{c,cell}=machine(t,1),before=cell.mood.energy;assert.equal(t.startConveyor(c),false);assert.match(c.status,/Apoya/);assert.equal(cell.mood.energy,before);assert(t.conveyorRotors(c).every(r=>!r.enabled));const y=t.rotorPart(c.baseId).g.body.position.y;step(t,40);assert(t.rotorPart(c.baseId).g.body.position.y<y-.03,'unsupported construction continues falling under gravity');
});

test('a tilted conveyor stays off and a floor-supported horizontal installation starts immediately',()=>{
 const {t}=lab(),{c,cell}=machine(t),before=cell.mood.energy,base=t.rotorPart(c.baseId),turn=t.Q();turn.setFromAxisAngle(t.V(0,0,1),Math.PI/4);base.g.body.quaternion.copy(turn);assert.equal(t.startConveyor(c),false);assert.match(c.status,/horizontal/);assert.equal(cell.mood.energy,before);base.g.body.quaternion.set(0,0,0,1);assert(t.startConveyor(c),c.status);step(t,25);assert(c.running,c.status);assert(cell.mood.energy<before);
});

test('a real tabletop supports a running conveyor after kinematic contacts disappear; removal stops and releases it',()=>{
 const {t}=lab(),{c}=machine(t,.505),table=t.storyWall(t.V(0,.25,0),t.V(.8,.25,.8));step(t,160);assert(t.conveyorSupportReady(c),c.supportStatus);assert(t.startConveyor(c),c.status);step(t,40);assert(c.running,c.status);assert(c.support.chain.some(s=>s.body===table.body));const body=t.rotorPart(c.baseId).g.body,y=body.position.y;t.world.removeBody(table.body);step(t,40);assert.equal(c.running,false);assert.match(c.status,/Apoya/);assert.equal(body.type,1);assert(body.position.y<y-.03,'losing the physical support releases the chassis to gravity');
});

test('a resting solid can support a conveyor but moving its supporting body removes the powered anchor',()=>{
 const {t}=lab(),{c}=machine(t,.275),support=t.makeGroup(Array.from({length:27},(_,i)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V((i%3-1)*.09,.045+Math.floor(i/9)*.09,(Math.floor(i/3)%3-1)*.09),q:t.Q()})));step(t,200);assert(t.conveyorSupportReady(c),c.supportStatus);assert(t.startConveyor(c),c.status);step(t,25);assert(c.running,c.status);support.body.position.x+=.3;support.body.aabbNeedsUpdate=true;step(t,5);assert.equal(c.running,false);assert.match(c.status,/Apoya/);
});

test('moving a support rechecks current geometry and preserves genuinely remaining support',()=>{
 const {t}=lab(),{c}=machine(t,.505),table=t.storyWall(t.V(0,.25,0),t.V(.8,.25,.8));step(t,160);assert(t.startConveyor(c),c.status);step(t,20);
 table.body.position.x+=.1;table.body.aabbNeedsUpdate=true;step(t,1);assert(c.running,'fresh downward probes still find the wide tabletop');assert(c.support.chain.some(saved=>saved.body===table.body&&saved.p.distanceTo(table.body.position)<1e-8));
 table.body.position.x+=3;table.body.aabbNeedsUpdate=true;step(t,1);assert.equal(c.running,false,'a previous contact cannot certify a tabletop moved away');assert.match(c.status,/Apoya/);
});
