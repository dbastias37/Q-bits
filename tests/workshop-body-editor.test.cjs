const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');
const near=(a,b,tolerance=1e-8)=>assert(Math.abs(a-b)<tolerance,`${a} != ${b}`);
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,mode:'playing',scene:'lab',phase:'idle',progress:{}});sandbox.document.body.dataset.booting='false';t.setupWorkshop();return game;}
function block(t,x,y,z,offset={x:0,z:0}){const p=t.getWorkshopBench().p,parts=[];for(let iy=0;iy<y;iy++)for(let iz=0;iz<z;iz++)for(let ix=0;ix<x;ix++)parts.push({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V(p.x+offset.x+(ix-(x-1)/2)*.09,p.y+.049+iy*.09,p.z+offset.z+(iz-(z-1)/2)*.09),q:t.Q()});return t.makeGroup(parts);}
function unchanged(t,g){return JSON.stringify({parts:t.worldParts(g),bodies:t.world.bodies.map(b=>b.id),groups:t.groups.map(item=>item.body.id)});}

test('body preview is read only and reshaping six real cubes preserves mass, identities and stored energy',()=>{
 const {t}=lab(),g=block(t,2,1,3),id=g.parts[0].id;
 g.parts.forEach((p,i)=>{p.weight=1+i/10;p.mood.energy=.1+i/10;p.mood.name='Pieza '+i;});
 const before=unchanged(t,g),moods=g.parts.map(p=>JSON.stringify(p.mood)),weights=g.parts.map(p=>p.weight),ids=g.parts.map(p=>p.id),joules=g.parts.reduce((n,p)=>n+p.mood.energy*t.gameBatteryCapacity(p),0);
 const preview=t.workshopBodyPreview(id,{x:6,y:1,z:1});assert(preview.ok,preview.error);assert.equal(preview.parts.length,6);near(preview.size.x,.54);assert.equal(unchanged(t,g),before);
 assert(t.workshopBodyApply(id,{x:6,y:1,z:1}));const made=t.rotorPart(id).g;assert.notEqual(made,g);assert.equal(t.groups.length,1);assert.equal(made.body.shapes.length,6);
 assert.deepEqual(made.parts.map(p=>p.id),ids);assert.deepEqual(made.parts.map(p=>p.weight),weights);assert.deepEqual(made.parts.map(p=>JSON.stringify(p.mood)),moods);
 near(made.body.mass,weights.reduce((a,b)=>a+b)*.25);near(made.parts.reduce((n,p)=>n+p.mood.energy*t.gameBatteryCapacity(p),0),joules);near(t.bounds(made).size.x,.54);near(t.bounds(made).size.y,.09);near(t.bounds(made).size.z,.09);
});

test('body editor refuses incompatible counts, dimensions, held and off-table material atomically',()=>{
 const {t}=lab(),g=block(t,2,1,2),id=g.parts[0].id;
 for(const dims of [{x:5,y:1,z:1},{x:2.5,y:1,z:2},{x:0,y:2,z:2},{x:Infinity,y:1,z:1},{x:17,y:1,z:1}]){const before=unchanged(t,g);assert.equal(t.workshopBodyApply(id,dims),false);assert.equal(unchanged(t,g),before);}
 t.setHeld({g,part:g.parts[0],items:[{g}]});assert.equal(t.workshopBodyApply(id,{x:4,y:1,z:1}),false);t.setHeld(null);
 g.body.position.x+=2;assert.equal(t.workshopBodyApply(id,{x:4,y:1,z:1}),false);g.body.position.x-=2;
 g.route={};assert.equal(t.workshopBodyApply(id,{x:4,y:1,z:1}),false);g.route=null;
 g.body.velocity.set(.2,0,0);assert.equal(t.workshopBodyApply(id,{x:4,y:1,z:1}),false);g.body.velocity.set(0,0,0);
 for(const field of ['externalBattery','production','matter']){g.parts[0].mood[field]={};const before=unchanged(t,g);assert.equal(t.workshopBodyApply(id,{x:4,y:1,z:1}),false);assert.equal(unchanged(t,g),before);delete g.parts[0].mood[field];}
 assert.equal(t.groups.length,1);
});

test('body output collision and tabletop footprint are checked before removing source pieces',()=>{
 const {t}=lab(),g=block(t,2,1,2,{x:-.2,z:-.16}),id=g.parts[0].id,p=t.getWorkshopBench().p;
 const obstacle=t.addQubit([p.x+.12,p.y+.05,p.z]);const before=unchanged(t,g);
 assert.equal(t.workshopBodyApply(id,{x:4,y:1,z:1}),false);assert.equal(unchanged(t,g),before);assert(t.groups.includes(obstacle));
 t.removeGroup(obstacle);assert(t.workshopBodyPreview(id,{x:4,y:1,z:1}).ok);
 t.removeGroup(g);const large=block(t,4,1,4),state=unchanged(t,large);const preview=t.workshopBodyPreview(large.parts[0].id,{x:16,y:1,z:1});assert.equal(preview.ok,false);assert.match(preview.error,/sobresale/);assert.equal(unchanged(t,large),state);
});

test('long body has real per-cube colliders and settles above the workshop surface',()=>{
 const {t}=lab(),g=block(t,2,1,3),id=g.parts[0].id;assert(t.workshopBodyApply(id,{x:6,y:1,z:1}));const made=t.rotorPart(id).g;
 for(let i=0;i<720;i++)t.world.step(1/240);
 const box=t.bounds(made);assert(box.min.y>=t.getWorkshopBench().p.y-.003,`body sank to ${box.min.y}`);assert(box.min.y<t.getWorkshopBench().p.y+.015);assert(made.body.velocity.norm()<.025);assert(made.body.angularVelocity.norm()<.05);assert.equal(made.body.shapes.length,6);
});

test('tall bodies can be reshaped again using their supported footprint and keep all pieces',()=>{
 const {t}=lab(),g=block(t,2,2,2),id=g.parts[0].id;assert(t.workshopBodyApply(id,{x:1,y:8,z:1}));assert(t.workshopBodyPreview(id,{x:8,y:1,z:1}).ok);assert(t.workshopBodyApply(id,{x:8,y:1,z:1}));assert.equal(t.rotorPart(id).g.parts.length,8);
 t.story.scene='campaign';assert.equal(t.workshopBodyApply(id,{x:8,y:1,z:1}),false);
});
