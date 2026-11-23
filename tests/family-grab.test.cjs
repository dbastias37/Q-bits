// Functional input and real Cannon checks. DOM/WebGL are simulated by the harness.
const test=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('./game-harness.cjs');

const plain=value=>JSON.parse(JSON.stringify(value));
const storedParts=f=>f.items.flatMap(item=>item.groups.flatMap(g=>g.parts));
function setup(){
 const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();
 Object.assign(t.story,{ready:true,started:true,scene:'lab',mode:'playing',phase:'idle'});
 sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.setRunning(true);
 t.canvas.requestPointerLock=()=>{sandbox.document.pointerLockElement=t.canvas;sandbox.document.dispatchEvent({type:'pointerlockchange'});};
 t.setLook({camera:[0,1,1],yaw:0,pitch:0});return game;
}
function family(t,count=10,p=t.V(0,1,0)){
 const members=Array.from({length:count},(_,i)=>t.addQubit([3+(i%10)*.12,.06,-3+Math.floor(i/10)*.12],1));
 const made=t.groupIntoFamilies(members,{name:'Drones',color:'#dcb62d'});assert.equal(made.length,1);
 const f=made[0];f.body.position.copy(p);f.body.velocity.set(0,0,0);f.body.angularVelocity.set(0,0,0);f.body.aabbNeedsUpdate=true;
 for(let i=0;i<30;i++)t.updateFamilies(1/30);
 return f;
}
function mouse(game,type,button=0){
 const target=type==='mousedown'?game.t.canvas:game.sandbox.document;
 target.dispatchEvent({type,button,clientX:640,clientY:360});
}
function take(game,f){mouse(game,'mousedown');const held=game.t.getHeld();assert(held,'primary press must establish a physical hold');assert(held.family===f,'expected the selected family in the hand');return held;}
function directTake(t,f,distance=.6){t.grabFamily({family:f,point:f.body.position.clone(),distance});assert(t.getHeld()?.family===f,'expected family to remain held');return t.getHeld();}
function aimAt(t,target){const held=t.getHeld(),eye=t.V(...t.getLook().camera),dir=t.screenRay(640,360);held.rootOffset=target.vsub(eye.vadd(dir.scale(held.distance)));}
function step(t,count=120){for(let i=0;i<count;i++)t.stepSimulation(1/120);}
function closeTo(actual,expected,tolerance=1e-8){assert(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);}

test('primary press grabs one family shell with the ordinary physical hand and mouseup releases it',()=>{
 const game=setup(),{t}=game,f=family(t,100),inventory=plain(f.items),bodies=t.world.bodies.length,constraints=t.world.constraints.length;
 const held=take(game,f);
 assert(t.getFamilyPlacement()===null,'ordinary pickup must not enter the blueprint placement tool');
 assert(held.g.body===f.body,'hand must use the existing family body');assert.equal(held.items.length,1);assert.equal(held.g.parts.length,0,'the hand proxy has no fictitious Q-bit');
 assert(!t.groups.includes(held.g));assert.equal(t.groups.length,0);assert.equal(f.body.qubitGroup,undefined);
 assert.equal(t.world.bodies.length,bodies+1,'one temporary hand anchor only');assert.equal(t.world.constraints.length,constraints+1);assert.equal(f.body.shapes.length,1);
 closeTo(held.weight,100);closeTo(f.body.mass,25);
 const anchor=held.anchorBody,joint=held.joint;mouse(game,'mouseup');
 assert(t.getHeld()===null,'physical hold must be released');assert(t.getFamilyPlacement()===null,'physical pickup must not enter a placement preview');assert.equal(t.world.bodies.length,bodies);assert.equal(t.world.constraints.length,constraints);
 assert(!t.world.bodies.includes(anchor));assert(!t.world.constraints.includes(joint));assert.equal(f.body.fixedRotation,false);
 assert.deepEqual(plain(f.items),inventory);assert.equal(t.familyInventoryCount(),100);
});

