const test=require('node:test'),assert=require('node:assert/strict'),createGame=require('./game-harness.cjs');
function lab(){const game=createGame(),{t,sandbox}=game;t.clearNarrativeScene();Object.assign(t.story,{ready:true,scene:'lab',mode:'playing',phase:'idle'});sandbox.document.body.dataset.booting='false';sandbox.document.pointerLockElement=t.canvas;t.initUnitRadial();return game;}
function aim(t,p){t.setLook({camera:[p.x,2.5,p.z+2],yaw:0,pitch:Math.atan2(p.y-2.5,2)});}
function place(t,id,p){aim(t,p);assert(t.beginCreationPlacement(id));assert(t.getCreationPreview()?.valid,t.getCreationPreview()?.reason);const poses=t.getCreationPreview().poses.map(p=>p.p.clone());assert(t.confirmCreationPlacement());return poses;}
const near=(a,b)=>assert(a.distanceTo(b)<1e-6,`${a} != ${b}`);
test('every quick physical item previews without bodies and commits at its shown position',()=>{
 for(const id of ['cube','tetra','pyramid','coupler','rotor','quick-arm','quick-drone','quick-propeller','quick-conveyor-straight','quick-conveyor-left','quick-conveyor-right','quick-battery-1','quick-battery-2','quick-battery-3','quick-sensor','quick-gripper','quick-cable-4','quick-power-reservoir','quick-cargo','quick-cooler']){
  const{t,buffers}=lab();aim(t,t.V(2,0,0));const bodies=t.world.bodies.length,allocated=buffers.size;
  assert(t.beginCreationPlacement(id),id);assert.equal(t.groups.length,0,id);assert.equal(t.world.bodies.length,bodies,id);assert.equal(buffers.size,allocated,id);
  assert(t.getCreationPreview().valid,`${id}: ${t.getCreationPreview().reason}`);const preview=t.getCreationPreview().poses.map(p=>p.p.clone());assert(t.confirmCreationPlacement(),id);
  if(t.groups.length){const actual=t.groups.flatMap(g=>t.poses(g));assert.equal(actual.length,preview.length,id);preview.forEach((p,i)=>near(actual[i].p,p));}
  assert.equal(t.getCreationPreview(),null);
 }
});
test('blocked placement never searches elsewhere, never allocates bodies, and can retry',()=>{
 const{t}=lab();aim(t,t.V());t.beginCreationPlacement('quick-conveyor-straight');const before=t.getCreationPreview().poses[0].p.clone();t.addQubit([before.x,before.y,before.z]);const count=t.groups.length,bodies=t.world.bodies.length;
 assert.equal(t.confirmCreationPlacement(),null);assert.equal(t.groups.length,count);assert.equal(t.world.bodies.length,bodies);assert(t.getCreationPreview());
 aim(t,t.V(2,0,0));assert(t.confirmCreationPlacement());assert.equal(t.conveyors.length,1);
});
test('surface support and occlusion: table works, vertical wall and occupied shelf space do not',()=>{
 const{t}=lab();t.storyWall(t.V(0,.6,0),t.V(.7,.03,.7));place(t,'quick-battery-2',t.V(0,.63,0));assert(t.groups.every(g=>t.bounds(g).min.y>=.63));
 aim(t,t.V(0,.6,.7));t.beginCreationPlacement('quick-arm');t.setLook({camera:[0,.6,2],yaw:0,pitch:0});assert.equal(t.updateCreationPlacement(),false);assert.equal(t.confirmCreationPlacement(),null);
});
test('Shift joins straight and both corner conveyors at real ports, preserving every hinge',()=>{
 for(const kind of ['straight','left','right']){
  const{t}=lab();place(t,'quick-conveyor-straight',t.V());const first=t.conveyors[0],port=t.conveyorPortWorld(first,'exit');aim(t,port.p);t.keys.add('ShiftLeft');t.beginCreationPlacement('quick-conveyor-'+kind);
  const preview=t.getCreationPreview();assert(preview.link,kind);assert(preview.valid,`${kind}: ${preview.reason}`);assert(t.confirmCreationPlacement(),kind);assert.equal(t.conveyors.length,2);assert.equal(t.rotors.length,6);
  const second=t.conveyors[1];near(t.conveyorPortWorld(first,'exit').p,t.conveyorPortWorld(second,'entry').p);assert.equal(t.rotorPart(first.baseId).g,t.rotorPart(second.baseId).g,'bases are physically welded');
  for(let i=0;i<120;i++)t.stepPhysics(1/120);assert(t.groups.every(g=>g.body.angularVelocity.norm()<.2));
 }
});
test('rotation preview matches spawned mechanism and cancelling leaves no objects',()=>{
 const{t}=lab();aim(t,t.V());t.beginCreationPlacement('quick-conveyor-left');t.handleWheel({deltaY:100,preventDefault(){}});assert.equal(t.getCreationPreview().turns,1);const poses=t.getCreationPreview().poses.map(p=>({p:p.p.clone(),q:p.q.clone()}));assert(t.confirmCreationPlacement());const actual=t.groups.flatMap(g=>t.poses(g));poses.forEach((p,i)=>near(p.p,actual[i].p));
 const before=t.groups.length;t.beginCreationPlacement('quick-arm');t.handleKey({code:'Escape',preventDefault(){}});assert.equal(t.getCreationPreview(),null);assert.equal(t.groups.length,before);
});
test('distance and rotation preferences are independent, with down-to-near default',()=>{
 const{t}=lab(),g=t.addQubit([0,1,0]);t.grabQubit({g,part:g.parts[0],point:g.body.position.clone(),distance:1});const held=t.getHeld();t.handleWheel({deltaY:100,preventDefault(){}});assert(held.distance<1);t.setPreferences({invertObjectDistance:true});t.handleWheel({deltaY:100,preventDefault(){}});assert(Math.abs(held.distance-1)<1e-8);
 t.releaseQubit();aim(t,t.V(2,0,0));t.beginCreationPlacement('cube');t.setPreferences({invertPieceRotation:true});t.handleWheel({deltaY:100,preventDefault(){}});assert.equal(t.getCreationPreview().turns,3);
});
test('edge pickup of a large structure uses its center without slowing the chosen hand response',()=>{
 const{t}=lab(),parts=Array.from({length:12},(_,i)=>({id:100+i,shape:'cube',weight:1,p:t.V((i-5.5)*.09,1,0),q:t.Q()})),g=t.makeGroup(parts),point=t.poses(g)[0].p;
 t.settings.maxCarry=256;t.grabQubit({g,part:g.parts[0],point,distance:1});assert(t.getHeld().stable);assert(t.getHeld().anchor.norm()<1e-8);assert.equal(g.body.mass,3);
 t.getHeld().rootOffset=t.V(0,1,0).vsub(t.V(...t.getLook().camera).vadd(t.screenRay(640,360).scale(t.getHeld().distance)));let peak=0;
 for(let i=0;i<240;i++){t.stepPhysics(1/120);peak=Math.max(peak,g.body.angularVelocity.norm());}assert(peak<.1,`spin ${peak}`);
 g.body.angularVelocity.set(2,3,4);t.releaseQubit();assert.equal(g.body.angularVelocity.norm(),0);
});

