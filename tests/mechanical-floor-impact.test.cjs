const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const createGame=require('./game-harness.cjs');
function setup(hz=120){
 let source=fs.readFileSync(process.env.QBITS_GAME_SOURCE||path.join(__dirname,'../assets/js/game.js'),'utf8');const i=source.lastIndexOf('})();');source=source.slice(0,i)+'window.__floorImpactTest={floor};'+source.slice(i);
 const game=createGame({graphics:false,gameSource:source}),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.applyPreferences({physicsHz:hz});return {...game,hz,floor:sandbox.__floorImpactTest.floor};
}
function step(game,seconds){for(let i=0;i<Math.round(seconds*game.hz);i++)game.t.stepPhysics(1/game.hz);}
function observeFirstImpact(game){
 const {t,floor}=game,original=t.world.solver.solve,seen={speed:null,maxRestitution:null};
 t.world.solver.solve=function(dt,world){const contact=world.contacts.find(c=>c.bi===floor||c.bj===floor),first=contact&&seen.speed===null;if(first)seen.speed=Math.abs(contact.getImpactVelocityAlongNormal());const value=original.call(this,dt,world);if(first)seen.maxRestitution=Math.max(...world.contacts.filter(c=>c.bi===floor||c.bj===floor).map(c=>c.restitution));return value;};return seen;
}
for(const hz of [60,120,240])test(`a falling rotor reaches the contact solver with its impact velocity at ${hz} Hz`,()=>{
 const game=setup(hz),{t}=game,r=t.spawnRotor(t.V(0,1,0)),members=t.rotorGroups(r),before=members.map(g=>({mass:g.body.mass,ids:Array.from(g.parts,p=>p.id)})),hit=observeFirstImpact(game);let minY=Infinity,up=0;
 for(let i=0;i<hz*2;i++){t.stepPhysics(1/hz);minY=Math.min(minY,...members.map(g=>t.bounds(g).min.y));if(hit.speed!==null)up=Math.max(up,...members.map(g=>g.body.velocity.y));}
 assert(hit.speed>4&&hit.speed<4.6,'a floor position correction must not erase a real falling impact');assert(up>.15,'the configured material produces a physical rebound');assert(minY>=-.001001,'the coherent floor correction still limits penetration');assert.deepEqual(members.map(g=>({mass:g.body.mass,ids:Array.from(g.parts,p=>p.id)})),before);
});
test('a rigid assembly retains the selected restitution instead of a size-dependent hidden cap',()=>{
 const game=setup(),{t}=game;t.world.defaultContactMaterial.restitution=.6;t.makeGroup(Array.from({length:8},(_,i)=>({id:t.allocateUnitId(),shape:'cube',weight:1,p:t.V((i%2)*.09,1.045+(i>>2)*.09,((i>>1)%2)*.09),q:t.Q()})));const hit=observeFirstImpact(game);let up=0;
 for(let i=0;i<120;i++){t.stepPhysics(1/120);if(hit.speed!==null)up=Math.max(up,t.groups[0].body.velocity.y);}
 assert.equal(hit.maxRestitution,.6);assert(up>1.5,'a chosen bouncy material must remain bouncy when its cubes are joined');
});
test('mechanical rebound remains controlled by the actual material value',()=>{
 function rebound(restitution){const game=setup(),{t}=game;t.world.defaultContactMaterial.restitution=restitution;t.spawnRotor(t.V(0,1,0));const hit=observeFirstImpact(game);let up=0;for(let i=0;i<120;i++){t.stepPhysics(1/120);if(hit.speed!==null)up=Math.max(up,...t.groups.map(g=>g.body.velocity.y));}return up;}
 const inelastic=rebound(0),elastic=rebound(.6);assert(inelastic<.1);assert(elastic>inelastic+1.5);
});
for(const mode of ['removed','floor-mask','floor-response','floor-shape','body-mask','body-response','body-shapes','empty-body'])test(`a ${mode} floor collision cannot provide invisible mechanical support`,()=>{
 const game=setup(),{t,floor}=game;t.spawnRotor(t.V(0,.2,0));
 if(mode==='removed')t.world.removeBody(floor);else if(mode==='floor-mask')floor.collisionFilterMask=0;else if(mode==='floor-response')floor.collisionResponse=false;else if(mode==='floor-shape')floor.shapes[0].collisionResponse=false;else for(const g of t.groups){if(mode==='body-mask')g.body.collisionFilterMask=0;else if(mode==='body-response')g.body.collisionResponse=false;else if(mode==='empty-body'){g.body.shapes.length=0;g.body.shapeOffsets.length=0;g.body.shapeOrientations.length=0;g.body.updateBoundingRadius();g.body.aabbNeedsUpdate=true;}else for(const shape of g.body.shapes)shape.collisionResponse=false;}
 step(game,.8);assert(t.groups.every(g=>g.body.position.y<-.1),'without a collision-enabled support the entire mechanism must keep falling');
});
test('the coherent floor correction follows the actual translated plane height',()=>{
 const game=setup(),{t,floor}=game;floor.position.y=1;floor.aabbNeedsUpdate=true;t.spawnRotor(t.V(0,1.5,0));step(game,2);
 assert(t.groups.every(g=>t.bounds(g).min.y>.9989));assert(Math.min(...t.groups.map(g=>t.bounds(g).min.y))<1.002);assert(t.groups.every(g=>g.body.sleepState===2));
});
test('an inclined floor retains its actual surface rather than a horizontal invisible stop',()=>{
 const game=setup(),{t,floor}=game;floor.quaternion.setFromEuler(-Math.PI/2+.3,0,0);floor.aabbNeedsUpdate=true;t.spawnRotor(t.V(0,.3,0));step(game,1.5);
 assert(Math.min(...t.groups.map(g=>t.bounds(g).min.y))<-.02,'the mechanism can occupy the lower part of the actual inclined plane');
});
test('two unpowered arms stay spatially steady after touching through the actual hand controller',()=>{
 const game=setup(),{t}=game,roots=[];
 for(const x of [-.6,.6]){const before=new Set(t.groups);assert(t.spawnSavedMechanism(t.robotArmBlueprintTemplate(),t.V(x,0,0)));roots.push(t.groups.find(g=>!before.has(g)));}
 const components=roots.map(g=>t.rotorConnectedGroups([g])),a=new Set(components[0].map(g=>g.body)),b=new Set(components[1].map(g=>g.body));
 step(game,3);const shift=Math.max(...components[0].map(g=>t.bounds(g).max.x))+.00005-Math.min(...components[1].map(g=>t.bounds(g).min.x));
 for(const g of components[1]){g.body.position.x+=shift;g.body.aabbNeedsUpdate=true;g.body.wakeUp();g.body.velocity.x=-.16;}for(const g of components[0]){g.body.wakeUp();g.body.velocity.x=.16;}
 for(let i=0;i<60;i++){roots[0].body.force.x+=roots[0].body.mass*6;roots[1].body.force.x-=roots[1].body.mass*6;t.stepPhysics(1/120);}step(game,4);
 const center=roots[0].body.position.clone();t.setLook({camera:[center.x,center.y+.12,center.z+1],yaw:0,pitch:0});t.grabQubit({g:roots[0],part:roots[0].parts[0],point:center,distance:1});const held=t.getHeld();assert(held);
 const camera=t.V(...t.getLook().camera),ray=t.screenRay(640,360),target=roots[0].body.position.clone();target.x+=.3;held.rootOffset=target.vsub(camera.vadd(ray.scale(held.distance)));
 let contacts=0;for(let i=0;i<60;i++){t.stepPhysics(1/120);contacts+=t.world.contacts.filter(c=>a.has(c.bi)&&b.has(c.bj)||b.has(c.bi)&&a.has(c.bj)).length;}assert(contacts>0,'the test must include actual mechanism-to-mechanism contact');t.releaseQubit(false);step(game,3);
 const before=t.groups.map(g=>g.body.position.clone());step(game,1);assert(t.groups.every((g,i)=>g.body.position.distanceTo(before[i])<.0005),'a released, supported pair must not continue visibly drifting');assert(t.groups.every(g=>g.body.type===1));assert(t.rotors.every(r=>!r.enabled));
});