test('a foreground family takes priority over the remote flight menu of a drone behind it',()=>{
 const game=setup(),{t,sandbox}=game,f=family(t,10),g=t.spawnSavedMechanism(t.propellerBlueprintTemplate(),t.V(0,1,-3));assert(g);assert(t.flightForGroup(g));
 const hub=t.worldParts(g).find(p=>p.shape==='coupler').p;f.body.position.set(hub.x,hub.y,hub.z+2.8);f.body.aabbNeedsUpdate=true;
 t.setLook({camera:[hub.x,hub.y,hub.z+3.8],yaw:0,pitch:0});t.setSelected(null);t.setMultiSelection([]);t.clearRotorSelection();
 assert(t.aimFamily()?.family===f);const behind=t.aimQubit(20);assert(behind?.g===g&&behind.distance>2.7);
 take(game,f);assert.equal(sandbox.document.querySelector('#command-menu').hidden,true,'the distant drone menu must stay closed');mouse(game,'mouseup');
});

test('the physical family follows the hand and falls under gravity after release',()=>{
 const game=setup(),{t}=game,f=family(t,10),inventory=plain(f.items);directTake(t,f);aimAt(t,t.V(.4,1.35,0));
 step(t,240);assert(f.body.position.x>.25,'constraint moves the family');assert(f.body.position.y>1.1,'family is held above the floor');
 const raised=f.body.position.y;t.releaseQubit();closeTo(f.body.velocity.norm(),0);closeTo(f.body.angularVelocity.norm(),0);
 step(t,300);assert(f.body.position.y<raised-.5);assert(f.body.position.y>.073&&f.body.position.y<.09,'family rests on its actual 15 cm shell');
 assert.equal(t.groups.length,0);assert.equal(f.body.shapes.length,1);assert.deepEqual(plain(f.items),inventory);
});

test('wheel adjusts hand distance and Shift plus movement rotates the physical family',()=>{
 const game=setup(),{t,sandbox}=game,f=family(t,10);const held=take(game,f),distance=held.distance;
 t.handleWheel({deltaY:100,preventDefault(){}});assert.notEqual(held.distance,distance);assert(t.getFamilyPlacement()===null,'physical pickup must not enter a placement preview');
 sandbox.document.dispatchEvent({type:'keydown',code:'ShiftLeft',repeat:false});
 closeTo(held.anchor.norm(),0);closeTo(held.joint.pivotA.norm(),0);
 sandbox.document.dispatchEvent({type:'keydown',code:'KeyA',repeat:false});
 step(t,45);assert(Math.abs(f.body.quaternion.y)>.05,'normal rotation keys turn the physical shell');
 sandbox.document.dispatchEvent({type:'keyup',code:'KeyA'});sandbox.document.dispatchEvent({type:'keyup',code:'ShiftLeft'});mouse(game,'mouseup');
 assert(t.getHeld()===null,'physical hold must be released');assert.equal(t.familyInventoryCount(),10);
});

test('family pickup respects cached material weight and the configured carrying limit',()=>{
 const game=setup(),{t}=game,f=family(t,20),bodies=t.world.bodies.length;t.settings.maxCarry=19;
 mouse(game,'mousedown');assert(t.getHeld()===null,'physical hold must be released');assert(t.getFamilyPlacement()===null,'physical pickup must not enter a placement preview');assert.equal(t.world.bodies.length,bodies);mouse(game,'mouseup');
 t.settings.maxCarry=20;take(game,f);assert.equal(t.getHeld().weight,20);mouse(game,'mouseup');
});