test('shortcuts arm placement and the explicitly enabled puzzle sandbox still permits primitive copies',()=>{
 const{t}=lab();aim(t,t.V());t.handleKey({code:'KeyN',preventDefault(){}});assert.equal(t.groups.length,0);assert(t.getCreationPreview());t.onCanvasMouseDown({button:0,preventDefault(){}});assert.equal(t.groups.length,1);
 t.puzzle.active=true;t.alphaSettings.allowPuzzleSpawn=true;aim(t,t.V(2,0,0));assert(t.startCreationTool('cube'));t.onCanvasMouseDown({button:0,preventDefault(){}});assert.equal(t.groups.length,2);assert.equal(t.startCreationTool('quick-arm'),false);
});

test('large rigid bodies are heavier than one cube, receive gentler contact response, and keep their identities',()=>{
 const{t}=lab(),single=t.addQubit([0,.045,0]),parts=Array.from({length:8},(_,i)=>({id:300+i,shape:'cube',weight:1,p:t.V(.16+(i%4)*.09,.045+Math.floor(i/4)*.09,0),q:t.Q()})),large=t.makeGroup(parts);
 assert.equal(large.body.mass,single.body.mass*8);assert(large.body.angularDamping>single.body.angularDamping);single.body.velocity.set(1,0,0);let contacts=0;
 for(let i=0;i<90;i++){t.stepPhysics(1/120);for(const c of t.world.contacts)if(c.bi===large.body||c.bj===large.body){contacts++;assert(c.restitution<=.025);}}
 assert(contacts>0);assert.equal(large.parts.length,8);assert(large.body.angularVelocity.norm()<.2);
});
test('workpiece receives the context click, E opens the bench, and packing leaves its objects in the world',()=>{
 const {t,sandbox}=lab(),bench=t.setupWorkshop(),p=bench.p,part=t.addQubit([p.x,p.y+.045,p.z]);
 aim(t,part.body.position);t.handleSecondary({clientX:640,clientY:360});
 assert(t.getCommandState()?.items.some(i=>i.label.startsWith('Tomar ')));assert(!t.getWorkshopPanel()?.isOpen);
 assert(t.openWorkshopMenu(t.V(0,p.y-2.5,-2).unit()));assert(t.getWorkshopPanel().isOpen);t.closeWorkshopPanel(false);
 sandbox.document.pointerLockElement=t.canvas;aim(t,t.V(p.x+.4,p.y,p.z));t.handleSecondary({clientX:640,clientY:360});
 t.getCommandState().items.find(i=>i.label==='Retirar mesa').run();assert.equal(t.getWorkshopBench(),null);
 assert(t.groups.includes(part));assert(!t.openWorkshopMenu());assert(!t.setupWorkshop());assert.equal(t.saveLab().workshop,null);
 for(let i=0;i<180;i++)t.stepPhysics(1/120);assert(t.bounds(part).min.y<.02);
 t.story.lab=t.saveLab();t.story.scene='campaign';t.enterLab(false);assert.equal(t.getWorkshopBench(),null);
});
test('quick workshop previews and re-deploys one oriented desk with matching usable and physical surfaces',()=>{
 const {t}=lab(),original=t.setupWorkshop(),p=t.V(2.313,0,-1.324);aim(t,p);
 t.beginCreationPlacement('quick-workshop');assert.equal(t.getWorkshopBench(),original);t.handleKey({code:'Escape',preventDefault(){}});assert.equal(t.getWorkshopBench(),original);
 t.beginCreationPlacement('quick-workshop');t.keys.add('ShiftRight');t.handleWheel({deltaY:400,preventDefault(){}});
 const preview=t.getCreationPreview(),shown=preview.poses.map(v=>v.p.clone());assert(preview.grid&&preview.valid,preview.reason);
 const bench=t.confirmCreationPlacement();assert(bench);bench.walls.forEach((wall,i)=>near(wall.p,shown[i]));
 assert(original.walls.every(w=>!t.world.bodies.includes(w.body)));assert(t.onWorkshop(bench.p.vadd(bench.q.vmult(t.V(.65,.05,.35)))));
 assert(!t.onWorkshop(bench.p.vadd(bench.q.vmult(t.V(0,.05,.48)))));
 t.story.lab=t.saveLab();t.story.scene='campaign';t.enterLab(false);const restored=t.getWorkshopBench();near(restored.p,bench.p);near(restored.q.vmult(t.V(1,0,0)),bench.q.vmult(t.V(1,0,0)));
});
test('construction blueprints use free coordinates, a temporary 9 cm floor grid and continuous wheel yaw',()=>{
 const {t,sandbox}=lab();const cursor=t.V(1.133,0,-.326);aim(t,cursor);t.updateRobotArmPanel();sandbox.document.querySelector('#arm-blueprint').dispatchEvent({type:'click'});
 const preview=t.getCreationPreview();assert(preview?.plan);near(preview.point,cursor);
 t.handleWheel({deltaY:100,preventDefault(){}});assert.equal(preview.turns,1);
 t.keys.add('ShiftLeft');t.handleWheel({deltaY:27,preventDefault(){}});assert(preview.turns>1&&preview.turns<1.1);
 near(preview.point,t.V(1.17,0,-.36));const dir=preview.q.vmult(t.V(1,0,0));
 t.handleKeyUp({code:'ShiftLeft'});t.updateCreationPlacement();near(preview.point,cursor);near(preview.q.vmult(t.V(1,0,0)),dir);
 t.keys.add('ShiftLeft');t.updateCreationPlacement();const shown=preview.poses[0].p.clone();
 const bp=t.confirmCreationPlacement();assert(bp);assert(t.blueprintTargets(bp).some(o=>o.p.distanceTo(shown)<1e-8));assert.equal(t.groups.length,0);
 const saved=t.alphaSceneSnapshot();t.clearAlphaScene();t.restoreAlphaScene(saved);near(t.blueprints[0].q.vmult(t.V(1,0,0)),dir);
});