test('Tomar familia from the context menu uses a latched physical hand until the next click',()=>{
 const game=setup(),{t,sandbox}=game,f=family(t,10),bodies=t.world.bodies.length;
 t.openFamilyMenu(f);const button=sandbox.document.querySelector('#command-actions').children.find(node=>/^Tomar familia/.test(node.textContent));assert(button,'context menu offers ordinary pickup');
 button.dispatchEvent({type:'click'});
 const held=t.getHeld();assert(held?.family===f,'menu pickup must hold this family');assert.equal(held.latched,true);assert(t.getFamilyPlacement()===null,'physical pickup must not enter a placement preview');assert.equal(t.world.bodies.length,bodies+1);
 mouse(game,'mouseup');assert(t.getHeld()===held,'menu pickup remains held after the menu click is released');
 mouse(game,'mousedown');assert(t.getHeld()===null,'physical hold must be released');assert.equal(t.world.bodies.length,bodies);mouse(game,'mouseup');
});

test('campaign primary clicks hold and release a family with the ordinary latched controls',()=>{
 const game=setup(),{t}=game,f=family(t,10),bodies=t.world.bodies.length;t.story.scene='campaign';
 const held=take(game,f);assert.equal(held.latched,true);assert(t.getFamilyPlacement()===null);
 mouse(game,'mouseup');assert(t.getHeld()===held,'campaign pickup survives the first mouseup');step(t,30);
 mouse(game,'mousedown');assert(t.getHeld()===null,'the next campaign click releases the family');mouse(game,'mouseup');
 assert.equal(t.world.bodies.length,bodies);assert(!t.world.constraints.includes(held.joint));assert.equal(t.familyInventoryCount(),10);
});

test('context pickup explains the ordinary reach limit without creating a hand or placement tool',()=>{
 const game=setup(),{t,sandbox}=game,f=family(t,10,t.V(0,1,-2.2)),bodies=t.world.bodies.length;
 t.openFamilyMenu(f);const button=sandbox.document.querySelector('#command-actions').children.find(node=>/^Tomar familia/.test(node.textContent));assert(button);button.dispatchEvent({type:'click'});
 assert(t.getHeld()===null);assert(t.getFamilyPlacement()===null);assert.equal(t.world.bodies.length,bodies);assert.equal(t.world.constraints.length,0);
 assert.match(sandbox.document.querySelector('#notice').textContent,/Acércate a la familia/);assert.equal(t.familyInventoryCount(),10);
});

test('a held family stops at a thin wall and can slide and pull away',()=>{
 const {t}=setup(),f=family(t,10,t.V(0,1,.16));t.storyWall(t.V(0,1,0),t.V(.5,.5,.006));const held=directTake(t,f),item=held.items[0];
 const stopped=t.safeGripSweep(item,t.V(0,1,-.5));assert(stopped.z>.0805,'shell cannot cross the panel');
 const slide=t.safeGripSweep(item,t.V(.06,1,-.5));assert(slide.x>.005);assert(slide.z>.0805);
 const away=t.safeGripSweep(item,t.V(0,1,.23));assert(away.z>.22);
 aimAt(t,t.V(0,1,-1));step(t,360);assert(f.body.position.z-.075>.003,'Cannon constraint stays on the near side');
});

test('the normal hand sweep treats another stored family as a solid obstacle',()=>{
 const {t}=setup(),a=family(t,10,t.V(0,1,.16)),b=family(t,10,t.V(0,1,0));const held=directTake(t,a);
 const stopped=t.safeGripSweep(held.items[0],t.V(0,1,-.3));assert(stopped.z>=.1495,'two family shells cannot overlap');
 const away=t.safeGripSweep(held.items[0],t.V(0,1,.23));assert(away.z>.22);assert.equal(b.body.shapes.length,1);
});

test('ordinary cubes also stop at a family shell in the shared hand sweep',()=>{
 const {t}=setup(),f=family(t,10,t.V(0,1,0)),g=t.addQubit([0,1,.14]);
 t.grabQubit({g,part:g.parts[0],point:g.body.position.clone(),distance:.6});assert(t.getHeld().g===g,'ordinary cube must remain held');
 const stopped=t.safeGripSweep(t.getHeld().items[0],t.V(0,1,-.3));assert(stopped.z>=.1195,'cube respects the larger family shell');
 assert.equal(t.familyInventoryCount(),10);assert.equal(f.body.shapes.length,1);
});

test('a family dragged onto a tabletop stays above it and does not launch on release',()=>{
 const {t}=setup(),f=family(t,10,t.V(0,.76,0));t.storyWall(t.V(0,.6,0),t.V(.6,.02,.4));directTake(t,f);aimAt(t,t.V(.18,.2,0));
 let low=Infinity,peak=0;for(let i=0;i<360;i++){t.stepSimulation(1/120);low=Math.min(low,f.body.position.y-.075);peak=Math.max(peak,f.body.velocity.norm());}
 assert(low>.617);assert(f.body.position.x>.1);t.releaseQubit();let high=f.body.position.y;for(let i=0;i<240;i++){t.stepSimulation(1/120);high=Math.max(high,f.body.position.y);}
 assert(high<.78);assert(f.body.position.y-.075>.617);assert(f.body.velocity.norm()<.05);assert(peak<2);
});

test('an unrelated cooler does not raise the hand support level or cool stored pieces',()=>{
 const {t}=setup(),f=family(t,10),before=plain(f.items);assert(t.createCooler(t.V(3,0,3)));directTake(t,f);aimAt(t,t.V(0,-.2,0));
 step(t,240);assert(f.body.position.y>.074&&f.body.position.y<.095,'only the actual floor supports the shell at this location');assert.deepEqual(plain(f.items),before);
});

test('holding a hundred stored pieces does not open their inventory, create pieces, or allocate per-frame buffers',()=>{
 const game=setup(),{t}=game,f=family(t,100),items=f.items,inventory=plain(items),records=storedParts(f).map(part=>({part,mood:part.mood}));let reads=0,inventoryReads=0;
 for(const {part,mood}of records)Object.defineProperty(part,'mood',{configurable:true,enumerable:true,get(){reads++;return mood;}});
 Object.defineProperty(f,'items',{configurable:true,enumerable:true,get(){inventoryReads++;return items;}});
 const buffers=game.buffers.size,bodies=t.world.bodies.length;
 try{take(game,f);for(let i=0;i<120;i++){t.stepSimulation(1/120);t.updateFamilies(1/60);t.updateTarget();t.drawFamilies();}assert.equal(reads,0);assert.equal(inventoryReads,0);assert.equal(t.groups.length,0);assert.equal(t.world.bodies.length,bodies+1);assert.equal(game.buffers.size,buffers);mouse(game,'mouseup');assert.equal(reads,0);assert.equal(inventoryReads,0);}
 finally{Object.defineProperty(f,'items',{configurable:true,enumerable:true,writable:true,value:items});for(const {part,mood}of records)Object.defineProperty(part,'mood',{configurable:true,enumerable:true,writable:true,value:mood});}
 assert.deepEqual(plain(f.items),inventory);
});

test('a held family survives the full frame HUD, focus and ordinary mouse motion without a fake piece',()=>{
 const game=setup(),{t,sandbox}=game,f=family(t,10);take(game,f);step(t,40);
 for(let i=0;i<8;i++)sandbox.document.dispatchEvent({type:'mousemove',movementX:i%2?-8:8,movementY:2,timeStamp:1000+i*60});
 assert(t.getHeld()?.family===f,'expected family to remain held');assert.equal(t.getHeld().g.parts.length,0);
 for(let i=0;i<4;i++)game.frame(2000+i*17);
 assert(t.getHeld()?.family===f,'expected family to remain held');assert.equal(t.groups.length,0);assert.equal(t.familyInventoryCount(),10);
 mouse(game,'mouseup');
});

test('pause and pointer-lock loss freeze and resume the same hold as an ordinary cube',()=>{
 for(const kind of ['cube','family'])for(const mode of ['pause','unlock']){
  const game=setup(),{t,sandbox}=game;let body;
  if(kind==='family'){const f=family(t,10);body=f.body;take(game,f);}else{const g=t.addQubit([0,1,0],10);body=g.body;mouse(game,'mousedown');assert(t.getHeld()?.g===g);}
  const held=t.getHeld(),pose=body.position.clone(),bodies=t.world.bodies.length,physics=t.getTickState().physics;
  if(mode==='pause')t.openPauseMenu();else sandbox.document.exitPointerLock();
  assert(t.getHeld()===held,kind+' '+mode+' retains the frozen hand');assert.equal(t.story.mode,'pause');assert.equal(t.advanceSimulation(.25),0);assert.equal(t.getTickState().physics,physics);assert(body.position.almostEquals(pose,1e-12));assert.equal(t.world.bodies.length,bodies);
  t.resumeGame();assert.equal(t.story.mode,'playing');assert(t.getHeld()===held);mouse(game,'mouseup');assert(t.getHeld()===null);assert(!t.world.bodies.includes(held.anchorBody));assert(!t.world.constraints.includes(held.joint));
 }
});

test('explicit release, family removal and scene clearing clean the physical hand',()=>{
 for(const mode of ['release','remove','clear']){
  const game=setup(),{t,sandbox}=game,f=family(t,10),bodies=t.world.bodies.length;const held=take(game,f),anchor=held.anchorBody;
  if(mode==='release')t.pause();else if(mode==='remove')t.removeFamily(f);else t.clearNarrativeScene();
  assert(t.getHeld()===null,mode);assert(!t.world.bodies.includes(anchor),mode);assert(!t.world.constraints.includes(held.joint),mode);
  if(mode==='release'){assert(t.families.includes(f));assert.equal(t.world.bodies.length,bodies);assert.equal(t.familyInventoryCount(),10);}else assert(!t.families.includes(f));
 }
});

test('held inventory cannot be consumed or merged until the physical hand releases it',()=>{
 const game=setup(),{t}=game,f=family(t,20),other=family(t,10,t.V(2,1,0)),inventory=plain(t.serializeFamilies());take(game,f);
 assert.equal(t.beginFamilyPlacement(f,'withdraw',1),false);assert.equal(t.beginFamilyPlacement(f,'move'),false);assert.equal(t.mergeFamilies(other,f),false);assert.equal(t.mergeFamilies(f,other),false);
 assert.deepEqual(plain(t.serializeFamilies()),inventory);assert(t.getHeld().family===f,'expected family to remain held');mouse(game,'mouseup');
 assert(t.beginFamilyPlacement(f,'withdraw',1));t.cancelFamilyPlacement();
});

test('deliberate Shift shaking splits a physically held family and cleans its hand constraint',()=>{
 const game=setup(),{t,sandbox}=game,f=family(t,35),inventory=plain(storedParts(f)).sort((a,b)=>a.id-b.id),held=take(game,f);
 for(let i=0;i<6;i++)sandbox.document.dispatchEvent({type:'mousemove',movementX:i%2?-50:50,movementY:0,timeStamp:100+i*70});assert.equal(t.families.length,1);
 sandbox.document.dispatchEvent({type:'keydown',code:'ShiftLeft',repeat:false});
 for(let i=0;i<6;i++)sandbox.document.dispatchEvent({type:'mousemove',movementX:i%2?-2:2,movementY:0,timeStamp:700+i*30});assert.equal(t.families.length,1);
 for(let i=0;i<5;i++)sandbox.document.dispatchEvent({type:'mousemove',movementX:i%2?-50:50,movementY:0,timeStamp:1200+i*70});
 sandbox.document.dispatchEvent({type:'keyup',code:'ShiftLeft'});mouse(game,'mouseup');
 assert(t.getHeld()===null,'physical hold must be released');assert(t.getFamilyPlacement()===null,'physical pickup must not enter a placement preview');assert(!t.world.bodies.includes(held.anchorBody));assert(!t.world.constraints.includes(held.joint));
 assert.deepEqual(Array.from(t.families,f=>f.count).sort((a,b)=>a-b),[5,10,10,10]);assert.deepEqual(plain(t.families.flatMap(storedParts)).sort((a,b)=>a.id-b.id),inventory);
});
